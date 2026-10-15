#!/usr/bin/env node

import process from "node:process";
import readline from "node:readline";
import { TOOL_DEFINITIONS, callTool } from "./tools.mjs";

const modernProtocolVersion = "2026-07-28";
const supportedVersions = [modernProtocolVersion, "2025-11-25", "2025-06-18", "2024-11-05"];
const serverInfo = { name: "token-speed", version: "0.1.0" };

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function success(id, result, modern = false) {
  const withIdentity = modern
    ? { ...result, _meta: { ...(result._meta ?? {}), "io.modelcontextprotocol/serverInfo": serverInfo } }
    : result;
  send({ jsonrpc: "2.0", id, result: withIdentity });
}

function failure(id, code, message, data) {
  send({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
}

function typeMatches(type, value) {
  if (type === "integer") return Number.isInteger(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

function validateInput(schema, value, path = "arguments") {
  const errors = [];
  if (schema.type && !typeMatches(schema.type, value)) return [`${path} must be ${schema.type}`];
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required ?? []) if (!(required in value)) errors.push(`${path}.${required} is required`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in (schema.properties ?? {}))) errors.push(`${path}.${key} is not allowed`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...validateInput(child, value[key], `${path}.${key}`));
    }
  }
  return errors;
}

async function handle(message) {
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    if (message.id !== undefined) failure(message.id, -32600, "Invalid Request");
    return;
  }
  const requestedVersion = message.params?._meta?.["io.modelcontextprotocol/protocolVersion"];
  if (requestedVersion && !supportedVersions.includes(requestedVersion)) {
    return failure(message.id, -32022, "Unsupported protocol version", { supported: supportedVersions, requested: requestedVersion });
  }
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return;
  if (message.method === "server/discover") {
    return success(message.id, {
      resultType: "complete",
      supportedVersions,
      capabilities: { tools: { listChanged: false } },
      _meta: { "io.modelcontextprotocol/serverInfo": serverInfo },
      instructions: "Read-only token speed (tok/s) and usage stats from local ZCode session rollout records.",
      ttlMs: 300000,
      cacheScope: "private",
    }, true);
  }
  if (message.method === "initialize") {
    const requested = message.params?.protocolVersion;
    const negotiated = supportedVersions.includes(requested) && requested !== modernProtocolVersion ? requested : "2025-11-25";
    return success(message.id, {
      protocolVersion: negotiated,
      capabilities: { tools: { listChanged: false } },
      serverInfo,
      instructions: "Read-only token speed (tok/s) and usage stats from local ZCode session rollout records.",
    });
  }
  if (message.method === "ping") return success(message.id, {}, Boolean(requestedVersion));
  if (message.method === "tools/list") return success(message.id, { resultType: "complete", tools: TOOL_DEFINITIONS, ttlMs: 300000, cacheScope: "private" }, Boolean(requestedVersion));
  if (message.method === "tools/call") {
    const definition = TOOL_DEFINITIONS.find((tool) => tool.name === message.params?.name);
    if (!definition) return failure(message.id, -32602, `Unknown tool: ${message.params?.name ?? "<missing>"}`);
    const inputErrors = validateInput(definition.inputSchema, message.params?.arguments ?? {});
    if (inputErrors.length) return failure(message.id, -32602, `Invalid tool input: ${inputErrors.join("; ")}`);
    try {
      const value = await callTool(message.params?.name, message.params?.arguments ?? {});
      return success(message.id, {
        resultType: "complete",
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
        structuredContent: value,
      }, Boolean(requestedVersion));
    } catch (error) {
      return success(message.id, {
        resultType: "complete",
        content: [{ type: "text", text: error.message }],
        isError: true,
      }, Boolean(requestedVersion));
    }
  }
  if (message.id !== undefined) failure(message.id, -32601, `Method not found: ${message.method}`);
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (!line.trim()) continue;
  try {
    await handle(JSON.parse(line));
  } catch (error) {
    process.stderr.write(`[token-speed-mcp] ${error.stack || error.message}\n`);
    failure(null, -32603, "Internal error");
  }
}
