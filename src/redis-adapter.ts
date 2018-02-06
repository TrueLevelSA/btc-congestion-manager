import * as Redis from 'ioredis'
import { config } from '../config'
import { MempoolTx, MempoolTxCustom, MempoolTxDefault } from './types'

const redis = new Redis(config.redis.port, config.redis.url)

export const setItem = async (key: string, value: any) => {
  try {
    return await redis.set(key, JSON.stringify(value))
  } catch (err) {
    return err
  }
}

export const getBufferAdded = async (): Promise<{ size: number, cumSize: number }[]> => {
  const key = 'buffer_added'
  try {
    return JSON.parse(await redis.get(key))
  } catch (err) {
    return err
  }
}

export const getBufferRemoved = async (): Promise<{ txs: { size: number, cumSize: number }[], ibi: number }> => {
  const key = 'buffer_removed'
  try {
    return JSON.parse(await redis.get(key))
  } catch (err) {
    return err
  }
}

export const getBufferBlockSize = async (): Promise<number[]> => {
  const key = 'buffer_blocksize'
  try {
    return JSON.parse(await redis.get(key))
  } catch (err) {
    return err
  }
}

export const getMinsFromLastBlock = async (): Promise<number> => {
  const key = 'minsfromlastblock'
  try {
    return JSON.parse(await redis.get(key))
  } catch (err) {
    return err
  }
}
