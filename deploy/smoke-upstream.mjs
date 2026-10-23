// CI-only protocol fixture. Never imported by the application or production image.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const streams = new Set();
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1:8091').pathname;
  if (path === '/auth/login' && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    response.writeHead(202, { 'Content-Type': 'application/json', 'Set-Cookie': 'session_id=ci-fixture; Path=/; SameSite=None; Secure; HttpOnly' });
    response.end(JSON.stringify({ message: '2FA code required', received: JSON.parse(body), origin: request.headers.origin, forwardedProto: request.headers['x-forwarded-proto'] }));
    return;
  }
  if (path === '/download/bulk/stream') {
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    response.write('{"chunk":1}\n');
    streams.add(response);
    response.on('close', () => streams.delete(response));
    return;
  }
  if (path === '/release-stream') {
    for (const stream of streams) stream.end('{"chunk":2}\n');
    streams.clear();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"released":true}');
    return;
  }
  if (path === '/auth/google/callback') {
    response.writeHead(302, { Location: '/login?2FA=true', 'Set-Cookie': 'oauth_state=; Path=/; Max-Age=0; Secure; HttpOnly' });
    response.end();
    return;
  }
  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end('{"error":"CI fixture route not found"}');
});

server.on('upgrade', (request, socket) => {
  const key = request.headers['sec-websocket-key'];
  if (request.url !== '/ws' || !key || request.headers.upgrade?.toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const payload = Buffer.from(JSON.stringify({ route: request.url, upgraded: true }));
  socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
  socket.on('data', () => socket.end(Buffer.from([0x88, 0x00])));
  socket.on('error', () => socket.destroy());
});

server.listen(8091, '127.0.0.1', () => process.stdout.write('CI protocol fixture on 127.0.0.1:8091\n'));
process.once('SIGTERM', () => { server.closeAllConnections(); server.close(); });

