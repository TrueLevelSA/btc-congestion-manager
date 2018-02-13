import { Monitor } from 'forever-monitor'

const options = {
  max: Number.POSITIVE_INFINITY,
  minUptime: 5000,
  spinSleepTime: 5000,
  silent: false,
}

new (Monitor)('dist/src/rest-server.js', options)
  .on('exit', () => console.log('rest-server.js has exited after infinity restarts'))
  .start()
