const { Buffer } = require('node:buffer');
const http = require('node:http');

const host = '127.0.0.1';
const port = Number(process.env.PORT) || 3001;
const maxBodyBytes = 16 * 1024;

const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200);
    response.end(JSON.stringify({ ok: true, service: 'appbackend' }));
    return;
  }

  if (request.method === 'POST' && request.url === '/api/test') {
    let body = '';
    let bodyBytes = 0;
    let tooLarge = false;

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      bodyBytes += Buffer.byteLength(chunk);
      if (bodyBytes > maxBodyBytes) {
        tooLarge = true;
        return;
      }
      body += chunk;
    });

    request.on('end', () => {
      if (tooLarge) {
        response.writeHead(413);
        response.end(JSON.stringify({ error: 'Request body is too large.' }));
        return;
      }

      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        response.writeHead(400);
        response.end(JSON.stringify({ error: 'Send a valid JSON request body.' }));
        return;
      }

      if (payload === null || Array.isArray(payload) || typeof payload !== 'object') {
        response.writeHead(400);
        response.end(JSON.stringify({ error: 'The JSON body must be an object.' }));
        return;
      }

      response.writeHead(200);
      response.end(JSON.stringify({
        ok: true,
        message: 'Backend test request received.',
        received: payload,
      }));
    });
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: 'Route not found.' }));
});

server.listen(port, host, () => {
  console.log(`Test backend listening at http://${host}:${port}`);
  console.log(`Health check: http://${host}:${port}/health`);
});

server.on('error', (error) => {
  console.error('Backend server error:', error);
  process.exitCode = 1;
});
