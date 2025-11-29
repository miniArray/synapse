#!/usr/bin/env bun

/**
 * Synapse - MCP Server (SSE Transport)
 *
 * Semantic search over your knowledge vault via MCP.
 * Designed for remote access over HTTP using Server-Sent Events.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  type EnvironmentConfig,
  initializeEnvironment,
} from "./environment.js";
import { BunSSETransport } from "./sse-transport.js";
import { connectionGraphTool, getConnectionGraph } from "./tools/graph.js";
import { searchNotes, searchNotesTool } from "./tools/search.js";
import { getSimilarNotes, similarNotesTool } from "./tools/similar.js";

function createServer(): Server {
  const server = new Server(
    {
      name: "synapse",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [searchNotesTool, similarNotesTool, connectionGraphTool],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "search_notes":
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  searchNotes(args as Parameters<typeof searchNotes>[0]),
                  null,
                  2,
                ),
              },
            ],
          };

        case "get_similar_notes":
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  getSimilarNotes(
                    args as Parameters<typeof getSimilarNotes>[0],
                  ),
                  null,
                  2,
                ),
              },
            ],
          };

        case "get_connection_graph":
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  getConnectionGraph(
                    args as Parameters<typeof getConnectionGraph>[0],
                  ),
                  null,
                  2,
                ),
              },
            ],
          };

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `Unknown tool: ${name}` }),
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Server] Tool error (${name}):`, message);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: message }) },
        ],
        isError: true,
      };
    }
  });

  return server;
}

async function main(): Promise<void> {
  const config: EnvironmentConfig = {
    vault_path: process.env["VAULT_PATH"] ?? "/snowscape/knowledge",
    env_path: process.env["ENV_PATH"] ?? "/snowscape/knowledge/.smart-env",
  };

  console.error("[Synapse] Starting...");

  try {
    await initializeEnvironment(config);
  } catch (error) {
    console.error("[Server] Failed to initialize:", error);
    process.exit(1);
  }

  const port = parseInt(process.env["MCP_PORT"] ?? "3939", 10);
  const host = process.env["MCP_HOST"] ?? "0.0.0.0";

  // Track active sessions
  const sessions = new Map<
    string,
    { server: Server; transport: BunSSETransport }
  >();

  Bun.serve({
    port,
    hostname: host,
    fetch: async (req) => {
      const url = new URL(req.url);

      // Health check
      if (url.pathname === "/health") {
        return Response.json({ status: "ok", sessions: sessions.size });
      }

      // SSE connection endpoint
      if (url.pathname === "/sse") {
        const transport = new BunSSETransport();
        const server = createServer();

        sessions.set(transport.sessionId, { server, transport });
        console.error(`[Server] New session: ${transport.sessionId}`);

        transport.onclose = () => {
          sessions.delete(transport.sessionId);
          console.error(`[Server] Session closed: ${transport.sessionId}`);
        };

        await server.connect(transport);

        return transport.response;
      }

      // Message endpoint (client -> server)
      if (url.pathname === "/messages" && req.method === "POST") {
        const sessionId = url.searchParams.get("sessionId");
        console.error(
          `[Server] POST /messages sessionId=${sessionId}, active sessions: [${[...sessions.keys()].join(", ")}]`,
        );
        const session = sessionId ? sessions.get(sessionId) : undefined;

        if (!session) {
          console.error(`[Server] Session not found: ${sessionId}`);
          return Response.json(
            { error: "Invalid or missing sessionId" },
            { status: 400 },
          );
        }

        try {
          const body = await req.json();
          await session.transport.handleMessage(body);
          return new Response(null, { status: 202 });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          return Response.json({ error: message }, { status: 400 });
        }
      }

      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.error(`[Server] MCP SSE server running on http://${host}:${port}`);
  console.error(`[Server] Connect via: http://${host}:${port}/sse`);
}

main().catch((error) => {
  console.error("[Server] Fatal error:", error);
  process.exit(1);
});
