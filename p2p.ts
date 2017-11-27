const bcoin = require('bcoin').set('main');
const Chain = bcoin.chain;
const Mempool = bcoin.mempool;
const Pool = bcoin.pool;

// Create a blockchain and store it in leveldb.
// `db` also accepts `rocksdb` and `lmdb`.

const prefix = process.env.HOME + '/my-bcoin-environment';

const chain = new Chain({
  network: 'testnet',
  db: 'leveldb',
  location: prefix + '/chain',
});

const mempool = new Mempool({
  network: 'testnet',
  chain: chain
});

const pool = new Pool({
  network: 'testnet',
  chain: chain,
  mempool: mempool,
  size: 100
});

(async function() {
  await pool.open();

  // Connect, start retrieving and relaying txs
  await pool.connect();

  // Start the blockchain sync.
  // pool.startSync();

  // chain.on('block', (block: Block) => {
  //   console.log('Added testnet block:');
  //   block.txs.map(tx => tx)
  //     .map(console.log)
  // });

  mempool.on('tx', (tx: Tx) => {
    console.log('Added testnet tx to mempool:');
    console.log(tx);
  });

  pool.on('tx', (tx) => {
    console.log('Saw testnet transaction:');
    console.log(tx);
  });
})().catch((err) => {
  console.error(err.stack);
  process.exit(1);
});


interface Block {
  hash: string
  height: number
  size: number
  virtualSize: number
  date: string
  version: string
  prevBlock: string
  merkleRoot: string
  commitmentHash: null
  time: number
  bits: number
  nonce: number
  txs: Tx[]
}

interface Tx {
  hash: string
  witnessHash: string
  size: number
  virtualSize: number
  value: string
  fee: string
  rate: string,
  minFee: string
  height: number
  block: null
  time: number
  date: null
  index: number
  version: number
  inputs: any[]
  outputs: any[]
  locktime: number
}
