import * as RpcClient from 'bitcoin-core'
import { Observable } from 'rxjs'
import { isEqual } from 'lodash'

const host = process.env.RPC_HOST || '127.0.0.1'
const rpc =
  new RpcClient({
    host,
    port: 18332,
    username: 'test',
    password: 'test',
  })

const blockSize = 1e6

const sortByFee = (txs: MempoolTx[], cumSize = 0, targetBlock = 1, n = 1) =>
  Object.keys(txs)
    .map((txid) => ({
      txid,
      satPerByte: 1e8 * txs[txid].fee / txs[txid].size,
      ...txs[txid],
    }))
    .sort((a, b) => b.feeRate - a.feeRate)
    .map(tx => {
      cumSize += tx.size
      if (cumSize > n * blockSize) {
        targetBlock += 1
        n += 1
      }
      return Observable.of({ ...tx, cumSize, targetBlock })
    })

const memPuller$ = Observable.timer(0, 5000)
  .flatMap((_): Observable<MempoolTx[]> =>
    Observable.fromPromise(rpc.getRawMemPool(true)))
  .scan((x, y) => !isEqual(x, y) ? y : x)
  .distinctUntilChanged()
  .flatMap(txs => sortByFee(txs))
  .mergeAll()

memPuller$
  .retryWhen(errors => errors.delay(10000))
  .subscribe(
  (x) => console.dir(x),
  console.error,
  () => console.log('finished'))


interface MempoolTx {
  txid: string
  satPerByte: number
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
  depends: any[]
  cumSize: number
  targetBlock: number
}
