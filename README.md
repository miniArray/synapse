# Synapse

Standalone MCP server for semantic search over your markdown knowledge vault. Generates embeddings via Ollama with automatic indexing and live file watching.

## Prerequisites

Ollama must be running on your system. Install from [ollama.com](https://ollama.com), then pull the embedding model:

```bash
ollama pull nomic-embed-text
```

## Server Setup

```bash
npm install
VAULT_PATH=/path/to/your/vault bun run start
```

Server runs on `http://0.0.0.0:3939` by default.

On first run, Synapse will:

1. Scan your vault for markdown files
2. Generate embeddings via Ollama
3. Store embeddings in SQLite database
4. Start a file watcher for live updates

### Environment Variables

| Variable       | Required | Default                  | Description                   |
| -------------- | -------- | ------------------------ | ----------------------------- |
| `VAULT_PATH`   | Yes      | -                        | Path to markdown vault        |
| `ENV_PATH`     | No       | `$VAULT_PATH/.synapse`   | Where embeddings.db is stored |
| `MCP_PORT`     | No       | `3939`                   | HTTP port                     |
| `MCP_HOST`     | No       | `0.0.0.0`                | Bind address                  |
| `OLLAMA_URL`   | No       | `http://localhost:11434` | Ollama API endpoint           |
| `OLLAMA_MODEL` | No       | `nomic-embed-text`       | Embedding model name          |

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

## How It Works

**Initial indexing:** On startup, Synapse scans your vault and generates embeddings for all markdown files using the specified Ollama model. These embeddings are stored in a local SQLite database.

**Live updates:** The built-in file watcher automatically detects changes, additions, and deletions in your vault, re-embedding modified files in real-time.

**Semantic search:** Tools use embeddings to find semantically related notes and build multi-hop connection graphs across your vault.
