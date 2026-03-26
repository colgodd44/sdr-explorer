const WebSocket = require('ws');
const net = require('net');

const RTL_HOST = '127.0.0.1';
const RTL_PORT = 1234;
const WS_PORT = 8080;

console.log('RTL-SDR WebSocket Proxy');
console.log(`Listening on 0.0.0.0:${WS_PORT}`);
console.log(`Target: ${RTL_HOST}:${RTL_PORT}`);

const server = net.createServer();
const wss = new WebSocket.Server({ server });

server.listen(WS_PORT, '0.0.0.0', () => {
  console.log(`TCP/WebSocket server listening on port ${WS_PORT}`);
});

let rtlSocket = null;
let browserWs = null;

const connectRTL = () => {
  if (rtlSocket) {
    try { rtlSocket.destroy(); } catch(e) {}
    rtlSocket = null;
  }
  
  console.log('Connecting to rtl_tcp...');
  
  rtlSocket = new net.Socket();
  
  rtlSocket.connect(RTL_PORT, RTL_HOST, () => {
    console.log('Connected to rtl_tcp!');
    
    // Set frequency to 102.5 MHz (FM)
    const freqBuffer = Buffer.alloc(5);
    freqBuffer[0] = 0x01;
    freqBuffer.writeUInt32BE(102500000, 1);
    rtlSocket.write(freqBuffer);
    console.log('Set frequency: 102.5 MHz');
    
    // Set sample rate
    const rateBuffer = Buffer.alloc(5);
    rateBuffer[0] = 0x02;
    rateBuffer.writeUInt32BE(2400000, 1);
    rtlSocket.write(rateBuffer);
    console.log('Set sample rate: 2.4 MHz');
  });
  
  rtlSocket.on('data', (data) => {
    if (browserWs && browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(data);
    }
  });
  
  rtlSocket.on('close', () => {
    console.log('rtl_tcp disconnected');
    rtlSocket = null;
  });
  
  rtlSocket.on('error', (err) => {
    console.log('RTL error:', err.message);
    rtlSocket = null;
  });
};

wss.on('connection', (ws, req) => {
  console.log('Browser connected!');
  browserWs = ws;
  
  connectRTL();
  
  ws.on('message', (msg) => {
    if (rtlSocket && rtlSocket.writable) {
      rtlSocket.write(msg);
    }
  });
  
  ws.on('close', () => {
    console.log('Browser disconnected');
    browserWs = null;
  });
});

wss.on('error', (err) => {
  console.log('Server error:', err.message);
});

console.log('Ready!');
