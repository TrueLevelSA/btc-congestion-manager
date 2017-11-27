import * as RpcClient from 'bitcoin-core'
import { Observable } from 'rxjs'
import { isEqual, differenceWith } from 'lodash'

const host = process.env.RPC_HOST || '127.0.0.1'
const rpc =
  new RpcClient({
    host,
    port: 18332,
    username: 'test',
    password: 'test',
  })

const blockWeight = 4e6

const sortByFee = (txs, cumSize = 0, targetBlock = 1, n = 1) =>
  Object.keys(txs)
    .map((txid) => ({
      ...txs[txid],
      txid,
      satPerByte: txs[txid].descendantfees / txs[txid].descendantsize,
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

const memPuller$ = Observable.timer(0, 5000)
  .flatMap((_): Observable<MempoolTx[]> =>
    Observable.fromPromise(rpc.getRawMemPool(true)))
  .scan((x, y) => !isEqual(x, y) ? y : x)
  .distinctUntilChanged()
  .map(txs => sortByFee(txs))
  .share()

const diffMempool$ = memPuller$.scan((x: MempoolTx[], y: MempoolTx[]) =>
  differenceWith(x, y, isEqual))

diffMempool$
  .retryWhen(err => {
    console.log(err)
    return err.delay(10000)
  })
  .subscribe(
  (x) => console.dir(x),
  console.error,
  () => console.log('finished'))



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
