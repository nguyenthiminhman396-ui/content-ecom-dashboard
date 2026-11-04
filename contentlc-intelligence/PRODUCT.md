# Product specification

## Objective
Automatically QC new or updated public content on Nhà thuốc Long Châu and Tiêm chủng Long Châu; benchmark related articles from Vinmec, VNVC, Tâm Anh; show evidence and action recommendations. **Manager confirms/rejects/requests verification, rates and assigns optimization work in existing ContentLC To-do/tasks**. No website or Portal edits/publishing.

## Roles
Manager/Admin: configure, run QC, decide, rate 1–5, assign existing team members, accept/reopen.
Editor: see assigned work, update status and revised article URL, submit for acceptance.
Medical reviewer: verify disputed medical claims, if role exists.
Viewer: read-only.

## Navigation
Content Intelligence: Overview | Quality Monitor | Review Queue | Assignments | Competitor Benchmark | Reports | Settings. Reuse current design system, auth, members, To-do/tasks, notifications.

## QC rubric / 100
- Medical accuracy and safety: 30
- Reader value and search intent: 25
- Completeness and depth: 15
- Evidence and sources: 15
- Editorial quality: 10
- Appropriate next action/CTA: 5
Score total = sum; if unable to inspect article or evidence, mark `insufficient_evidence`, not a fabricated score.
Severity independent of score: P0 urgent harmful advice; P1 major medical issue; P2 material content/editorial issue; P3 minor polish.
Finding categories: `quality_issue`, `content_opportunity`, `medical_verification`.
Competitor differences are opportunities, **not proof of medical errors**.

## Editorial rules
H2 without H3 is fine; if an H2 has H3, it must have at least two. Prefer H3 under 10 words (advisory). Avoid default H2 “Kết luận/Lời khuyên”. Natural, clear Vietnamese for patients. Avoid invented physician quotes and absolute claims.

## Workflow
1. AI discovers/fetches article and generates score + individual findings with exact quote, location, reason, evidence URL, confidence, priority and proposed action.
2. Manager reviews each finding: `confirmed`, `rejected`, `needs_medical_verification` with optional reason and 1–5 review score.
3. Only confirmed findings can be assigned as optimization work; medical verification can be routed to medical reviewer.
4. Manager selects assignee from existing members, deadline, priority, instructions. Create/link task through **existing To-do/task system**. Prevent duplicate tasks.
5. Editor updates task and submits revised public URL. AI rechecks current version and compares `resolved`, `unresolved`, `new`, `unable_to_verify`.
6. Manager `accepted` or `changes_requested` or `needs_medical_verification`. Audit decisions, actor, timestamps and status history.
7. AI score, manager review score, and staff KPI points are separate. No automatic staff KPI update.

## Scheduling
Daily 17:00 Asia/Ho_Chi_Minh: QC verified new/updated public URLs, dedupe canonical URL + content hash. Weekly Monday 09:00: aggregate existing QC, manager decisions, task throughput, competitors, 3–5 insights; do not recrawl every article. Manual URL QC/recheck anytime. Unknown update time must be labeled unknown, not new.

## Report outputs
Daily: discovered / successfully fetched / actually QCed / failed / unverified, coverage denominator, P0–P3 counts, pending review, URLs and sources, recommended actions.
Weekly: quality trends, repeated problems, unresolved medical issues, tasks assigned/completed/overdue, recheck results, competitor gaps, actionable priorities. Every figure sourced from stored records.
