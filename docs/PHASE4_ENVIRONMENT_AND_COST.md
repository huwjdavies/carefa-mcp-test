# Phase 4 environment and cost verification — 2026-10-19

## Inventory: observed, not inferred isolation

Read-only connected inventory returned one Base44 application: CarefaCollector `69fc9f9df40058abb77f7f42` (live). No CAREFA Companion V1 Isolated Lab exists in the accessible inventory. Existing development branches do not establish separate data, auth or secrets. No independent backend ID is available. Account plan/remaining credits are not exposed by the connected app inventory, so incremental Base44 cost is unknown.

Render workspace `tea-db5rksid0e5s738fktr0` still contains these CAREFA services:

| Service | ID | Branch | Auto deploy | Compute |
|---|---|---|---|---|
| carefa-oauth-hardening-lab | srv-db9lk6mq1p3s738ne2gg | carefa-multiuser-hardening-20261017 | off | free |
| Carefa-oauth-isolated-test | srv-db8rc0mi0phs738oguj0 | carefa-plugin-oauth-20261016 | on | free |
| carefa-mcp-diagnostic | srv-db5s3ag473hc73c7f9t0 | carefa-secure-link | on | free |

Do not use any of these for Phase 4. Configuration metadata cannot prove they have no legacy grants or shared secrets. No env values or collection rows were requested. Existing CAREFA database: carefa-oauth-development-db `dpg-db9l16dg1s2s739497p0-a`, logical carefa_oauth_development_db, PostgreSQL 18, Frankfurt, available, paid-plan ID `0.1c-256mb`, 1GB. It is not an approved isolated target. An unrelated existing free database occupies the workspace's one-free-database slot; it was not queried or altered. New free database creation in this workspace is therefore not a viable proposal.

## Proposed empty target — not created or verified

| Boundary | Proposed name | Actual identity |
|---|---|---|
| Base44 app and backend | CAREFA Companion V1 Isolated Lab | NOT_CREATED; backend ID unassigned |
| Render workspace | CAREFA Companion Isolated Lab | NOT_CREATED; free eligibility unconfirmed |
| Render service | carefa-companion-phase3-lab, Frankfurt, free, auto-deploy OFF | NOT_CREATED |
| PostgreSQL instance / logical DB | carefa-companion-phase3-db / carefa_companion_phase3, Frankfurt | NOT_CREATED |

Create a new EMPTY app, not a production branch or a clone carrying data/secrets. After approval, prove separate app/backend identity, empty collection entities, independent app-scoped sessions/auth, owner RLS, fresh function secrets, no shared connectors/automations/webhooks, no live publish target or Git sync mapping. Cross-app auth rejection must be tested without exporting production tokens. If platform evidence cannot establish independent auth/data/backend, stop. Sharing Base44 vendor infrastructure or billing does not mean sharing collections, but shared credit exhaustion remains an operational risk to production; resolve quota separation before acceptance. Do not assume a second paid/free workspace is included.

Render needs separate workspace quotas/network, fresh database and role credentials, no shared environment groups, only new Base44 origins, and no production credentials. Separate private network plus least-privilege runtime role is required; external IP restrictions alone do not prove isolation. Evidence remains future work after separately authorised creation. Current no-change activity establishes that this work has not altered production; it does not prove hypothetical infrastructure isolation.

## Cost findings and limits

Sources checked 2026-10-19 (official):

- https://base44.com/pricing — Free $0, up to five apps, 25 message/100 integration credits monthly; Builder $40/month equivalent **billed annually ($480/year)**, 250 message/10,000 integration credits, unlimited apps. Do not confuse annual equivalent with month-to-month checkout.
- https://docs.base44.com/Account-and-billing/Billing-and-plans — Builder includes backend functions; current account entitlement and shared-credit usage cannot be read here. Published core-backend inclusion does not establish custom-function eligibility on Free. Need exact account Plan & Subscriptions/credits confirmation; do not upgrade. A new app may add $0 if existing entitled capacity and isolated quotas permit; this is conditional, not verified free hosting. Separate billing/quota boundaries may require another subscription. Monthly checkout price was not independently extracted; do not quote a guaranteed $50 charge.
- https://render.com/docs/free — free service/database compute $0 if eligible. One free PostgreSQL per workspace, 1GB, 30-day expiry, then inaccessible and 14-day upgrade grace before deletion; no managed backups/pooling. Free service idles after 15 minutes, cold-start around one minute; 750 running hours/workspace/month, exhaustion suspends all free services. Bandwidth/build overages can charge if payment method exists, otherwise suspend/stop builds. Separate workspace eligibility and actual usage limits are not exposed by current resource inventory. No zero-cost guarantee or indefinite free database.
- https://render.com/pricing — current dynamic compute price table was not available through text retrieval. https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses gives a **July 2026 snapshot** of about $13/month for Starter web plus Basic-256mb PostgreSQL, before growth; it is NOT a current account quote. Storage noted at $0.30/GB/month. https://render.com/docs/compute-plans confirms 0.1c-256mb is the renamed basic-256mb, distinct from free.

Least-cost suitable candidate for a short lab: existing eligible Base44 capacity plus a separate eligible Render free workspace/service and 30-day free DB, incremental $0 **only after entitlement/quota/overage evidence**. No such complete free setup is verified. Durable alternative: new dedicated smallest paid PostgreSQL plus free web (accept cold starts), with exact current checkout quote; always-on alternative historically about $13/month Render plus any Base44 subscription. Both require a new, separate cost decision and a revised preflight; no paid fallback is authorised. Local disposable testing stays at no new cloud-resource cost but cannot prove actual Base44/ChatGPT onboarding.

Estimated incremental monthly total today: UNKNOWN. Conditional short-lab floor $0 for <=30 days; no verified ongoing $0 managed-PostgreSQL option. Base44 annual Builder floor, if a new entitled subscription is needed and suitable, $480 upfront plus Render/tax/usage; not an approved purchase. Owner must privately confirm plan, credits, extra-workspace eligibility and spending controls or obtain provider confirmation. Do not supply billing credentials or secrets to chat.
