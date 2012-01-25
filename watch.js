var util = require('util'),
events = require('events'),
fs = require('fs');


//
//watching is accomplished at the file descriptor level.
//watching a "filename" means you get events on deleted files where applications are still writing to open descriptors they are holding.
//a big thing to note is that if a file is moved and another process starts to write to it these change events will be buffered
//
exports.watch = function(filename,options,listener){
  return new Watcher(filename,options,listener);
};

function Watcher(filename,options,listener){
  events.EventEmitter.call(this);

  var self = this,
  args = this._normalizeArguments(arguments);
  
  // treat missing listener exactly like node does in fs.watchFile
  if(typeof args.listener != 'function') {
    throw new Error('watch requires a listener function');
  }
  
  this.options = args.options||{};
  this.file = args.file;
  this.fds = {};
  
  //
  //if im watching a file descriptor thats deleted and inactive.
  //
  this.options.timeout = this.options.timeout || 60*60*1000;
  
  //
  //this is the interval that the watcher uses to enforce options.timeout.
  //
  this.options.timeoutInterval = this.options.timeoutInterval || 60*5*1000;
  if(this.options.timeout < this.options.timeoutInterval) this.options.timeoutInterval = this.options.timeout;

  this.on('change',args.listener);
  
  fs.stat(this.file,function(err,stat) {
    
    if(err) {
      
      if(err.code != 'ENOENT') {
        
        //next tick so we have a chance to bind error
        process.nextTick(function(){
          //for all other errors we cannot continue.
          self.emit('error',err);
        });
        return;
        
      }
      
    } else {
      
      self._observeInode(stat);
      
    }
    
    self._watchFile();
    self._startTimeout();
  });
}

util.inherits(Watcher,events.EventEmitter);

//
// define class members
//
var WatcherMethods = {
  //public api methods
  
  close:function(){
    for(var inode in this.fds) {
      if(this.fds.hasOwnProperty(inode)) {
        this._closeFd(inode);
      }
    }
    fs.unwatchFile(this.file);
    clearTimeout(this._timeoutInterval);
  },
  //------ protected methods -------
  
  //
  //this is the path to the last stat i got from the filename im trying to watch.
  //used to differentiate "inactive" descriptors from the one currently residing at that file location.
  //
  _fileStat:null,
  //
  // the interval used to cleanup inactive file descriptors that no longer refrenced by this.file
  //
  _timeoutInterval:null,
  //
  // watchFile watches the stat at path
  // i am using watchFile to determine if the file i was originally told to watch is replaced etc.
  //
  _watchFile:function(){
    var self = this,lastInode = null;
    //NOTE for windows i could poll with fs.stat at options.interval
    fs.watchFile(this.file,this.options,function(cur,prev){
      //i need to know what fd is the active fd inter the file path
      self._fileStat = cur;
      
      if(!self.fds[cur.ino]){
        self._observeInode(cur);
    
      } else if(cur.nlink === 0) {
        //no hardlinks left to this file. its unlinked for sure.
        self.emit('unlink',self.fds[cur.ino].fd,self.fds[cur.ino].getData());

      } else if(cur.size === prev.size){
        console.log('same size');
        //sometimes the watch event fires after an unlink with nlink still equal to 1
        //i stat to first see if its not there
        //by the time stat is done checking the file could have been replaced by a new file
        //so i validate the inode also.
        
        fs.stat(self.file,function(err,stat){
          var deleted = false;
          if(err && err.code === 'ENOENT'){
            deleted = true;
          } else if(!err) {
            if(stat.ino !== cur.ino || cur.nlink === 0) {
              deleted = true;
            }
          }

          if(deleted) {
            self.emit('unlink',self.fds[cur.ino].fd,self.fds[cur.ino].getData());
          }
        });
          
      }
      
    });
  },
  //
  // manage open file descriptors to deleted/moved log files.
  //
  _startTimeout:function(){
    //timeouts are not subject to stacking and stuff with process overload
    var self = this;
    self._timeoutInterval = setTimeout(function fn(){
      if(!self._fileStat) {
        return;
      }
      for(var inode in self.fds){
        if(self.fds.hasOwnProperty(inode) && self.fds[inode]) {  
          if(inode+'' !== self._fileStat.ino+''){

            var fdState = self.fds[inode],
                mtime = Date.parse(fdState.stat.mtime);
            
            // i want to wait at least timeout from the time i start watching the fd
            if(mtime < fdState.created){
              mtime = fdState.created;
            }
            
            var sinceChange = Date.now()-mtime;

            if(sinceChange > self.options.timeoutInterval){

                self.emit('timeout',fdState.fd,fdState.getData());
                self._closeFd(inode);
            }

          }
          
        }
      }
      self._timeoutInterval = setTimeout(fn,self.options.timeoutInterval);
    },self.options.timeoutInterval);
  },
  //
  // start file descriptor based watcher
  //
  _observeInode:function(stat,cb) {
    var self = this;
    
    //prevent assigning multiple watch watchers
    if(self.fds[stat.ino]) {
      return;
    }
    
    var fdState = self.fds[stat.ino] = new WatcherFd(stat),
        inode = stat.ino;

    fs.open(this.file,'r',function(err,fd){
      if(err){
        
        //file must not exist now. it was deleted pretty quickly.. =/
        self._closeFd(stat.ino);
        
      } else {
        
        fdState.fd = fd;
        self.emit('open',fdState.fd,fdState.getData());
        
        fdState.watcher = fs.watch(self.file,function(event,filename) {
          fdState.created = Date.now();//time of last event
          fs.fstat(fd,function(err,stat){
            var prev = fdState.stat;
            fdState.stat = stat;
            self._observeChange(stat,prev,fdState);
          });
        });
        // observe change that told us about the fd
        process.nextTick(function() {
          self._observeChange(stat,stat);
        });
      }
    });
  },
  //
  // clean up 
  //
  _closeFd:function(inode){
    this.fds[inode].close();
    delete this.fds[inode];
  },
  //
  // change dispatcher - sends WatcherFd data with each change event.
  //
  _observeChange:function(stat,prev) {
    this.emit('change',stat,prev,this.fds[stat.ino].getData());
  },
  //
  //format arguments for easy reading / access
  //
  _normalizeArguments:function(args){
    if(typeof args[1] == 'function'){
      args[2] = args[1];
      args[1] = {};
    }
    return {file:args[0],options:args[1],listener:args[2]};
  }
};

extend(Watcher.prototype,WatcherMethods);

function WatcherFd(stat,timeout){
  this.stat = stat;
  this.timeout = timeout || this.timeout;
  this.created = Date.now();
}

WatcherFd.prototype = {
  fd:null,
  stat:null,
  state:null,
  watcher:null,
  created:null,
  getData:function(){
    return {fd:this.fd.fd,stat:this.stat};
  },
  close:function(){
    if(this.fd) fs.close(this.fd);
    if(this.watcher) this.watcher.close();
    clearTimeout(this.timer);
  }
};

//---
function extend(o,o2){
  for( var i in o2 ) {
    if(o2.hasOwnProperty(i)) o[i] = o2[i];
  }
}
