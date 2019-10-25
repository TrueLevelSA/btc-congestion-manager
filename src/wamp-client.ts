import { Client } from 'thruway.js'
import { Observable } from 'rxjs'
import { config } from '../config'
const wamp = new Client(config.wamp.url, config.wamp.realm)


export const minedTxSummary$ =
  wamp.topic(config.wamp.topic.minedtxssummary)
    .flatMap(x => x.args)

export const minDiff$ =
  wamp.topic(config.wamp.topic.deals)
    .flatMap(x => x.args)

// Observable.merge(
//   minedTxSummary$,
//   minDiff$
// ).subscribe(
//   x => console.dir(x),
//   err => console.error(err),
//   () => console.log('finished')
//   )

