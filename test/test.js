var w = require('../lib/watch.js');
var watcher = w.watch('taco.log',{timeout:5000},function(cur,prev){
  console.log('CHANGE ','ino: '+cur.ino+', size: '+prev.size+' -> '+cur.size);
});

watcher.on('open',function(fd,data){
  console.log('OPEN ','ino: '+data.stat.ino+', size:'+data.stat.size);
});

watcher.on('unlink',function(fd,data){
  console.log('UNLINK ','ino: '+data.stat.ino+', size:'+data.stat.size);
});

watcher.on('timeout',function(fd,data){
  console.log('TIMEOUT ','ino: '+data.stat.ino+', size:'+data.stat.size);  
});




