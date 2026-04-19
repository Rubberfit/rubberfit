# OpenClaw skills triage — Gemini

## Install-now (8 max — ruthless)

These earn their keep in the next 30 days of REMA nesting work (Rust + Next.js + Supabase, multi-phase plans, CodeRabbit/Codex/Gemini sign-offs).

1. **coding-agent** — Delegates to Codex/Claude Code as background procs. Direct fit for the Codex co-worker protocol already in `~/Work/CLAUDE.md`. Ready, no setup.
2. **github** — `gh` CLI for PRs, CI logs, issue triage on `refactor/rf-engine`. Daily use. Ready.
3. **gh-issues** — Auto-spawns sub-agents on labeled issues and opens PRs. Useful for grinding through S2.5 follow-ups and CodeRabbit nits. Ready.
4. **gemini** — One-shot large-context Q&A. Already a core co-worker; skill just formalizes invocation. Ready.
5. **session-logs** — `jq` over prior sessions. High-value for REMA because plans span days and memories live in `~/.claude/projects/.../memory/`. Ready.
6. **taskflow** — Durable multi-task flow substrate with child-task linkage and waiting state. Maps cleanly onto `docs/superpowers/plans/` multi-phase tracking (tasks 1-6 on rf-engine). Ready.
7. **skill-creator** — We will write REMA-specific skills (pack-cli invocation, parity-snapshot runner, clippy gate). Having the authoring skill now pays off immediately. Ready.
8. **1password** — `op` CLI. REMA uses `NEXT_PUBLIC_SUPABASE_*` and will accumulate more secrets; terminal-native injection beats dotenv sprawl. Needs CLI install + sign-in.

## Install-later (conditional)

- **mcporter** — If we add more MCP servers beyond Supabase (e.g. a jagua-rs benchmark server), this is the control plane.
- **oracle** — Prompt/file bundling for multi-file sign-offs. Redundant with the existing Gemini bridge today; revisit if bridge limits bite.
- **slack** / **discord** — Only if the team grows or we want CI failure pings. Zero value solo.
- **notion** — Only if plans migrate out of `docs/superpowers/plans/`. Not now.
- **model-usage** — Nice cost visibility once Codex/Claude spend becomes material.
- **healthcheck** — Useful when the Windows GPU box or a VPS joins the OpenClaw mesh permanently.
- **node-connect** — Only if mobile companion pairing breaks.
- **tmux** — Useful if long-running `cargo test` or Sparrow runs need pane scraping from an agent. Low priority while iterating locally.
- **summarize** — Fallback for podcast/video research; not part of current loop.
- **taskflow-inbox-triage** — Install once taskflow is wired and we have real inbound routing.

## Skip

Pure lifestyle / home / media / messaging-to-humans skills that do not touch REMA:

- **apple-notes**, **bear-notes**, **obsidian**, **things-mac**, **apple-reminders**, **trello** — user explicitly doesn't use any of these today.
- **blucli**, **bluebubbles**, **sonoscli**, **spotify-player**, **openhue**, **eightctl**, **camsnap**, **songsee**, **gifgrep**, **video-frames** — media/home automation, irrelevant.
- **imsg**, **wacli**, **voice-call**, **xurl**, **goplaces**, **ordercli**, **weather**, **blogwatcher**, **gog** — personal comms/lookup, no REMA tie-in.
- **himalaya**, **nano-pdf** — duplicate existing Gmail/Preview workflows.
- **openai-whisper**, **openai-whisper-api**, **sherpa-onnx-tts**, **sag** — no audio in our loop.
- **peekaboo** — macOS UI automation, not needed for terminal-heavy Rust/TS work.
- **clawhub** — meta/install skill; the built-in `openclaw skills install` already covers it.

## Hidden gem

**session-logs** is undersold by its description. For a workflow where multi-phase plans (`refactor/rf-engine` tasks 1-6) span days and memories live at `~/.claude/projects/.../memory/MEMORY.md`, being able to `jq` prior sessions for "what did we decide about sparrow GLS warm-start?" is dramatically more valuable than a generic log search. It turns the memory index into a queryable substrate instead of a grep target. Install it even if you install nothing else from this list.
