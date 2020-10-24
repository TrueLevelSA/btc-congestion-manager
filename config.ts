import { range } from 'lodash'
import { ConfigManager } from './src/ConfigManager';

const configManager = ConfigManager.getInstance();

export const config = {
  debug: process.env.NODE_ENV === 'development',
  rpc: {
    host: configManager.getString('RPC_HOST', '127.0.0.1'),
    port: configManager.getInteger('RPC_PORT', 8332),
    username: configManager.getString('RPC_USERNAME', 'test'),
    password: configManager.getString('RPC_PASSWORD', 'test'),
    ssl: configManager.getBoolean('RPC_SSL_ENABLED', false),
  },
  wamp: {
    url: configManager.getString('WAMP_WS', 'ws://localhost:8080/ws'),
    realm: configManager.getString('WAMP_REALM', 'realm1'),
    key: configManager.getString('WAMP_KEY', 'bcm-be'),
    user: configManager.getString('WAMP_USER', 'bcm-be'),
    role: configManager.getString('WAMP_ROLE', configManager.getString('WAMP_USER', 'bcm-be')),
    topic: {
      deals: `com.fee.v1.${configManager.getString('CURRENCY', 'btc')}.${configManager.getString('COIN_NETWORK', 'main')}.deals`,
      minedtxssummary: `com.fee.v1.${configManager.getString('CURRENCY', 'btc')}.${configManager.getString('COIN_NETWORK', 'main')}.minedtxssummary`,
      minsfromlastblock: `com.fee.v1.${configManager.getString('CURRENCY', 'btc')}.${configManager.getString('COIN_NETWORK', 'main')}.minsfromlastblock`,
    },
  },
  zmq_socket: {
    url: configManager.getString('ZMQ_URL', 'tcp://localhost:28333'),
  },
  redis: {
    port: configManager.getInteger('REDIS_PORT', 6379),
    url: configManager.getString('REDIS_HOST', 'localhost'),
    password: configManager.getString('REDIS_PASSWORD'),
    keyPrefix: configManager.getString('REDIS_PREFIX', 'app:'),
  },
  constants: {
    range: [
      ...range(.5, 1, 1 / 4), 1,
      ...range(1.5, 3, 1 / 4),
      ...range(3, 48, 1)
    ],
    integrateTimeAdded: 2 * 60 * 60e+3, // averaging 2 h data
    integrateBlocksRemoved: 18, // averaging 18 blocks
    timeRes: 20e+3,
    blockSize: configManager.getFloat('INIT_BLOCK_SIZE', 1e+6),
    minersReservedBlockRatio: 0.05,
    minSavingsRate: 0.05,
    reliableMinedBlockThreshold: configManager.getInteger('RELIABLE_MINED_BLOCK_THRESHOLD', 500),
    averageBlockTime: configManager.getFloat('AVG_BLOCK_TIME', 10), // average time between blocks
  }
}
