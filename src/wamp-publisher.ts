import { dealer$, minedTxsSummary$, minsFromLastBlock$ } from './fee-estimator'
import { Observable } from 'rxjs'
import { config } from '../config'
import { Client } from 'thruway.js'

const wamp = new Client(config.wamp.url, config.wamp.realm)

wamp.publish('com.fee.minsfromlastblock', minsFromLastBlock$)
wamp.publish('com.fee.minedtxssummary', minedTxsSummary$)
wamp.publish(
  'com.fee.deals',
  dealer$.retryWhen(error$ =>
      error$
        .do(err => {
          console.error()
          console.error(`------ ${(new Date()).toString()} ------`)
          console.error(err)
          console.error(`------------`)
        })
        .delay(config.constants.timeRes)))
