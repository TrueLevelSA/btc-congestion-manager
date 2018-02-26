import { Monitor } from 'forever-monitor'

const options = {
  max: Number.POSITIVE_INFINITY,
  minUptime: 5000,
  spinSleepTime: 5000,
  silent: false,
}

new (Monitor)('dist/src/wamp-publisher.js', options)
  .on('exit', () => console.log('wamp-publisher.js has exited after infinity restarts'))
  .start()
