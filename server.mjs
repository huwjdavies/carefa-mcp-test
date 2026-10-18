import { createOAuthBridge } from "./oauth.mjs";
import { initializeDurableGrants } from "./db/initialize.mjs";
import http from "node:http";
import { pathToFileURL } from "node:url";
import {
  companionTool,
  validateCompanionInput,
  projectCompanionResult,
} from "./companion/tools.mjs";
import { projectCard } from "./companion/reader.mjs";

import { randomUUID } from "node:crypto";

export function createCarefaServer({
  env = process.env,
  fetchImpl = globalThis.fetch,
  durableStorage = null,
  logger = console,
} = {}) {
  // CAREFA Render MCP bridge

  const PORT = Number(env.PORT || 10000);

  const SERVER_NAME = "carefa-mcp-diagnostic";

  const PROTOCOL_VERSION = "2025-03-26";

  const VERSION = "1.5.0-oauth-dev";

  const CAREFA_APP_URL = (
    env.CAREFA_APP_URL || "https://carefacollector.base44.app"
  ).replace(/\/$/, "");

  const CAREFA_LINK_FUNCTION_URL = env.CAREFA_LINK_FUNCTION_URL || "";

  const BRIDGE_SECRET = env.RENDER_BRIDGE_SECRET || "";

  const PUBLIC_URL = (env.RENDER_PUBLIC_URL || "").replace(/\/$/, "");

  const TOOLS = [
    {
      name: "carefa_demo_collection",
      description:
        "Return fictional CAREFA collection statistics for testing. No real user data is accessed.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },

    {
      name: "carefa_connection_test",

      description:
        "Check ChatGPT-to-Render connectivity. No private data is accessed.",

      inputSchema: {
        type: "object",

        properties: {},

        additionalProperties: false,
      },
    },

    {
      name: "carefa_collection_summary",

      description:
        "Get the linked CAREFA collector collection summary using this OAuth session. Requires collection:read access.",

      inputSchema: {
        type: "object",

        properties: {},

        additionalProperties: false,
      },
    },
    {
      name: "carefa_pokemon_count",
      description:
        "Count matching Pokemon cards in the linked collector collection. Read-only, authenticated and owner-scoped. Returns unique records and total owned copies.",
      inputSchema: {
        type: "object",
        properties: {
          pokemon: { type: "string", minLength: 1, maxLength: 80 },
        },
        required: ["pokemon"],
        additionalProperties: false,
      },
    },
    {
      name: "carefa_collection_cards",
      description:
        "Read one page of cards owned by the authenticated CAREFA collector. No private account details. Requires collection:read.",
      inputSchema: {
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["user_cards", "collection_entries"],
          },
          page: { type: "integer", minimum: 0, maximum: 10000 },
        },
        additionalProperties: false,
      },
    },
  ];
  if (env.CAREFA_COMPANION_V1 === "enabled") TOOLS.push(companionTool);
  for (const tool of TOOLS) {
    tool.annotations = {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };
    tool.securitySchemes = [{ type: "oauth2", scopes: ["collection:read"] }];
  }

  function sendJson(res, status, data, extra = {}) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",

      "Cache-Control": "no-store",

      "X-Content-Type-Options": "nosniff",

      "Access-Control-Allow-Origin": "*",

      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",

      "Access-Control-Allow-Headers":
        "Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Authorization",

      "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id",

      ...extra,
    });

    res.end(JSON.stringify(data));
  }

  function rpcResult(id, result) {
    return {
      jsonrpc: "2.0",

      id,

      result,
    };
  }

  function rpcError(id, code, message) {
    return {
      jsonrpc: "2.0",

      id,

      error: {
        code,

        message,
      },
    };
  }

  function toolText(message, isError = false) {
    return {
      content: [
        {
          type: "text",

          text: message,
        },
      ],

      isError,
    };
  }

  function authToolError(message = "CAREFA access needs reconnection.") {
    return {
      ...toolText(message, true),
      _meta: {
        "mcp/www_authenticate": [
          `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp", error="invalid_token", error_description="Reconnect your CAREFA account"`,
        ],
      },
    };
  }
  function upstreamError(status) {
    const error = new Error("CAREFA upstream access unavailable");
    error.status = status;
    return error;
  }
  function configured() {
    return !!(
      CAREFA_LINK_FUNCTION_URL.startsWith("https://") &&
      PUBLIC_URL.startsWith("https://") &&
      BRIDGE_SECRET.length >= 32
    );
  }

  function getCarefaConnectFunctionUrl() {
    if (!CAREFA_LINK_FUNCTION_URL) return "";

    const result = CAREFA_LINK_FUNCTION_URL.replace(
      /carefaAiLink\/?$/,

      "carefaAiConnect",
    );

    if (result === CAREFA_LINK_FUNCTION_URL) {
      return "";
    }

    return result;
  }

  async function exchangeCode(code, callbackUrl) {
    const controller = new AbortController();

    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetchImpl(CAREFA_LINK_FUNCTION_URL, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "x-carefa-bridge-secret": BRIDGE_SECRET,
        },

        body: JSON.stringify({
          action: "exchangeCode",

          code,

          callback_url: callbackUrl,
        }),

        signal: controller.signal,

        redirect: "error",
      });

      if (!response.ok) {
        throw new Error(`CAREFA exchange rejected (${response.status})`);
      }

      const data = await response.json();

      if (typeof data?.token !== "string" || data.token.length < 32) {
        throw new Error("CAREFA exchange returned no valid link token");
      }

      return data.token;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchCollectionSummary(linkToken) {
    const endpoint = getCarefaConnectFunctionUrl();

    if (!endpoint) {
      throw new Error("CAREFA collection endpoint could not be derived");
    }

    const controller = new AbortController();

    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          "x-carefa-bridge-secret": BRIDGE_SECRET,

          "x-carefa-link-token": linkToken,
        },

        body: JSON.stringify({
          detail: "summary",
        }),

        signal: controller.signal,

        redirect: "error",
      });

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw upstreamError(response.status);
      }

      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchCollectionCards(linkToken, source, page) {
    const endpoint = getCarefaConnectFunctionUrl();
    if (!endpoint)
      throw new Error("CAREFA collection endpoint could not be derived");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-carefa-bridge-secret": BRIDGE_SECRET,
          "x-carefa-link-token": linkToken,
        },
        body: JSON.stringify({ detail: "cards", source, page }),
        signal: controller.signal,
        redirect: "error",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw upstreamError(response.status);
      if (
        !Array.isArray(data.cards) ||
        !data.pagination ||
        data.pagination.source !== source ||
        data.pagination.page !== page
      ) {
        throw new Error(
          "CAREFA detailed collection access is not available on this endpoint",
        );
      }
      return {
        cards: data.cards.map(projectCard),
        pagination: {
          source,
          page,
          page_size: data.pagination.page_size,
          total: data.pagination.total,
          has_more: data.pagination.has_more,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function handleRpc(message, req) {
    if (
      !message ||
      typeof message !== "object" ||
      Array.isArray(message) ||
      message.jsonrpc !== "2.0"
    ) {
      return rpcError(
        null,

        -32600,

        "Invalid JSON-RPC request",
      );
    }

    const { id, method, params } = message;

    if (typeof method === "string" && id === undefined) {
      return null;
    }

    if (id === undefined || typeof method !== "string") {
      return rpcError(
        id ?? null,

        -32600,

        "Invalid JSON-RPC request",
      );
    }

    if (method === "initialize") {
      const supported = ["2025-03-26", "2025-06-18", "2025-11-25"];

      return rpcResult(id, {
        protocolVersion: supported.includes(params?.protocolVersion)
          ? params.protocolVersion
          : PROTOCOL_VERSION,

        capabilities: {
          tools: {
            listChanged: false,
          },
        },

        serverInfo: {
          name: SERVER_NAME,

          version: VERSION,
        },
      });
    }

    if (method === "ping") {
      return rpcResult(id, {});
    }

    if (method === "tools/list") {
      return rpcResult(id, {
        tools: TOOLS,
      });
    }

    if (method === "tools/call") {
      const args = params?.arguments ?? {};
      if (!args || typeof args !== "object" || Array.isArray(args))
        return rpcError(id, -32602, "Invalid arguments");
      const definition = TOOLS.find((tool) => tool.name === params?.name);
      if (!definition) return rpcError(id, -32602, "Unknown tool");
      if (
        !Object.keys(definition.inputSchema.properties).length &&
        Object.keys(args).length
      )
        return rpcError(
          id,
          -32602,
          "This tool accepts no account-selection or other arguments",
        );
      if (params.name === "carefa_companion_read") {
        try {
          const input = validateCompanionInput(args);
          if (!req.carefaLinkToken)
            return rpcResult(id, toolText("CAREFA sign-in required.", true));
          const endpoint = env.CAREFA_COMPANION_FUNCTION_URL;
          if (
            !endpoint ||
            new URL(endpoint).protocol !== "https:" ||
            new URL(endpoint).origin !==
              new URL(CAREFA_LINK_FUNCTION_URL).origin
          )
            return rpcResult(
              id,
              toolText("CAREFA Companion V1 is not yet available.", true),
            );
          const response = await fetchImpl(endpoint, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(15000),
            headers: {
              "Content-Type": "application/json",
              "x-carefa-bridge-secret": BRIDGE_SECRET,
              "x-carefa-link-token": req.carefaLinkToken,
            },
            body: JSON.stringify(input),
          });
          if (!response.ok)
            return rpcResult(
              id,
              response.status === 401 || response.status === 403
                ? authToolError()
                : toolText(
                    "CAREFA companion information is temporarily unavailable.",
                    true,
                  ),
            );
          return rpcResult(
            id,
            toolText(
              JSON.stringify(
                projectCompanionResult(await response.json(), input.section),
              ),
            ),
          );
        } catch {
          return rpcResult(
            id,
            toolText("CAREFA companion request rejected or unavailable.", true),
          );
        }
      }

      if (params?.name === "carefa_connection_test") {
        return rpcResult(
          id,

          toolText(
            "CAREFA MCP CONNECTION SUCCESSFUL. ChatGPT reached the Render server and called its diagnostic tool. No private collection data was accessed.",
          ),
        );
      }

      if (params?.name === "carefa_demo_collection") {
        return rpcResult(
          id,
          toolText(
            JSON.stringify({
              collector: "Test Trainer",
              cards_owned: 1250,
              unique_cards: 987,
              collection_value_gbp: 8450,
              demo: true,
            }),
          ),
        );
      }

      if (params?.name === "carefa_collection_summary") {
        const token = req.carefaLinkToken;

        if (!token) {
          return rpcResult(
            id,

            toolText(
              "CAREFA COLLECTION ACCESS LOCKED. This MCP connection does not yet contain the secure CAREFA bearer token. No private collection data was accessed.",

              true,
            ),
          );
        }

        try {
          const data = await fetchCollectionSummary(token);

          const summary = data?.summary || {};

          return rpcResult(
            id,

            toolText(
              [
                "CAREFA COLLECTION SUMMARY",

                "",

                `Total user cards: ${summary.total_user_cards ?? "unknown"}`,

                `Collection entries: ${
                  summary.total_collection_entries ?? "unknown"
                }`,

                "",

                typeof data?.user?.collector_fingerprint === "string" &&
                /^collector-v1-[A-Za-z0-9_-]{22}$/.test(
                  data.user.collector_fingerprint,
                )
                  ? `Collector fingerprint: ${data.user.collector_fingerprint}`
                  : "Collector fingerprint: unavailable (CAREFA identity endpoint not upgraded)",

                "Authenticated CAREFA account link verified.",
              ].join("\n"),
            ),
          );
        } catch (error) {
          return rpcResult(
            id,

            error?.status === 401 || error?.status === 403
              ? authToolError()
              : toolText(
                  "CAREFA collection access denied. Retry or reconnect your account.",
                  true,
                ),
          );
        }
      }

      if (params?.name === "carefa_pokemon_count") {
        const token = req.carefaLinkToken;
        if (!token)
          return rpcResult(
            id,
            toolText("CAREFA COLLECTION ACCESS LOCKED.", true),
          );
        const args = params?.arguments || {};
        if (
          Object.keys(args).some((k) => k !== "pokemon") ||
          typeof args.pokemon !== "string" ||
          args.pokemon.trim().length < 1 ||
          args.pokemon.length > 80
        ) {
          return rpcError(id, -32602, "Invalid pokemon name");
        }
        try {
          const endpoint = getCarefaConnectFunctionUrl();
          if (!endpoint)
            throw new Error("CAREFA collection endpoint not configured");
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 15000);
          let response;
          try {
            response = await fetchImpl(endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-carefa-bridge-secret": BRIDGE_SECRET,
                "x-carefa-link-token": token,
              },
              body: JSON.stringify({
                detail: "pokemon_count",
                pokemon: args.pokemon.trim(),
              }),
              signal: controller.signal,
              redirect: "error",
            });
          } finally {
            clearTimeout(timer);
          }
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw upstreamError(response.status);
          if (
            data?.pokemon_count?.pokemon?.toLowerCase() !==
              args.pokemon.trim().toLowerCase() ||
            !Number.isSafeInteger(data?.pokemon_count?.unique_records) ||
            !Number.isSafeInteger(data?.pokemon_count?.total_copies)
          ) {
            throw new Error(
              "CAREFA count endpoint is not ready or returned invalid data",
            );
          }
          return rpcResult(id, toolText(JSON.stringify(data.pokemon_count)));
        } catch (error) {
          return rpcResult(
            id,
            error?.status === 401 || error?.status === 403
              ? authToolError()
              : toolText(
                  "CAREFA count unavailable. Retry or reconnect your account.",
                  true,
                ),
          );
        }
      }

      if (params?.name === "carefa_collection_cards") {
        const token = req.carefaLinkToken;
        if (!token)
          return rpcResult(
            id,
            toolText("CAREFA COLLECTION ACCESS LOCKED.", true),
          );
        const args = params?.arguments || {};
        if (
          Object.keys(args).some((k) => !["source", "page"].includes(k)) ||
          (args.source !== undefined &&
            !["user_cards", "collection_entries"].includes(args.source)) ||
          (args.page !== undefined &&
            (!Number.isSafeInteger(args.page) ||
              args.page < 0 ||
              args.page > 10000))
        ) {
          return rpcError(id, -32602, "Invalid collection page arguments");
        }
        try {
          const data = await fetchCollectionCards(
            token,
            args.source || "user_cards",
            args.page ?? 0,
          );
          return rpcResult(id, toolText(JSON.stringify(data)));
        } catch (error) {
          return rpcResult(
            id,
            error?.status === 401 || error?.status === 403
              ? authToolError()
              : toolText(
                  "CAREFA card access denied. Retry or reconnect your account.",
                  true,
                ),
          );
        }
      }

      return rpcError(
        id,

        -32602,

        "Unknown tool",
      );
    }

    return rpcError(
      id,

      -32601,

      "Method not found",
    );
  }

  const oauth = createOAuthBridge({
    publicUrl: PUBLIC_URL,
    appUrl: CAREFA_APP_URL,
    redirectUris: JSON.parse(env.OAUTH_REDIRECT_URIS || "[]"),
    configured,
    exchangeCode,
    durableGrants: durableStorage?.grants ?? null,
    durableHandshakes: durableStorage?.handshakes ?? null,
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(
        req.url || "/",

        "http://localhost",
      );

      const path = url.pathname;

      res.on("finish", () => {
        logger.log(
          "[CAREFA MCP]",

          req.method,

          path,

          res.statusCode,
        );
      });

      if (await oauth.handle(req, res, url)) return;

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",

          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",

          "Access-Control-Allow-Headers":
            "Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Authorization",
        });

        return res.end();
      }

      // Public read-only diagnostic: only tool names, never credentials or collector data.
      if (req.method === "GET" && path === "/diagnostics/tool-names") {
        return sendJson(
          res,
          200,
          {
            toolCount: TOOLS.length,
            toolNames: TOOLS.map((tool) => tool.name),
          },
          { "Cache-Control": "no-store" },
        );
      }

      if (req.method === "GET" && path === "/health") {
        return sendJson(res, 200, {
          status: "ok",

          service: "CAREFA MCP diagnostic",

          version: VERSION,

          collectionAccess: "requires authenticated bearer token",

          authentication: "OAuth authorization code with S256 PKCE",

          linkBridgeConfigured: oauth.ready(),

          requestId: randomUUID(),
        });
      }

      if (path === "/link/start" || path === "/link/callback") {
        return sendJson(res, 400, {
          error: "Start sign-in through the OAuth authorization endpoint.",
        });
      }

      if (path !== "/mcp") {
        return sendJson(
          res,

          404,

          {
            error: "Not found",
          },
        );
      }

      const session = await oauth.authenticate(req);
      if (!session) return oauth.challenge(res);
      // The caller's OAuth session selects exactly one CAREFA link token.
      // Never accept an upstream CAREFA token directly from an MCP caller.
      req.carefaLinkToken = session.linkToken;

      if (req.method === "GET") {
        return sendJson(
          res,

          405,

          {
            error: "SSE stream not supported. Use POST.",
          },

          {
            Allow: "POST, OPTIONS",
          },
        );
      }

      if (req.method !== "POST") {
        return sendJson(
          res,

          405,

          {
            error: "Method not allowed",
          },

          {
            Allow: "POST, OPTIONS",
          },
        );
      }

      const chunks = [];

      let size = 0;

      try {
        for await (const chunk of req) {
          size += chunk.length;

          if (size > 65536) {
            return sendJson(
              res,

              413,

              {
                error: "Request too large",
              },
            );
          }

          chunks.push(chunk);
        }
      } catch {
        return sendJson(
          res,

          400,

          {
            error: "Could not read request",
          },
        );
      }

      let message;

      try {
        message = JSON.parse(
          Buffer.concat(chunks)

            .toString("utf8"),
        );
      } catch {
        return sendJson(
          res,

          400,

          rpcError(
            null,

            -32700,

            "Parse error",
          ),
        );
      }

      if (Array.isArray(message)) {
        return sendJson(
          res,

          400,

          rpcError(
            null,

            -32600,

            "Batch requests not supported",
          ),
        );
      }

      const response = await handleRpc(
        message,

        req,
      );

      if (response === null) {
        res.writeHead(202, {
          "Access-Control-Allow-Origin": "*",
        });

        return res.end();
      }

      return sendJson(
        res,

        200,

        response,

        {
          "MCP-Protocol-Version": PROTOCOL_VERSION,
        },
      );
    } catch {
      logger.error("CAREFA request failed");
      if (!res.headersSent)
        sendJson(res, 503, { error: "temporarily_unavailable" });
      else res.destroy();
    }
  });

  return { server, oauth };
}
export async function startCarefaServer(env = process.env) {
  const durableStorage = await initializeDurableGrants(env);
  const { server } = createCarefaServer({ env, durableStorage });
  server.listen(Number(env.PORT || 10000), "0.0.0.0", () =>
    console.log("CAREFA MCP server listening on port " + server.address().port),
  );
  const stop = () =>
    server.close(async () => {
      if (durableStorage) await durableStorage.pool.end();
    });
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startCarefaServer().catch(() => {
    console.error("CAREFA startup failed; review private configuration");
    process.exitCode = 1;
  });
}
