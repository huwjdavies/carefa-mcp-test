import http from 'node:http';

const port = Number(process.env.PORT || 10000);

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      service: 'CAREFA MCP diagnostic',
      collectionAccess: false
    }));
  }

  if (req.method !== 'POST' || path !== '/mcp') {
    res.writeHead(404);
    return res.end('Not found');
  }

  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16000) {
      res.writeHead(413);
      return res.end('Request too large');
    }
  }

  let message;
  try {
    message = JSON.parse(body);
  } catch {
    res.writeHead(400);
    return res.end('Invalid JSON');
  }

  let result;

  if (message.method === 'initialize') {
    result = {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: {
        name: 'carefa-mcp-diagnostic',
        version: '1.0.0'
      }
    };
  } else if (message.method === 'tools/list') {
    result = {
      tools: [{
        name: 'carefa_connection_test',
        description: 'Tests the connection without accessing any collector data.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      }]
    };
  } else if (message.method === 'tools/call') {
    if (message.params?.name !== 'carefa_connection_test') {
      res.writeHead(400);
      return res.end('Unknown tool');
    }
    result = {
      content: [{
        type: 'text',
        text: 'CAREFA connection successful! No private collection data was accessed.'
      }]
    };
  } else if (message.method === 'notifications/initialized') {
    res.writeHead(202);
    return res.end();
  } else {
    res.writeHead(404);
    return res.end('Unknown method');
  }

  res.writeHead(200, {
    'Content-Type': 'application/json'
  });

  res.end(JSON.stringify({
    jsonrpc: '2.0',
    id: message.id ?? null,
    result
  }));
});

server.listen(port, '0.0.0.0', () => {
  console.log('CAREFA diagnostic server listening on ' + port);
});
