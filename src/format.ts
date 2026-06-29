// Terminal output helpers: optional colour (auto-disabled when piped or when
// NO_COLOR is set), and rendering of MCP tool results.

import type { ToolCallResult, JsonSchemaProp } from "./mcp.js";

const useColor =
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb" &&
  process.stdout.isTTY === true;

function wrap(code: number, s: string): string {
  return useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const c = {
  bold: (s: string) => wrap(1, s),
  dim: (s: string) => wrap(2, s),
  red: (s: string) => wrap(31, s),
  green: (s: string) => wrap(32, s),
  yellow: (s: string) => wrap(33, s),
  cyan: (s: string) => wrap(36, s),
};

export function err(msg: string): void {
  process.stderr.write(`${c.red("error")}: ${msg}\n`);
}

export function info(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

/** Render a JSON-schema "type" (which may be a union array) as a short label. */
export function typeLabel(prop: JsonSchemaProp): string {
  const t = prop.type;
  let base = Array.isArray(t) ? t.join("|") : (t ?? "any");
  if (base === "array" && prop.items?.type) {
    const it = prop.items.type;
    base = `array<${Array.isArray(it) ? it.join("|") : it}>`;
  }
  return base;
}

/**
 * Print a tool-call result. The server packs results as MCP content blocks;
 * object results arrive as a JSON string in a text block, so we pretty-print
 * them by default. `raw` emits the exact text the server returned.
 *
 * Returns the process exit-relevant flag: true when the tool reported isError.
 */
export function printToolResult(
  result: ToolCallResult,
  opts: { raw?: boolean } = {}
): boolean {
  const texts = (result.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string);
  const images = (result.content ?? []).filter((b) => b.type === "image");

  const out = result.isError ? process.stderr : process.stdout;
  const body = texts.join("\n");

  if (opts.raw) {
    out.write(body + (body.endsWith("\n") ? "" : "\n"));
  } else {
    out.write(prettyMaybeJson(body) + "\n");
  }

  if (images.length > 0 && !opts.raw) {
    info(
      c.dim(
        `[${images.length} image block${images.length > 1 ? "s" : ""} omitted — see image URL in the result above]`
      )
    );
  }

  return result.isError === true;
}

/** Pretty-print a string if it is valid JSON; otherwise return it unchanged. */
export function prettyMaybeJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return text;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}
