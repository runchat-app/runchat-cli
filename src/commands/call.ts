// `runchat <tool> [--flags]` / `runchat call <tool> [--flags]` — the generic
// dispatcher. Builds an arguments object from flags and forwards it to the MCP
// server's tools/call. No per-tool code, so the CLI never drifts from the
// server's tool surface.

import { readFileSync } from "node:fs";
import { coerceValue } from "../args.js";
import { printToolResult } from "../format.js";
import { EXIT } from "../constants.js";
import type { McpClient } from "../mcp.js";

// Flags consumed by the CLI itself — never forwarded as tool arguments.
const RESERVED = new Set([
  "raw",
  "json",
  "base_url",
  "api_key",
  "token",
  "help",
  "h",
]);

/** Resolve a single raw flag string into its value, honouring @file / @- / @@. */
function resolveScalar(raw: string): unknown {
  if (raw === "@-") return readStdin();
  if (raw.startsWith("@@")) return coerceValue(raw.slice(1)); // literal leading @
  if (raw.startsWith("@")) return readFileSync(raw.slice(1), "utf8"); // string, uncoerced
  return coerceValue(raw);
}

let stdinCache: string | undefined;
function readStdin(): string {
  if (stdinCache === undefined) {
    try {
      stdinCache = readFileSync(0, "utf8"); // fd 0
    } catch {
      stdinCache = "";
    }
  }
  return stdinCache;
}

/** Build the tool-argument object from parsed flags. */
export function buildToolArgs(
  flags: Record<string, string | boolean | string[]>
): Record<string, unknown> {
  let args: Record<string, unknown> = {};

  // --json supplies the whole argument object; individual flags override keys.
  const jsonFlag = flags["json"];
  if (typeof jsonFlag === "string") {
    const text = jsonFlag === "@-" ? readStdin() : jsonFlag.startsWith("@") ? readFileSync(jsonFlag.slice(1), "utf8") : jsonFlag;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new UsageError(`--json is not valid JSON: ${(e as Error).message}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new UsageError("--json must be a JSON object");
    }
    args = { ...(parsed as Record<string, unknown>) };
  }

  for (const [key, value] of Object.entries(flags)) {
    if (RESERVED.has(key)) continue;
    if (value === true) {
      args[key] = true;
    } else if (Array.isArray(value)) {
      args[key] = value.map((v) => resolveScalar(v));
    } else {
      args[key] = resolveScalar(String(value));
    }
  }

  return args;
}

export class UsageError extends Error {}

export async function callCommand(
  client: McpClient,
  toolName: string,
  flags: Record<string, string | boolean | string[]>
): Promise<number> {
  const args = buildToolArgs(flags);
  const result = await client.callTool(toolName, args);
  const isError = printToolResult(result, { raw: flags["raw"] === true });
  return isError ? EXIT.TOOL_ERROR : EXIT.OK;
}
