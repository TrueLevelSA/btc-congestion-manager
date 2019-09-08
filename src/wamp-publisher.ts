import { dealer$, minedTxsSummary$, minsFromLastBlock$ } from './fee-estimator'
import { Observable } from 'rxjs'
import { config } from '../config'
import { Client } from 'thruway.js'
import { auth_cra } from 'autobahn'

const wamp = new Client(
  config.wamp.url,
  config.wamp.realm,
  {
    authmethods: ['wampcra'],
    role: config.wamp.role,
    authid: config.wamp.user,
  }
)

wamp.onChallenge(challenge => challenge
  .map((x) => auth_cra.sign(config.wamp.key, (x.extra as any).challenge)))

wamp.publish(
  'com.fee.all',
  Observable.of(
    [
      config.wamp.topic.minsfromlastblock,
      config.wamp.topic.minedtxssummary,
      config.wamp.topic.deals,
    ]
  )
)
const dealerRecover$ = dealer$
  .retryWhen(error$ =>
    error$
      .do(err => {
        console.error()
        console.error(`------ ${(new Date()).toString()} ------`)
        console.error(err)
        console.error(`------------`)
      })
      .delay(config.constants.timeRes))
  .share()

// this is an ordinary client, listening for new value, like any other outside
// subscriber
const monitoring$ = wamp.topic(config.wamp.topic.deals)
  .flatMap(y => y.args)

wamp.publish(config.wamp.topic.minsfromlastblock, minsFromLastBlock$)
wamp.publish(config.wamp.topic.minedtxssummary, minedTxsSummary$)
wamp.publish(config.wamp.topic.deals, dealerRecover$)

// if monitoring$ doesn't produce new values for too long, kill process
const suicideOnStall = () => monitoring$
  .timeInterval()
  .filter(x => x.interval > config.constants.timeRes * 10)
  .subscribe(
    () => {
      console.error()
      console.error(`------ ${(new Date()).toString()} ------`)
      console.error(`Suicide because no estimates published by wamp-publisher for > ${(config.constants.timeRes * 10) / 1e+3} seconds`)
      console.error(`----------------------------------------`)
      console.error()
      process.exit() // will be relaunched by forevermonitor
    }, (e) => {
      console.error()
      console.error(`------ ${(new Date()).toString()} ------`)
      console.error("Failed suicide attempt, with error:\n", e)
      console.error(`----------------------------------------`)
    }
  )

suicideOnStall()
