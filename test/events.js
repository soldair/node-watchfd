var should = require('should'),
    fs = require('fs'),
    watchfd = require(__dirname+'/watchfd.js'),
    file = 'test1.log',
    t;//jshint doesnt like should so i assign should calls to t

var eventLog = [],
    expected = {};

var logevent = function(name,args){
  eventLog.push(Array.prototype.slice.call(args).unshift(name));
  if(expected[name]) {
    for(var i = 0,j=expected[name].length;i<j;i++) {
      expected[name][i][0](expected[name][i],args);
      expected[name][i] = null;//<-- i know this leaks. joboffset will have to refactored so i can splice
    }
  }
};

var expectEvent = function(name,cb,timeout){
  var jobOffset;
  var timer = setTimeout(function(){
    (false).should.be('event '+name+' not fired before timeout of '+timeout+' ms');
    expected[name] = null;
  },timeout);

  if(!expected[name]) expected[name] = [];

  expected[name].push([function(arr,eventArgs){
    clearTimeout(arr[1]);
    cb(false,eventArgs);
  },timer]);

  joboffset = expected[name].length - 1;
};

exports['test events'] = function(){
  var watcher = watchfd.watch(file,function(cur,prev){
    logevent('change',arguments);
  });

  watcher.on('unlink',function(){
    logevent('unlink',arguments);
  });

  watcher.on('timeout',function(){
    logevent('timeout',arguments);  
  });

  watcher.on('open',function(){
    logevent('open',arguments);
  });

  fs.open('test1.log','w+',function(err,fd){
    (!err).should.eql(true);
    expectEvent('open',function(){
      fs.write(fd,new Buffer('party rockin'),function(err,bytesWritten){
        (!err).should.eql(true);
      });
    },1000);
  });
  this.on('exit',function(){
  
  });
}


