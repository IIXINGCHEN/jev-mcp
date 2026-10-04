# jev-mcp

MCP server + CLI that exposes [TypeSafe](https://typesafe.ai) **Jev**
(a System One model) to AI agents. Agents call `jev_ask` with a state and
typed questions; they get back structured judgments — no text generation,
no parsing.

This is a thin bridge: it validates the request shape, forwards it to
`POST https://api.typesafe.ai/v1/systemone`, and returns the answers.
Question design stays with the caller (see the
[TypeSafe docs](https://docs.typesafe.ai/introduction)).

## Tools

### `jev_ask`

Answer typed questions about a state. All questions run in parallel against
the same state; answers come back under your question ids.

| Param | Type | Notes |
|---|---|---|
| `state` | string \| object \| array | **required.** Text or structured data (chat logs, records, app state). Capped at ~120k chars. |
| `questions` | object | **required.** `{id: question}`; 1–50 questions. Ids label answers; they are **not** sent to the model — put full meaning in `instructions`. |
| `model` | string | default `jev-latest` |

Question types:

- `noul` — yes/no. Returns `noul` 0–1 (probability of yes). Optional
  `criteria: {true, false}` to define the outcomes.
- `choice` — pick one of 1–255 named options. Returns `choice`,
  `probabilities` (sums to 1), `confidence`.
- `score` — position on your 2–10 level rubric. Returns `score` (can land
  between levels), `legend`, `probabilities`, `confidence`.

Example:

```json
{
  "state": "Help! My payouts have been failing for 3 days.",
  "questions": {
    "is_urgent": { "type": "noul", "instructions": "Does this convey urgency?" },
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this?",
      "criteria": { "billing": "Payments, invoicing, refunds", "technical": "Bugs, outages, integrations" }
    }
  }
}
```

### `jev_models`

Lists the model names/aliases this API key can use. No parameters.

## Install

```bash
npm install -g jev-mcp
# or run from source: node src/server.js
```

Node.js 20+ required.

## Auth

Set `TYPESAFE_API_KEY` in the environment (create one at
[console.typesafe.ai](https://console.typesafe.ai)). `CHECK_AI_CLI_TYPESAFE_API_KEY`
is accepted as a fallback. The server refuses to start without a key and never
logs it.

## Connect your agent

**Claude Code** (`claude mcp add`, or `.mcp.json`):

```bash
claude mcp add jev-mcp --env TYPESAFE_API_KEY=$TYPESAFE_API_KEY -- node /path/to/jev-mcp/src/server.js
```

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.jev-mcp]
command = "node"
args = ["/path/to/jev-mcp/src/server.js"]
env = { "TYPESAFE_API_KEY" = "..." }
```

**Gemini CLI** (`~/.gemini/settings.json`):

```json
{
  "mcpServers": {
    "jev-mcp": {
      "command": "node",
      "args": ["/path/to/jev-mcp/src/server.js"],
      "env": { "TYPESAFE_API_KEY": "..." }
    }
  }
}
```

Any MCP-compatible client works the same way: stdio transport, `node
/path/to/jev-mcp/src/server.js`, key in the environment.

## CLI

```bash
export TYPESAFE_API_KEY=...
jev-ask request.json
cat request.json | jev-ask
jev-ask --model jev-1.13.0 request.json
```

Request shape: `{"state": ..., "model": "jev-latest", "questions": {...}}`.
Response JSON goes to stdout.

## Test

```bash
export TYPESAFE_API_KEY=...
npm test   # MCP stdio smoke test incl. live jev_ask + jev_models calls
```

## Notes

- Billing is per input token only ($0.042/Mtok); output tokens are free.
  State is capped client-side to bound cost.
- Jev is strongest in English; validate on your own data for other languages,
  and use `confidence` to decide when to act vs. escalate.
- Ask one atomic judgment per question; decompose broad judgments and combine
  answers in code.
