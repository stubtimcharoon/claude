---
name: xla-pages-atlas-update
description: Researches and publishes bi-weekly Atlas goal updates for the five XLA Pages goals. Pulls signal from Slack (primary), Jira, Confluence, and Drive, drafts a bulleted ADF summary with inline links, and posts via goals_createUpdate. Runs on the same Wednesdays as xpn-goal-update. Use when posting bi-weekly Atlas progress updates for XLA Pages.
---

# XLA Pages Atlas Update Skill

Posts bi-weekly updates to five XLA Pages Atlas goals via `goals_createUpdate`. One short paragraph per goal in "Key wins:" format (Atlas caps the summary at 280 visible characters). **Status defaults to the goal's current `state.value`** (passthrough). Only change it when signal clearly warrants.

## Constants

- GraphQL endpoint: `https://xsolla.atlassian.net/gateway/api/graphql` (Basic auth: `ATLASSIAN_EMAIL:ATLASSIAN_API_TOKEN`).
- Every op needs `@optIn(to: "Townsquare")`.
- `containerId`: `ari:cloud:townsquare::site/9dfc393f-ac2d-4cef-8b1c-0657da26067f`.
- Update page: `https://home.atlassian.com/o/baede55a-3fe5-4ac5-a2e3-6467bef08ffe/s/9dfc393f-ac2d-4cef-8b1c-0657da26067f/goal/<KEY>/updates`.

## Required env

`ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` (classic / unscoped), `ATLASSIAN_SITE`.

Optional (each source skipped silently if its var is unset):
- `SLACK_BOT_TOKEN`: Slack `search:read`. **Primary research source.**
- `GOOGLE_OAUTH_TOKEN`: `drive.readonly` + `calendar.events` scopes.

## Goals

| Key | Name | Focus | Key tickets | Key people |
|---|---|---|---|---|
| XSOLLA-8722 | Platform Infrastructure | Shop Builder, Xsolla ID, Backpack, UGC-S service layer. Platform arch by Q2 2026. | XLAPAGES-65, 68, 69, 26, 118; DEVALL-1512, 714, 824 | Jeff Greenberg, Denis Desiatov, Victoria Zabolotnykh, Stas Kapinus, Artem Liubutov |
| XSOLLA-8723 | XLA Pages Build | Page frames (Payment/Game/Influencer/Telecom/Retail), 8 MVP plugins, PRD, Figma, Jira plan. Q3 2026 launch. | XLAPAGES-26, 64–67, 27, 51, 118 | Aleksandr Belomoev, Kirill Tokarev, Jeremy MacKay, Sam Tubtimcharoon |
| XSOLLA-8731 | SEO & Organic Traffic | SEO foundation for 10k+ auto-generated pages: meta, sitemap, canonicalization, hreflang, AI-search impact. | XLAPAGES-29, 83, 90–92 | Tyler Erickson, Kirill Tokarev, Denis Desiatov |
| XSOLLA-8733 | ELIAA | Affiliate attribution baked into Pages. Blocked on team ownership; acquihire preferred path. Default `at_risk`. | XLAPAGES-14, 70, 113 | Kirill Tokarev, Jeremy MacKay, Maxim Silaev |
| XSOLLA-8861 | Payments MVP / Paze | First live XLA Payment Page with real partner by 2026-06-15. Primary: Paze (hard deadline). Secondary: ShopeePay. | XLAPAGES-71, 111, 112; DEVALL-1512, 639, 1289 | Kirill Tokarev, Aleksandr Belomoev, Sam Tubtimcharoon |

## Step 1: Resolve each goal

Call `goals_byKey(goalKey, containerId)` and record `id` (ARI), `state.value` (= passthrough status), `latestUpdate.creationDate`. **Skip goals whose last update is <3 days old**: the helper script handles this automatically.

## Step 2: Research (Slack primary, then supplements)

Window: since each goal's `latestUpdate.creationDate` (fall back to 30 days). Caps per source: **Slack 15, Jira 20, Confluence 10, Drive 10.**

### Slack: primary
Channel-scoped first: `in:<#C09JA0JH17V>` (`#xla-pages-workgroup`, private, the canonical workgroup). Then keyword search across public channels (e.g. "Paze", "ELIAA", "SEO PRD", "gap analysis") only if channel-scoped is thin.

```bash
[ -z "$SLACK_BOT_TOKEN" ] || curl -sS -G -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  --data-urlencode "query=in:<#C09JA0JH17V> after:<SINCE>" \
  --data-urlencode 'count=15' https://slack.com/api/search.messages
```

### Jira: supplement
Hit each goal's key tickets via `getJiraIssue`, plus one JQL: `project = XLAPAGES AND updated >= "<SINCE>" ORDER BY updated DESC` (cap 20).

### Confluence: supplement
One CQL: `space = "XNTWRK" AND lastmodified >= "<SINCE>" ORDER BY lastmodified DESC` (cap 10).

### Drive: optional supplement
Skip unless `GOOGLE_OAUTH_TOKEN` set. Query: `fullText contains 'XLA Pages' and modifiedTime > '<SINCE>T00:00:00Z'`.

## Step 3: Write the update (bullets only)

For each goal, an ADF doc with **one `bulletList`** of 4–6 list items. No headings, no long-form prose.

Rules:
- Each bullet = one specific fact: decision, ticket, person, blocker, shipped scope. No filler.
- Every Jira key, Confluence page, and Slack permalink must be a hyperlinked `text` node (text + `link` mark): never bare URL.
- Order most important first.
- Don't repeat content from the prior update unless still current.

Shape: `{ "version": 1, "type": "doc", "content": [{ "type": "bulletList", "content": [<listItem>...] }] }`. A `listItem` wraps a `paragraph` whose content is `text` nodes (some carrying a `link` mark).

## Step 4: Publish

Write the ADF to `/tmp/<KEY>.adf.json`, then call the helper:

```bash
scripts/post-atlas-update.sh "$GOAL_KEY" "$STATUS_PASSTHROUGH" "/tmp/$GOAL_KEY.adf.json"
```

The script resolves the ARI, applies the 3-day duplicate-guard, stringifies the ADF, posts the mutation, and prints `update.url`. Collect every URL for Step 5. If any goal fails, surface `errors[].message` but continue with the rest.

## Step 5: Schedule review reminder (Google Calendar)

After all goals post, create **one** event on `s.tubtimcharoon@xsolla.com`'s primary calendar:

- Summary: `Review Atlas monthly updates`
- Start: `now + 2h`, end: start + 30 min, time zone: `Asia/Bangkok`
- Reminder: one `popup` at 0 minutes
- Description: one line per posted goal: `<a href="$URL">$KEY</a> · $STATUS`: joined with `<br>`

Workflow path (curl), skipped silently if no token / wrong scope:

```bash
[ -z "$GOOGLE_OAUTH_TOKEN" ] || curl -sS -X POST \
  -H "Authorization: Bearer $GOOGLE_OAUTH_TOKEN" -H "Content-Type: application/json" \
  --data "$EVENT_JSON" \
  "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none"
```

Interactive (Claude Code) path: use the `mcp__claude_ai_Google_Calendar__create_event` tool with the same fields.

## Gotchas

- `@optIn(to: "Townsquare")` is mandatory on every op.
- Use a **classic** API token: scoped tokens lack Townsquare access.
- `summary` is a **String scalar**: pass `JSON.stringify(adf)`, not the ADF object. The helper script handles this.
- Status defaults to passthrough (the goal's current `state.value`). Change only when signal explicitly warrants.
- If a research source errors, log and continue: never fail the whole run on one source.
- **Atlas hard-caps `summary` at 280 visible characters.** Over that returns `"That's a pretty long update mate..."` with `success: false`. Per goal, use a single short paragraph in `"Key wins: <comma list>. <follow-up>."` format: no bullets, no headings, no inline links. Count before posting and trim phrases until ≤ 280 chars.
