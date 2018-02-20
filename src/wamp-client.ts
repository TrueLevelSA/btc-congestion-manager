import { Client } from 'thruway.js'
import { Observable } from 'rxjs'
import { config } from '../config'
const wamp = new Client(config.wamp.url, config.wamp.realm)


export const minedTxSummary$ =
  wamp.topic('com.fee.v1.btc.minedtxssummary')
    .flatMap(x => x.args)

export const minDiff$ =
  wamp.topic('com.fee.v1.btc.deals')
    .flatMap(x => x.args)

// Observable.merge(
//   minedTxSummary$,
//   minDiff$
// ).subscribe(
//   x => console.dir(x),
//   err => console.error(err),
//   () => console.log('finished')
//   )

