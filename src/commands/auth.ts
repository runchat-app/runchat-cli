// `runchat login` / `logout` / `status` — manage the stored API key.
//
// We deliberately do NOT implement the OAuth 2.1 browser flow here: API keys
// are Runchat's documented server-to-server credential (auth.md) and map
// cleanly onto a headless CLI. OAuth tokens still work if supplied as a Bearer
// token via --api-key / RUNCHAT_API_KEY.

import { createInterface } from "node:readline";
import { CLI_NAME, DEFAULT_BASE_URL, EXIT } from "../constants.js";
import { c, err, info } from "../format.js";
import {
  writeConfig,
  clearStoredKey,
  resolveToken,
  resolveBaseUrl,
  maskKey,
  configFile,
} from "../config.js";
import { McpClient, McpHttpError } from "../mcp.js";

/** Verify a token works by listing tools (cheap, spends no credits). */
async function verify(baseUrl: string, token: string): Promise<number> {
  const tools = await new McpClient(baseUrl, token).listTools();
  return tools.length;
}

export async function loginCommand(
  flags: Record<string, unknown>
): Promise<number> {
  const baseUrl = resolveBaseUrl(flags);

  let key: string | undefined;
  const flagKey = flags["api_key"] ?? flags["token"];
  if (typeof flagKey === "string" && flagKey) {
    key = flagKey.trim();
  } else if (!process.stdin.isTTY) {
    // Piped: read the key from stdin (e.g. `echo $KEY | runchat login`).
    key = (await readAll()).trim();
  } else {
    key = (await prompt(`Paste your Runchat API key (from ${baseUrl} → API keys): `)).trim();
  }

  if (!key) {
    err("No API key provided.");
    return EXIT.USAGE;
  }

  try {
    const count = await verify(baseUrl, key);
    const file = writeConfig({ apiKey: key, ...(baseUrl !== DEFAULT_BASE_URL ? { baseUrl } : {}) });
    info(`${c.green("✓")} Key verified (${count} tools available) and saved to ${c.dim(file)}`);
    info(c.dim(`  Stored key: ${maskKey(key)}`));
    return EXIT.OK;
  } catch (e) {
    if (e instanceof McpHttpError && (e.status === 401 || e.status === 403)) {
      err(`Key rejected by ${baseUrl} (${e.status}). Not saved.`);
      return EXIT.AUTH;
    }
    err(`Could not verify key: ${(e as Error).message}`);
    return EXIT.NETWORK;
  }
}

export function logoutCommand(): number {
  const removed = clearStoredKey();
  if (removed) info(`${c.green("✓")} Removed saved API key from ${c.dim(configFile())}`);
  else info("No saved API key to remove.");
  return EXIT.OK;
}

export async function statusCommand(
  flags: Record<string, unknown>
): Promise<number> {
  const baseUrl = resolveBaseUrl(flags);
  const { token, source } = resolveToken(flags);

  info(`${c.bold("Server")}    ${baseUrl}`);
  if (!token) {
    info(`${c.bold("API key")}   ${c.yellow("not configured")}`);
    info("");
    info(
      `Set one with \`${CLI_NAME} login\`, the RUNCHAT_API_KEY env var, or --api-key.`
    );
    info(c.dim(`Get a key at ${baseUrl} → account menu → API keys.`));
    return EXIT.AUTH;
  }

  const srcLabel =
    source === "flag" ? "--api-key flag" : source === "env" ? "RUNCHAT_API_KEY env" : "config file";
  info(`${c.bold("API key")}   ${maskKey(token)} ${c.dim(`(from ${srcLabel})`)}`);

  try {
    const count = await verify(baseUrl, token);
    info(`${c.bold("Auth")}      ${c.green("ok")} ${c.dim(`(${count} tools available)`)}`);
    return EXIT.OK;
  } catch (e) {
    if (e instanceof McpHttpError && (e.status === 401 || e.status === 403)) {
      info(`${c.bold("Auth")}      ${c.red("rejected")} ${c.dim(`(${e.status})`)}`);
      return EXIT.AUTH;
    }
    info(`${c.bold("Auth")}      ${c.yellow("unknown")} ${c.dim(`(${(e as Error).message})`)}`);
    return EXIT.NETWORK;
  }
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  // Best-effort masking: blank out keystrokes echoed to the terminal.
  const anyRl = rl as unknown as { _writeToOutput: (s: string) => void };
  let masking = false;
  anyRl._writeToOutput = (s: string) => {
    if (masking && s !== "\r\n" && s !== "\n") process.stderr.write("*");
    else process.stderr.write(s);
  };
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      masking = false;
      process.stderr.write("\n");
      rl.close();
      resolve(answer);
    });
    masking = true;
  });
}

function readAll(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}
