export const config = {
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
    url: 'tcp://localhost:28333'
  },
  constants: {
    integrateTimeAdded: 30 * 60e+3, // averaging 30 min
    integrateBlocksRemoved: 12, // TODO: averaging 18 blocks
    timeRes: 10e+3, // 5 s
    blockSize: 1e+6,
    minersReservedBlockRatio: 0.05,
    minSavingsRate: 0.1,
  }
}
