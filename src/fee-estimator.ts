import RpcClient from 'bitcoin-core'
import { Observable, Subscriber } from 'rxjs'
import { isEqual, differenceBy, minBy, sumBy, meanBy, isEmpty, range } from 'lodash'
import { socket } from 'zeromq'
import { config } from '../config'
import Redis from 'ioredis'
import { MempoolTx, MempoolTxCustom, MempoolTxDefault, GetBlock, Deal, MinsFromLastBlock }
  from './types'
import { setItem, getBufferAdded, getBufferRemoved, getBufferBlockSize, getMinsFromLastBlock }
  from './redis-adapter'

const { integrateTimeAdded, integrateBlocksRemoved, timeRes, minSavingsRate } =
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

const blockSize$ =
  blockHash$
    .flatMap((hash): Observable<GetBlock> =>
      Observable.fromPromise(
        rpc.getBlock(hash.toString('hex'))
          .then(res => res)
          .catch(err => { throw err })))
    .filter(x => isValid(x.weight))
    .map(x => x.weight / 4)
    .do(x => {
      if (config.debug) {
        console.log(`block size = ${x / 1e+6} MvB`)
      }
    })

const bufferBlockSizeInitial$ =
  Observable.fromPromise(getBufferBlockSize())
    .filter(x => !isEmpty(x))
    .flatMap(x => x)

const bufferBlockSize$ =
  Observable.merge(bufferBlockSizeInitial$, blockSize$)
    .bufferCount(integrateBlocksRemoved, 1)
    .do(x => setItem('buffer_blocksize', x))

const averageBlockSize$ =
  bufferBlockSize$
    .map(x => x
      .filter(isValid)
      .reduce((acc, x) => acc + x / integrateBlocksRemoved, 0))

const effectiveBlockSize$ =
  /* the following line was making the estimator believe blocks were too small
   * when mempool was empty for too long, thus i substituted with a hardcoded
   * blocksize */
  // averageBlockSize$
  Observable.of(config.constants.blockSize)
    .map(x => x * (1 - config.constants.minersReservedBlockRatio))
    .share()

const interBlockInterval$ =
  blockHash$
    .timeInterval()
    .map(x => x.interval)
    .do(x => {
      if (config.debug) {
        console.log(`ibi: ${x / 60e+3} minutes`)
      }
    })
    .share()

export const minsFromLastBlock$: Observable<MinsFromLastBlock> =
  Observable.merge(
    Observable.fromPromise(getMinsFromLastBlock()),
    blockHash$.mapTo(0)
  )
    .switchMap(x => Observable.timer(0, 60e+3).map(y => y + x))
    .withLatestFrom(
      blockHash$.map(x => x.toString('hex')),
      (minutes, blockHash) => ({ minutes, blockHash }))
    .do(x => console.log(`minsFromLastBlock ${x.minutes}`))
    .do(x => setItem('minsfromlastblock', x.minutes))
    .shareReplay(1)

const isValid = (x: number) => x != null && !isNaN(x) && x > 0

export const sortByFee = (txs, blockSize: number, cumSize = 0, targetBlock = 1) =>
  Object.keys(txs)
    .map((txid) => ({
      size: <number>txs[txid].size,
      fee: <number>txs[txid].fee,
      descendantsize: <number>txs[txid].descendantsize,
      descendantfees: <number>txs[txid].descendantfees,
      txid,
      feeRate: txs[txid].descendantfees / txs[txid].descendantsize,
    }))
    .filter(x => isValid(x.size)
      && isValid(x.fee)
      && isValid(x.descendantsize)
      && isValid(x.descendantfees)
      && isValid(x.feeRate))
    .sort((a, b) => b.feeRate - a.feeRate)
    .map((tx): MempoolTx => {
      cumSize += tx.size
      if (cumSize > targetBlock * blockSize) {
        targetBlock += 1
      }
      return { ...tx, cumSize, targetBlock }
    })

export const memPooler$ =
  Observable.timer(0, timeRes)
    .merge(blockHash$) // emit when new block found
    .switchMap((): Observable<any> =>
      Observable.fromPromise(
        rpc.getRawMemPool(true)
          .then(res => res)
          .catch(err => { throw err })))
    .withLatestFrom(effectiveBlockSize$, (txs, blockSize) => ({ txs, blockSize }))
    .map(({ txs, blockSize }) => sortByFee(txs, blockSize))
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
    .filter(txs => txs.length > config.constants.reliableMinedBlockThreshold) // reliable mined block proxy

// range selector of a sorted list
const rangeSelector = (xs: any[], edge0: number, edge1 = 0) =>
  edge0 > edge1
    ? xs.filter((_, x) =>
      x > xs.length * (1 - edge0) && x <= xs.length * (1 - edge1))
    : []

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
    .do(x => {
      if (config.debug) {
        console.dir(x)
      }
    })

const bufferAddedInitial$ =
  Observable.fromPromise(getBufferAdded())
    .filter(x => !isEmpty(x))

export const bufferAdded$ =
  bufferAddedInitial$
    .merge(addedTxs$
      .flatMap(x => x)
      // .timestamp()
      .map(x => ({
        size: x.size,
        cumSize: x.cumSize,
        // timestamp: x.timestamp
      }))
      .bufferTime(integrateTimeAdded, timeRes)
      .do(x => setItem('buffer_added', x)))
    .share()

const bufferRemovedInitial$ =
  Observable.fromPromise(getBufferRemoved())
    .filter(x => !isEmpty(x))

// buffer all txs until next block mined
export const bufferRemoved$ =
  bufferRemovedInitial$
    .merge(removedTxsShared$
      .flatMap(x => x)
      .filter(tx => isValid(tx.size) && isValid(tx.cumSize))
      .map(tx => ({ size: tx.size, cumSize: tx.cumSize }))
      .buffer(blockHash$.delay(1.5e3)) // delay so that memPooler$ can update first
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
    .withLatestFrom(effectiveBlockSize$, (txs, blockSize) => ({ txs, blockSize }))
    .map(({ txs, blockSize }) => txs
      .filter(tx => isValid(tx.size)
        && isValid(tx.cumSize)
        && tx.cumSize < targetBlock * blockSize)
      .reduce((acc, tx) => acc + tx.size, 0))
    // (B / ms) * 10 min
    .map(addSize => (addSize / integrateTimeAdded) * 10 * 60e+3) // per 10 min per B
    .distinctUntilChanged()

export const removedBytesAheadTargetPer10min = (targetBlock: number) =>
  bufferRemoved$
    .withLatestFrom(effectiveBlockSize$, (x, blockSize) => ({ ...x, blockSize }))
    .map(x => ({
      ibi: x.ibi,
      rmSize: x.txs
        .filter(tx => isValid(tx.size)
          && isValid(tx.cumSize)
          && tx.cumSize < targetBlock * x.blockSize)
        .reduce((acc, tx) => acc + tx.size, 0)
    }))
    .filter(x => isValid(x.rmSize) && isValid(x.ibi))
    .map(x => (x.rmSize / x.ibi) * 10 * 60e+3)
    .timestamp()
    .map(x => ({ rmV: x.value, rmtimestamp: x.timestamp }))
    .distinctUntilChanged()

// mempool growth velocity in B / 10 min ahead of targetBlock
export const velocity = (targetBlock: number) =>
  Observable.combineLatest(
    addedBytesAheadTargetPer10min(targetBlock),
    removedBytesAheadTargetPer10min(targetBlock),
    (addV, rmV) => ({ addV, ...rmV }))
    .filter(x => isValid(x.addV) && isValid(x.rmV))
    .map(x => x.addV - x.rmV) // B / 10 min
    .scan((x, y) => !isEqual(x, y) ? y : x)
    .distinctUntilChanged()
    .do(x => {
      if (config.debug)
        console.log(`velocity ahead of targetBlock ${targetBlock} is ${x / 1e+6} MvB/10min`)
    })
    .share()

// // the position x we aim to reach at time targetBlock
const finalPosition = (targetBlock: number) =>
  effectiveBlockSize$
    .filter(blockSize => isValid(blockSize))
    .map(blockSize => targetBlock * blockSize)

// find the initial position x_0
export const initialPosition = (targetBlock: number) =>
  Observable.combineLatest(
    finalPosition(targetBlock),
    velocity(targetBlock),
    (x, v) => x - v * targetBlock)
    .scan((x, y) => !isEqual(x, y) ? y : x)
    .distinctUntilChanged()
    .do((x) => {
      if (config.debug)
        console.log(`initialPosition for targetBlock ${targetBlock} ${x / 1e+6} MvB`)
    })

// find the tx in mempool closest to the estimated x_0, to observe how much it
// pays in fees
export const getFeeTx = (targetBlock: number) =>
  initialPosition(targetBlock)
    .combineLatest(memPooler$, (pos, txs) => ({ pos, txs }))
    .filter(x => isValid(x.pos))
    .map(x => x.txs
      .filter(tx => isValid(tx.cumSize))
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
      // timestamp: x.timestamp,
      date: new Date(x.timestamp),
    }))
    .scan((x, y) => !isEqual(x, y) ? y : x)
    .distinctUntilChanged()
    .do((x) => {
      if (config.debug)
        console.log(`getFee ${x.targetBlock} = ${x.feeRate} satoshi/B @ ${x.date}`)
    }).startWith({
      targetBlock,
      feeRate: NaN,
      date: new Date(),
    })

const fees = config.constants.range.map(getFee)

// take the derivative (diff) of feeRate over targetBlock
export const feeDiff$ = Observable.combineLatest(...fees)
  .filter(x => x != null)
  .map(x => x
    .filter(y => isValid(y.feeRate))
    .reduce((acc, fee, i, xs) =>
      [
        ...acc,
        (fee.targetBlock > 1)
          ? {
            ...fee,
            diff: (xs[i].feeRate - xs[i - 1].feeRate)
              / (config.constants.range[i] - config.constants.range[i - 1])
          }
          : {
            ...fee,
            diff: 0,
          }
      ], [])
    .filter(x => x.diff <= 0)
  )
  .scan((x, y) => !isEqual(x, y) ? y : x)
  .distinctUntilChanged()

const square = (n: number) => n * n

const median = (values: number[]) => {
  values.sort((a, b) => a - b)
  const half = Math.floor(values.length / 2)
  if (values.length % 2) return values[half]
  else return (values[half - 1] + values[half]) / 2
}

// quantify relative goodness of the fee estimates
const addScore = (minDiffs: Array<Deal & { diff: number }>) => {
  const medianFee = median(minDiffs.map(x => x.feeRate))
  const scores = minDiffs.map(x =>
    (medianFee - x.diff) / (x.targetBlock * x.feeRate))
  const maxScore = Math.max(...scores)
  return scores
    .map((x, i) => ({ ...minDiffs[i], score: x / maxScore }))
    .map(({ diff, ...x }) => ({ ...x }))
}

// the dealer picks the best deals by finding places where there are large fee
// jumps on the queue (larger than minSavingsRate).
export const dealer$: Observable<Array<Deal & { score: number }>> = feeDiff$
  .map(x => x
    .filter(fee => isValid(fee.feeRate))
    .reduce((acc, fee, i, xs) =>
      [
        ...acc,
        i === 0
          || (xs[i - 1].feeRate - xs[i].feeRate) / xs[i - 1].feeRate >= minSavingsRate
          ? {
            ...fee,
            valid: i >= 1
              ? range(0, i - 1).every(j => fee.feeRate <= xs[j].feeRate)
              : true,
          }
          : {
            ...fee,
            valid: false,
          },
      ], [])
    .filter(x => x.valid)
    .map(({ valid, ...x }) => x)
    .sort((a, b) => a.targetBlock - b.targetBlock)
  )
  .map(x => addScore(x))
  .scan((x, y) => !isEqual(x, y) ? y : x)
  .distinctUntilChanged()
  .share()
