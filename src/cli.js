#!/usr/bin/env node
/**
 * jev-ask — CLI for TypeSafe's Jev. Reads a System One request as JSON from
 * a file (or stdin) and prints the response JSON to stdout.
 *
 *   jev-ask request.json
 *   cat request.json | jev-ask
 *   jev-ask --model jev-1.13.0 request.json
 *
 * Request shape: {"state": ..., "model": "jev-latest", "questions": {...}}
 * Auth: TYPESAFE_API_KEY environment variable.
 */
import { readFileSync } from "node:fs";
import { TypeSafeClient } from "@typesafe-ai/sdk";

function usage() {
  console.error("usage: jev-ask [--model <name>] [request.json]  (or pipe JSON via stdin)");
  process.exit(2);
}

async function readInput(file) {
  if (file) return readFileSync(file, "utf8");
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const args = process.argv.slice(2);
  let model = null;
  let file = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) model = args[++i];
    else if (args[i] === "-h" || args[i] === "--help") usage();
    else if (!args[i].startsWith("-") && !file) file = args[i];
    else usage();
  }
  const key = process.env.TYPESAFE_API_KEY || process.env.CHECK_AI_CLI_TYPESAFE_API_KEY;
  if (!key || !key.trim()) {
    console.error("jev-ask: TYPESAFE_API_KEY is not set.");
    process.exit(1);
  }
  let req;
  try {
    req = JSON.parse(await readInput(file));
  } catch (e) {
    console.error(`jev-ask: invalid request JSON: ${e.message}`);
    process.exit(2);
  }
  if (model) req.model = model;
  try {
    const client = new TypeSafeClient({ apiKey: key });
    const result = await client.systemOne(req);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (e) {
    const msg = String((e && e.message) || e).replace(/(Bearer\s+)[^\s"']+/gi, "$1***");
    console.error(`jev-ask: ${msg}`);
    process.exit(1);
  }
}

main();
