## goal

provide events for any file descriptors that are referenced by a watched path
or were referenced by a watched path for as long as they are active.
active is defined by a timeout since last event. file descriptors that become inactive are removed.


## install

	npm install watchfd

## use

	var watchfd = require('watchfd').watch;
	watchfd('/some.log',function(cur,prev){
		console.log(prev.size,' changed to ',cur.size);
	});

#### a use case:

an issue with log/file forwarding utilities currently available in npm is that they only watch the file descriptor under the filename. when a log is rotated and a new log is created the server may not stop writing to the old file descriptor immediately. Any data written to that descriptor in this state ends up in /dev/null


#### windows support problems

- It uses file inode as a unique id for each descriptor. I know there is a way to get a unique id for a file in windows i just don't know if that would be passed to stat as stat.ino. 
- I use watchFile which is not supported at all on windows but this would be easier to overcome considering i can use a configured polling interval as a stat polling fall back on windows. 
- I also don't know windows very well and don't know if windows has the problem this module solves...but i imagine it would

#### notes

I noticed distinct differences in watchFile vs watch api
fs.watchFile will issue events for a file that is currently referenced by a path
fs.watch will take a path but issue events whenever that file descriptor is changed even after it's unlinked

We should probably design servers to listen to SIGHUP and grab new file descriptors for all loggers but even if you used logrotate with copytruncate mode as to not change the file referenced by a path the chance that you will loose data is still there. I feel safer waiting for a file descriptor to be quiet so i know its out of use before i close it in a process that has the ability to read data out of it.
