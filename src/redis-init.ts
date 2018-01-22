import * as Redis from 'ioredis'
import { config } from '../config'
import { setItem } from './redis-adapter'
import { Observable } from 'rxjs'

const keys = ['buffer_added', 'buffer_removed']

keys.reduce((acc, key) =>
  acc.merge(Observable.fromPromise(setItem(key, JSON.stringify([])))), Observable.empty())
  .subscribe(console.log, console.error, process.exit)
