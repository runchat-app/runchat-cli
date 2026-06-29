// `runchat guide` — print the server's own getting-started instructions (the
// MCP `initialize` response's `instructions` field). This is the same guidance
// the MCP server hands every agent, so it always matches the live tool set.

import { EXIT } from "../constants.js";
import { err } from "../format.js";
import type { McpClient } from "../mcp.js";

export async function guideCommand(client: McpClient): Promise<number> {
  const result = await client.initialize();
  const text = result?.instructions?.trim();
  if (!text) {
    err("The server returned no instructions.");
    return EXIT.TOOL_ERROR;
  }
  process.stdout.write(text + "\n");
  return EXIT.OK;
}
