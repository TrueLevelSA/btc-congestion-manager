import * as RpcClient from 'bitcoin-core'
import { Observable, Subscriber } from 'rxjs'
import { isEqual, differenceBy } from 'lodash'
import { socket } from 'zeromq'

const intTimeAdded = 30 // min
const timeRes = 10e3; // 10 s
// const intTimeRemoved = 30 // min

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
// const blockHash$ = Observable.timer(0, 10000)

const interBlockInterval$ =
  blockHash$
    .timeInterval()
    .map(x => x.interval)
    .do(t => console.log(`new block found after ${t / 60e3} minutes`))
    .share()

export const sortByFee = (txs, cumSize = 0, targetBlock = 1, n = 1) =>
  Object.keys(txs)
    .map((txid): MempoolTx => ({
      ...txs[txid],
      txid,
      feeWeight: txs[txid].descendantfees / txs[txid].descendantsize,
    }))
    .sort((a, b) => b.feeWeight - a.feeWeight)
    .map(tx => {
      cumSize += tx.size
      if (cumSize > n * blockWeight) {
        targetBlock += 1
        n += 1
      }
      return { ...tx, cumSize, targetBlock } as MempoolTx
    })

export const memPooler$ = Observable.timer(0, 10e3)
  .merge(blockHash$)
  .flatMap((_): Observable<MempoolTx[]> =>
    Observable.fromPromise(rpc.getRawMemPool(true)))
  .scan((x, y) => !isEqual(x, y) ? y : x)
  .distinctUntilChanged()
  .map(txs => sortByFee(txs))
  .share()


// time moving array containing the last 2 MempoolTx[]
export const last2Mempool$ =
  memPooler$
    .bufferCount(2, 1)
    .share()

export const addedTxs$ =
  last2Mempool$
    .flatMap(txs => differenceBy(txs[1], txs[0], 'txid'))
    .share()

export const removedTxs$ =
  last2Mempool$
    .flatMap(txs => differenceBy(txs[0], txs[1], 'txid'))
    .share()

export const bufferAdded$ =
  addedTxs$
    .bufferTime(intTimeAdded * 60e3, timeRes)
    .share()

// buffer all txs until next block mined
export const bufferRemoved$ =
  removedTxs$
    .buffer(blockHash$.delay(10e3)) // delay so that memPooler$ can update first
    .withLatestFrom(interBlockInterval$, (txs, ibi) =>
      ({ txs, ibi }))
    .bufferCount(6, 1)
    .map(x => x.reduce((acc, y) =>
      ({
        ibi: y.ibi + acc.ibi,
        txs: [...acc.txs, ...y.txs]
      }),
      { ibi: 0, txs: [] }))
    // .do(_ => console.log('emited'))

// returns bytes added to mempool / 10 min ahead of targetBlock
export const addedBytesAheadTargetPer10min = (targetBlock: number) =>
  bufferAdded$
    .map(txs => txs // MempoolTx[]
      .filter(tx => tx.cumSize < targetBlock * blockWeight)
      .reduce((acc, tx) => acc + tx.size, 0))
    .map(x => (x / intTimeAdded) * 10) // per 10 min per B
    .distinctUntilChanged()

export const removedBytesAheadTargetPer10min = (targetBlock: number) =>
  bufferRemoved$
    .map(i => i.txs
      .filter(tx => tx.cumSize < targetBlock * blockWeight)
      .reduce((acc, tx) => ({
        ...acc,
        value: tx.size + acc.value,
      }),
      {
        value: 0,
        ibi: i.ibi
      }))
    .map(x => x.value / (x.ibi / 60e3) * 10)
    .distinctUntilChanged()

// mempool growth velocity in MB / 10 min ahead of targetBlock
export const velocity = (targetBlock: number) =>
  Observable.combineLatest(
    addedBytesAheadTargetPer10min(targetBlock),
    removedBytesAheadTargetPer10min(targetBlock))
    .map(x => (x[0] - x[1]) / 1e6)

// const initialEstimate = (targetBlock: number) =>
//   memPooler$.last()
//     .map(txs => txs.find(tx => tx.targetBlock === targetBlock))
//     .filter(tx => tx !== undefined)
//     .map((tx: MempoolTx) => ({
//       feeIndex: tx.feeIndex,
//       cumSize: tx.cumSize,
//       targetBlock: tx.targetBlock
//     }))

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
  txid: string
  feeWeight: number
  cumSize: number
  targetBlock: number
}
