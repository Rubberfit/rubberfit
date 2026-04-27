# `tools/openclaw/`

Local-first PR automation driven by the OpenClaw agent layer (Ollama + GLM-5.1 by default). Greptile-style: every diagnosis is grounded in the PR diff _and_ the contents of the files the failure references, not the log alone.

## Tools shipped here

| Script          | Purpose                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `triage-ci.mjs` | Reads the latest failed CI run on a PR, builds a context bundle (PR diff + filtered CI log + affected file contents), asks GLM-5.1 to produce a structured root-cause diagnosis, and posts/updates a single sticky comment on the PR. |

## Why local-first

GitHub Actions runners can't reach the Ollama instance on the LAN
(`192.168.50.68:11434`), and exposing Ollama publicly defeats the
local-first stack. So this tool runs on the developer's Mac (or any host
with `OLLAMA_HOST` configured) against the gh CLI. v2 will move to a
self-hosted runner on the Windows GPU box for hands-off automation.

## Prerequisites

- `gh` CLI authenticated for the repo
- `OLLAMA_HOST` env exported (defaults to `http://192.168.50.68:11434`)
- Model `glm-5.1:cloud` registered on the Ollama host (override with
  `OPENCLAW_MODEL=...`). Model role routing rules live in
  `~/Work/CLAUDE.md`; for CI triage GLM-5.1 is the default because it's
  tuned for structured output + multi-step instruction following.

## Usage

```bash
node tools/openclaw/triage-ci.mjs 145              # triage failed CI on PR #145
OPENCLAW_MODEL=kimi-k2.6:cloud node tools/openclaw/triage-ci.mjs 145
```

Exit codes:

- `0` — diagnosis posted, updated, or intentionally skipped (low confidence)
- `1` — no failed CI runs on the PR (nothing to triage)
- `2` — unrecoverable error (Ollama unreachable, gh CLI missing, model not pulled)

The first run posts a new comment marked with
`<!-- openclaw:ci-triage -->`. Subsequent runs find that comment and
_edit it in place_ — no spam, the diagnosis stays current with the
latest failure on the PR.

## Output shape

The model is constrained (see `prompts/ci-triage.md`) to return a
fixed-shape comment:

```
🔴 Root cause: <one sentence>

📍 Likely fix:
- <bullet, file:line where known>
- ...

📋 Failure excerpt:
```

<verbatim error lines from the log>
```

🤔 Confidence: high | medium | low

```

Followed by an OpenClaw footer line with the model + run id + confidence.

## Confidence calibration

`parseConfidence` extracts the `**Confidence:** <level>` token from the
model output. The script **refuses to post** when confidence is `low` or
unparsed — false-positive comments train developers to ignore the bot.
The model is instructed to use `low` (and explain what's missing) when
the log alone doesn't give it enough to fix the failure.

## Files

```

tools/openclaw/
├── README.md # this file
├── triage-ci.mjs # main entry — orchestrates gh + Ollama + comment post
├── prompts/
│ └── ci-triage.md # system prompt (edit here, no code change needed)
└── lib/
├── build-prompt.mjs # pure prompt assembly (testable, no I/O)
├── ollama.mjs # thin Ollama HTTP client + pre-flight check
└── comments.mjs # idempotent gh comment helpers

````

## Tests

`tests/openclaw/build-prompt.test.ts` covers the pure prompt-builder
helpers — file extraction from log mentions, truncation behavior, and
confidence parsing. No live Ollama or gh calls in the test suite.

```bash
npx vitest run tests/openclaw/
````

## Roadmap

- **v1** _(this commit)_ — manual run from the dev Mac, single PR at a time.
- **v2** — self-hosted runner on the Windows box; trigger on
  `workflow_run` failure events so the diagnosis appears automatically.
- **v3** — codebase indexer (treesitter + nomic-embed-text). The current
  v1 grabs files mentioned in the log; v3 expands context to related
  modules retrieved by semantic similarity.
- **v4** — auto-fix proposals on a `bot/<pr>` branch when confidence is
  high and the fix is mechanical (missing import, type rename).
