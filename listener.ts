import { socket } from 'zeromq'
import { Transaction, TransactionBuilder, networks } from 'bitcoinjs-lib'
import * as RpcClient from 'bitcoin-core'
import { Observable } from 'rxjs'
const reverse: (b: Buffer) => Buffer = require("buffer-reverse")

const host = process.env.RPC_HOST || '127.0.0.1'
const rpc =
  new RpcClient({
    host,
    port: 18332,
    username: 'test',
    password: 'test',
  })

const sock = socket('sub')

// (async () =>
//     console.log(await rpc.getTransaction('51d01765c3e09968d91b156cdc47602d2d641f6908ab479b7a9db59f02c73a36'))
// )()

sock.connect('tcp://localhost:28332')
console.log('worker connected')
// sock.subscribe('')
// const reverse = (s: string) =>
//     s.match(/[a-fa-f0-9]{2}/g).reverse().join('')

const getFee = (tx_bytes: Buffer) => Observable.of(Transaction.fromBuffer(tx_bytes))
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
  .subscribe(console.dir)

sock.subscribe('rawtx')
sock.on(
  'message',
  (topic, message) => getFee(message)
)


// // (async () =>
// //     console.log(await rpc.getTransaction('51d01765c3e09968d91b156cdc47602d2d641f6908ab479b7a9db59f02c73a36'))
// // )()

// // sock.subscribe('')
// const getTxid = (txid: Buffer) => Observable.of(txid)
//     // .flatMap((txid) => Observable.fromPromise(rpc.getRawTransaction(txid.toString('hex'))))
//     .flatMap(rawtx => Observable.fromPromise(rpc.decodeRawTransaction(rawtx)))
//     .map((mempoolTx: Tx) => mempoolTx.vin.map(x => ({ txid: x.txid, vout: x.vout }))
//     )
//     .flatMap((txid) => Observable.fromPromise(rpc.getRawTransaction(txid)))
//     // .flatMap(rawtx => Observable.fromPromise(rpc.decodeRawTransaction(rawtx)))
//     .subscribe((x) => console.dir(x))

// sock.subscribe('hashtx')
// sock.on(
//     'message',
//     (topic, message) => { if (message.toString('hex') === 'hashtx') getTxid(message)
//                           elseif (message.toString) { }
//                         }
// )


interface Tx {
  txid: string,
  hash: string,
  version: number,
  size: number,
  vsize: number,
  locktime: number,
  vin:
  [{
    txid: string,
    vout: number,
    scriptSig: Object,
    sequence: number
  }],
  vout:
  [{ value: number, n: number, scriptPubKey: Object },
    { value: number, n: number, scriptPubKey: Object }]
}
