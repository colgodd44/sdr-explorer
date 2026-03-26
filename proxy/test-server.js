const http = require('http');
const WebSocket = require('ws');
const net = require('net');

const RTL_HOST = '127.0.0.1';
const RTL_PORT = 1234;
const PORT = 8090;

console.log('RTL-SDR WebSocket Bridge');
console.log(`Listening on port ${PORT}`);

const server = http.createServer();
const wss = new WebSocket.Server({ server });

server.on('upgrade', (request, socket, head) => {
  console.log('HTTP Upgrade request received');
  console.log('Headers:', request.headers);
  
  wss.handleUpgrade(request, socket, head, (ws) => {
    console.log('WebSocket upgrade complete!');
    wss.emit('connection', ws, request);
  });
});

let rtlConn = null;

wss.on('connection', (ws) => {
  console.log('WebSocket connection established!');
  
  ws.on('message', (msg) => {
    console.log('Browser message:', msg.length, 'bytes');
  });
  
  ws.on('close', () => {
    console.log('WebSocket closed');
  });
  
  ws.on('error', (err) => {
    console.log('WebSocket error:', err.message);
  });
  
  // Connect to rtl_tcp
  if (rtlConn) rtlConn.destroy();
  
  console.log('Connecting to rtl_tcp on', RTL_HOST + ':' + RTL_PORT);
  rtlConn = net.connect(RTL_PORT, RTL_HOST);
  
  rtlConn.on('connect', () => {
    console.log('Connected to rtl_tcp!');
  });
  
  rtlConn.on('data', (data) => {
    console.log('RTL data:', data.length, 'bytes');
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
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  console.log('Server error:', err.message);
});
