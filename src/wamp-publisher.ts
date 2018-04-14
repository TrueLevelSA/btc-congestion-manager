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
    role: config.wamp.user,
    authid: config.wamp.user,
  }
)

wamp.onChallenge(challenge => challenge
  .map((x) => auth_cra.sign(config.wamp.key, x.extra.challenge)))

wamp.publish(
  'com.fee.all',
  Observable.of(
    [
      'com.fee.v1.btc.minsfromlastblock',
      'com.fee.v1.btc.minedtxssummary',
      'com.fee.v1.btc.deals',
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

const sub0 = wamp.publish('com.fee.v1.btc.minsfromlastblock', minsFromLastBlock$)
const sub1 = wamp.publish('com.fee.v1.btc.minedtxssummary', minedTxsSummary$)
let sub2 = wamp.publish('com.fee.v1.btc.deals', dealerRecover$)

const suicideOnStall = () => dealerRecover$
  .timeInterval()
  .filter(x => x.interval > config.constants.timeRes * 10)
  .subscribe(
  () => {
    sub2.unsubscribe()
    console.error('suicide due to stall')
    process.exit() // will be relauched by forevermonitor
  }
  )

suicideOnStall()
