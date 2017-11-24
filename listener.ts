import { socket as Socket } from 'zeromq'
import { Transaction } from 'bitcoinjs-lib'
import * as RpcClient from 'bitcoin-core'
import * as sio from 'socket.io'
import { Observable, Subscriber } from 'rxjs'
const reverse: (b: Buffer) => Buffer = require("buffer-reverse")

const host = process.env.RPC_HOST || '127.0.0.1'
const rpc =
  new RpcClient({
    host,
    port: 18332,
    username: 'test',
    password: 'test',
  })

const getFee = (tx_bytes: Buffer) =>
  Observable.of(Transaction.fromBuffer(tx_bytes))
    .map(tx => ({
      txid: tx.getId(),
      size: tx.byteLength(),
      rbf: tx.ins.every(y => y.sequence < 0xffffffff - 1),
      ins: tx.ins.map(y => ({
        prev_txid: reverse(y.hash).toString('hex'),
        prev_index: y.index,
      })),
      value: tx.outs.reduce((acc, y) => acc + y.value, 0)
    }))
    .flatMap((curr) =>
      curr.ins.map(prev =>
        Observable.fromPromise(rpc.getRawTransaction(prev.prev_txid)
          .then(x => x)
          .catch(err => err))
          .flatMap((prev_txid: string): Observable<Tx> =>
            Observable.fromPromise(rpc.decodeRawTransaction(prev_txid)
              .then(x => x)
              .catch(err => err)))
          .map(prev_tx => prev_tx.vout[prev.prev_index].value * 1e8))
        .reduce((acc1, x) =>
          x.reduce((acc2, y) => y + acc2, 0)
            .flatMap(z => acc1.map(a => a + z)), Observable.of(0))
        .map(prev_value => ({
          txid: curr.txid,
          prev_txids: curr.ins.map(x => x.prev_txid),
          rbf: curr.rbf,
          feeSatoshiPerByte: (prev_value - curr.value) / curr.size
        })))
    .retryWhen(errors => errors.delay(5000))

const rawtxsocket$: Observable<any> =
  Observable.create((subscriber: Subscriber<any>) => {
    const socket = Socket('sub')
    socket.connect('tcp://localhost:28332')
    socket.subscribe('rawtx')
    socket.monitor(10000)
    socket.on('open', () => console.log('socket opened'))
    socket.on('message', (topic, message) => subscriber.next(message))
    socket.on('reconnect_error', (err) => subscriber.error(err))
    socket.on('reconnect_failed', () => subscriber.error(new Error('reconnection failed')))
    socket.on('close', () => {
      socket.unsubscribe('rawtx')
      socket.close()
      subscriber.complete()
    })
    return () => socket.close()
  })

const n = 5
const transaction$ =
  rawtxsocket$
    .flatMap((message) => getFee(message))
    .scan(
    (acc, x) => acc.length < n
      ? [x, ...acc]
      : x > acc[-1]
        ? [...acc.slice(0, n - 1), x]
        : acc
    , [])
    // get size from acc to drop elements that are far off

    .map(txs =>
      txs.sort((a, b) => b.feeSatoshiPerByte - a.feeSatoshiPerByte))

// flatMap mempool_node$ here

// const sortedTransactions$ =
//   transaction$
//     // .toArray()
//     .map(txs =>
//       txs.sort((a, b) => b.feeSatoshiPerByte - a.feeSatoshiPerByte))

const mempool_node$: Observable<string[]> = Observable.fromPromise(
  rpc.getRawMemPool()
    .then(x => x)
    .catch(e => e)
)

const mempuller$ =
  Observable.timer(10000, 5000)
    .flatMap((_) => mempool_node$)
// .flatMap(txids => txids
//   .map(txid => transactions$
//     .filter(tx => tx.txid === txid)
//   )).mergeAll())

transaction$
  .subscribe((x) => console.log('\n\nnew\n\n\n', x))
// .combineLatest(mempuller$, (txs, txids) => txs.map)
// mempool$.combineAll()


// transactions$
//   .bufferTime(10000)
//   .map(txs => ({
//     mean: txs.reduce((acc, tx) => tx.feeSatoshiPerByte + acc, 0) / txs.length,
//     size: txs.length,
//     time: 10000,
//   }))
//   .subscribe(console.log, console.error, console.log)


interface Tx {
  txid: string
  hash: string
  version: number
  size: number
  vsize: number
  locktime: number
  vin: {
    txid: string
    vout: number
    scriptSig: Object
    sequence: number
  }[]
  vout: {
    value: number
    n: number
    scriptPubKey: Object
  }[]
}
