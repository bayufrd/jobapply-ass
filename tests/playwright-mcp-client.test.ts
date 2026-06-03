import test from "node:test";
import assert from "node:assert/strict";
import { PlaywrightMcpClient } from "../lib/mcp/playwright-mcp-client.ts";

test("falls back to default MCP URL when constructor input is empty or whitespace", () => {
  const emptyClient = new PlaywrightMcpClient("");
  assert.equal(emptyClient.getMcpUrl(), "http://localhost:8931/mcp");

  const whitespaceClient = new PlaywrightMcpClient("   ");
  assert.equal(whitespaceClient.getMcpUrl(), "http://localhost:8931/mcp");
});

test("trims MCP URL when constructor input contains surrounding whitespace", () => {
  const client = new PlaywrightMcpClient("  http://localhost:8931/mcp  ");
  assert.equal(client.getMcpUrl(), "http://localhost:8931/mcp");
});
