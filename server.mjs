
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 10000);
const SERVER_NAME = 'carefa-mcp-diagnostic';
const PROTOCOL_VERSION = '2025-03-26';

const TOOLS = [
  {
    name: 'carefa_connection_test',
    description:
      'Check that ChatGPT can communicate with the CAREFA MCP server. No private collector data is accessed.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'carefa_collection_summary',
    description:
      'Get the authenticated CAREFA collector collection summary. Currently locked until secure account linking is verified.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  }
];

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Authorization',
    'Access-Control-Expose-Headers':
      'MCP-Protocol-Version, MCP-Session-Id',
    ...headers
  });

  res.end(JSON.stringify(data));
}

function rpcResult(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

function rpcError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  };
}

function toolText(message, isError = false) {
  return {
    content: [
      {
        type: 'text',
        text: message
      }
    ],
    isError
  };
}

function handleRpc(message) {
  if (
    !message ||
    typeof message !== 'object' ||
    Array.isArray(message) ||
    message.jsonrpc !== '2.0'
  ) {
    return rpcError(null, -32600, 'Invalid JSON-RPC request');
  }

  const { id, method, params } = message;

  if (typeof method === 'string' && id === undefined) {
    return null;
  }

  if (id === undefined || typeof method !== 'string') {
    return rpcError(id ?? null, -32600, 'Invalid JSON-RPC request');
  }

  if (method === 'initialize') {
    const supportedVersions = [
      '2025-03-26',
      '2025-06-18',
      '2025-11-25'
    ];

    const requestedVersion = params?.protocolVersion;

    const version = supportedVersions.includes(requestedVersion)
      ? requestedVersion
      : PROTOCOL_VERSION;

    return rpcResult(id, {
      protocolVersion: version,
      capabilities: {
        tools: {
          listChanged: false
        }
      },
      serverInfo: {
        name: SERVER_NAME,
        version: '1.2.0'
      }
    });
  }

  if (method === 'ping') {
    return rpcResult(id, {});
  }

  if (method === 'tools/list') {
    return rpcResult(id, {
      tools: TOOLS
    });
  }

  if (method === 'tools/call') {
    const name = params?.name;

    if (name === 'carefa_connection_test') {
      return rpcResult(
        id,
        toolText(
          'CAREFA MCP CONNECTION SUCCESSFUL. ChatGPT reached the Render server and called its diagnostic tool. No private collection data was accessed.'
        )
      );
    }

    if (name === 'carefa_collection_summary') {
      return rpcResult(
        id,
        toolText(
          'CAREFA COLLECTION ACCESS LOCKED. Secure collector authentication and account linking have not yet been verified. No collection data was accessed.',
          true
        )
      );
    }

    return rpcError(id, -32602, 'Unknown tool');
  }

  return rpcError(id, -32601, 'Method not found');
}

const server = http.createServer(async (req, res) => {
  const path = new URL(
    req.url || '/',
    'http://localhost'
  ).pathname;

  res.on('finish', () => {
    console.log(
      '[CAREFA MCP]',
      req.method,
      path,
      res.statusCode
    );
  });

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Authorization'
    });

    return res.end();
  }

  if (req.method === 'GET' && path === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'CAREFA MCP diagnostic',
      version: '1.2.0',
      collectionAccess: false,
      authentication: 'none - diagnostic only',
      requestId: randomUUID()
    });
  }

  if (path !== '/mcp') {
    return sendJson(res, 404, {
      error: 'Not found'
    });
  }

  if (req.method === 'GET') {
    return sendJson(
      res,
      405,
      { error: 'SSE stream not supported. Use POST.' },
      { Allow: 'POST, OPTIONS' }
    );
  }

  if (req.method !== 'POST') {
    return sendJson(
      res,
      405,
      { error: 'Method not allowed' },
      { Allow: 'POST, OPTIONS' }
    );
  }

  const chunks = [];
  let size = 0;

  try {
    for await (const chunk of req) {
      size += chunk.length;

      if (size > 65536) {
        return sendJson(res, 413, {
          error: 'Request too large'
        });
      }

      chunks.push(chunk);
    }
  } catch {
    return sendJson(res, 400, {
      error: 'Could not read request'
    });
  }

  let message;

  try {
    message = JSON.parse(
      Buffer.concat(chunks).toString('utf8')
    );
  } catch {
    return sendJson(
      res,
      400,
      rpcError(null, -32700, 'Parse error')
    );
  }

  if (Array.isArray(message)) {
    return sendJson(
      res,
      400,
      rpcError(null, -32600, 'Batch requests not supported')
    );
  }

  const response = handleRpc(message);

  if (response === null) {
    res.writeHead(202, {
      'Access-Control-Allow-Origin': '*'
    });

    return res.end();
  }

  return sendJson(res, 200, response, {
    'MCP-Protocol-Version': PROTOCOL_VERSION
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `CAREFA MCP diagnostic server v1.2.0 listening on port ${PORT}`
  );
});
