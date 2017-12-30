import * as express from 'express'
// import { minDiff$ } from './listener'
import { Observable } from 'rxjs'
import { Client } from 'thruway.js'
import { config } from './config'

const wamp = new Client(config.wamp.url, config.wamp.realm)

const minDiff$ = wamp.topic('com.fee.mindiff')
  .flatMap(y => y.args)

const app = express()
app.get(
  '/',
  (req, res) => minDiff$.last()
    .subscribe(res.send)
)

app.listen(
  3000,
  () => console.log('Listening on port 3000!')
)

// inDiff$.last().subscribe(console.log)
