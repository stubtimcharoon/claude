---
name: atlas-goal-update
description: "Stage A of the two-stage Atlas goal update pipeline. Researches and drafts a delta update for each of seven Atlas goals (Pages and Partner Network) and writes one drafts/<GOAL_KEY>.json per goal. Reads each goal's current status and last update via the Atlassian MCP, researches Slack, Jira, and Confluence, and drafts what changed since the previous update. Does NOT post anything: a separate Python script (execution/post_goal_updates.py, Stage B) chunks and posts the drafts. Use when drafting Atlas goal updates for the seven XSOLLA goals."
---

# Atlas Goal Update Skill (Stage A: research and draft)

Researches seven Atlas goals and writes **one JSON draft per goal** to `drafts/<GOAL_KEY>.json`. Then it stops.

## Division of labour (read this first)

This is Stage A of a two-stage pipeline.

- **Stage A (this skill): research and drafting ONLY.** Output is `drafts/<GOAL_KEY>.json`. Nothing else.
- **Stage B (`execution/post_goal_updates.py`): deterministic posting.** It reads the drafts and posts each one to Atlas as a single update. It rejects any body over 280 characters.

**This skill must never call the GraphQL API, never call `post-atlas-update.sh`, and never write to Atlas.** No `goals_createUpdate`, no `goals_byKey`, no curl to `xsolla.atlassian.net`. The one exception is the read-only helper `execution/atlassian_read.py` (see "No MCP tools? Use the read-only helper"), which has no write path. If you find yourself about to post, stop: the draft file is the deliverable. Do not create calendar events or send Slack messages either.

## Use subagents for the research

Step 2 research covers seven goals across Slack, Jira and Confluence. Do not do it serially.

- Spawn parallel subagents, grouped by source or by goal cluster, and launch them all in a single message so they run concurrently. Natural groupings: the two Pages goals and the five Partner Network goals (XSOLLA-10661, 8889, 10662, 10663, 10664).
- Each agent returns **findings only**. The main session does the drafting (Step 3 onward), so the voice and the delta framing stay consistent across all seven goals.
- Tell each agent explicitly that it is **read-only**: never post, never write a draft, never call the GraphQL API.

## Constants

- cloudId: `9dfc393f-ac2d-4cef-8b1c-0657da26067f` (pass as a **top-level** argument on every `executeRead`, never inside `inputs`).
- containerId: `ari:cloud:townsquare::site/9dfc393f-ac2d-4cef-8b1c-0657da26067f` (the empty segment between the two colons is required).
- ARI prefix for every goal: `ari:cloud:townsquare:9dfc393f-ac2d-4cef-8b1c-0657da26067f:goal/<UUID>`.
- Slack channel: `C09JA0JH17V` (`#current-xla-pages-workgroup`).
- Jira projects: `XLAPAGES`, `XLAPAGESN`. Confluence space: `XNTWRK`.

## Goals

| Key | Name | UUID |
|---|---|---|
| XSOLLA-8723 | Page Volume Expansion / Game-Payment Page MVP | d18d896d-b7a6-466e-ba8d-44fccc58b5ac |
| XSOLLA-10169 | First Wave Page Auto-Generation and Core Purchase Flow | 1e7501b0-0eff-4888-92f6-098e587f2788 |
| XSOLLA-10661 | 1. Community Socials | 3971354f-0da1-49f1-8624-2fdd2220a55b |
| XSOLLA-8889 | 2. Creator Retention Program Top 50 | 145cc5b9-3066-4ab7-98df-01810faa871c |
| XSOLLA-10662 | 3. Xsolla Mall Bundle Program | 01316922-438a-4e78-a61e-271d637cc475 |
| XSOLLA-10663 | 4. XPN for Brands | 7ed43f4e-034e-4b7d-a14a-838ab5eb3fd8 |
| XSOLLA-10664 | 5. Partner-Granted Items | 5c5198c7-a438-4ebf-af6e-ad62251fa392 |

`goal_ari` for a goal is the ARI prefix above followed by its UUID. Example: XSOLLA-10663 is `ari:cloud:townsquare:9dfc393f-ac2d-4cef-8b1c-0657da26067f:goal/7ed43f4e-034e-4b7d-a14a-838ab5eb3fd8`.

Grouping for research: XSOLLA-8723 and XSOLLA-10169 are the **Pages** goals. XSOLLA-10661, 8889, 10662, 10663 and 10664 are the **Partner Network** goals. XSOLLA-7370 is Alexander Menshikov's goal and is NOT updated by this pipeline.

## Step 1: Memory (current status and last update)

For each of the seven goals, read its current `status.value` AND its most recent update summary. That summary is your memory of what was already said.

Use the Atlassian MCP operation `getGoal` via `executeRead` with a top-level `cloudId`:

```json
{
  "name": "getGoal",
  "cloudId": "9dfc393f-ac2d-4cef-8b1c-0657da26067f",
  "inputs": { "identifier": "<KEY>", "include": ["updates"], "limits": { "updates": 3 } }
}
```

Record:
- `status.value`, **verbatim**, into `status_passthrough`.
- The most recent update's summary text into `previous_update_summary` (flatten ADF to plain text if the summary comes back as an ADF string). Also note its creation date: that is the research window start (Step 2).
- If the goal has **no updates**, `previous_update_summary` is `null` and the window falls back to 14 days. See the next section.

### Goals with no prior update

XSOLLA-10661, 10662, 10663 and 10664 have **never received an update**, so on the first run their `updates` list is empty. Handle this explicitly: set `previous_update_summary` to JSON `null` (not an empty string, not the text "none"), use the 14-day window, and write the body as a first update (what the goal is, where it stands, named owners, dates, numbers, blockers) because there is no prior text to take a delta against. Do not assume an update exists and do not index into an empty list. Check the other four goals the same way: any goal can have an empty list.

### No MCP tools? Use the read-only helper

In GitHub Actions there is no Atlassian MCP. If `getGoal` / `searchJiraIssuesUsingJql` / `searchConfluence` are not in your tool list, do NOT stop and do NOT write zero drafts. Use the read-only helper instead (it uses the `ATLASSIAN_*` env vars already set in CI; run it from the repo root):

```bash
python3 execution/atlassian_read.py goal XSOLLA-8723                   # Step 1: status + last 3 updates (text already flattened)
python3 execution/atlassian_read.py jql 'project in (XLAPAGES, XLAPAGESN) AND updated >= "2026-10-08"' 40
python3 execution/atlassian_read.py issue MED-369                       # description + recent comments
python3 execution/atlassian_read.py cql 'space = XNTWRK AND lastmodified >= "2026-10-08"' 25
python3 execution/atlassian_read.py page 24149524689                    # page body as plain text
```

`goal` gives you `status` (copy it verbatim into `status_passthrough`) and `updates[0].text` / `created` (your `previous_update_summary` and window start). Slack has no fallback in CI: skip it and lean on Jira and Confluence. Subagents get the same instruction.

### Why the MCP and not GraphQL

Raw GraphQL to `xsolla.atlassian.net` is **BLOCKED by the egress proxy inside Claude cloud sessions** (`curl: (56) CONNECT tunnel failed, response 403`). The same call works from a GitHub Actions runner. So in cloud sessions use the MCP path above; in GitHub Actions use the read-only helper. Do not try to work around the block, do not retry with another token, and do not conclude a token rotated: that 403 is network policy before auth is attempted.

## Step 2: Research

Window: **since the goal's previous update**, falling back to **14 days** when there is none. Do not research further back than the window: older material is already covered by earlier updates.

### Slack (primary for the Pages goals)

Channel `C09JA0JH17V` (`#current-xla-pages-workgroup`, private, the canonical workgroup). Use `mcp__Slack__slack_read_channel` with `channel_id: C09JA0JH17V` and `oldest` set to the window start as a Unix timestamp, paginating with `cursor`. Use `mcp__Slack__slack_read_thread` for threads with substance. Fall back to keyword search across public channels (for example the goal name or a ticket key) only if the channel is thin. For the Partner Network goals, search by goal name and key tickets rather than reading the Pages channel.

### Jira

Projects `XLAPAGES` and `XLAPAGESN` (the active project migrated to XLAPAGESN, so query both). Use `mcp__Atlassian_MCP__searchJiraIssuesUsingJql`, for example `project in (XLAPAGES, XLAPAGESN) AND updated >= "<SINCE>" ORDER BY updated DESC`, and `mcp__Atlassian_MCP__getJiraIssue` for tickets named in the previous update or the goal description. Other projects will show up through the goals (for example `MED-262`, OPPT dependencies): follow the ticket keys the goal's own text names.

### Confluence

Space `XNTWRK`. Use `mcp__Atlassian_MCP__searchConfluence` for pages modified since the window start, and `mcp__Atlassian_MCP__getConfluenceContent` to read a page.

### Source tracking

Keep the canonical URL of every Jira issue, Confluence page and Slack permalink that actually drove a claim. They go in `sources`, never in `body`. Jira URLs look like `https://xsolla.atlassian.net/browse/MED-262`.

If a research source errors, log it and continue. Never fail the whole run on one source, and never fabricate content to fill a gap.

## Step 3: Draft as a DELTA

This is the heart of the skill. The previous update is memory, not material.

- The new `body` says what **changed since the previous update**: new decisions, things shipped, new or cleared blockers, dates that moved, numbers that moved, newly named owners.
- **Do not restate** the previous update. Do not recycle its sentences. If a fact is unchanged and still relevant, leave it out unless the change itself is that it is still unresolved (for example "OPPT dependencies still overdue, now 5 weeks").
- **If nothing material changed for a goal, say so in one short line** (for example "No material change since Oct 5. Discord launch still on for Oct 20.") rather than padding or reusing the previous text.
- Where a blocker persists, name it, say how long it has been open and who owns it.

Content shape follows `atlas-updates/2026-10-05.md`: concrete facts, named owners, real dates, exact numbers, named blockers. Compare:

> Approved 60k bonus envelope (Sept 23) for auto-generating 605 payment pages (5 payment methods, 100 games, 500 combined) with 6-plugin purchase flow. Blockers: none. Deadline: deliver production-ready pages with email-based purchase delivery by Oct 27.

> Target 3-5 paid deals by Jan 2027. 10 proposals out by Oct 15 (warm outreach, Salesforce in progress). Budget $80k. Risk: 30% conversion may not support targets.

Rules:
- Preserve numbers exactly (counts, percentages, budgets, dates). Do not paraphrase precision away.
- Plain text only. No markdown, no ADF, no bullets, no headings, **no links in `body`**.
- Order most important first.
- Status is not in the body. Do not write "on track" or "at risk" into the text unless it is a substantive fact about a named deadline.

### Format: one post, 280 characters, "Key wins:" (hard rule)

Each goal gets **exactly one Atlas update**: a single plain-text paragraph of **at most 280 characters**, in Sam's established format:

> Key wins: <what shipped or was decided, with numbers and ticket keys>. Blocker(s): <named blocker, owner, how long>. Next: <next concrete step and date>.

Real examples from the goal history:

> Key wins: New PM Rene Valen joined XLA Pages; JJ Park joined on the Mall side. Buy Game page redesign finalizing the game key page for template use. 6 titles in queue, 4 prioritized. Two templates agreed: ideal + feasible. Onboarding welcome book prepared.

> Key wins: Design complete for all plugins + Payment Page. Targeting Aug 10 creation tool, Oct 30 auto-gen MVP. Shop Builder added auto-generation to Q3 plan. AI-prototype workshop kicking off with Kir Romanovsky team. Claim process spec written.

Rules:
- **Count characters with a script before writing the draft** (`python3 -c 'import sys; print(len(sys.argv[1]))' "<body>"`). Over 280 means rewrite shorter: pick the 2 or 3 facts that matter most. Stage B rejects any body over 280; it never splits a goal into `(1/N)` parts.
- If nothing shipped, write `Key wins: none this round.` and go straight to the blocker.
- **No research notes in the body.** Never write things like "not verified", "Slack was not checked", "no evidence found", "differs from the previous update", "sections were left blank", or "in the sources checked". If a fact is uncertain, leave it out. Caveats go in your run report, not in Atlas.

### Status

`status_passthrough` is a **pure passthrough** of the `status.value` recorded in Step 1. Never change it unless a hard external deadline is demonstrably slipping, and then explain the evidence in `body`. Valid values are `pending`, `on_track`, `at_risk`, `off_track`, `done`, `cancelled`.

## Step 4: Write the drafts

Create the `drafts/` directory if needed and write one file per goal, `drafts/<GOAL_KEY>.json` (for example `drafts/XSOLLA-10663.json`). Seven files in total, each valid JSON, each exactly this schema (the contract with Stage B: do not add, rename or drop fields):

```json
{
  "goal_key": "XSOLLA-10663",
  "goal_ari": "ari:cloud:townsquare:9dfc393f-ac2d-4cef-8b1c-0657da26067f:goal/7ed43f4e-034e-4b7d-a14a-838ab5eb3fd8",
  "status_passthrough": "on_track",
  "previous_update_summary": "text of the goal's last update, or null if none",
  "body": "plain text, no markdown, no ADF, no links",
  "sources": ["https://xsolla.atlassian.net/browse/MED-262"]
}
```

Field rules:
- `goal_key`: the key from the table, exactly.
- `goal_ari`: ARI prefix plus the UUID from the table, exactly.
- `status_passthrough`: verbatim `status.value` from `getGoal`.
- `previous_update_summary`: plain-text summary of the last update, or JSON `null` if the goal has never had one.
- `body`: the delta from Step 3.
- `sources`: array of URL strings that drove the body. Empty array `[]` is allowed if nothing was found, but then the body should be the one-line no-change statement.

After writing, validate each file (for example `python3 -c "import json,sys; json.load(open(sys.argv[1]))" drafts/<KEY>.json`) and check that no `body` contains an em-dash, a URL or markdown syntax. Then report the seven draft paths and a one-line summary per goal, and **stop**. Do not post.

## House style

- **No em-dashes anywhere** (in `body`, in your report, anywhere). Substitute a period, colon, comma or parentheses.
- Tight, factual sentences. No filler, no hype, no "exciting progress".
- Dates in the form used by the existing updates ("Oct 20", "Sept 23", "Jan 2027").

## Gotchas

- **Egress block.** Raw GraphQL to `xsolla.atlassian.net` fails inside Claude cloud sessions with `curl: (56) CONNECT tunnel failed, response 403` (the egress proxy refuses the host), but works from a GitHub Actions runner. Use the MCP `getGoal` path for research. This is network policy, not a bad token.
- **`previous_update_summary` is null for the four new goals** (XSOLLA-10661, 10662, 10663, 10664) on the first run. Write JSON `null`, use the 14-day window, and draft a first update. Never assume a prior update exists.
- **Status is passthrough.** Copy `status.value` verbatim. Only deviate if a hard external deadline is demonstrably slipping.
- **This skill never posts.** No GraphQL, no `post-atlas-update.sh`, no `goals_createUpdate`, no writes to Atlas. Posting is `execution/post_goal_updates.py` (Stage B).
- **`drafts/` is gitignored.** Drafts must never be committed or pushed. Do not `git add` them.
- **One post, max 280 characters, "Key wins:" format.** Count with a script. Stage B rejects longer bodies; it never chunks.
- **cloudId is top-level.** Passing it inside `inputs` makes the execute call fail.
- Keep `getGoal` calls to `limits.updates: 3`. Only the most recent update feeds `previous_update_summary`; the other two help you see whether a theme keeps repeating.
