# Task 9.5 second-opinion — Codex

## Context

Tasks 5-9 shipped. Task 9 (df41b10) fixed the biggest burn-down item (the `ext_to_int_transformation` replay bug you diagnosed). Three mitigations remain, blocking the `s2.5a-industry-competitive` tag.

Full Task 9 follow-ups: `.claude/research/archive/task9/followups.md`.

## Parallel Gemini researcher

Writing `.claude/research/task9.5/gemini-report.md` right now. Focus: root-cause Item #1 (custom_pipeline containment over-report at `specialized_pipeline.rs:86-102`) and propose a concrete fix.

## Your assignment

Independent read. Deep-dive into the same three items. Write `.claude/research/task9.5/codex-report.md` (or print if sandbox is read-only).

Specifically for Item #1:

1. **Read the sparrow upstream line-by-line against our port.** Files:
   - `/tmp/sparrow-research/sparrow/src/eval/specialized_jaguars_pipeline.rs`
   - Our port: `engine/crates/rema-layout/src/infrastructure/search/gls/specialized_pipeline.rs`

   Is there a verbatim difference Task 4's port introduced? Or is sparrow upstream itself producing the same divergence and just never exercising a test case that trips it?

2. **The suspected branch — containment check on `v_quadtree.hazards.iter()` (lines 86-102).** Walk through the `QTHazPresence::Partial` arm and `detect_containment_collision`. Compare against jagua's default pass at `CDEngine::collect_poly_collisions:261-289`.

3. **Why does Exterior appear in both but the extra PlacedItem appears only in custom?** Possible angle: the custom path walks hazards in a different order / different parent traversal than jagua's default, so a hazard that jagua discards early (via bbox-early-return) survives in custom.

4. **Propose a concrete fix OR argue this is the right upstream-sparrow issue to file** (i.e. not our bug).

For Item #3 (jagua internal):
- If you've time, propose the minimal reproducer + the upstream fix diff.
- If not, sign off on the profile-override-until-upstream-fix approach.

## Output

≤1500 words. Verdict: APPROVE for Claude to ship fixes / REJECT pending more research. If sandbox read-only, print for Claude to save.
