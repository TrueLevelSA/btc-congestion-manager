import * as forever from 'forever-monitor'
const server = new (forever.Monitor)('dist/src/wamp-server.js', {
  max: Number.POSITIVE_INFINITY,
  minUptime: 5000,
  spinSleepTime: 5000,
  silent: false,
});
server.on('exit', function() {
  console.log('server.js has exited after infinity restarts');
});
server.start()
