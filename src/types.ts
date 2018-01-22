export type MempoolTx = MempoolTxDefault & MempoolTxCustom

// drop some of the fields of the default tx in order to save memory
// dropped fields commented out below
export interface MempoolTxDefault {
  size: number
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
  txid: string
  feeRate: number
  cumSize: number
  targetBlock: number
}
