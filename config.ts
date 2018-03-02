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
    key: 'ANSIBLE_ME',
    user: 'bcm-be',
  },
  zmq_socket: {
    url: 'tcp://localhost:28333',
  },
  redis: {
    port: 6379,
    url: 'localhost',
  },
  constants: {
    range: [
      ...range(.5, 1, 1 / 4), 1,
      ...range(1.5, 3, 1 / 4),
      ...range(3, 48, 1)
    ],
    integrateTimeAdded: 60 * 60e+3, // averaging 60 min
    integrateBlocksRemoved: 18, // averaging 18 blocks
    timeRes: 10e+3,
    minersReservedBlockRatio: 0.05,
    minSavingsRate: 0.05,
  }
}
