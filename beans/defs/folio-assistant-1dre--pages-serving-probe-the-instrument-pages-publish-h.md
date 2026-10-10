---
# folio-assistant-1dre
title: 'PAGES SERVING PROBE: the instrument pages-publish-health counts, and it can only be built in CI because egress refuses every route from an agent'
status: todo
type: feature
priority: normal
created_at: 2026-09-26T03:55:45Z
updated_at: 2026-10-10T16:53:55Z
parent: folio-assistant-1xhc
---


`pages-publish-health` (bean `qj9a`) counts instruments for observing the
published site. The count is **0**, so it reports a `major` finding whose action
is this bean. This is that probe, specified rather than built, because it cannot
be built here.

## Why it cannot be written or tested from an agent's container

Measured 2026-09-25 and 2026-09-26, every route refused:

| route | result |
|---|---|
| `GET https://litlfred.github.io/folio-assistant/` | `connect_rejected` — egress proxy, organization policy |
| the same for a `STAGING/<slug>/` page | `connect_rejected` |
| `GET /repos/:o/:r/pages` | every field `null` |
| `GET /repos/:o/:r/pages/builds` | *"Access to this GitHub API path is not permitted through this proxy"* |
| `actions/workflows/pages-build-deployment/runs` | `total_count` absent |

So a probe written locally cannot be exercised even once, and a probe that
reaches the network at sweep time would report `unknown` — which
[`qj9a`](folio-assistant-qj9a--staging-size-the-measurement-is-right-and-the-seve.md)
establishes takes the WHOLE health report to `unknown`, exits 2 and leaves the
tracking issue untouched. `health-check.yml`'s own comment: *"the whole verdict
goes to `unknown` — correctly, and uselessly."*

**That constraint shapes the design and is the reason this is a bean rather than
a patch.**

## What it has to do

1. **Run in CI**, in a job with ordinary egress — `health-check.yml` already runs
   daily and already fetches `gh-pages`, so it is the obvious host.
2. **Fetch the published site** and record, per URL: HTTP status, bytes served,
   and whether the body is the expected page rather than Pages' own 404.
3. **Record the observation as committed evidence**, not as a live call the sweep
   depends on. The check then reads the recorded observation and counts as its
   instrument — which keeps `pages-publish-health` offline and deterministic,
   the property `bean-quiet-claims` has for the same reason (`bun run cat health`
   must not need a token or a reachable API to say anything).
4. **Carry its own staleness**, because a recorded observation is a measurement
   with a date. An observation older than N is not an observation — same rule
   `check:ci-health` applies to a red that has not re-run in a week.

## The question it exists to settle

**Is GitHub's documented 1 GB Pages limit enforced at all for branch-based
sites?** Measured: the served tree crossed 1 GB on 2026-09-23 and was 2.67 GB on
2026-09-25, with every deploy succeeding throughout. So it is not a hard refusal
on push. Whether it degrades, truncates, or is simply unenforced is unknown, and
the answer changes what the thresholds MEAN:

- **enforced somehow** → 500 MB is a safety margin and the owner's number is a
  cliff-avoidance measure
- **not enforced** → 500 MB is a repository-hygiene policy, and saying so plainly
  is more honest than implying a cliff

Neither is asserted here. This is the one fact a probe buys that no amount of
reasoning does.

## What it must NOT become

**Not a gate.** `schema:viz:check` is exempt from gating for a reason that
applies with more force here: a check depending on an external service reddens
when that service hiccups rather than when this author forgot something. The
probe records; a person reads.

**Not a licence to delete.** Even a probe returning HTTP 500 would not authorise
removing a preview — `deletion-requires-confirmation`, and every remedy on this
check names a person.

## Done when

- [ ] A CI job fetches the published site and commits the observation with its
      timestamp
- [ ] `pages-publish-health` reads that observation, counts it as its instrument,
      and stays offline — no network at sweep time
- [ ] A stale observation is distinguished from a fresh one, with the horizon's
      basis recorded
- [ ] The enforcement question above is answered from evidence, and
      `STAGING_WARN_BYTES`' basis says which of the two readings is true
- [ ] It is NOT wired into `gates`, and the exemption states why


## Owner decision

(Lane B drain, 2026-10-10.) The bean asks for the probe's observation to be **committed**, but since arc `3fva` and `5hox` health and QA results stay off main (`test/health/results/` is gitignored), so it is unclear where the observation should live. The reader, `pagesPublishHealthCheck` in cat-harness-tools `test/health/checks.ts`, is here. The writer is a CI job in folio-assistant's `health-check.yml`, which has the network access.

Where should the CI job record the pages-serving observation?

1. **(Recommended)** **On `qa-reports`**, under `main/<sha>/health/pages-serving.json`, using the existing qa-store publish. The health check reads it with `qa:fetch`, stays offline at sweep time, and treats a missing or old entry as `unknown` with its date.
2. **Committed on main** as a small dated file (e.g. `test/health/observations/pages-serving.json`): one deliberate exception to results-off-main, because it is an instrument reading, not a verdict.
3. **As a workflow artifact plus a tracking-issue comment**, with the check reading the issue. That needs the API at sweep time, which the bean rules out.
4. **Not built:** keep `instruments = 0` and the `major` finding as the standing reminder.

**Default if no answer:** option 4. Nothing is built, and the finding stays as it is today.
