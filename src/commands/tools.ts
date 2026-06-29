// `runchat tools` — list every tool the server exposes, grouped, with a
// one-line description each. Mirrors how the MCP server advertises its tools.

import { CLI_NAME } from "../constants.js";
import { c } from "../format.js";
import { getTools, groupTools } from "../catalog.js";
import type { McpClient, McpTool } from "../mcp.js";

function firstLine(desc?: string): string {
  if (!desc) return "";
  const line = desc.replace(/\s+/g, " ").trim();
  return line.length > 96 ? line.slice(0, 95) + "…" : line;
}

function pad(name: string, width: number): string {
  return name + " ".repeat(Math.max(0, width - name.length));
}

function printGroup(title: string, tools: McpTool[], width: number): void {
  if (tools.length === 0) return;
  process.stdout.write(`\n${c.bold(title)}\n`);
  for (const t of [...tools].sort((a, b) => a.name.localeCompare(b.name))) {
    process.stdout.write(`  ${c.cyan(pad(t.name, width))}  ${c.dim(firstLine(t.description))}\n`);
  }
}

export async function toolsCommand(
  client: McpClient,
  baseUrl: string,
  flags: Record<string, unknown>
): Promise<number> {
  const { tools, fromCache } = await getTools(client, baseUrl, {
    refresh: flags["refresh"] === true,
  });

  if (flags["json"] === true) {
    process.stdout.write(JSON.stringify(tools, null, 2) + "\n");
    return 0;
  }

  const { workspace, canvas } = groupTools(tools);
  const width = Math.min(
    24,
    tools.reduce((m, t) => Math.max(m, t.name.length), 0)
  );

  process.stdout.write(`${tools.length} tools available`);
  if (fromCache) process.stdout.write(c.dim("  (cached — use --refresh to update)"));
  process.stdout.write("\n");

  printGroup("Workspace & discovery", workspace, width);
  printGroup("Canvas  (pass --runchat_id)", canvas, width);

  process.stdout.write(
    `\n${c.dim(`Run \`${CLI_NAME} <tool> --help\` for a tool's parameters.`)}\n`
  );
  return 0;
}
