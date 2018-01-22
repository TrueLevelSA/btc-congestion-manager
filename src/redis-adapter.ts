import * as Redis from 'ioredis'
import { config } from '../config'
import { MempoolTx, MempoolTxCustom, MempoolTxDefault } from './types'

const redis = new Redis(config.redis.port, config.redis.url)

export const setItem = async (key: string, value: any) => {
  try {
    return await redis.set(key, JSON.stringify(value))
  } catch (err) {
    console.error(err)
    return err
  }
}

export const getBufferAdded = async (key: string): Promise<{ size: number, cumSize: number }[]> => {
  try {
    return JSON.parse(await redis.get(key))
  } catch (err) {
    console.error(err)
    return err
  }
}

export const getBufferRemoved = async (key: string): Promise<{ txs: { size: number, cumSize: number }[], ibi: number }> => {
  try {
    return JSON.parse(await redis.get(key))
  } catch (err) {
    console.error(err)
    return err
  }
}
