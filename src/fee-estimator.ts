import * as RpcClient from 'bitcoin-core'
import { Observable, Subscriber } from 'rxjs'
import { isEqual, differenceBy, minBy, sumBy, meanBy, isEmpty } from 'lodash'
import { socket } from 'zeromq'
import { config } from '../config'
import * as Redis from 'ioredis'
import { MempoolTx, MempoolTxCustom, MempoolTxDefault } from './types'
import { setItem, getBufferAdded, getBufferRemoved } from './redis-adapter'

const { integrateTimeAdded, integrateBlocksRemoved, timeRes, minSavingsRate, range } =
  config.constants

const blockEffectiveSize =
  config.constants.blockSize
  * (1 - config.constants.minersReservedBlockRatio)

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
      if (cumSize > n * blockEffectiveSize) {
        targetBlock += 1
        n += 1
      }
      return { ...tx, cumSize, targetBlock }
    })

export const memPooler$ =
  Observable.timer(0, timeRes)
    .merge(blockHash$) // emit when new block found
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
    .map(txs => differenceBy(txs[1], txs[0], 'txid'))

const removedTxsShared$ =
  last2Mempools$
    .map(txs => differenceBy(txs[0], txs[1], 'txid'))
    .share()

export const minedTxs$ =
  removedTxsShared$
    .filter(txs => txs.length > 500) // reliable mined block proxy

// range selector of a sorted list
const rangeSelector = (xs: any[], edge0: number, edge1 = 0) => {
  if (edge0 > edge1)
    return xs.filter((_, x) =>
      x > xs.length * (1 - edge0) && x <= xs.length * (1 - edge1))
  else return []
}

export const minedTxsSummary$ =
  minedTxs$
    .withLatestFrom(interBlockInterval$, (mempool, ibi) => ({ ibi, mempool }))
    .timestamp()
    .map(x => x.value.mempool.map(y => ({ ...y, timestamp: x.timestamp, ibi: x.value.ibi }))
      .sort((a, b) => b.feeRate - a.feeRate))
    .map(txs => ({
      ibi: txs[0].ibi / 60e+3,
      date: new Date(txs[0].timestamp),
      ntxs: txs.length,
      blockSize: sumBy(txs, 'size') / 1e6,
      timestamp: txs[0].timestamp,
      fee: [.4, .2, .1, .05, .01, .005, .001]
        .reduce((acc, x, i, xs) => ({
          ...acc,
          [x]: meanBy(rangeSelector(txs, xs[i], xs[i + 1]), 'feeRate')
        }), {}),
      minFeeTx: minBy(txs, 'feeRate'),
    }))

export const blockEffectiveSize$ =
  minedTxsSummary$
    .map(x => x.blockSize)
    .bufferCount(integrateBlocksRemoved)
    .map(x => x.reduce((acc, y) => acc + y / integrateBlocksRemoved, 0))


const bufferAddedInitial$ =
  Observable.fromPromise(getBufferAdded('buffer_added'))
    .filter(x => !isEmpty(x))

export const bufferAdded$ =
  bufferAddedInitial$
    .merge(addedTxs$
      .flatMap(x => x)
      .map(x => ({ size: x.size, cumSize: x.cumSize }))
      .bufferTime(integrateTimeAdded, timeRes)
      .do(x => setItem('buffer_added', x)))
    .share()

const bufferRemovedInitial$ =
  Observable.fromPromise(getBufferRemoved('buffer_removed'))
    .filter(x => !isEmpty(x))

// buffer all txs until next block mined
export const bufferRemoved$ =
  bufferRemovedInitial$
    .merge(removedTxsShared$
      .flatMap(x => x)
      .map(tx => ({ size: tx.size, cumSize: tx.cumSize }))
      .buffer(blockHash$.delay(5e+3)) // delay so that memPooler$ can update first
      .withLatestFrom(interBlockInterval$, (txs, ibi) => ({ txs, ibi }))
      .bufferCount(integrateBlocksRemoved, 1)
      .map(x => x.reduce((acc, y) =>
        ({
          ibi: y.ibi + acc.ibi,
          txs: [...acc.txs, ...y.txs]
        }),
        { ibi: 0, txs: [] }))
      .do(x => setItem('buffer_removed', x)))

// returns bytes added to mempool / 10 min ahead of targetBlock
export const addedBytesAheadTargetPer10min = (targetBlock: number) =>
  bufferAdded$
    .map(txs => txs
      .filter(tx => tx.cumSize < targetBlock * blockEffectiveSize)
      .reduce((acc, tx) => acc + tx.size, 0))
    // (B / ms) * 10 min
    .map(addSize => (addSize / integrateTimeAdded) * 10 * 60e+3) // per 10 min per B
    .distinctUntilChanged()
    .do(x => {
      if (config.debug)
        console.log(`add velocity ahead of targetBlock ${targetBlock} is ${x / 1e+6} MW/10min`)
    })

export const removedBytesAheadTargetPer10min = (targetBlock: number) =>
  bufferRemoved$
    .map(x => ({
      ibi: x.ibi,
      rmSize: x.txs
        .filter(tx => tx.cumSize < targetBlock * blockEffectiveSize)
        .reduce((acc, tx) => tx.size + acc, 0)
    }))
    .map(x => (x.rmSize / x.ibi) * 10 * 60e+3)
    .distinctUntilChanged()
    .timestamp()
    .map(x => ({ rmV: x.value, rmtimestamp: x.timestamp }))
    .distinctUntilChanged()
    .do(x => {
      if (config.debug)
        console.log(`rm velocity ${x.rmV / 1e+6} MW/10min`)
    })

// mempool growth velocity in B / 10 min ahead of targetBlock
export const velocity = (targetBlock: number) =>
  Observable.combineLatest(
    addedBytesAheadTargetPer10min(targetBlock),
    removedBytesAheadTargetPer10min(targetBlock),
    (addV, rmV) => ({ addV, ...rmV }))
    .map(x => x.addV - x.rmV) // B / 10 min
    .scan((x, y) => !isEqual(x, y) ? y : x)
    .distinctUntilChanged()
    .share()

// export const finalPosition$ =
//   memPooler$
//     .map(txs => txs.find(tx => tx.targetBlock === 1 + 1))
//     .filter(tx => tx !== undefined)
//     .map((tx: MempoolTx) => tx.cumSize)
//     .scan((x, y) => !isEqual(x, y) ? y : x)
//     .distinctUntilChanged()
//     .share()
//     .do(x => {
//       if (config.debug)
//         console.log(`desired final position  ${x / 1e+6} MW`)
//     })

// the position x we aim to reach at time targetBlock
const finalPosition$ = Observable.of(blockEffectiveSize)

// find the initial position x_0
export const initialPosition = (targetBlock: number) =>
  Observable.combineLatest(
    finalPosition$,
    velocity(targetBlock),
    (x, v) => x - v * targetBlock)
    .scan((x, y) => !isEqual(x, y) ? y : x)
    .distinctUntilChanged()
    .do((x) => {
      if (config.debug)
        console.log(`initialPosition for targetBlock ${targetBlock} ${x / 1e+6} MB`)
    })

// find the tx in mempool closest to the estimated x_0, to observe how much it
// pays in fees
export const getFeeTx = (targetBlock: number) =>
  initialPosition(targetBlock)
    .combineLatest(memPooler$, (pos, txs) => ({ pos, txs }))
    .map(x => x.txs
      .map(tx => ({ ...tx, distance: Math.abs(tx.cumSize - x.pos) })))
    .map(x => minBy(x, y => y.distance))
    .filter(x => x !== undefined)
    .scan((x, y) => !isEqual(x, y) ? y : x)
    .distinctUntilChanged()
    .share()

export const getFee = (targetBlock: number) =>
  getFeeTx(targetBlock)
    .map((x: MempoolTx & { distance: number }) => x.feeRate)
    .timestamp()
    .map(x => ({
      // make the fee different from the base tx fee, afraid of bad minima if
      // api becomes heavily used
      targetBlock,
      feeRate: x.value + 0.01,
      timestamp: x.timestamp,
      date: new Date(x.timestamp),
    }))
    .scan((x, y) => !isEqual(x, y) ? y : x)
    .distinctUntilChanged()
    .do((x) => {
      if (config.debug)
        console.log(`getFee ${x.targetBlock} = ${x.feeRate} satoshi/W @ ${new Date(x.timestamp)}`)
    })

const fees = range.map(getFee)

export const feeDiff$ = Observable.combineLatest(...fees)
  .map(x => x
    .reduce((acc, fee, i, xs) =>
      [
        ...acc,
        (i > 0)
          ? {
            ...fee,
            diff: fee.targetBlock > 1
              ? (xs[i].feeRate - xs[i - 1].feeRate) / (range[i] - range[i - 1])
              : (xs[i].feeRate - xs[i - 1].feeRate) / -(range[i] - range[i - 1]),
          }
          : {
            ...fee,
            diff: 0,
          }
      ], [])
    .filter(x => x.diff <= 0))
  .scan((x, y) => !isEqual(x, y) ? y : x)
  .distinctUntilChanged()

const square = (n: number) => n * n

// cost function = sqrt(cumDiff * diff) / targetBlock. first value is the best
// deal, if any exist, otherwise its the next block estimated fee. last value is
// the next block estimated fee
export const minDiff$ = feeDiff$
  .map(x => {
    let cumDiff = 0
    let cumDiffNeg = 0
    return x.reduce((acc, fee, i, xs) => [
      ...acc,
      i === 0
        || (fee.targetBlock <= 1 && fee.diff / xs[0].feeRate >= minSavingsRate)
        || -fee.diff / xs[i - 1].feeRate >= minSavingsRate
        ? {
          ...fee,
          cumDiff: fee.targetBlock > 1 ? cumDiff += fee.diff : cumDiffNeg += fee.diff / 10,
          valid: fee.targetBlock > 1 ? fee.feeRate <= xs[0].feeRate : true,
        }
        : {
          ...fee,
          cumDiff: NaN,
          valid: false,
        },
    ], [])
      .filter(x => x.valid)
      .map(({ valid, ...x }) => x)
      .sort((b, a) =>
        Math.sqrt(a.diff * a.cumDiff) / (a.targetBlock)
        - Math.sqrt(b.diff * b.cumDiff) / (b.targetBlock))
  })
  .scan((x, y) => !isEqual(x, y) ? y : x)
  .distinctUntilChanged()
  // .map(x => x
  //   .map(({ targetBlock, ...y }) => ({ confirmationMinutes: targetBlock * 10, ...y })))
  .share()


