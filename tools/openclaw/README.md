# `tools/openclaw/`

Local-first PR automation driven by OpenClaw + Ollama. Greptile-style: every diagnosis is grounded in the PR diff, the failure log, the contents of the files the failure references, **and** semantically-related chunks pulled from a codebase index — not just whatever the log says in isolation.

The whole thing runs on the devops box (the same Windows server that hosts Ollama). No GitHub Actions runners, no GitHub-stored secrets, no public Ollama exposure. The bot's GitHub App private key never leaves that machine.

## Tools shipped here

| Script            | Purpose                                                                                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `triage-ci.mjs`   | **v1.** Reads the latest failed CI run on a PR, builds a context bundle (PR diff + filtered failure log + contents of files the log mentions + retrieved related code), asks GLM-5.1 for a structured root-cause diagnosis, posts/updates a single sticky comment on the PR. |
| `triage-poll.mjs` | **v2.** Long-running poller that watches every open PR for new failed CI runs and runs the triage automatically. State lives in `.openclaw/poll-state.json` so we never re-triage the same run twice.                                                                        |
| `index-repo.mjs`  | **v3.** Builds the codebase index used by `triage-ci.mjs` for semantic retrieval. Chunks every indexable source file, embeds via `nomic-embed-text`, persists to `.openclaw/index.json`. Incremental: only re-embeds files whose mtime changed.                              |
| `triage-cr.mjs`   | **v4.** Reads every open CodeRabbit comment on a PR, classifies each one (ACCEPT / SKIP_NITPICK / SKIP_OUT_OF_SCOPE / SKIP_FALSE_POSITIVE) using the team's house rules, and posts an inline reply per comment. **Advisory only — never auto-applies changes.**              |

## Architecture

```
┌─────────────────────── Windows devops box (192.168.50.68) ───────────────────────┐
│                                                                                  │
│   Ollama  ──────────────  glm-5.1:cloud, kimi-k2.6:cloud, deepseek-v3.1:671b,    │
│   :11434                  nomic-embed-text                                       │
│                                                                                  │
│       ▲                                                                          │
│       │  HTTP                                                                    │
│       │                                                                          │
│   Node.js                                                                        │
│   processes  ───  triage-poll.mjs  ───  spawns triage-ci.mjs / triage-cr.mjs     │
│                                                                                  │
│       │  GitHub App                                                              │
│       │  installation                                                            │
│       ▼  token                                                                   │
│       ─────────────────────────────────────────────────────────────────────────  │
│                                                                                  │
│   ~/.openclaw/                                                                   │
│   ├── private-key.pem      ←── GitHub App private key (chmod 600, gitignored)    │
│   └── …                                                                          │
└──────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ HTTPS
                                       ▼
                                api.github.com
```

## Prerequisites

- **`gh` CLI** authenticated — used for read-only fetches (PR diff, run logs, listing PRs). The default user auth is fine here; the App token is only used for posting.
- **`OLLAMA_HOST`** exported (defaults to `http://192.168.50.68:11434`).
- **Models registered:** `glm-5.1:cloud` (default for triage), `nomic-embed-text` (for indexing), and any others you want to reach via `OPENCLAW_MODEL`. Routing rules live in `~/Work/CLAUDE.md` — TL;DR: GLM for orchestration / structured output, Kimi for design review, DeepSeek for math/algorithm correctness.
- **GitHub App** — required for v4 (CR evaluator), strongly recommended for v1/v2 so comments post as `@openclaw[bot]` instead of your personal user. Setup below.

## Posting as `@openclaw[bot]`

Without App auth, v1 (triage-ci) falls back to posting via the `gh` CLI as your personal user. v4 (triage-cr) refuses to run without App auth so it never posts review-feedback under your name.

### One-time GitHub App setup

1. Create the App at <https://github.com/organizations/Arc-and-Anchor/settings/apps/new> — App lives under the org so credentials and bot identity are organization-owned.
2. Form fields:
   - **Name:** `openclaw` (globally unique; if taken try `openclaw-arc-anchor`)
   - **Homepage URL:** any URL (cosmetic)
   - **Webhook → Active:** uncheck — this stack doesn't subscribe to events
   - **Repository permissions:**
     - Issues → Read & write
     - Pull requests → Read & write
     - Contents → Read-only
     - Actions → Read-only
   - **Where can this GitHub App be installed?** Only on this account
3. **Generate a private key** on the App's settings page. Move the downloaded `.pem` somewhere outside the repo:
   ```bash
   mkdir -p ~/.openclaw
   mv ~/Downloads/openclaw.*.private-key.pem ~/.openclaw/private-key.pem
   chmod 600 ~/.openclaw/private-key.pem
   ```
4. **Install** the App on the org → "All repositories" or just the ones you want the bot to comment on. The Install URL contains the **Installation ID**.

### Wire credentials (devops box only)

```bash
# These three live on the devops box and never leave it.
export OPENCLAW_APP_ID=1234567
export OPENCLAW_INSTALLATION_ID=12345678
export OPENCLAW_PRIVATE_KEY_PATH="$HOME/.openclaw/private-key.pem"
```

The poller / triage scripts read those env vars at runtime, sign a short-lived JWT (10 min), and exchange it for a per-installation access token (~1 hour TTL) for each API call. **The `.pem` is never serialized into a log line, never sent over a non-GitHub network, and never copied off the devops box.**

The repo's `.gitignore` covers `.openclaw/` and `*.pem` so the key can't accidentally land in a commit.

## v1 — manual triage

```bash
node tools/openclaw/triage-ci.mjs 145
OPENCLAW_MODEL=kimi-k2.6:cloud node tools/openclaw/triage-ci.mjs 145
```

Exit codes:

- `0` — diagnosis posted/updated, or skipped due to low confidence
- `1` — no failed CI runs on the PR (nothing to triage)
- `2` — unrecoverable error (Ollama unreachable, model not pulled, gh missing)

Subsequent runs find the existing `<!-- openclaw:ci-triage -->` marker and edit in place — no spam, the diagnosis stays current.

## v2 — auto-triage poller

```bash
node tools/openclaw/triage-poll.mjs              # default 60s interval
OPENCLAW_POLL_INTERVAL_MS=30000 node tools/openclaw/triage-poll.mjs
node tools/openclaw/triage-poll.mjs --once       # single pass, exit
```

Run as a Windows service via NSSM or Task Scheduler, or under pm2 / launchd on macOS. Suggested NSSM config:

```
nssm install openclaw-triage "C:\Program Files\nodejs\node.exe" "C:\repos\rema-portal\tools\openclaw\triage-poll.mjs"
nssm set openclaw-triage AppDirectory C:\repos\rema-portal
nssm set openclaw-triage AppEnvironmentExtra ^
  OLLAMA_HOST=http://localhost:11434 ^
  OPENCLAW_APP_ID=1234567 ^
  OPENCLAW_INSTALLATION_ID=12345678 ^
  OPENCLAW_PRIVATE_KEY_PATH=C:\Users\Daniel\.openclaw\private-key.pem
nssm start openclaw-triage
```

State (which run id we last triaged per PR) is persisted in `.openclaw/poll-state.json` so a restarted poller doesn't re-post on the same failures.

## v3 — codebase index

Build / refresh once on the devops box (and any time the repo gains a meaningful chunk of new code):

```bash
node tools/openclaw/index-repo.mjs
```

Re-running is incremental — only modified files get re-embedded. The first build for `rema-portal` is ~minutes; subsequent rebuilds are seconds.

The triage script auto-loads the index when present and adds top-K (default 5) semantically-related chunks to the prompt. With no index it falls back gracefully to the v1 file-mention heuristic.

## v4 — CR comment evaluator

```bash
node tools/openclaw/triage-cr.mjs 145
```

Reads every CodeRabbit review comment on PR #145 that hasn't already been evaluated (no marker reply present), asks GLM-5.1 to classify each one against the team's house rules in `prompts/cr-evaluation.md`, and posts an inline reply per comment:

- **ACCEPT** — concrete suggestion fix, with reasoning
- **SKIP_NITPICK / SKIP_OUT_OF_SCOPE / SKIP_FALSE_POSITIVE** — short reasoned skip reply

Every reply ends with _"Advisory only. The engineer reviewing this PR makes the final call."_ OpenClaw never auto-applies changes — the goal is to give engineers a reasoned recommendation per CR comment, so they don't take CR at face value.

To force re-evaluation, delete OpenClaw's reply on GitHub and re-run.

## Output shape (v1)

The triage model is constrained to return a fixed-shape comment. Roughly:

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

## Confidence calibration (v1)

`parseConfidence` extracts the `**Confidence:** <level>` token from the model output. The script **refuses to post** when confidence is `low` or unparsed — false-positive comments train developers to ignore the bot. Skipped runs print to stdout for offline review.

## Files

```

tools/openclaw/
├── README.md # this file
├── triage-ci.mjs # v1 — single-PR CI triage
├── triage-poll.mjs # v2 — devops-box poller that runs v1 on new failures
├── index-repo.mjs # v3 — codebase indexer CLI
├── triage-cr.mjs # v4 — CR comment evaluator + suggestion poster
├── prompts/
│ ├── ci-triage.md # v1 system prompt
│ └── cr-evaluation.md # v4 system prompt (house rules embedded)
└── lib/
├── build-prompt.mjs # v1+v3 prompt assembly (file context + retrieved chunks)
├── ollama.mjs # Ollama HTTP client + pre-flight model check
├── github-app.mjs # JWT signing + installation token exchange
├── comments.mjs # idempotent triage comment posting (App or gh CLI)
├── indexer.mjs # v3 chunking + embedding + persistence
├── retrieval.mjs # v3 cosine top-K + query construction
└── cr-evaluator.mjs # v4 prompt assembly + verdict parsing

````

## Tests

| Suite | Coverage |
| --- | --- |
| `tests/openclaw/build-prompt.test.ts` | v1 prompt builder: truncation, file-mention extraction, confidence parsing, full prompt assembly |
| `tests/openclaw/github-app.test.ts` | RS256 JWT signing (verified end-to-end with a freshly-generated keypair), env-driven `isAppAuthConfigured` |
| `tests/openclaw/indexer.test.ts` | v3 chunking, persistence round-trip, incremental re-embedding |
| `tests/openclaw/retrieval.test.ts` | v3 cosine similarity, top-K ranking, query construction |
| `tests/openclaw/cr-evaluator.test.ts` | v4 CR-prompt scrubbing, verdict JSON parsing (with/without code fences), prompt shape |

No live Ollama, GitHub, or `gh` CLI calls in the test suite — all I/O is mocked or generated.

```bash
npx vitest run tests/openclaw/
````

## Roadmap (after v4)

- **Symbol-aware indexing** — replace v3's line-window chunking with treesitter symbol chunks so retrieval surfaces "the function being called" rather than "the next 80 lines."
- **Cross-PR memory** — when a PR re-introduces a pattern OpenClaw flagged on a previous PR, surface that history.
- **Issue triage parity** — promote the existing OpenClaw issue-triage script (the `🦞 Triaged via OpenClaw` you've seen on GitHub issues) into this directory so all OpenClaw automations live together.
