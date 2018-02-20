import { dealer$, minedTxsSummary$, minsFromLastBlock$ } from './fee-estimator'
import { Observable } from 'rxjs'
import { config } from '../config'
import { Client } from 'thruway.js'

const wamp = new Client(config.wamp.url, config.wamp.realm)

wamp.publish(
  'com.fee.all',
  Observable.of(
    [
      'com.fee.v1.btc.minsfromlastblock',
      'com.fee.v1.btc.minedtxssummary',
      'com.fee.v1.btc.deals',
    ]
  )
)

wamp.publish('com.fee.v1.btc.minsfromlastblock', minsFromLastBlock$)
wamp.publish('com.fee.v1.btc.minedtxssummary', minedTxsSummary$)
wamp.publish(
  'com.fee.v1.btc.deals',
  dealer$.retryWhen(error$ =>
    error$
      .do(err => {
        console.error()
        console.error(`------ ${(new Date()).toString()} ------`)
        console.error(err)
        console.error(`------------`)
      })
      .delay(config.constants.timeRes)))
