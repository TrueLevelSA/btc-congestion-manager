import * as forever from 'forever-monitor'
const server1 = new (forever.Monitor)('dist/src/wamp-server.js', {
  max: Number.POSITIVE_INFINITY,
  minUptime: 5000,
  spinSleepTime: 5000,
  silent: false,
});

server1.on('exit', function() {
  console.log('wamp-server.js has exited after infinity restarts');
});
server1.start()

const server2 = new (forever.Monitor)('dist/src/rest-server.js', {
  max: Number.POSITIVE_INFINITY,
  minUptime: 5000,
  spinSleepTime: 5000,
  silent: false,
});

server2.on('exit', function() {
  console.log('rest-server.js has exited after infinity restarts');
});
server2.start()
