# CLAUDE.md

## Agent-first working rule

Always delegate to subagents when possible. Do not work serially in the main session.

- Default to spawning subagents via the Agent tool for anything parallelisable: codebase exploration, multi-file reads, independent build tracks, research across several sources.
- Launch independent agents in ONE message so they run concurrently. Never one at a time.
- Use `model: sonnet` for mechanical, well-specified work. Reserve the default model for design and judgment calls.
- Give each agent an explicit file ownership boundary so two agents never touch the same file.
- Do NOT delegate: a single known-file lookup, a one-line edit, or anything where writing the prompt costs more than doing the work.

## Repo context

This repo automates Atlas goal updates for eight XSOLLA goals.

- Two-stage pipeline. Stage A (`.claude/skills/atlas-goal-update/`) researches and writes `drafts/<KEY>.json`. Stage B (`execution/post_goal_updates.py`) deterministically checks length and posts.
- Read the skill and the script before changing either.
- `execution/goals.py` is the single source of truth for goal keys and ARIs. Never hardcode an ARI anywhere else.

## Hard rules

- **One post per goal, never several.** Never split an update into `(1/N)` parts. Each update is a single post of at most 280 VISIBLE characters. Tighten the wording to fit. Stage B fails a goal whose body is over the limit rather than splitting or trimming it.
- `goals_createUpdate` returns HTTP 200 with `success: false` on rejection. Always check `success`, never the HTTP status.
- `summary` is a String scalar holding a JSON-stringified ADF doc, not an object.
- Every Goals GraphQL operation needs `@optIn(to: "Townsquare")`.
- Never commit secrets. `drafts/`, `.env` and `credentials.json` are gitignored. Keep it that way.
- No em-dashes in any output, committed file, or posted update. Use a period, colon, comma or parentheses.

## Verification

A green CI run does not prove an update posted. Verify against the Atlassian API (`getGoal`), not the Actions log.
