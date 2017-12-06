import { Client } from 'thruway.js'

const wamp = new Client('ws://localhost:8080/ws', 'realm1')

const fee1 = wamp.topic('com.buffered.getfee1')
  .flatMap(x => x.args)

const fee2 = wamp.topic('com.buffered.getfee2')
  .flatMap(x => x.args)

const fee3 = wamp.topic('com.buffered.getfee3')
  .flatMap(x => x.args)

const fee4 = wamp.topic('com.buffered.getfee4')
  .flatMap(x => x.args)

const fee5 = wamp.topic('com.buffered.getfee5')
  .flatMap(x => x.args)

const fee6 = wamp.topic('com.buffered.getfee6')
  .flatMap(x => x.args)

const mined = wamp.topic('com.buffered.minedtxssummary')
  .flatMap(x => x.args)

fee1.merge(fee2)
  .merge(fee3)
  .merge(fee4)
  .merge(fee5)
  .merge(fee6)
  .merge(mined)
  .subscribe(x => console.dir(x))
