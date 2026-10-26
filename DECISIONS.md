# Decisions

- **Vault source of truth:** `~/Documents/learn/subjects` holds markdown content; `~/.local/share/ken/*.json` is ken's derived progress state and is not hand-edited.
- **Bun install:** installed via the official installer to `~/.bun`; `bun`/`bunx` symlinked into `~/.local/bin` so package scripts work in bash and fish.
- **MCP endpoint:** SDK `WebStandardStreamableHTTPServerTransport` in stateless JSON mode, so it runs natively on Bun without the Node adapter.
- **UI build:** `bun run start` builds the UI only when `dist/ui/index.html` is missing; `HARNESS_SKIP_BUILD=1` and `HARNESS_FORCE_BUILD=1` override this.
- **SQLite:** M0 creates only a `meta` table; the real schema lands in M2/M3.
- **Config:** port 4317, host 127.0.0.1, LAN off by default, all overridable by env (`PORT`, `HOST`, `HARNESS_VAULT`, `HARNESS_DB`, `HARNESS_LAN`, `HARNESS_MCP_TOKEN`).
- **Design register:** product UI, restrained color, dark-first (night study on laptop/phone). One system sans, fixed rem scale, accent reserved for actions/selection/state. Impeccable loaded for token work; Lane C inherits these tokens instead of inventing a palette.
