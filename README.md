# OpenRAG Chat

A modern chat application with LLM and MCP (Model Context Protocol) server integration. Built with Go, React, and TypeScript.

## Features

- **Multi-model support** — Configure and switch between different LLM providers (OpenAI, Mistral, etc.)
- **MCP server integration** — Connect to MCP servers for tool use and extended capabilities
- **Real-time streaming** — Server-Sent Events (SSE) for low-latency response streaming
- **Conversation management** — Save and organize conversations with full message history
- **Theme support** — Light/dark mode and customizable themes
- **Diagnostic notifications** — Real-time health checks for backend, models, and MCP servers
- **Tool use** — Full support for LLM-initiated tool calls and results

## Architecture

```
openrag_chat/
├── backend/          # Go server (chi router, SQLite, SSE streaming)
│   ├── handlers/     # HTTP handlers (chat, models, MCP servers, conversations)
│   ├── llm/          # LLM client with streaming support
│   ├── mcp/          # MCP JSON-RPC client (streamable-http + SSE transports)
│   ├── db/           # SQLite database layer
│   └── models/       # Type definitions
│
└── frontend/         # React application (Vite, TypeScript, Zustand)
    └── src/
        ├── components/   # UI components (chat, settings, notifications)
        ├── pages/        # Page layouts
        ├── api/          # Typed API client
        ├── store/        # Global state (Zustand)
        └── themes.ts     # Theme system
```

## Quick Start

### Prerequisites

- **Go** 1.21+
- **Node.js** 18+
- **npm** 9+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/EnjoyBacon7/openrag_chat.git
cd openrag_chat
```

2. Install dependencies:
```bash
npm install
```

### Running Locally

Run both backend and frontend with a single command:

```bash
npm run dev
```

This starts:
- **Backend**: `http://localhost:8080`
- **Frontend**: `http://localhost:5173`

Then open `http://localhost:5173` in your browser.

**Manual startup** (separate terminals):

Terminal 1 — Backend:
```bash
cd backend
go run main.go
```

Terminal 2 — Frontend:
```bash
cd frontend
npm run dev
```

### Building for Production

```bash
npm run build
```

Outputs:
- `backend/chatui-server` (compiled binary)
- `frontend/dist/` (static files)

## Configuration

### Backend Environment Variables

Create a `.env` file in the root directory:

```bash
# Database path (default: chatui.db)
DB_PATH=chatui.db

# Server port (default: 8080)
PORT=8080

# Static files directory for production (default: ../frontend/dist)
STATIC_DIR=../frontend/dist
```

See `.env.example` for a template.

## API Reference

### REST Endpoints

**Models:**
- `GET /api/models` — List configured models
- `POST /api/models` — Create a new model
- `PUT /api/models/{id}` — Update a model
- `DELETE /api/models/{id}` — Delete a model

**MCP Servers:**
- `GET /api/mcp-servers` — List configured MCP servers
- `POST /api/mcp-servers` — Create a new MCP server
- `PUT /api/mcp-servers/{id}` — Update an MCP server
- `DELETE /api/mcp-servers/{id}` — Delete an MCP server
- `POST /api/mcp-servers/{id}/test` — Test MCP server connectivity

**Conversations:**
- `GET /api/conversations` — List conversations
- `POST /api/conversations` — Create a conversation
- `GET /api/conversations/{id}` — Get conversation with messages
- `PATCH /api/conversations/{id}` — Update conversation title
- `DELETE /api/conversations/{id}` — Delete conversation

**Chat (SSE):**
- `POST /api/chat/send` — Send a message (streams response)
- `POST /api/chat/edit` — Edit a message and regenerate (streams response)

**Health:**
- `GET /api/health` — Backend health check

## Development

### Technology Stack

**Backend:**
- [chi](https://github.com/go-chi/chi) — HTTP router
- [SQLite](https://sqlite.org) — Database (via modernc.org/sqlite)

**Frontend:**
- [React](https://react.dev) — UI framework
- [Vite](https://vitejs.dev) — Build tool
- [TypeScript](https://www.typescriptlang.org) — Type safety
- [Zustand](https://github.com/pmndrs/zustand) — State management
- [Tailwind CSS](https://tailwindcss.com) — Styling
- [lucide-react](https://lucide.dev) — Icons

### Code Style

- **Go**: Standard Go conventions; run `gofmt` before committing
- **TypeScript/React**: ESLint + TypeScript strict mode
- **CSS**: Tailwind utility classes + CSS variables for theming

### Testing

Run frontend tests (if added):
```bash
cd frontend
npm test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Reporting bugs
- Submitting feature requests
- Code style and standards
- Pull request process

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/EnjoyBacon7/openrag_chat/issues)
- **Discussions**: [GitHub Discussions](https://github.com/EnjoyBacon7/openrag_chat/discussions)

## Authors

- Created and maintained by the OpenRAG team

---

**Ready to contribute?** Start with [CONTRIBUTING.md](CONTRIBUTING.md).
