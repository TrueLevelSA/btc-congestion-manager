import * as RpcClient from 'bitcoin-core'
import { Observable, Subscriber } from 'rxjs'
import { isEqual, differenceBy } from 'lodash'
import { socket } from 'zeromq'

const host = process.env.RPC_HOST || '127.0.0.1'
const rpc =
  new RpcClient({
    host,
    port: 8332,
    username: 'test',
    password: 'test',
  })

export const blockWeight = 4e6

export const blockHashSocket$: Observable<Buffer> =
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
  })

export const blockHash$ = blockHashSocket$.share()

const interBlockInterval$ =
  blockHash$
    .timeInterval()
    .map(x => x.interval)
    .do(t => console.log(`new block found after ${t / 60e3} minutes`))
    .share()

export const sortByFee = (txs, cumSize = 0, targetBlock = 1, n = 1) =>
  Object.keys(txs)
    .map((txid) => ({
      ...txs[txid],
      txid,
      feeIndex: txs[txid].descendantfees / txs[txid].descendantsize,
    }))
    .sort((a, b) => b.feeRate - a.feeRate)
    .map(tx => {
      cumSize += tx.size
      if (cumSize > n * blockWeight) {
        targetBlock += 1
        n += 1
      }
      return { ...tx, cumSize, targetBlock } as MempoolTx
    })

export const memPooler$ = Observable.timer(0, 10000)
  .merge(blockHash$)
  .flatMap((_): Observable<MempoolTx[]> =>
    Observable.fromPromise(rpc.getRawMemPool(true)))
  .scan((x, y) => !isEqual(x, y) ? y : x)
  .distinctUntilChanged()
  .map(txs => sortByFee(txs))
  .share()

// time moving array containing the last 2 MempoolTx[]
export const last2Mempool$ = memPooler$
  .bufferCount(2, 1)
  .share()

export const addedTxs$ = last2Mempool$
  .map(xs =>
    differenceBy(xs[1], xs[0], 'txid'))
  .share()

export const removedTxs$ =
  last2Mempool$
    .map(xs =>
      differenceBy(xs[0], xs[1], 'txid'))
    .share()

const intTimeAdded = 5 // min
// const intTimeRemoved = 30 // min
const timeRes = 1e3; // 1 s

export const bufferAdded$ = addedTxs$
  .bufferTime(intTimeAdded * 60e3, timeRes)
  .share()
// .shareReplay(undefined, 60 * 60e3)

// buffer all txs until next block mined
export const bufferRemoved$ = removedTxs$
  .buffer(blockHash$.delay(10e3)) // delay so that memPooler$ can update first
  .combineLatest(interBlockInterval$, (txss, interBlockInterval) =>
    ({ txss, interBlockInterval }))
  .do((x) => console.log('bufferRemove interval in min', x.interBlockInterval / 60e3))
  .share()
// .shareReplay(undefined, 60 * 60e3)

// returns bytes added to mempool / 10 min ahead of targetBlock
export const addedBytesAheadTargetPer10min = (targetBlock: number) =>
  bufferAdded$
    .map(txss => txss // MempoolTx[][]
      .map(txs => txs // MempoolTx[]
        .filter(tx => tx.cumSize < targetBlock * blockWeight)
        .reduce((acc, tx) => acc + tx.size, 0))
      .reduce((acc, x) => acc + x, 0))
    .map(x => (x / intTimeAdded) * 10) // per 10 min per B
    .distinctUntilChanged()

export const removedBytesAheadTargetPer10min = (targetBlock: number) =>
  bufferRemoved$
    .map(txss => txss.txss
      // .filter(txs => txs.length > 500) // proxy to removal due to mining
      .map(txs => txs
        .filter(tx => tx.cumSize < targetBlock * blockWeight)
        .reduce((acc, tx) => acc + tx.size, 0))
      .reduce((acc, x) => acc.map(y => x + y), Observable.of(0))
      .map(acc => ({ acc, interBlockInterval: txss.interBlockInterval })))
    .flatMap(x => x)
    .map(x => x.acc / (x.interBlockInterval / 60e3) * 10)
    .do(x => console.log('removedBytesAheadTargetPer10min in MB per 10 min', x / 1e6))
    .distinctUntilChanged()

// mempool growth velocity in MB / 10 min ahead of targetBlock
export const velocity = (targetBlock: number) =>
  Observable.combineLatest(
    addedBytesAheadTargetPer10min(targetBlock),
    removedBytesAheadTargetPer10min(targetBlock)
  ).map(x => (x[0] - x[1]) / 1e6)

const initialEstimate = (targetBlock: number) => memPooler$.last()
  .map(txs => txs.find(tx => tx.targetBlock === targetBlock))
  .filter(tx => tx !== undefined)
  .map((tx: MempoolTx) => ({
    feeIndex: tx.feeIndex,
    cumSize: tx.cumSize,
    targetBlock: tx.targetBlock
  }))

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



velocity(3)
  .retryWhen(err => {
    console.log(err)
    return err.delay(10000)
  })
  .subscribe(
  (x) => console.dir(x),
  console.error,
  () => console.log('finished'))


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



interface MempoolTx {
  txid: string
  feeIndex: number
  size: number
  fee: number
  modifiedfee: number
  time: number
  height: number
  descendantcount: number
  descendantsize: number
  descendantfees: number
  ancestorcount: number
  ancestorsize: number
  ancestorfees: number
  depends: string[]
  cumSize: number
  targetBlock: number
}
