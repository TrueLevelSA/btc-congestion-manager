import { range } from 'lodash'
export const config = {
  debug: true,
  rpc: {
    host: '127.0.0.1',
    port: 8332,
    username: 'test',
    password: 'test',
  },
  wamp: {
    url: 'ws://localhost:8080/ws',
    realm: 'realm1',
  },
  zmq_socket: {
    url: 'tcp://localhost:28333',
  },
  redis: {
    port: 6379,
    url: 'localhost',
  },
  constants: {
    range: [1, ...range(0.9, 0.5, -0.1), ...range(2, 36)],
    integrateTimeAdded: 30 * 60e+3, // averaging 30 min
    integrateBlocksRemoved: 18, // averaging 18 blocks
    timeRes: 10e+3, // 5 s
    blockSize: 1e+6,
    minersReservedBlockRatio: 0.05,
    minSavingsRate: 0.1,
  }
}
