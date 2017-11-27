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

const sortByFee = (mempool, cumSize = 0, targetBlock = 0, n = 1) =>
  Object.keys(mempool)
    .map((txid) => ({
      txid,
      satPerByte: 1e8 * mempool[txid].fee / mempool[txid].size,
      ...mempool[txid],
    }))
    .sort((a, b) => b.feeRate - a.feeRate)
    .map(tx => {
      cumSize += tx.size
      if (cumSize > n * blockSize) {
        targetBlock += 1
        n += 1
      }
      return { ...tx, cumSize, targetBlock }
    })


const listenMemPool = (prevMempool: any = {}, sortPrevMempool: any = {}) =>
  Observable.timer(0, 5000)
    .flatMap(_ => Observable.fromPromise(rpc.getRawMemPool(true)))
    .filter(mempool => !isEqual(mempool, prevMempool))
    .flatMap((mempool) => {
      prevMempool = mempool
      sortPrevMempool = sortByFee(mempool)
      return sortPrevMempool
    }).retryWhen(errors => errors.delay(10000))


listenMemPool().subscribe(
  (x) => console.dir(x),
  console.error,
  () => console.log('finished'))
