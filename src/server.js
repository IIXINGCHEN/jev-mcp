#!/usr/bin/env node
/**
 * jev-mcp — MCP server exposing TypeSafe's Jev (System One) to AI agents.
 *
 * Tools:
 *   jev_ask    — answer typed questions (choice/score/noul) about a state
 *   jev_models — list models available to this API key
 *
 * Auth: TYPESAFE_API_KEY environment variable (falls back to
 * CHECK_AI_CLI_TYPESAFE_API_KEY). Never printed or logged.
 *
 * Protocol: stdio. All logging goes to stderr; stdout is MCP only.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TypeSafeClient } from "@typesafe-ai/sdk";

const DEFAULT_MODEL = "jev-latest";
const MAX_QUESTIONS = 50;
const MAX_STATE_CHARS = 120_000; // ~32k token state budget, with headroom for questions

function apiKeyPresent() {
  const k = process.env.TYPESAFE_API_KEY || process.env.CHECK_AI_CLI_TYPESAFE_API_KEY;
  return typeof k === "string" && k.trim().length > 0;
}

function makeClient() {
  const key = process.env.TYPESAFE_API_KEY || process.env.CHECK_AI_CLI_TYPESAFE_API_KEY;
  return new TypeSafeClient({ apiKey: key });
}

// --- input schemas -------------------------------------------------------

const entrySchema = z.union([
  z.string(),
  z.record(z.string(), z.any()),
  z.array(z.any()),
  z.null(),
]);

const noulSchema = z.object({
  type: z.literal("noul"),
  instructions: entrySchema.refine((v) => v !== null && v !== undefined, {
    message: "instructions is required",
  }),
  criteria: z
    .object({ true: entrySchema.optional(), false: entrySchema.optional() })
    .nullable()
    .optional(),
});

const choiceSchema = z.object({
  type: z.literal("choice"),
  instructions: entrySchema.refine((v) => v !== null && v !== undefined, {
    message: "instructions is required",
  }),
  criteria: z.record(z.string(), entrySchema).refine(
    (c) => Object.keys(c).length >= 1 && Object.keys(c).length <= 255,
    { message: "choice criteria needs 1-255 options" }
  ),
});

const scoreSchema = z.object({
  type: z.literal("score"),
  instructions: entrySchema.refine((v) => v !== null && v !== undefined, {
    message: "instructions is required",
  }),
  criteria: z.array(entrySchema).refine((c) => c.length >= 2 && c.length <= 10, {
    message: "score criteria needs 2-10 levels",
  }),
});

const questionSchema = z.discriminatedUnion("type", [noulSchema, choiceSchema, scoreSchema]);

// --- server ---------------------------------------------------------------

const server = new McpServer(
  { name: "jev-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

function errResult(message) {
  return { content: [{ type: "text", text: `error: ${message}` }], isError: true };
}

function okResult(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }] };
}

function scrubbedError(e) {
  // SDK errors never carry the key, but scrub defensively anyway.
  const msg = e && e.message ? String(e.message) : String(e);
  return msg.replace(/(Bearer\s+)[^\s"']+/gi, "$1***");
}

server.tool(
  "jev_ask",
  "Ask Jev (TypeSafe System One) typed questions about a state. " +
    "Each question is one atomic judgment: 'noul' = yes/no probability 0-1, " +
    "'choice' = pick one named option (returns choice + probabilities + confidence), " +
    "'score' = position on your ordered rubric (returns score + legend + probabilities + confidence). " +
    "Questions run in parallel against the same state; answers come back under your question ids. " +
    "Put the full meaning in 'instructions' (question ids are NOT sent to the model). " +
    "Decompose broad judgments into atomic questions and combine answers in code.",
  {
    state: z
      .union([z.string(), z.record(z.string(), z.any()), z.array(z.any())])
      .describe("The content to evaluate: text, or a JSON object/array (chat logs, records, app state)."),
    questions: z
      .record(z.string(), questionSchema)
      .refine((q) => Object.keys(q).length >= 1 && Object.keys(q).length <= MAX_QUESTIONS, {
        message: `questions needs 1-${MAX_QUESTIONS} entries`,
      })
      .describe("Map of question id -> typed question. Ids label the answers; they are not sent to the model."),
    model: z.string().optional().default(DEFAULT_MODEL).describe("Model name or alias; default jev-latest."),
  },
  async ({ state, questions, model }) => {
    if (!apiKeyPresent()) return errResult("TYPESAFE_API_KEY is not set.");
    const stateChars = JSON.stringify(state).length;
    if (stateChars > MAX_STATE_CHARS) {
      return errResult(`state is ${stateChars} chars, over the ${MAX_STATE_CHARS} cap; trim it and retry.`);
    }
    try {
      const client = makeClient();
      const result = await client.systemOne({ state, model, questions });
      return okResult(result);
    } catch (e) {
      return errResult(scrubbedError(e));
    }
  }
);

server.tool(
  "jev_models",
  "List the TypeSafe model names/aliases this API key can use in jev_ask's model field.",
  {},
  async () => {
    if (!apiKeyPresent()) return errResult("TYPESAFE_API_KEY is not set.");
    try {
      const client = makeClient();
      const listed = await client.models.list();
      return okResult(listed);
    } catch (e) {
      return errResult(scrubbedError(e));
    }
  }
);

async function main() {
  if (!apiKeyPresent()) {
    console.error("jev-mcp: TYPESAFE_API_KEY is not set; refusing to start.");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("jev-mcp: serving on stdio");
}

main().catch((e) => {
  console.error(`jev-mcp: fatal: ${scrubbedError(e)}`);
  process.exit(1);
});
