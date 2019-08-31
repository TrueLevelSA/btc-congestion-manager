import { range } from 'lodash'
import { ConfigManager } from './src/ConfigManager';

const configManager = ConfigManager.getInstance();

export const config = {
  debug: process.env.NODE_ENV === 'development',
  rpc: {
    host: configManager.getString('RPC_HOST', '127.0.0.1'),
    port: configManager.getNumber('RPC_PORT', 8332),
    username: configManager.getString('RPC_USERNAME', 'test'),
    password: configManager.getString('RPC_PASSWORD', 'test'),
  },
  wamp: {
    url: configManager.getString('WAMP_WS', 'ws://localhost:8080/ws'),
    realm: configManager.getString('WAMP_REALM', 'realm1'),
    key: configManager.getString('WAMP_KEY', 'bcm-be'),
    user: configManager.getString('WAMP_USER', 'bcm-be'),
    role: configManager.getString('WAMP_ROLE', configManager.getString('WAMP_USER', 'bcm-be'))
  },
  zmq_socket: {
    url: configManager.getString('ZMQ_URL', 'tcp://localhost:28333'),
  },
  redis: {
    port: configManager.getNumber('REDIS_PORT', 6379),
    url: configManager.getString('REDIS_HOST', 'localhost'),
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
    blockSize: 1e+6,
    minersReservedBlockRatio: 0.05,
    minSavingsRate: 0.05,
  }
}
