# Synapse

SSE-based MCP server for semantic search over your knowledge vault.

## Server Setup (Remote Host)

```bash
npm install
VAULT_PATH=/path/to/your/vault bun run start
```

Server runs on `http://0.0.0.0:3939` by default.

### Environment Variables

| Variable     | Required | Default                | Description     |
| ------------ | -------- | ---------------------- | --------------- |
| `VAULT_PATH` | Yes      | -                      | Path to vault   |
| `ENV_PATH`   | No       | `$VAULT_PATH/.synapse` | Embeddings data |
| `MCP_PORT`   | No       | `3939`                 | HTTP port       |
| `MCP_HOST`   | No       | `0.0.0.0`              | Bind address    |

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
