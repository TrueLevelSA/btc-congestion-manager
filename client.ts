import { Client } from 'thruway.js'
import { range } from './listener'
import { Observable } from 'rxjs'

const wamp = new Client('ws://localhost:8080/ws', 'realm1')
const minedTxSummary$ = wamp.topic('com.buffered.minedtxssummary')
  .flatMap(x => x.args)
const baseStr = 'com.buffered.getfee'
const fees = range.map(x => wamp.topic(baseStr + x).flatMap(y => y.args))

Observable.merge(...fees, minedTxSummary$).subscribe(x => console.dir(x))
