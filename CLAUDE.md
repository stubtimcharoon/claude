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

- Two-stage pipeline. Stage A (`.claude/skills/atlas-goal-update/`) researches and writes `drafts/<KEY>.json`. Stage B (`execution/post_goal_updates.py`) deterministically chunks and posts.
- Read the skill and the script before changing either.
- `execution/goals.py` is the single source of truth for goal keys and ARIs. Never hardcode an ARI anywhere else.

## Hard rules

- Atlas goal update summaries cap at 280 VISIBLE characters. Chunk, never trim.
- `goals_createUpdate` returns HTTP 200 with `success: false` on rejection. Always check `success`, never the HTTP status.
- `summary` is a String scalar holding a JSON-stringified ADF doc, not an object.
- Every Goals GraphQL operation needs `@optIn(to: "Townsquare")`.
- Never commit secrets. `drafts/`, `.env` and `credentials.json` are gitignored. Keep it that way.
- No em-dashes in any output, committed file, or posted update. Use a period, colon, comma or parentheses.

## Atlas update memory (from the Nov 10 2026 owner review)

What Sam owns vs only writes for:
- Owns: advertising goal XSOLLA-11872 and its measures 11907, 11908, 11909, 11910, 11911, 11912, 11913, 11962, 11965, 11974 (created by Neuronet Bot Nov 3 2026 from Shurick's $100M Advertising plan), plus projects XSOLLA-10948 (Chat MVP) and XSOLLA-11855.
- Not owner, so never post on them: Pages goals 8723 (Kirill Tokarev) and 10169 (Rene Valen); 10661 Alex Price, 8889 Sandy Davila, 10662/10663/10664/7370 Menshikov. Send input to the owner instead.
- Rule: only post updates on goals and projects Sam owns.
- Closed: 7681 cancelled, 7687 completed (Nov 9 2026).

Cadence and stakes:
- Menshikov wants every goal and project updated every 2 weeks (next: Nov 24 2026).
- 10661, 8889, 10662, 10663, 10664 are Sixth Sense bonus envelopes: a missed monthly update cancels the bonus.

How to write an update:
- Hard cap: 280 visible characters per post. Draft to fit in ONE post. Count before posting.
- Never change status or target date unless Sam explicitly asks. Pass the current status through.
- Wording: say "target assessed" (and what is realistic), never "target moved" or "pushed the date".
- Lead with work in progress (pitches, pipeline, named leads, what shipped), not just "nothing signed". Say plainly what is not done.
- If nothing changed, write one line starting "In the plan:" (what comes next, what's ready) plus the milestone. Never write "No change". No padding, no restating context from the parent goal.
- Never reuse someone else's update wording (e.g. Menshikov's Nov 6 posts). Write it fresh.
- End every update with "First milestone: <milestone> (MM/YY)".
- Each sibling goal speaks to its own metric. Do not repeat the same example (e.g. one sponsor) across many goals.
- Only claim what a source shows. Barter is not cash revenue. Do not reuse unverified lines from old updates.

- Research each goal on its own before drafting; never draft a goal's line from a shared topic summary.
- After posting, fact-check. Post a correction only for a major mismatch (a false statement of current fact). Fold minor mismatches into the next round.
- Nov 24 round carry-overs: 11907 Fandango budget unapproved (MOVIES-229 parking lot); 11912 each deal needs its own signed IO (template LEGAL-9538); 11913 Finance owner not accepted; 11965 overlay depends on Twitch App XSOLLA-4890 (no launch date); 11909 TwitchCon creators are Xsolla-paid; 11855 email copy still in review (PMSD-1861), MED-374 overdue.

How to post (cloud session):
- Raw GraphQL is blocked here. Use the Atlassian MCP: `createGoalUpdate` / `createProjectUpdate` via `executeWrite`, top-level `cloudId`, with `phaseStatus` set to the current status.
- Post only after Sam approves the exact text, then read each item back with `getGoal` / `getProject` to confirm.

Voice for messages Sam sends (Slack/email): short, lowercase-casual on Slack, "Menshi" for Menshikov, "Hi Menshi," / "Best, Sam" on email, no bot-style bullet walls.

## Verification

A green CI run does not prove an update posted. Verify against the Atlassian API (`getGoal`), not the Actions log.
