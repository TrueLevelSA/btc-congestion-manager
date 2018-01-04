import * as express from 'express'
// import { minDiff$ } from './fee-estimator'
import { Observable } from 'rxjs'
import { Client } from 'thruway.js'
import { config } from '../config'

const wamp = new Client(config.wamp.url, config.wamp.realm)

const minDiff$ = wamp.topic('com.fee.mindiff')
  .flatMap(y => y.args)
const nReplay = 1
const minDiffShare$ = minDiff$.shareReplay(nReplay)
const app = express()

app.get(
  '/',
  (_, res) => minDiffShare$
    .take(nReplay)
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
