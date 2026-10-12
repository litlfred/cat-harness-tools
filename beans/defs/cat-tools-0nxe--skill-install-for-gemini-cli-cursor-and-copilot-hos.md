---
# cat-tools-0nxe
title: 'Skill install for Gemini CLI, Cursor and Copilot hosts (x4mt follow-up) — verify formats first'
status: draft
type: task
priority: normal
tags:
    - x4mt
    - skills
created_at: 2026-10-12T15:45:25Z
updated_at: 2026-10-12T15:45:25Z
---

Follow-up to x4mt (tools#143, `scripts/install-skills.ts`). That PR installs each
skill as `<prefix>-<name>/SKILL.md` for two hosts only: `claude`
(`.claude/skills`) and `antigravity` (`.agents/skills`). AGENTS.md promises
Gemini CLI, Cursor and Copilot as well. This bean records what each of those
hosts would need. It is **draft**: whether to build them is the owner's call
(lane A, 2026-10-12), so nothing below is to be built before that.

## What to verify per host (from the vendors' current docs, not memory)

| Host | Believed location | Believed format | To verify |
|---|---|---|---|
| Gemini CLI | `.gemini/` (extensions: `gemini-extension.json` + context file; commands: `.gemini/commands/*.toml`) | context Markdown, or TOML command with `prompt` / `description` | Does Gemini CLI read Agent Skills (`SKILL.md` with `name`/`description` front matter) natively now, and from which directory? If not, is a skill an extension context file, or a command? |
| Cursor | `.cursor/rules/*.mdc` | MDC: front matter `description`, `globs`, `alwaysApply`, then the body | Is "Agent Requested" (description only, no globs, `alwaysApply: false`) the right mapping for a skill's trigger `description`? Does Cursor also read `SKILL.md` directories? |
| Copilot | `.github/instructions/*.instructions.md` (`applyTo`), `.github/prompts/*.prompt.md`, possibly `.github/skills/<name>/SKILL.md` | Markdown with front matter | Which of the three Copilot (VS Code agent mode, and the coding agent) loads on demand by description, the way a skill is meant to trigger? Is `.github/skills` supported, and by which surfaces? |

For each: the directory, the file name, the front-matter keys and which one
carries the trigger description, whether a body may reference sibling files,
and a size limit if there is one. Record the doc URL and date read.

## Steps (once the owner says build)
- [ ] Verify the table above against vendor docs; correct it in this bean
- [ ] Add each host to `HOSTS` in `scripts/install-skills.ts` with its own `render` (front-matter mapping) where SKILL.md is not native
- [ ] `ownedInstalls` keeps working per host: the installed marker must survive each format (an MDC/TOML comment where Markdown comments do not apply)
- [ ] Tests in `scripts/tests/install-skills.test.ts` per host: path, front matter, marker, `--check`

## Done when
1. The table is verified, with sources and dates.
2. If built: `bun run cat skills:install --host <h>` writes a tree each host loads, and `--check` fails when it is stale, for every host built.

## Owner decision

Asked 2026-10-12 by lane C. x4mt shipped Claude and Antigravity only.

1. **(Recommended) Verify the three formats now, build later.** Lane C fills
   the table from vendor docs, and building waits on a separate go.
2. Verify and build all three now.
3. Build only the hosts that read `SKILL.md` natively (no format mapping).
4. Leave it: Claude and Antigravity are enough for now.

Default if unanswered: **1**.
