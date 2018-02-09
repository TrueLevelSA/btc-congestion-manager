export type MempoolTx = MempoolTxDefault & MempoolTxCustom

// drop some of the fields of the default tx in order to save memory
// dropped fields commented out below
export interface MempoolTxDefault {
  // size: number
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

export interface MempoolTxCustom {
  size: number
  txid: string
  feeRate: number
  cumSize: number
  targetBlock: number
}

export interface MinDiff {
  // cumDiff: number
  // diff: number
  targetBlock: number
  feeRate: number
  // timestamp: number
  date: Date
}


export interface MinsFromLastBlock {
  minutes: number
  blockHash: string
}


export interface GetBlock {
  hash: string
  confirmations: number
  strippedsize: number
  size: number
  weight: number
  height: number
  version: number
  versionHex: string
  merkleroot: string
  tx: string[]
}
