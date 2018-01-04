import { Client } from 'thruway.js'
import { Observable } from 'rxjs'
import { config } from '../config'
const wamp = new Client(config.wamp.url, config.wamp.realm)

const minedTxSummary$ = wamp.topic('com.fee.minedtxssummary')
  .flatMap(x => x.args)

const minDiff$ = wamp.topic('com.fee.mindiff')
  .flatMap(y => y.args)

Observable.merge(
  minedTxSummary$,
  minDiff$
).subscribe(
  x => console.dir(x),
  err => console.error(err),
  () => console.log('finished')
  )

