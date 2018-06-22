import * as Redis from 'ioredis'
import { config } from '../config'
import { MempoolTx, MempoolTxCustom, MempoolTxDefault } from './types'

const redis = new Redis(config.redis.port, config.redis.url)

export const setItem = async (key: string, value: any) => {
  try {
    return await redis.set(key, JSON.stringify(value))
  } catch (err) {
    throw err
  }
}

export const getBufferAdded = async (): Promise<{ size: number, cumSize: number }[]> => {
  const key = 'buffer_added'
  try {
    const data: { size: number, cumSize: number }[] =
      JSON.parse(await redis.get(key))
    return typeof data.filter === "function"
      ? data.filter(x =>
        x.cumSize != null && !isNaN(x.cumSize)
        && x.size != null && !isNaN(x.size))
      : []
  } catch (err) {
    throw err
  }
}

export const getBufferRemoved = async (): Promise<{ txs: { size: number, cumSize: number }[], ibi: number }> => {
  const key = 'buffer_removed'
  try {
    const data: { txs: { size: number, cumSize: number }[], ibi: number } =
      JSON.parse(await redis.get(key))
    const txs = data.txs.filter(x =>
      x.cumSize != null && !isNaN(x.cumSize)
      && x.size != null && !isNaN(x.size))
    // const ibi = data.ibi != null && !isNaN(data.ibi) ? data.ibi : 60e3
    return { txs, ibi: data.ibi }
  } catch (err) {
    throw err
  }
}

export const getBufferBlockSize = async (): Promise<number[]> => {
  const key = 'buffer_blocksize'
  try {
    const data: number[] = JSON.parse(await redis.get(key))
      return typeof data.filter === "function"
          ? data.filter(x => x != null && !isNaN(x))
          : []
  } catch (err) {
    throw err
  }
}

export const getMinsFromLastBlock = async (): Promise<number> => {
  const key = 'minsfromlastblock'
  try {
    const data = JSON.parse(await redis.get(key))
    return JSON.parse(data)
  } catch (err) {
    throw err
  }
}
