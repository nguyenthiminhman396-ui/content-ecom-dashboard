# Acceptance tests
1. Manual URL -> fetch -> QC score or `insufficient_evidence` -> findings -> manager review queue.
2. Re-run unchanged URL does not duplicate QC or tasks.
3. Changed content creates version; recheck compares old and new findings.
4. Manager confirm/reject/medical verification persists reviewer, reason, time.
5. Confirmed finding assigned to real existing ContentLC member creates/links existing To-do task, visible to assignee; retries idempotent.
6. Editor submits result; manager accepts or requests changes; all transitions audited.
7. P0/P1 warning persists even when total score >=90.
8. Fabricated URL/quote fails evidence validation; competitor-only disagreement is not classified as confirmed medical error.
9. H2 with no H3 passes; exactly one H3 triggers editorial warning; >=2 passes.
10. Failed fetch/unauthorized Portal reports not accessed; no fabricated dates, coverage, evidence or scores.
11. Non-manager cannot assign/accept; API key not exposed to browser; no external edit/publish calls.
12. Weekly report aggregates stored records without unnecessary repeat QC; counts have denominators.
13. Lint, typecheck, tests, build pass; staging dry-run with mock data; cron disabled by default.

Pilot with 20–30 manually reviewed articles; evaluate precision of alerts, evidence validity, manager accept rate, cost/article and duplicate tasks before production rollout.
