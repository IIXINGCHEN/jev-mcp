#!/usr/bin/env node
/**
 * MCP smoke test: spawns src/server.js over stdio and exercises the full
 * JSON-RPC flow — initialize, tools/list, tools/call jev_ask (live API),
 * tools/call jev_models. Exits non-zero on any failure.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverPath = path.join(root, "src", "server.js");

const child = spawn(process.execPath, [serverPath], {
  env: process.env,
  stdio: ["pipe", "pipe", "inherit"],
});

let buf = "";
let nextId = 1;
const pending = new Map();

child.stdout.on("data", (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`RPC ${msg.id}: ${JSON.stringify(msg.error)}`));
      else resolve(msg.result);
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`RPC timeout: ${method}`)); }
    }, 60000);
  });
}

const notify = (method, params) =>
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

try {
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.1.0" },
  });
  check("initialize", init && init.serverInfo && init.serverInfo.name === "jev-mcp");
  notify("notifications/initialized", {});

  const tools = await rpc("tools/list", {});
  const names = (tools.tools || []).map((t) => t.name).sort();
  check("tools/list", names.includes("jev_ask") && names.includes("jev_models"), names.join(","));

  const askRes = await rpc("tools/call", {
    name: "jev_ask",
    arguments: {
      state: "Help! My payouts have been failing for 3 days.",
      questions: {
        is_urgent: { type: "noul", instructions: "Does this convey urgency?" },
        department: {
          type: "choice",
          instructions: "Which team should handle this?",
          criteria: { billing: "Payments, invoicing, refunds", technical: "Bugs, outages, integrations" },
        },
      },
    },
  });
  check("jev_ask no error", !askRes.isError, askRes.isError ? askRes.content[0].text.slice(0, 200) : "");
  const body = JSON.parse(askRes.content[0].text);
  check("jev_ask model", body.model === "jev-1.13.0", body.model);
  check("jev_ask noul", body.answers.is_urgent.noul > 0.8, String(body.answers.is_urgent.noul));
  check("jev_ask choice", body.answers.department.choice === "billing", body.answers.department.choice);

  // validation: bad question type must be rejected by the schema
  const badRes = await rpc("tools/call", {
    name: "jev_ask",
    arguments: { state: "x", questions: { q: { type: "bogus", instructions: "?" } } },
  });
  check("jev_ask rejects bad type", badRes.isError === true);

  const modelsRes = await rpc("tools/call", { name: "jev_models", arguments: {} });
  check("jev_models no error", !modelsRes.isError);
  const modelsText = modelsRes.content[0].text;
  check("jev_models lists jev-latest", modelsText.includes("jev-latest"));
} catch (e) {
  console.log(`FAIL exception: ${e.message}`);
  failures++;
} finally {
  child.kill();
}

console.log(failures === 0 ? "ALL SMOKE TESTS PASSED" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
