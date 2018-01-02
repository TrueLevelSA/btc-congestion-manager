import * as express from 'express'
// import { minDiff$ } from './fee-estimator'
import { Observable } from 'rxjs'
import { Client } from 'thruway.js'
import { config } from '../config'

const wamp = new Client(config.wamp.url, config.wamp.realm)
const minDiff$ = wamp.topic('com.fee.mindiff')
  .flatMap(y => y.args)
const n = 1
const minDiffShare$ = minDiff$.shareReplay(n)
const app = express()

app.get(
  '/',
  (_, res) => minDiffShare$
    .take(n)
    .subscribe(x => res.send(x))
)

app.listen(
  3000,
  () => console.log('Listening on port 3000!')
)
