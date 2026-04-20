# S4 plan review — Gemini

## Verdict: Conditional sign-off

The plan is structurally sound for a "cleanup" phase, but it relies on several false assumptions about code parity (specifically Cut Planner) and ignores established user workflows (Cut History). If implemented as written, it will degrade the UX for power users and likely introduce a bloated, "god-component" in the planner.

## Required changes

1.  **Abort "Shared State" Unification for Cut Planner:** Grounding (b) proves the three planner modes have distinct data schemas and outputs. **Change:** Implement a "Planner Gateway" page with a clear mode-selection UI (Cards or Toggle) that routes to the existing (but polished) sub-pages. Do NOT merge the logic into a single Zustand store; keep the specialized logic separate to avoid a 1,500+ LOC maintenance nightmare.
2.  **Restore Cut History to Operations:** Grounding (d) notes Cut History is a load-source for the planner. Moving it to a tab inside `/analytics/` buries a critical operational tool. **Change:** Keep Cut History in the "Operations" nav group. It can be *mirrored* in Analytics if desired, but its primary home must remain accessible to the "get back to work" workflow.
3.  **Fix Dashboard Routing:** Grounding (e) identifies a legacy `/dashboard/default` route. **Change:** The task list must include a "Nav Sync" step that explicitly updates `app/navigation/sidebar/sidebar-items.ts` to point to `/dashboard` and removes all `default/` references.
4.  **Simplify Hook Tiers:** Three tiers for 8 hooks is architecture theater. **Change:** Adopt a 2-tier rule: `_components/use-*.ts` (local) and `app/hooks/` (global/domain). Only introduce `domain/_hooks/` if a domain exceeds 5 shared hooks.
5.  **Analytics Deep-Link Longevity:** One release cycle for redirects is insufficient for B2B SaaS where bookmarks are often internal documentation. **Change:** Implement permanent (308) redirects for the 7 analytics routes. The maintenance cost of a few lines in `next.config.mjs` is near-zero compared to the cost of broken user bookmarks.

## Nice-to-haves / follow-ups

*   **Dynamic Analytics:** Since the 7 analytics pages total 1,600+ LOC, use `next/dynamic` for the tab contents to prevent the `/analytics` bundle from exploding.
*   **Report Classification:** The plan absorbs "Reports" into Analytics. Verify with stakeholders if "Reports" (often high-level CSV/PDF exports) belongs with "Trends" (interactive charts). If they serve different personas (Manager vs. Operator), keep them distinct.
*   **KPI Drill-down:** Ensure the 4 KPI cards on the dashboard are not just stats but links to the respective filtered views (e.g., "Low Stock" card links to `inventory?filter=low-stock`).

## Inspiration / references worth noting

*   **Linear's Settings:** Excellent example of "Tabbed IA" that maintains deep-link integrity while feeling like a single workspace.
*   **Vercel Dashboard:** Use their "Quick Action" pattern (Command Palette style or prominent icon buttons) to solve the "get back to work" requirement.
*   **Shadcn's `DataTable` Pattern:** The plan mentions `DataTable`; ensure it supports the "Subtle/Default/Strong" border tokens defined in Task 1.

## Things I looked at that are fine

*   **Procurement Stub:** Confirmed it's a 6-line redirect; safe to delete and merge into Inventory.
*   **Design Token Strategy:** CSS vars + `theme.extend` is the correct weight for this project. Avoids build-tool bloat while providing semantic flexibility.
*   **Task 1+2 Seriality:** Establishing the visual "language" before moving the "furniture" is the correct sequence to prevent UI jitter during the migration.

## Questions for Claude

1.  **Cut Planner Output:** Does the "Batch" optimizer ever produce data that needs to be fed back into the "Manual" or "Single" planner, or are they strictly terminal endpoints? (If they are terminal, it further justifies keeping them as separate routes).
2.  **Error Codes:** For the `ErrorState` component, do we have a centralized registry of these machine codes (e.g., `RECEIVED_REQUIRES_RECEIVE_FLOW`), or are they scattered? We should consolidate these into a `const` or `enum` during Task 2.
3.  **Analytics Navigation:** If "Reports" is moved from "Management" to "Analytics," what remains in "Management"? If the group becomes empty, the nav cleanup needs to be more aggressive.
