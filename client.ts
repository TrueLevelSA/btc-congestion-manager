import { Client } from 'thruway.js'
import { Observable } from 'rxjs'
const wamp = new Client('http://159.100.247.219:8080/ws', 'realm1')
const minedTxSummary$ = wamp.topic('com.fee.minedtxssummary')
  .flatMap(x => x.args)

// const feeDiff$ = wamp.topic('com.buffered.feediff')
//   .flatMap(y => y.args)

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

