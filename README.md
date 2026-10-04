# jev-mcp

[中文](#中文) | [English](#english)

---

## 中文

MCP server + CLI，把 [TypeSafe](https://typesafe.ai) 的 **Jev**（System One
模型）开放给 AI agent 调用。Agent 调用 `jev_ask`，传入 state 和类型化问题，
拿回结构化判断——无文本生成、无需解析。

这是一个薄桥接：只做请求校验，转发到
`POST https://api.typesafe.ai/v1/systemone`，再把答案原样返回。
问题的设计由调用方负责（见 [TypeSafe 文档](https://docs.typesafe.ai/introduction)）。

### 工具

#### `jev_ask`

针对一段 state 回答类型化问题。所有问题并行、基于同一 state 求值，
答案按你起的 question id 返回。

| 参数 | 类型 | 说明 |
|---|---|---|
| `state` | string \| object \| array | **必填。** 待评估内容：文本或结构化数据（聊天记录、工单、应用状态）。上限约 12 万字符。 |
| `questions` | object | **必填。** `{id: question}`，1–50 个问题。id 只用于标识答案，**不会**送进模型——把完整含义写进 `instructions`。 |
| `model` | string | 默认 `jev-latest`。 |

问题类型：

- `noul` —— 是否判断。返回 `noul`（0–1，yes 的概率）。可用
  `criteria: {true, false}` 定义两种结果的含义。
- `choice` —— 从 1–255 个命名选项中单选。返回 `choice`、
  `probabilities`（和为 1）、`confidence`。
- `score` —— 在你定义的 2–10 级量表上打分。返回 `score`（可落在两级
  之间）、`legend`、`probabilities`、`confidence`。

示例：

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

#### `jev_models`

列出当前 API key 可用的模型名/别名，供 `jev_ask` 的 `model` 参数使用。无参数。

### 安装

```bash
npm install -g @iixingchen/jev-mcp
# 或从源码运行：node src/server.js
```

需要 Node.js 20+。

### 授权

环境变量 `TYPESAFE_API_KEY`（到 [console.typesafe.ai](https://console.typesafe.ai)
创建）。也接受 `CHECK_AI_CLI_TYPESAFE_API_KEY` 作为回退。无 key 时 server
拒绝启动，且 key 永不写入日志。

### 接入你的 agent

**Claude Code**（`claude mcp add`，或 `.mcp.json`）：

```bash
claude mcp add jev-mcp --env TYPESAFE_API_KEY=$TYPESAFE_API_KEY -- node /path/to/jev-mcp/src/server.js
```

**Codex**（`~/.codex/config.toml`）：

```toml
[mcp_servers.jev-mcp]
command = "node"
args = ["/path/to/jev-mcp/src/server.js"]
env = { "TYPESAFE_API_KEY" = "..." }
```

**Gemini CLI**（`~/.gemini/settings.json`）：

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

任何兼容 MCP 的客户端都一样：stdio 传输，`node /path/to/jev-mcp/src/server.js`，
key 放环境变量。

### CLI

```bash
export TYPESAFE_API_KEY=...
jev-ask request.json
cat request.json | jev-ask
jev-ask --model jev-1.13.0 request.json
```

请求格式：`{"state": ..., "model": "jev-latest", "questions": {...}}`，
答案 JSON 输出到 stdout。

### 测试

```bash
export TYPESAFE_API_KEY=...
npm test   # MCP stdio 冒烟测试，含真实 jev_ask + jev_models 调用
```

### 说明

- 计费只按输入 token（$0.042/Mtok），输出免费；客户端侧已做 state 上限以控制成本。
- Jev 英文最强；其他语言请在自己的数据上验证，并用 `confidence` 决定自动执行还是转人工。
- 每个问题只问一个原子判断；宽泛的判断拆成多个原子问题，答案在代码里组合。

---

## English

MCP server + CLI exposing [TypeSafe](https://typesafe.ai) **Jev** (a System One
model) to AI agents. Agents call `jev_ask` with a state and typed questions;
they get back structured judgments — no text generation, no parsing.

This is a thin bridge: it validates the request shape, forwards it to
`POST https://api.typesafe.ai/v1/systemone`, and returns the answers.
Question design stays with the caller (see the
[TypeSafe docs](https://docs.typesafe.ai/introduction)).

### Tools

#### `jev_ask`

Answer typed questions about a state. All questions run in parallel against
the same state; answers come back under your question ids.

| Param | Type | Notes |
|---|---|---|
| `state` | string \| object \| array | **required.** The content to evaluate: text, or structured data (chat logs, records, app state). Capped at ~120k chars. |
| `questions` | object | **required.** `{id: question}`; 1–50 questions. Ids label answers; they are **not** sent to the model — put full meaning in `instructions`. |
| `model` | string | default `jev-latest`. |

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

#### `jev_models`

Lists the model names/aliases this API key can use in `jev_ask`'s `model`
field. No parameters.

### Install

```bash
npm install -g @iixingchen/jev-mcp
# or run from source: node src/server.js
```

Node.js 20+ required.

### Auth

Set `TYPESAFE_API_KEY` in the environment (create one at
[console.typesafe.ai](https://console.typesafe.ai)). `CHECK_AI_CLI_TYPESAFE_API_KEY`
is accepted as a fallback. The server refuses to start without a key and never
logs it.

### Connect your agent

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

### CLI

```bash
export TYPESAFE_API_KEY=...
jev-ask request.json
cat request.json | jev-ask
jev-ask --model jev-1.13.0 request.json
```

Request shape: `{"state": ..., "model": "jev-latest", "questions": {...}}`.
Response JSON goes to stdout.

### Test

```bash
export TYPESAFE_API_KEY=...
npm test   # MCP stdio smoke test incl. live jev_ask + jev_models calls
```

### Notes

- Billing is per input token only ($0.042/Mtok); output tokens are free.
  State is capped client-side to bound cost.
- Jev is strongest in English; validate on your own data for other languages,
  and use `confidence` to decide when to act vs. escalate.
- Ask one atomic judgment per question; decompose broad judgments and combine
  answers in code.

---

## License

MIT — same as the official [@typesafe-ai/sdk](https://github.com/typesafe-ai)
and [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol).
See [LICENSE](LICENSE).
