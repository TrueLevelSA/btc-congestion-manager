import { minDiff$, minedTxsSummary$ } from './fee-estimator'
import { Observable } from 'rxjs'
import { config } from '../config'
import { Client } from 'thruway.js'

const wamp = new Client(config.wamp.url, config.wamp.realm)

// subscriber
Observable.merge(minDiff$, minedTxsSummary$)
  .retryWhen(errors =>
    errors
      .do(err => console.error(`Error: ${err}`))
      .delayWhen(val => Observable.timer(config.constants.timeRes * 10)))
  .subscribe(
  x => console.dir(x),
  err => console.error(err),
  () => console.log('finished (not implemented)')
  )


wamp.publish('com.fee.minedtxssummary', minedTxsSummary$)
wamp.publish('com.fee.mindiff', minDiff$)
