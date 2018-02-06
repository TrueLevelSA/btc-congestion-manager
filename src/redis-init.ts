import * as Redis from 'ioredis'
import { config } from '../config'
import { setItem } from './redis-adapter'
import { Observable } from 'rxjs'

const keys = [
  'buffer_added',
  'buffer_removed',
  'buffer_blocksize',
  'minsfromlastblock',
]

const values = [
  '[]',
  '[]',
  '[1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000]',
  '10',
]


// init redis keys with empty arrays
keys.reduce((acc, key, i) =>
  acc.merge(Observable.fromPromise(setItem(key, values[i]))), Observable.empty())
  .subscribe(console.log, console.error, process.exit)

