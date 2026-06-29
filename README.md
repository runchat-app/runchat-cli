# runchat — Runchat CLI

[![npm](https://img.shields.io/npm/v/@runchat/cli.svg)](https://www.npmjs.com/package/@runchat/cli)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Build and run [Runchat](https://runchat.com) node-based AI workflows from the
terminal. This is a faithful command-line port of the Runchat **MCP server** —
every MCP tool is available as a CLI command, and the tool list is fetched
**live** from the server, so the CLI never drifts from the API.

```sh
npx @runchat/cli tools                  # list every tool
npx @runchat/cli list_runchats          # call a tool
npx @runchat/cli create_node --help     # read a tool's parameters
```

> The command is `runchat` once installed. The npm package is `@runchat/cli`
> (the unscoped name `runchat` was already taken by an unrelated project).

---

## Install

```sh
# one-off, always latest (recommended for agents/CI)
npx @runchat/cli <command>

# or install globally
npm install -g @runchat/cli
runchat <command>
```

Requires Node.js ≥ 18 (uses the built-in `fetch`). Zero runtime dependencies.

## Authenticate

The CLI authenticates with a **Runchat API key** sent as a Bearer token.

1. Sign in at <https://runchat.com>
2. Account menu → **API keys** → create a key (shown once)
3. Give it to the CLI in any of these ways (highest precedence first):

```sh
runchat <tool> --api-key rc_xxx          # per-command flag
export RUNCHAT_API_KEY=rc_xxx            # env var — best for agents & CI
runchat login                            # stores it in your user config
```

Check it anytime:

```sh
runchat status        # shows server, key (masked) and verifies it works
```

OAuth 2.1 access tokens (from the MCP consent flow) also work — pass one as the
Bearer token via `--api-key`/`RUNCHAT_API_KEY`. See
<https://runchat.com/auth.md> for the full auth model.

## Quickstart

```sh
export RUNCHAT_API_KEY=rc_xxx

# discover
runchat tools                                   # all tools, grouped
runchat guide                                    # the agent getting-started guide
runchat create_node --help                       # one tool's parameters

# workspace
runchat list_runchats --query invoice --limit 5
runchat create_runchat --name "My flow" --tags '["demo"]'

# canvas tools take --runchat_id
ID=<runchat_id>
runchat get_canvas --runchat_id "$ID"
runchat create_node --runchat_id "$ID" --type promptNode --label "Summarize"
runchat run_nodes  --runchat_id "$ID"
```

## Discovering tools

The CLI is self-describing — you don't need to memorize anything:

| Command | What it shows |
| --- | --- |
| `runchat tools` | Every tool, grouped (workspace/discovery vs canvas), one line each |
| `runchat tools --json` | The raw tool definitions (name, description, JSON input schema) |
| `runchat <tool> --help` | A tool's full description and every parameter (type, required, choices) |
| `runchat guide` | The server's own getting-started instructions for agents |

Tool definitions are cached for an hour under your config dir; add `--refresh`
to force an update.

## Passing arguments

Arguments are plain `--flags`. Values are **smart-typed**:

```sh
--limit 5                 # number   → 5
--is_private true         # boolean  → true
--name "My flow"          # string   → "My flow"
--tags '["a","b"]'        # array    → ["a","b"]
--initial_data '{"code":["return 1"]}'   # object
```

Bare words stay strings (`--model gpt-4` → `"gpt-4"`), and id-like values are
preserved (`--x 007` → `"007"`). For full control, pass the whole argument
object at once:

```sh
runchat create_node --json '{"runchat_id":"abc","type":"promptNode"}'
# individual --flags override keys in --json
```

Read big values from a file or stdin (handy for code nodes):

```sh
runchat edit_file --runchat_id "$ID" --node_id n1 --new_text @app.js
cat app.js | runchat edit_file --runchat_id "$ID" --node_id n1 --new_text @-
```

Dashes and underscores in arg names are interchangeable
(`--runchat-id` == `--runchat_id`).

## Output & exit codes

Results print as pretty JSON. Use `--raw` for the server's exact text. Image
results (e.g. `view_image`, `take_screenshot`) include their URL in the result.

| Code | Meaning |
| --- | --- |
| `0` | success |
| `1` | tool ran but reported an error (or server error) |
| `2` | bad CLI usage (unknown arg, missing tool name) |
| `3` | authentication problem (no/invalid key) |
| `4` | network / transport failure |

## Configuration

| Variable | Purpose |
| --- | --- |
| `RUNCHAT_API_KEY` | API key (alias: `RUNCHAT_TOKEN`) |
| `RUNCHAT_BASE_URL` | Override the server (default `https://runchat.com`) |
| `RUNCHAT_CONFIG_DIR` | Override where config + tool cache live |

Config file location: `%APPDATA%\runchat\config.json` (Windows),
`$XDG_CONFIG_HOME/runchat/config.json` or `~/.config/runchat/config.json`
(macOS/Linux). It stores your API key (chmod `600` where supported) and an
optional base URL.

## How it works

The CLI drives the Runchat MCP server's Streamable-HTTP endpoint
(`POST {baseUrl}/api/mcp`) over JSON-RPC:

- `tools/list` powers `runchat tools` and `--help` — the tool surface is the
  server's, so new tools appear automatically with no CLI update.
- `tools/call` runs a tool in a single request (arguments are coerced locally;
  no extra round trip).
- `initialize` powers `runchat guide`.

This is why it's a true "mirror of the MCP" rather than a hand-maintained
wrapper.

## Development

```sh
git clone https://github.com/runchat-app/runchat-cli
cd runchat-cli
npm install
npm run build        # compile TypeScript → dist/
npm test             # build + run unit tests
node dist/cli.js --help

# point at a local Runchat instance
RUNCHAT_BASE_URL=http://localhost:3000 node dist/cli.js tools
```

## License

MIT © Runchat
