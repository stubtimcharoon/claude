---
name: stk-ticket-update
description: DRAFT. Researches every open STK (Shurick's Tasks) ticket owned by Sam, drafts a short, stakeholder-safe progress comment per ticket from Jira, Slack, Confluence and Drive, then posts only after human approval. Use when STK bot pings for follow-ups, or when asked to "update my STK tickets".
---

# STK Ticket Research and Update (draft)

## Why this exists

- **Bot pressure:** the STK board has a follow-up bot (Grisha Romanyuk account). It posts "No follow-up provided over the past 2 weeks" and tracks FollowUpDelay / FollowUpCount per ticket.
- **Visible audience:** the board owner (Shurick) reads these. Tone must be clean and factual.
- **Past incident:** an earlier Claude run meant to rename a few Confluence pages also touched the STK board. This skill is therefore comment-only on STK.

## Hard guardrails

- **Write scope:** `addCommentToJiraIssue` only, and only after explicit approval of that exact text.
- **Never:** edit fields, rename, transition, move, close, link, create tickets, or touch Confluence pages.
- **No invention:** every claim needs a source link. If nothing changed, say "no change" and why. Do not pad.
- **Style:** short bullets, no em-dashes, no "not just X, but Y" phrasing, no praise words.
- **Neuronet overlap:** Neuronet auto-posts some updates. Read the last 3 comments first and do not duplicate them.

## Flow

1. **Load process.** Fetch Confluence STK "Board Process overview" (page 22571483163) and "Notification matrix" (22616866920). Extract the required update cadence and comment format. Cadence is unconfirmed in my research, so this step decides it. If unreadable, stop and ask.
2. **Inventory.** JQL: `project = STK AND assignee = currentUser() AND statusCategory != Done`. Add tickets where Sam is @mentioned by the bot in the last 30 days (Gmail: `from:jira@xsolla.atlassian.net "No follow-up provided"`). Known set: STK-386, 565, 956, 960, 1090, 1306, 1433, 2422, 2430, 2541, 2746, 3184, 3261, 4513.
3. **Research per ticket (parallel subagents, one per ticket, read-only).**
   - Jira: description, last 5 comments, status, due date, labels, linked issues in MED, BDXPN, OPTT, XLAPAGES, and their current status.
   - Slack: search ticket key and title since the last comment date. Prefer threads Sam is in.
   - Confluence and Drive: search key and title, take only pages modified since the last comment.
   - Return JSON: `key, last_comment_date, new_facts[{fact, source_url}], blockers[], decisions[], next_steps[], recommended_action`.
4. **Classify** each ticket as one of:
   - `UPDATE`: new facts exist, draft a comment.
   - `NO_CHANGE`: nothing new, draft a one-line comment only if the bot threshold is near.
   - `BLOCKED`: dependency named with owner and ticket.
   - `MOVE_OR_CLOSE_CANDIDATE`: work now lives on MED or XLAPAGES. Only recommend, never act.
5. **Draft** into `stk-updates-<YYYY-MM-DD>.md` in the scratchpad. One section per ticket: classification, draft comment, source links, confidence.
6. **Approval gate.** Show the file. Wait for approval per ticket. Edits from the user replace the draft verbatim.
7. **Post** approved comments, then re-read each ticket to confirm the comment landed.
8. **Report** in Slack-ready bullets: posted, skipped, needs-human, move/close candidates.

## Comment format (per ticket)

```
Update (<date>)
- **Status:** <one line, matches Jira status>
- **Done since last update:** <facts with links>
- **Blocked by:** <ticket + owner, or "none">
- **Next:** <next step + target date if one exists in a source>
```

- Max about 6 lines. Dates only when a source states them. Placeholder dates are labelled as placeholders.

## Prompt (paste into Claude Code, or use as the workflow prompt)

```
Run the stk-ticket-update skill (.claude/skills/stk-ticket-update/SKILL.md).

Goal: prepare progress comments for my open STK tickets so the follow-up bot stops flagging them, without duplicating Neuronet updates.

Steps:
1. Read the STK Board Process overview and Notification matrix on Confluence and tell me the required cadence and format before anything else.
2. List my open STK tickets and flag any with 10+ days since the last comment.
3. For each flagged ticket, spawn a read-only research subagent. Use Jira, Slack, Confluence, Drive. Only facts newer than the last comment, each with a source link.
4. Write drafts to a local markdown file in the Comment format. Classify each ticket UPDATE, NO_CHANGE, BLOCKED or MOVE_OR_CLOSE_CANDIDATE.
5. Stop and show me the file. Do not post anything yet.

Rules: comment-only on Jira after my explicit approval. Never edit, rename, move, transition or close anything. No invented facts. Short bullets, no em-dashes. Anything Shurick may read must sound neutral and precise. If Atlassian access is missing, say so and stop.
```

## Open questions before enabling

- **Cadence:** what the matrix actually requires (bot fires at 2 weeks, true SLA unknown).
- **Neuronet scope:** it auto-updates some tickets and a stakeholder asked Sam to remove a manual update. Confirm which tickets it owns.
- **Auth:** needs Atlassian MCP authorized for the session or API token env vars, as in the existing workflows.
- **Automation:** run manually first for 2 cycles. Only then consider a schedule like xpn-goal-update.yml.
