// const Socket = require('blockchain.info/Socket')
import { Observable } from 'rxjs'
// const Rx = require('@reactivex/rxjs')
const Socket = require('blockchain.info/Socket')
var mySocket = new Socket()
mySocket.onOpen(() => console.log('opened'))
mySocket.onClose(() => console.log('closed'))

const getFee = (tx: Tx) => Observable.of(tx)
    // .filter(tx => tx.inputs[0].sequence < 4294967294)
    .map((tx) => ({
        hash: tx.hash,
        tx_index: tx.tx_index,
        fee_per_byte: (tx.inputs.reduce((acc, x) => x.prev_out.value + acc, 0)
            - tx.out.reduce((acc, x) => x.value + acc, 0)) / tx.size,
        rbf: tx.inputs.every(x => x.sequence < 0xffffffff - 1),
        consumed_indices: tx.inputs.map(x => x.prev_out.tx_index),
        apperance_ts: Date.now(),
        confirmed_ts: undefined,
        interval: undefined,
    }))
    .filter(x => x.rbf === true)
    .subscribe(console.dir)

mySocket.onTransaction(getFee)
// mySocket.onBlock(console.dir)


interface Tx {
    lock_time: number
    ver: number
    size: number
    inputs: Input[],
    time: number,
    tx_index: number,
    vin_sz: 1,
    hash: string
    vout_sz: number,
    relayed_by: string,
    out: Out[]
}

interface Input {
    sequence: number
    prev_out: Out
    script: string
}

interface Out {
    spent: boolean
    tx_index: number
    type: number
    addr: string
    value: number
    n: number
    script: string
}

interface Block {
    txIndexes: number[]
    nTx: number
    totalBTCSent: number
    estimatedBTCSent: number
    reward: number
    size: number
    blockIndex: number
    prevBlockIndex: number
    height: number
    hash: string
    mrklRoot: string
    version: number
    time: number
    bits: number
    nonce: number
    foundBy: {
        description: string
        ip: string
        link: string
        time: number
    }
}
