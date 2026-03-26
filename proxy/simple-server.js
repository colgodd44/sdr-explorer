const WebSocket = require('ws');
const net = require('net');

const PORT = 8090;
const RTL_HOST = '127.0.0.1';
const RTL_PORT = 1234;

console.log('RTL-SDR WebSocket Bridge on port', PORT);

const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', (ws) => {
  console.log('Browser connected!');
  
  let rtlConn = null;
  
  // Connect to rtl_tcp
  console.log('Connecting to rtl_tcp...');
  rtlConn = net.connect(RTL_PORT, RTL_HOST);
  
  rtlConn.on('connect', () => {
    console.log('Connected to rtl_tcp!');
    
    // Set frequency to FM
    const freqBuf = Buffer.alloc(9);
    freqBuf[0] = 1; // set freq command
    freqBuf.writeDoubleLE(102500000, 1); // 102.5 MHz
    rtlConn.write(freqBuf);
    console.log('Set frequency 102.5 MHz');
    
    // Set sample rate
    const rateBuf = Buffer.alloc(9);
    rateBuf[0] = 2; // set sample rate command
    rateBuf.writeDoubleLE(2400000, 1); // 2.4 MHz
    rtlConn.write(rateBuf);
    console.log('Set sample rate 2.4 MHz');
  });
  
  rtlConn.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
  
  rtlConn.on('close', () => {
    console.log('rtl_tcp disconnected');
  });
  
  rtlConn.on('error', (err) => {
    console.log('RTL error:', err.message);
  });
  
  ws.on('message', (msg) => {
    console.log('Browser command:', msg.length, 'bytes');
    if (rtlConn) {
      rtlConn.write(msg);
    }
  });
  
  ws.on('close', () => {
    console.log('Browser disconnected');
    if (rtlConn) {
      rtlConn.destroy();
    }
  });
});

wss.on('error', (err) => {
  console.log('Server error:', err.message);
});

console.log('Ready! Start rtl_tcp with: rtl_tcp -a 0.0.0.0 -p 1234');
