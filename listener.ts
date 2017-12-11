import { argv } from 'yargs'
import * as RpcClient from 'bitcoin-core'
import { Observable, Subscriber } from 'rxjs'
import { isEqual, differenceBy, minBy, sumBy, isEmpty, meanBy, sortBy, reverse } from 'lodash'
import { socket } from 'zeromq'
// import { Client } from 'thruway.js'
// import { MempoolTx, intTimeAdded, timeRes } from './buffered'

// const wamp = new Client('ws://localhost:8080/ws', 'realm1')

export const intTimeAdded = 30 * 60e+3 // 30 min
export const timeRes = 30e+3; // 30 s
export const blockSize = 1e+6

const host = process.env.RPC_HOST || '127.0.0.1'

const rpc =
  new RpcClient({
    host,
    port: 8332,
    username: 'test',
    password: 'test',
  })

export const blockHash$: Observable<Buffer> =
  Observable.create((subscriber: Subscriber<any>) => {
    const s = socket('sub')
    s.connect('tcp://localhost:28333')
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

// const blockHash$ = blockHashSocket$.share()
// wamp.publish('com.buffered.blockhash', blockHash$);
const interBlockInterval$ =
  blockHash$
    .timeInterval()
    .map(x => x.interval)
    .do(_ => console.log('\n--------------------'))
    .do(t => console.log(`new block found after ${t / 60e+3} minutes`))
    .do(_ => console.log('--------------------\n'))
    .share()
// wamp.publish('com.buffered.interblockinterval', interBlockInterval$);

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
  Observable.timer(0, 30e+3)
    .merge(blockHash$) // run when new block found
    .flatMap((_): Observable<MempoolTx[]> =>
      Observable.fromPromise(rpc.getRawMemPool(true)))
    .scan((x, y) => !isEqual(x, y) ? y : x)
    .distinctUntilChanged()
    .map(txs => sortByFee(txs))
    .share()

// wamp.publish('com.buffered.mempooler$', memPooler$);

// time moving array containing the last 2 MempoolTx[]
export const last2Mempools$ =
  memPooler$
    .bufferCount(2, 1)
    .share()

// wamp.publish('com.buffered.last2mempools$', last2Mempools$);

export const addedTxs$ =
  last2Mempools$
    .flatMap(txs => differenceBy(txs[1], txs[0], 'txid'))
// .share()

// wamp.publish('com.buffered.addedtxs$', addedTxs$)

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
    .do(x => console.log(`mined ${x.length} txs at ${new Date(x[0].timestamp)}`))
    // .map(x => ({ ...x.value, interval: x.interval }))
    .map(x => ({
      ibi: x[0].ibi / 60e+3,
      date: new Date(x[0].timestamp),
      txs: x.length,
      blockSize: sumBy(x, 'size') / 1e6,
      timestamp: x[0].timestamp,
      fee: {
        [0.100]: meanBy(minQuant(x, 0.100), 'feeRate'),
        [0.050]: meanBy(minQuant(x, 0.050), 'feeRate'),
        [0.010]: meanBy(minQuant(x, 0.010), 'feeRate'),
        [0.005]: meanBy(minQuant(x, 0.005), 'feeRate'),
        [0.001]: meanBy(minQuant(x, 0.001), 'feeRate'),
        minFeeTx: minBy(x, 'feeRate')
      }
    }))
// .do(x => console.log(`block size: ${sumBy(x, 'size')}`))
// .do(_ => console.log('-----------------------------\n'))

export const bufferAdded$ =
  addedTxs$
    .map(x => ({ size: x.size, cumSize: x.cumSize }))
    .bufferTime(intTimeAdded, timeRes)
    .share()

// wamp.publish('com.buffered.bufferadded$', bufferAdded$)

// buffer all txs until next block mined
export const bufferRemoved$ =
  removedTxs$
    .map(tx => ({ size: tx.size, cumSize: tx.cumSize }))
    .buffer(blockHash$.delay(5e+3)) // delay so that memPooler$ can update first
    .withLatestFrom(interBlockInterval$, (txs, ibi) => ({ txs, ibi }))
    .bufferCount(6, 1)
    .map(x => x.reduce((acc, y) =>
      ({
        ibi: y.ibi + acc.ibi,
        txs: [...acc.txs, ...y.txs]
      }),
      { ibi: 0, txs: [] }))
// .share()

// wamp.publish('com.buffered.bufferremoved$', bufferRemoved$)


// const wamp = new Client('ws://localhost:8080/ws', 'realm1')

// export const blockWeight = 4e+6

// const blockHash$ = wamp.topic('com.buffered.blockhash')
//   .flatMap(x => x.args)

// const interBlockInterval$ = wamp.topic('com.buffered.interblockinterval$')
//   .flatMap(x => x.args)

// const memPooler$: Observable<MempoolTx[]> =
//   wamp.topic('com.buffered.mempooler$')
//     .flatMap(x => x.args)

// const last2Mempools$ = wamp.topic('com.buffered.last2mempools$')
//   .flatMap(x => x.args)

// const addedTxs$ = wamp.topic('com.buffered.addedtxs$')
//   .flatMap(x => x.args)

// const removedTxs$ = wamp.topic('com.buffered.removedtxs$')
//   .flatMap(x => x.args)

// const bufferAdded$: Observable<MempoolTx[]> =
//   wamp.topic('com.buffered.bufferadded$')
//     .flatMap(x => x.args)

// const bufferRemoved$: Observable<{ txs: MempoolTx[], ibi: number }> =
//   wamp.topic('com.buffered.bufferremoved$')
//     .flatMap(x => x.args)

// const minedTxs$: Observable<{ txid: string, timestamp: number }[]> =
//   wamp.topic('com.buffered.minedtxs$')
//     .flatMap(x => x.args)

// returns bytes added to mempool / 10 min ahead of targetBlock
export const addedBytesAheadTargetPer10min = (targetBlock: number) =>
  bufferAdded$
    .map(txs => txs
      .filter(tx => tx.cumSize < targetBlock * blockSize)
      .reduce((acc, tx) => acc + tx.size, 0))
    .map(x => (x / intTimeAdded) * 10 * 60e+3) // per 10 min per B
    .distinctUntilChanged()
    .do(x => console.log(`add velocity ${x / 1e+6} MW/10min`))

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
    .do(x => console.log(`rm velocity ${x.rmV / 1e+6} MW/10min`))

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
    .do(x => console.log(`velocity ${x / 1e+6} MW/10min`))

// const minsFromLastBlock = (x.now - x.rmtimestamp) / 60e3
// const rmV = (x.rmV / 10) * (10 + minsFromLastBlock)
// const rmV = x.rmV

export const finalPosition = (targetBlock: number) =>
  memPooler$
    .map(txs => txs.find(tx => tx.targetBlock === targetBlock + 1))
    .filter(tx => tx !== undefined)
    .map((tx: MempoolTx) => tx.cumSize)

export const initialPosition = (targetBlock: number) =>
  Observable.combineLatest(
    finalPosition(targetBlock),
    velocity(targetBlock),
    (x, v) => x - v * targetBlock)
    .distinctUntilChanged()
    .do((x) => console.log(`initialPosition ${x / 1e+6} MW`))

export const getFeeTx = (targetBlock: number) =>
  initialPosition(targetBlock)
    .combineLatest(memPooler$, (pos, txs) => ({ pos, txs }))
    .map(x => x.txs
      .map(tx => ({ ...tx, distance: Math.abs(tx.cumSize - x.pos) })))
    .map(x => minBy(x, y => y.distance))
    .filter(x => x !== undefined)
    .share()

// export const estimateConfBlock = (feeRate: number) =>
//   memPooler$
//     .map(txs => txs
//       .map(tx => ({ ...tx, distance: Math.abs(tx.cumSize - x.pos) })))
// .map(x => x)

export const getFee = (targetBlock: number) =>
  getFeeTx(targetBlock)
    .map((x: MempoolTx & { distance: number }) => x.feeRate)
    .timestamp()
    .map(x => ({
      feeRate: x.value,
      timestamp: x.timestamp,
      date: new Date(x.timestamp),
      targetBlock,
    }))
    .do((x) => console.log(`getFee ${x.targetBlock} = ${x.feeRate} satoshi/W @ ${new Date(x.timestamp)}`))
    .do(_ => console.log('--------------------'))

// const bufferedMinedTxs$ =
//   minedTxs$
//     .bufferTime(60e+3, 1e+3)
//     .flatMap(x => x)
//     .distinctUntilChanged()
//     .share()

// as string because it can be used for publishing to wamp
// export const range = ['01', '02', '03', '04', '05', '06', '09', '12', '15', '18', '21']

export const range = [1, 2, 3, 4, 5, 6, 9, 12, 15, 18, 21, 25, 30, 35, 40, 50, 60]

export const fees = range
  .map(x => getFee(x).share())
// export const fees = range
//   .map(x => {
//     const getter$ = getFee(Number(x)).share()
//     // wamp.publish('com.buffered.getfee' + x, getter$)
//     return getter$
//   })

// wamp.publish('com.buffered.minedtxssummary', minedTxsSummary$)

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
            diff: NaN,
            ...fee,
          }
      ], [])
    .filter(x => !isNaN(x.diff)))

// cost function = feeDiff / sqrt(targetBlock)
// last value best deal
const minDiff$ = feeDiff$
  .flatMap(x => x
    .sort((a, b) =>
      b.diff / Math.sqrt(b.targetBlock)
          - a.diff / Math.sqrt(a.targetBlock)))

// subscriber
Observable.merge(minDiff$, minedTxsSummary$)
  .retryWhen(err => {
    console.error(err)
    return err.delay(20e+3)
  })
  .subscribe(
  x => console.dir(x),
  err => console.error(err),
  () => console.log('finished (not implement)')
  )


// getFee(6).combineLatest(getFee(5), getFee(4), getFee(3), getFee(2), getFee(1), (x, y, z, i, j) => )

// export const errorFun = (targetBlock: number, counts = 60, res = 60e+3) =>
//   Observable.timer(0, res)
//     .flatMap(_ => getFeeTx(targetBlock).last())
//     .timestamp()
//     .bufferCount(counts, res)
//     .map((x) => x
//       .filter(y => y !== undefined)
//       .map(y => ({
//         ...y.value,
//         timestamp: y.timestamp
//       }))
//       .map((z: MempoolTx & { distance: number; timestamp: number }) =>
//         ({
//           txid: z.txid,
//           timestamp: z.timestamp + targetBlock * 10 * 60e+3
//         })))
//     .withLatestFrom(bufferedMinedTxs$, (predicted, mined) => mined
//       .map(m => predicted
//         .filter(p => p.txid === m.txid)
//         .map(x => ({
//           txid: m.txid,
//           predicted: x.timestamp,
//           mined: m.timestamp
//         }))))
//     .flatMap(x => x)
//     .do(x => x.map(y =>
//       console.log(`txid: ${y.txid}, predicted: ${y.predicted / (10 * 60e+3)}, mined: ${y.mined / (10 * 60e+3)}, difference: ${(y.predicted - y.mined) / (10 * 60e+3)}, mining success rate: ${counts / x.length}`)))
//     .flatMap(x => x.map(y => ({
//       timeError: y.predicted - y.mined,
//       successRate: counts / x.length
//     })))
//     .bufferTime(counts * res, res)
//     .map(x => x.map(y => ({
//       timeError: y.timeError / (10 * 60e+3),
//       successRate: y.successRate
//     })))
//     .filter(x => !isEmpty(x))
//     .map(x => ({
//       timeError: ci(x, 'timeError'),
//       successRate: ci(x, 'successRate')
//     }))
//     .do(x => console.log(`95% CI per 10 min based on past hour's data`))
//     .do(x => console.dir(x))

// const mean = (xs: number[]) =>
//   xs.reduce((acc, x) => acc + x, 0) / xs.length

// const ci = (xs: object[], prop: string) => {
//   const mean = meanBy(xs, prop)
//   const squareErr = xs[prop]
//     .map(x => x - mean)
//     .map(x => x * x)
//   const variance = meanBy(squareErr)
//   const std = Math.sqrt(variance)
//   const ci = 1.96 * std / xs.length
//   return { mean, ci }
// }
// .sample(blockHash$.delay(10e+3))
// .flatMap()
// export const fee = (targetBlock: number) =>
//   initialPosition(targetBlock)
//     .do(x => console.log(`initialPos in fee ${x}`))
//     .flatMap((pos) => getFee(pos))
//     .do((x) => console.log(`fee ${x} B`))

// const res = 200 / blockWeight
// const getFee = (targetBlock: number) =>
//   initialEstimate(targetBlock)
//     // recursion
//     .expand(feeObj => velocity(feeObj.feeIndex).last()
//       .map(v => {
//         const pos = feeObj.cumSize + v * feeObj.targetBlock * 10
//         const err = pos / blockWeight
//         const feeIndex = Math.abs(err) < res
//           ? feeObj.feeIndex
//           : feeObj.feeIndex / err
//         return {
//           ...feeObj,
//           v,
//           pos,
//           feeIndex
//         }
//       }))
//     // .distinctUntilChanged()
//     .take(40)

// const args: string[] = [...argv._]

// const caller = (method: string, ...args) => this[method](...args)
// // interval()
// caller(args[0], ...args.slice(1))
//   // .retryWhen(err => {
//   //   console.log(err)
//   //   return err.delay(10e+3)
//   // })
//   .subscribe(
//   console.log('\n------------------------------------------------------\n'),
//   (err) => {
//     console.error(err)
//     caller(args[0], ...args.slice(1))
//   },
//   () => console.log('finished'))


// const getFeeAsync = async (targetBlock: number) => {
//   const mempool = await memPooler$.takeLast(1).toPromise()
//   const tx0 = mempool.find(tx => tx.targetBlock === targetBlock)
//   if (!tx0) { throw Error('tx0 not found') }
//   const x0 = tx0.feeIndex

//   const fee = async (_x0: number) => {
//     const v = await diffTxs(_x0).takeLast(1).toPromise()
//     const t = targetBlock * 10 // min
//     const x = _x0 + v * t
//     console.log('x0', _x0, 'x', x, 'v', v)
//     return x < blockWeight && x > blockWeight / 2
//       ? _x0
//       : fee(_x0 * 2)
//   }

//   return console.log(await fee(x0))
// }

// getFeeAsync(3)



// const binarySearch = (
//   arr,
//   val,
//   compFunc = (a, b) =>
//     typeof val == 'number'
//       ? a - b
//       : a.localeCompare(b), i = 0, j = arr.length
// ) => (i >= j)
//     ? i
//     : (mid =>
//       (cmp =>
//         cmp < 0 ? binarySearch(arr, val, compFunc, i, mid)
//           : cmp > 0 ? binarySearch(arr, val, compFunc, mid + 1, j)
//             : mid
//       )(compFunc(val, arr[mid]))
//     )(i + j >> 1);

type MempoolTx = MempoolTxDefault & MempoolTxCustom

// drop some of the fields of the default tx in order to save memory
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
