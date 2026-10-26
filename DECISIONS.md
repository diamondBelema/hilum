# Decisions

- **The harness replaces ken.** ken is reference material only: no runtime proxy, no ken process, no reads or writes of `~/.local/share/ken`. The harness owns the vault, MCP surface, mastery and state.
- **Bun install:** installed via the official installer to `~/.bun`; `bun`/`bunx` symlinked into `~/.local/bin` so package scripts work in bash and fish.
- **MCP endpoint:** SDK `WebStandardStreamableHTTPServerTransport` in stateless JSON mode, so it runs natively on Bun without the Node adapter.
- **UI build:** `bun run start` builds the UI only when `dist/ui/index.html` is missing; `HARNESS_SKIP_BUILD=1` and `HARNESS_FORCE_BUILD=1` override this.
- **SQLite:** M0 creates only a `meta` table; the real schema lands in M2/M3.
- **Config:** port 4317, host 127.0.0.1, LAN off by default, all overridable by env (`PORT`, `HOST`, `HARNESS_VAULT`, `HARNESS_DB`, `HARNESS_LAN`, `HARNESS_MCP_TOKEN`).
- **Design register:** product UI, restrained color, dark-first (night study on laptop/phone). One system sans, fixed rem scale, accent reserved for actions/selection/state. Impeccable loaded for token work; Lane C inherits these tokens instead of inventing a palette.
- **ken mapping:** see `docs/ken-mapping.md`. Vault layout follows SPEC (`courses/<code>/`); ken formats are borrowed where useful, but SPEC wins on any conflict.
