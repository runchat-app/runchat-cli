// Minimal MCP-over-HTTP (Streamable HTTP, stateless) client. Each call is one
// self-contained JSON-RPC POST to <baseUrl>/api/mcp — no session, no SSE.
//
// This is the whole "backend" of the CLI: every command is a thin wrapper over
// initialize / tools/list / tools/call. Because tools/list is fetched live,
// the CLI's tool surface always matches the server's — nothing is hardcoded.

import {
  MCP_PATH,
  MCP_PROTOCOL_VERSION,
  CLI_NAME,
  CLI_VERSION,
} from "./constants.js";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, JsonSchemaProp>;
    required?: string[];
  };
}

export interface JsonSchemaProp {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchemaProp;
  default?: unknown;
}

export interface ToolContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolCallResult {
  content: ToolContent[];
  isError?: boolean;
}

export interface InitializeResult {
  protocolVersion?: string;
  serverInfo?: { name?: string; title?: string; version?: string };
  instructions?: string;
  capabilities?: unknown;
}

/** A JSON-RPC error returned by the server (error object present in the body). */
export class McpRpcError extends Error {
  constructor(
    message: string,
    readonly code: number
  ) {
    super(message);
    this.name = "McpRpcError";
  }
}

/** An HTTP-level failure: auth (401/403), rate limit (429), 5xx, etc. */
export class McpHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "McpHttpError";
  }
}

/** A transport failure — could not reach the server at all. */
export class McpNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpNetworkError";
  }
}

export class McpClient {
  private id = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string | undefined
  ) {}

  get endpoint(): string {
    return `${this.baseUrl}${MCP_PATH}`;
  }

  private async rpc<T>(method: string, params?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++this.id,
          method,
          params,
        }),
      });
    } catch (err) {
      throw new McpNetworkError(
        `Could not reach ${this.endpoint}: ${(err as Error).message}`
      );
    }

    const bodyText = await res.text();
    let body: any;
    try {
      body = bodyText ? JSON.parse(bodyText) : undefined;
    } catch {
      body = undefined;
    }

    if (!res.ok) {
      const message =
        (body && (body.error?.message || body.error)) ||
        bodyText ||
        res.statusText;
      throw new McpHttpError(String(message), res.status);
    }

    if (body?.error) {
      throw new McpRpcError(
        body.error.message || "RPC error",
        body.error.code ?? -1
      );
    }

    return body?.result as T;
  }

  initialize(): Promise<InitializeResult> {
    return this.rpc<InitializeResult>("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: CLI_NAME, version: CLI_VERSION },
    });
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.rpc<{ tools: McpTool[] }>("tools/list");
    return result?.tools ?? [];
  }

  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    return this.rpc<ToolCallResult>("tools/call", { name, arguments: args });
  }
}
