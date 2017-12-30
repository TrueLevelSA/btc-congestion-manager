import { argv } from 'yargs'
import * as RpcClient from 'bitcoin-core'
import { Observable, Subscriber } from 'rxjs'
import { isEqual, differenceBy, minBy, sumBy, meanBy } from 'lodash'
import { socket } from 'zeromq'
import { Client } from 'thruway.js'
import { config } from './config'

const wamp = new Client(config.wamp.url, config.wamp.realm)

const { intTimeAdded, timeRes, blockSize, minersReservedBlockRatio } =
  config.constants

const rpc = new RpcClient(config.rpc)

export const blockHash$: Observable<Buffer> =
  Observable.create((subscriber: Subscriber<any>) => {
    const s = socket('sub')
    s.connect(config.zmq_socket.url)
    s.subscribe('hashblock')
    s.monitor(10000)
    s.on('open', () => console.log('socket opened'))
    s.on('message', (topic, message) => subscriber.next(message))
    s.on('reconnect_error', (err) => subscriber.error(err))
    s.on('reconnect_failed', () => subscriber.error(new Error('reconnection failed')))
    s.on('close', () => {
      s.unsubscribe('hashblock')
      s.close()
      subscriber.complete()
    })
    return () => s.close()
  }).share()

const interBlockInterval$ =
  blockHash$
    .timeInterval()
    .map(x => x.interval)
    .share()

export const sortByFeeExp = (
  txs,
  cumSize = 0,
  targetBlock = 1,
  n = 1,
  // blockSize * Math.pow(1 - minersReservedBlockRatio, n)
  nextBlockThreshold = blockSize * minersReservedBlockRatio
) =>
  Object.keys(txs)
    .map((txid) => ({
      size: <number>txs[txid].size,
      fee: <number>txs[txid].fee,
      descendantsize: <number>txs[txid].descendentsize,
      descendantfees: <number>txs[txid].descendentfees,
      txid,
      feeRate: txs[txid].descendantfees / txs[txid].descendantsize,
    }))
    .sort((a, b) => b.feeRate - a.feeRate)
    .map((tx): MempoolTx => {
      cumSize += tx.size
      if (cumSize > nextBlockThreshold) {
        targetBlock += 1
        n += 1
        // the pow makes predicitions in the future assume blocks are smaller,
        // compensating for the multiplicative error
        nextBlockThreshold += blockSize * Math.pow(1 - minersReservedBlockRatio, n)
      }
      return { ...tx, cumSize, targetBlock }
    })

export const sortByFee = (txs, cumSize = 0, targetBlock = 1, n = 1) =>
  Object.keys(txs)
    .map((txid) => ({
      size: <number>txs[txid].size,
      fee: <number>txs[txid].fee,
      descendantsize: <number>txs[txid].descendentsize,
      descendantfees: <number>txs[txid].descendentfees,
      txid,
      feeRate: txs[txid].descendantfees / txs[txid].descendantsize,
    }))
    .sort((a, b) => b.feeRate - a.feeRate)
    .map((tx): MempoolTx => {
      cumSize += tx.size
      if (cumSize > n * blockSize) {
        targetBlock += 1
        n += 1
      }
      return { ...tx, cumSize, targetBlock }
    })

export const memPooler$ =
  Observable.timer(0, timeRes)
    .merge(blockHash$) // run when new block found
    .flatMap((_): Observable<MempoolTx[]> =>
      Observable.fromPromise(rpc.getRawMemPool(true)))
    .scan((x, y) => !isEqual(x, y) ? y : x)
    .distinctUntilChanged()
    .map(txs => sortByFee(txs))
    .share()

// time moving array containing the last 2 MempoolTx[]
export const last2Mempools$ =
  memPooler$
    .bufferCount(2, 1)
    .share()

export const addedTxs$ =
  last2Mempools$
    .flatMap(txs => differenceBy(txs[1], txs[0], 'txid'))
// .share()

const removedTxsShared$ =
  last2Mempools$
    .map(txs => differenceBy(txs[0], txs[1], 'txid'))
    .share()

export const removedTxs$ =
  removedTxsShared$.flatMap(x => x)
// .share()

export const minedTxs$ =
  removedTxsShared$
    .filter(txs => txs.length > 500) // reliable mined block proxy
    .withLatestFrom(interBlockInterval$, (mempool, ibi) => ({ ibi, mempool }))
    .timestamp()
    .map(x => x.value.mempool.map(y => ({ ...y, timestamp: x.timestamp, ibi: x.value.ibi }))
      .sort((a, b) => b.feeRate - a.feeRate))
// .share()

// min quantile of a sorted list
const minQuant = (xs: any[], quantile: number) =>
  xs.filter((_, i) => i > xs.length * (1 - quantile))

export const minedTxsSummary$ =
  minedTxs$
    .map(x => ({
      ibi: x[0].ibi / 60e+3,
      date: new Date(x[0].timestamp),
      txs: x.length,
      blockSize: sumBy(x, 'size') / 1e6,
      timestamp: x[0].timestamp,
      fee: [.4, .2, .1, .05, .01, .005, .001]
        .reduce((acc, y) => ({
          ...acc,
          [y]: meanBy(minQuant(x, y), 'feeRate')
        }), {}),
      minFeeTx: minBy(x, 'feeRate')
    }))

wamp.publish('com.fee.minedtxssummary', minedTxsSummary$)

export const bufferAdded$ =
  addedTxs$
    .map(x => ({ size: x.size, cumSize: x.cumSize }))
    .bufferTime(intTimeAdded, timeRes)
    .share()

// buffer all txs until next block mined
export const bufferRemoved$ =
  removedTxs$
    .map(tx => ({ size: tx.size, cumSize: tx.cumSize }))
    .buffer(blockHash$.delay(5e+3)) // delay so that memPooler$ can update first
    .withLatestFrom(interBlockInterval$, (txs, ibi) => ({ txs, ibi }))
    .bufferCount(18, 1)
    .map(x => x.reduce((acc, y) =>
      ({
        ibi: y.ibi + acc.ibi,
        txs: [...acc.txs, ...y.txs]
      }),
      { ibi: 0, txs: [] }))
// .share()

// returns bytes added to mempool / 10 min ahead of targetBlock
export const addedBytesAheadTargetPer10min = (targetBlock: number) =>
  bufferAdded$
    .map(txs => txs
      .filter(tx => tx.cumSize < targetBlock * blockSize)
      .reduce((acc, tx) => acc + tx.size, 0))
    .map(x => (x / intTimeAdded) * 10 * 60e+3) // per 10 min per B
    .distinctUntilChanged()
// .do(x => console.log(`add velocity ahead of targetBlock ${targetBlock} is ${x / 1e+6} MW/10min`))

export const removedBytesAheadTargetPer10min = (targetBlock: number) =>
  bufferRemoved$
    .map(x => x.txs
      .filter(tx => tx.cumSize < targetBlock * blockSize)
      .reduce((acc, tx) => ({
        ...acc,
        value: tx.size + acc.value,
      }),
      {
        value: 0,
        ibi: x.ibi
      }))
    .map(x => x.value / (x.ibi / 60e+3) * 10)
    .distinctUntilChanged()
    .timestamp()
    .map(x => ({ rmV: x.value, rmtimestamp: x.timestamp }))
// .do(x => console.log(`rm velocity ${x.rmV / 1e+6} MW/10min`))

// mempool growth velocity in B / 10 min ahead of targetBlock
export const velocity = (targetBlock: number) =>
  Observable.combineLatest(
    addedBytesAheadTargetPer10min(targetBlock),
    removedBytesAheadTargetPer10min(targetBlock),
    (addV, rmV) => ({ addV, ...rmV }))
    .timestamp()
    .map(x => ({ ...x.value, now: x.timestamp }))
    .map(x => x.addV - x.rmV) // B / 10 min
    .distinctUntilChanged()
// .do(x => console.log(`velocity ahead of targetBlock ${targetBlock} is ${x / 1e+6} MW/10min`))

export const finalPosition = (targetBlock: number) =>
  memPooler$
    .map(txs => txs.find(tx => tx.targetBlock === targetBlock + 1))
    .filter(tx => tx !== undefined)
    .map((tx: MempoolTx) => tx.cumSize)

// find the initial position x_0
export const initialPosition = (targetBlock: number) =>
  Observable.combineLatest(
    finalPosition(targetBlock),
    velocity(targetBlock),
    (x, v) => x - v * targetBlock)
    .distinctUntilChanged()
// .do((x) => console.log(`initialPosition for targetBlock ${targetBlock} ${x / 1e+6} MW`))

// find the tx in mempool closest to the estimated x_0, to observe how much it
// pays in fees
export const getFeeTx = (targetBlock: number) =>
  initialPosition(targetBlock)
    .combineLatest(memPooler$, (pos, txs) => ({ pos, txs }))
    .map(x => x.txs
      .map(tx => ({ ...tx, distance: Math.abs(tx.cumSize - x.pos) })))
    .map(x => minBy(x, y => y.distance))
    .filter(x => x !== undefined)
    .share()

export const getFee = (targetBlock: number) =>
  getFeeTx(targetBlock)
    .map((x: MempoolTx & { distance: number }) => x.feeRate)
    .timestamp()
    .map(x => ({
      // make the fee different from the base tx fee, afraid of bad minima if
      // protocol becomes heavily used
      feeRate: x.value * 0.999,
      timestamp: x.timestamp,
      date: new Date(x.timestamp),
      targetBlock,
    }))
// .do((x) => console.log(`getFee ${x.targetBlock} = ${x.feeRate} satoshi/W @ ${new Date(x.timestamp)}`))

export const range = [1, 2, 3, 4]

export const fees = range
  .map(x => getFee(x))

const feeDiff$ = Observable.combineLatest(...fees)
  .map(x => x
    .reduce((acc, fee, i, xs) =>
      [
        ...acc,
        (i > 0)
          ? {
            diff: (xs[i].feeRate - xs[i - 1].feeRate) / (range[i] - range[i - 1]),
            ...fee,
          }
          : {
            diff: 0,
            ...fee,
          }
      ], [])
    .filter(x => x.diff <= 0))


// cost function = feeDiff / sqrt(targetBlock)
// last value best deal
export const minDiff$ = feeDiff$
  .map(x => x
    .sort((a, b) =>
      b.diff / Math.sqrt(b.targetBlock)
      - a.diff / Math.sqrt(a.targetBlock)))
  .share()

wamp.publish('com.fee.mindiff', minDiff$)

// useful to have a subscriber for debugging, although wamp.publish does
// subscribe by itself

// subscriber
Observable.merge(minDiff$, minedTxsSummary$)
  .retryWhen(err => {
    console.error(err)
    return err.delay(20e+3)
  })
  .subscribe(
  x => console.dir(x),
  err => console.error(err),
  () => console.log('finished (not implemented)')
  )

type MempoolTx = MempoolTxDefault & MempoolTxCustom

// drop some of the fields of the default tx in order to save memory
// dropped fields commented out below
export interface MempoolTxDefault {
  size: number
  fee: number
  // modifiedfee: number
  // time: number
  // height: number
  // descendantcount: number
  descendantsize: number
  descendantfees: number
  // ancestorcount: number
  // ancestorsize: number
  // ancestorfees: number
  // depends: string[]
}

interface MempoolTxCustom {
  txid: string
  feeRate: number
  cumSize: number
  targetBlock: number
}
