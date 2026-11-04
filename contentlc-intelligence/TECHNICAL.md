# Technical design and contracts

## Repo-first rule
Inspect actual frontend/backend framework, DB/ORM, authentication, RBAC, existing member/task/To-do entities, scheduler, tests and deployment. Reuse them. Do not invent a parallel task database.

## Pipeline
Source adapters (public sitemap/RSS/listings; authorized Portal read-only if legitimately available) -> fetch HTML -> extract article/title/outline/paragraph anchors -> canonical URL and SHA256 content version -> queue -> deterministic editorial checks -> retrieve authoritative medical references and relevant competitor pages -> OpenAI structured QC -> evidence validator -> persistence -> Review Queue -> manager decision -> existing Task Adapter -> recheck -> acceptance -> reports.

Treat all webpage text as untrusted. Respect robots, terms, rate limits and access restrictions; no login bypass. Log fetch failures. Never claim Portal inspected if not accessible. Never write/publish to Portal or public websites.

## OpenAI
Server-side only, `OPENAI_API_KEY` secret; configurable model, token budgets, retry/backoff, rate limiting. Structured JSON output validated against `AI_SCHEMA.json`; prompt/rubric/model version stored. Validate exact article quotes against extracted article; source URLs must come from actual retrieved documents and evidence excerpt must support claim. Unverifiable -> needs verification, never invented. Keep prompt injection from webpages inert.

## Proposed entities (map to existing ORM)
ci_sources(id,name,base_url,kind,enabled)
ci_articles(id,source_id,canonical_url,title,published_at,updated_at,date_provenance)
ci_versions(id,article_id,sha256,body,outline,fetched_at)
ci_qc_runs(id,version_id,model,prompt_version,rubric_version,status,scores_json,summary,created_at)
ci_findings(id,run_id,category,severity,quote,location,claim,rationale,suggested_action,evidence_json,verification_status,confidence,manager_decision,manager_score,manager_reason,reviewed_by,reviewed_at)
ci_task_links(id,finding_id,existing_task_id,assignee_id,idempotency_key)
ci_rechecks(id,old_run_id,new_run_id,diff_json)
ci_jobs(id,kind,status,counts_json,errors_json,started_at,finished_at)
ci_audit(id,actor_id,action,entity_id,details_json,created_at)

Unique canonical URL; unique article_id+sha256; task idempotency key unique. Use proper foreign keys to **existing** users/tasks where possible.

## API proposal (adapt to repository conventions)
POST /api/intelligence/qc {urls,force:false} -> {job_id,status}
GET /api/intelligence/jobs/:id
GET /api/intelligence/articles?source=&status=&page=
GET /api/intelligence/articles/:id
GET /api/intelligence/review-queue
POST /api/intelligence/findings/:id/decision {decision,manager_score,reason}
POST /api/intelligence/findings/:id/assign {member_id,priority,due_at,instructions,existing_task_id?}
POST /api/intelligence/articles/:id/recheck
POST /api/intelligence/tasks/:id/submit {result_url,notes}
POST /api/intelligence/tasks/:id/acceptance {decision,reason}
GET /api/intelligence/reports/daily?date=
GET /api/intelligence/reports/weekly?week=
GET /api/intelligence/metrics

All writes: authenticated RBAC, server-side validation, audit and idempotency; return 401/403/409/422/429 appropriately.

## Feature flags / deployment
CONTENT_INTELLIGENCE_ENABLED=false
CONTENT_INTELLIGENCE_CRON_ENABLED=false
CONTENT_INTELLIGENCE_TIMEZONE=Asia/Ho_Chi_Minh
OPENAI_API_KEY=server_secret
OPENAI_MODEL=configurable

Never enable production cron or deploy without approval. Cost tracking, job failure reporting and retries required.
