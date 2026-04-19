# OpenClaw skills triage

## Context

The user just stood up an OpenClaw agent on their Mac (inference offloaded to Ollama on their Windows box — qwen2.5-coder:32b on a 4070 Ti Super). OpenClaw ships with 52 bundled skills. We want to pick the subset that genuinely helps our existing workflow and install them.

## Our actual workflow (be honest — skills must earn their keep)

- **Primary work:** the REMA portal nesting engine (Rust + Next.js + Supabase). Current focus: multi-task S2.5 plan porting sparrow GLS into jagua-rs BPP. Tasks 1-6 done/in-flight on branch `refactor/rf-engine`.
- **Collaborators I already use:**
  - Claude Code (me) — primary agent in the IDE
  - Gemini CLI — large-context codebase reads, sign-offs
  - Codex CLI — independent second opinion, sign-offs
  - CodeRabbit CLI — pre-commit review
- **Things that happen daily:** writing Rust/TS code, running tests + clippy + lint, reading CodeRabbit output, writing commit messages, tracking multi-phase plans in `docs/superpowers/plans/`, saving memories in `~/.claude/projects/.../memory/`.
- **OS:** macOS Tahoe primary, Windows 11 for GPU. Terminal-heavy. Uses Warp + Herd. No Apple Notes / Bear / Obsidian / Things today.

## The 52 skills

Full list at `/tmp/openclaw-skills-clean.txt`. Read the whole file (it's ~190 lines). Each skill has: status (ready / needs setup), icon, name, short description, source.

## Your assignment

Produce a ranked triage at `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/openclaw-skills/<your-name>.md` with:

1. **Install-now tier** — skills that genuinely earn their setup cost for our actual workflow above. Be ruthless: a skill that wires into a tool the user doesn't already use (e.g. Bear, Obsidian, Things) is a tier-3 distraction. For each: why it helps, what setup it needs.

2. **Install-later tier** — skills with conditional value (e.g. Slack skill is great IF we later add team notifications; messaging bridges useful IF we want mobile access).

3. **Skip tier** — skills that don't fit or duplicate tools we already have (e.g. anything that duplicates existing CLI review tools, fitness/media control, home automation we don't have).

4. **Hidden gem call-out** — if any skill is more broadly useful than its description suggests, flag it. Be specific.

Tight filter: "would I use this in the next 30 days of REMA work?" If not, it's install-later or skip. We have 52 skills to choose from — install-now should be ≤ 8.

Output under 600 words. Concrete, with skill names matching the list verbatim so I can feed them back into `openclaw skills install <name>`.
