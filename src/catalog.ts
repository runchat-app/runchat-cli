// Fetches and caches the live tool list from the MCP server's tools/list.
//
// The catalog is the server's, not ours — caching only avoids a round trip on
// repeated `runchat tools` / `--help` calls. A tool call itself never needs the
// catalog (args are coerced generically), so it stays a single request.

import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { configDir } from "./config.js";
import type { McpClient, McpTool } from "./mcp.js";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheFile {
  // Keyed by base URL so a dev server and prod don't share a catalog.
  [baseUrl: string]: { fetchedAt: number; tools: McpTool[] };
}

function cachePath(): string {
  return join(configDir(), "tools-cache.json");
}

function readCache(): CacheFile {
  try {
    return JSON.parse(readFileSync(cachePath(), "utf8")) as CacheFile;
  } catch {
    return {};
  }
}

function writeCache(cache: CacheFile): void {
  try {
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(cachePath(), JSON.stringify(cache), "utf8");
  } catch {
    /* cache is best-effort */
  }
}

/**
 * Get the tool list, preferring a fresh cache. `refresh` forces a network
 * fetch. On a network/auth failure with a usable (even stale) cache, the cache
 * is returned so `--help` keeps working offline.
 */
export async function getTools(
  client: McpClient,
  baseUrl: string,
  opts: { refresh?: boolean } = {}
): Promise<{ tools: McpTool[]; fromCache: boolean }> {
  const cache = readCache();
  const entry = cache[baseUrl];
  const fresh = entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;

  if (!opts.refresh && fresh) {
    return { tools: entry.tools, fromCache: true };
  }

  try {
    const tools = await client.listTools();
    cache[baseUrl] = { fetchedAt: Date.now(), tools };
    writeCache(cache);
    return { tools, fromCache: false };
  } catch (e) {
    if (entry) return { tools: entry.tools, fromCache: true };
    throw e;
  }
}

export function findTool(tools: McpTool[], name: string): McpTool | undefined {
  return tools.find((t) => t.name === name);
}

/** True when a tool is scoped to a specific canvas (requires runchat_id). */
export function isCanvasTool(tool: McpTool): boolean {
  return (tool.inputSchema?.required ?? []).includes("runchat_id");
}

export interface ToolGroups {
  workspace: McpTool[];
  canvas: McpTool[];
}

/** Split tools into workspace/discovery vs canvas-scoped, derived from schema. */
export function groupTools(tools: McpTool[]): ToolGroups {
  const workspace: McpTool[] = [];
  const canvas: McpTool[] = [];
  for (const t of tools) {
    (isCanvasTool(t) ? canvas : workspace).push(t);
  }
  return { workspace, canvas };
}
