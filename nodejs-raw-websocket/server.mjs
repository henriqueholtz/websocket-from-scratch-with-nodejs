import { createServer } from 'http';
import crypto from 'crypto';

const PORT = 1337;
const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const server = createServer((request, response) => {
  response.writeHead(200);
  response.end('Hey!');
}).listen(PORT, () => console.log('Server listening to', PORT));

function onSocketUpgrade(req, socket, head) {
  const { 'sec-websocket-key': webClientSocketKey } = req.headers;
  console.log(webClientSocketKey, ' connected!');
  const headers = prepateHandShakeHeaders(webClientSocketKey);
  console.log({ headers });
  socket.write(headers);
}

function prepateHandShakeHeaders(id) {
  const acceptKey = createSocketAccept(id);
  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '',
  ]
    .map((line) => line.concat('\r\n'))
    .join('');
  return headers;
}

function createSocketAccept(id) {
  const shaum = crypto.createHash('sha1');
  shaum.update(id + WEBSOCKET_MAGIC_STRING_KEY);
  return shaum.digest('base64');
}

server.on('upgrade', onSocketUpgrade);

// error handling to keep the server on
['unhandledRejection', 'uncaughtException'].forEach((event) =>
  process.on(event, (err) => {
    console.error(
      `Something bad happened! event: ${event}, msg: ${
        err?.stack || err || 'No error!'
      }`
    );
  })
);
