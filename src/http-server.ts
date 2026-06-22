#!/usr/bin/env node
import { timingSafeEqual } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createCapitalGainsMcpServer } from "./mcp-server.js";

interface HttpAppOptions {
  authMode: "bearer" | "none";
  apiKey?: string;
  host?: string;
  allowedHosts?: string[];
}

function secureTokenEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function parseBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
}

export function createCapitalGainsHttpApp(options: HttpAppOptions) {
  if (options.authMode === "bearer" && !options.apiKey) {
    throw new Error("MCP_API_KEY is required when MCP_AUTH_MODE is bearer.");
  }
  if (
    options.authMode === "bearer" &&
    options.apiKey &&
    options.apiKey.length < 32
  ) {
    throw new Error("MCP_API_KEY must contain at least 32 characters.");
  }

  const host = options.host ?? "0.0.0.0";
  const app = createMcpExpressApp({
    host,
    ...(options.allowedHosts && options.allowedHosts.length > 0
      ? { allowedHosts: options.allowedHosts }
      : {})
  });

  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    res.set("Cache-Control", "no-store").status(200).json({
      status: "ok",
      service: "kr-capital-gains-tax",
      version: "0.1.0"
    });
  });

  app.use("/mcp", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (options.authMode === "none") {
      next();
      return;
    }

    const token = parseBearerToken(req.get("authorization"));
    if (!token || !secureTokenEquals(token, options.apiKey!)) {
      res.set("WWW-Authenticate", "Bearer").status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null
      });
      return;
    }
    next();
  });

  app.post("/mcp", async (req, res) => {
    const server = createCapitalGainsMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    let cleanedUp = false;
    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      await Promise.allSettled([transport.close(), server.close()]);
    };

    res.once("close", () => void cleanup());

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP HTTP request failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null
        });
      }
      await cleanup();
    }
  });

  app.get("/mcp", (_req, res) => {
    res.set("Allow", "POST").status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null
    });
  });

  app.delete("/mcp", (_req, res) => {
    res.set("Allow", "POST").status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null
    });
  });

  return app;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function parseAuthMode(value: string | undefined): "bearer" | "none" {
  const authMode = value ?? "bearer";
  if (authMode !== "bearer" && authMode !== "none") {
    throw new Error("MCP_AUTH_MODE must be either bearer or none.");
  }
  return authMode;
}

async function main(): Promise<void> {
  const authMode =
    process.env.MCP_PUBLIC_MODE === "true"
      ? "none"
      : parseAuthMode(process.env.MCP_AUTH_MODE);
  const apiKey = process.env.MCP_API_KEY;

  const host = process.env.HOST ?? "0.0.0.0";
  const port = parsePort(process.env.PORT);
  const allowedHosts = process.env.ALLOWED_HOSTS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const app = createCapitalGainsHttpApp({
    authMode,
    ...(apiKey ? { apiKey } : {}),
    host,
    allowedHosts
  });
  const httpServer = app.listen(port, host, () => {
    console.error(
      `kr-capital-gains-tax MCP HTTP server listening on ${host}:${port} (auth=${authMode})`
    );
  });

  httpServer.on("error", (error) => {
    console.error("MCP HTTP server error:", error);
    process.exitCode = 1;
  });

  const shutdown = (signal: string) => {
    console.error(`Received ${signal}; shutting down.`);
    httpServer.close((error) => {
      if (error) {
        console.error("MCP HTTP server shutdown failed:", error);
        process.exit(1);
      }
      process.exit(0);
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("MCP HTTP server fatal error:", error);
  process.exit(1);
});
