import { createServer } from "http";
import crypto from "crypto";

// https://docs.google.com/spreadsheets/d/1KcTFjBRlosK0eV7BM4W8MLBZZNSkue1JzqIe2f31Fuo/edit#gid=0

const PORT = 1337;
const WEBSOCKET_MAGIC_STRING_KEY = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
const SIXTYFOUR_BITS_INTEGER_MARKER = 127;
const MASK_KEY_BYTES_LENGTH = 4;

// parseInt('10000000', 2)
const FIRST_BIT = 128;

const server = createServer((request, response) => {
  response.writeHead(200);
  response.end("Hey!");
}).listen(PORT, () => console.log("Server listening to", PORT));

function onSocketUpgrade(req, socket, head) {
  const { "sec-websocket-key": webClientSocketKey } = req.headers;
  console.log(webClientSocketKey, " connected!");
  const headers = prepateHandShakeHeaders(webClientSocketKey);
  console.log({ headers });

  socket.write(headers);
  socket.on("readable", () => onSocketReadable(socket));
}

function onSocketReadable(socket) {
  // consume optcode (first byte)
  // 1 - 1 byte - 8 bits
  socket.read(1);

  const [markerAndPayloadLength] = socket.read(1);
  //Because de first bit is always for client-to-server messages
  // you can subtract one bit (128 or '10000000')
  // from this byte to get rid of the MASK bit
  const lengthIndicatorInBits = markerAndPayloadLength - FIRST_BIT;

  let messageLength = 0;
  if (lengthIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) {
    messageLength = lengthIndicatorInBits;
  } else {
    throw new Error(`Your message is too long! We don't handle 64-bit messages`);
  }

  const maskKey = socket.read(MASK_KEY_BYTES_LENGTH);
  const encoded = socket.read(messageLength);

  const decoded = unmask(encoded, maskKey);
  const received = decoded.toString("utf8");
  const data = JSON.parse(received);
  console.log("message received: ", data);
}

function unmask(encodedBuffer, maskKey) {
  const finalBuffer = Buffer.from(encodedBuffer);
  // because the maskKey has only 4 bytes
  // index % 4 === 0, 1, ,2, 3 = index bits needed to decode the message

  // XOR ^
  // return 1 if both are different
  // return 0 if both are equals

  // (71).toString(2).padStart(8, '0') = 0 1 0 0 0 1 1 1 (to binary)
  // (53).toString(2).padStart(8, '0') = 0 0 1 1 0 1 0 1 (to binary)
  //    XOR (result) ->                  0 1 1 1 0 0 1 0 (114 in decimal)

  // (71 ^ 53).toString(2).padStart(8, '0')
  // String.fromCharCode(parseInt('01110010', 2))
  const fillWithEightZeros = (t) => t.padStart(8, "0");
  const toBinary = (t) => fillWithEightZeros(t.toString(2));
  const fromBinaryToDecimal = (t) => parseInt(toBinary(t), 2);
  const getCharFromBinary = (t) => String.fromCharCode(fromBinaryToDecimal(t));

  for (let index = 0; index < encodedBuffer.length; index++) {
    finalBuffer[index] = encodedBuffer[index] ^ maskKey[index % MASK_KEY_BYTES_LENGTH];

    const logger = {
      unmaskingCalc: `${toBinary(encodedBuffer[index])} ^ ${toBinary(maskKey[index % MASK_KEY_BYTES_LENGTH])} = ${toBinary(finalBuffer[index])}`,
      decoded: getCharFromBinary(finalBuffer[index]),
    };
    console.log(logger);
  }

  return finalBuffer;
}

function prepateHandShakeHeaders(id) {
  const acceptKey = createSocketAccept(id);
  const headers = ["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${acceptKey}`, ""]
    .map((line) => line.concat("\r\n"))
    .join("");
  return headers;
}

function createSocketAccept(id) {
  const shaum = crypto.createHash("sha1");
  shaum.update(id + WEBSOCKET_MAGIC_STRING_KEY);
  return shaum.digest("base64");
}

server.on("upgrade", onSocketUpgrade);

// error handling to keep the server on
["unhandledRejection", "uncaughtException"].forEach((event) =>
  process.on(event, (err) => {
    console.error(`Something bad happened! event: ${event}, msg: ${err?.stack || err || "No error!"}`);
  })
);
