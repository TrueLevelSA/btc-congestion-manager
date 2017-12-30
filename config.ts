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
    intTimeAdded: 30 * 60e+3, // 30 min
    timeRes: 30e+3, // 30 s
    blockSize: 1e+6,
    minersReservedBlockRatio: 0.05,
  }
}
