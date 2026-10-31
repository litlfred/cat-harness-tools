---
# cat-tools-sr31
$schema: bean/1.0.0
title: 'SECURITY REVIEW 2026-10-31: every harnessed layer, against the security sub-KG and the secure-code-authoring voice'
status: todo
type: epic
priority: high
created_at: 2026-10-31T04:05:00Z
updated_at: 2026-10-31T04:05:00Z
parent: folio-assistant-rwmf
---

Owner, 2026-10-31: *"do full QA security review on all code harnesd in a KG. record findsgs as per SOPs."*

Scope: cat-harness, cat-harness-tools, folio-assistant-core, folio-assistant-sci, fhir-harness, smart-base, smart-ra, smart-immunizations, smart-trust, who-iris, dth-hrh, bootstrap, folio-assistant. Method: the boundary table in `cat-harness/skills/conduct/security/security.md`, the 16 rules of the `secure-code-authoring` voice, the RED FLAG categories in `schemas/sdlc/red-flag.ts`, `bun audit`, `check:workflow-injection`, and a sink sweep (shell strings, path joins, HTML sinks, CORS, auth headers, unpinned actions).

Each finding is a child bug in the store of the layer that owns the code. Findings that would help an attacker against a running deployment are held out of the public stores until the owner decides how to disclose them (project thread, 2026-10-31).

Fixes are separate pull requests, each needing the owner's go-ahead.

## Done when

- [ ] Every layer reviewed, findings filed as children.
- [ ] The owner has chosen how the held findings are disclosed.
