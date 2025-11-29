# Synapse

SSE-based MCP server for semantic search over your knowledge vault.

## Server Setup (Remote Host)

```bash
cd /snowscape/knowledge/synapse
npm install
bun run start
```

Server runs on `http://0.0.0.0:3939` by default.

### Environment Variables

| Variable     | Default                           | Description     |
| ------------ | --------------------------------- | --------------- |
| `MCP_PORT`   | `3939`                            | HTTP port       |
| `MCP_HOST`   | `0.0.0.0`                         | Bind address    |
| `VAULT_PATH` | `/snowscape/knowledge`            | Path to vault   |
| `ENV_PATH`   | `/snowscape/knowledge/.smart-env` | Embeddings data |

## Client Setup (Local Machine)

```bash
claude mcp add --scope user --transport sse synapse http://<remote-host>:3939/sse
```

Replace `<remote-host>` with the IP/hostname of the machine running the server.

## Endpoints

| Endpoint                | Method | Description               |
| ----------------------- | ------ | ------------------------- |
| `/sse`                  | GET    | SSE connection for MCP    |
| `/messages?sessionId=X` | POST   | Client-to-server messages |
| `/health`               | GET    | Health check              |

## Tools

- `search_notes` - Keyword search in note paths
- `get_similar_notes` - Semantic similarity using embeddings
- `get_connection_graph` - Multi-level connection exploration
