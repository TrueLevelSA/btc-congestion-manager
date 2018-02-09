import * as express from 'express'
// import { minDiff$ } from './fee-estimator'
import { Observable } from 'rxjs'
import { Client } from 'thruway.js'
import { config } from '../config'
import { MinDiff, MinsFromLastBlock } from './types'

const wamp = new Client(config.wamp.url, config.wamp.realm)
const nReplay = 1

const minDiff$: Observable<MinDiff[]> =
  wamp.topic('com.fee.mindiff')
    .flatMap(y => y.args)

const minDiffShare$ = minDiff$.shareReplay(nReplay)

const minsFromLastBlock$: Observable<MinsFromLastBlock> =
  wamp.topic('com.fee.minsfromlastblock')
    .flatMap(y => y.args)

const minsFromLastBlockShare$ = minsFromLastBlock$.shareReplay(nReplay)

const app = express()

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
})

app.get(
  '/btc/deals',
  (_, res) => minDiffShare$
    .take(nReplay)
    .retryWhen(errors =>
      errors
        .do(err => console.error(`Error: ${err}`))
        .delayWhen(val => Observable.timer(config.constants.timeRes * 10)))
    .subscribe(
    x => res.send(x),
    err => { console.error(`error in server: ${err}`) },
    // () => console.log('Successly sent price!')
  )
)

app.get(
  '/btc/minutes',
  (_, res) => minsFromLastBlockShare$
    .take(nReplay)
    .retryWhen(errors =>
      errors
        .do(err => console.error(`Error: ${err}`))
        .delayWhen(val => Observable.timer(config.constants.timeRes * 10)))
    .subscribe(
    x => res.send(x),
    err => { console.error(`error in server: ${err}`) },
    // () => console.log('Successly sent price!')
  )
)

app.listen(
  3000,
  () => console.log('Listening on port 3000!')
)