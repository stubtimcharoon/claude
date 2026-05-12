---
name: atlas-update
description: Researches and publishes monthly Atlas goal updates directly to each Atlas goal via the Atlassian Goals GraphQL API. For each goal, reads the correct goal scope, searches Slack, Confluence, Jira, and Google Drive for recent movements, then writes short bulleted and long-form updates with all relevant links and posts them with goals_createUpdate. Use when updating Atlas goals or posting monthly progress updates.
---

# Atlas Goal Update Skill

This skill produces monthly Atlas goal updates for the XLA Pages project. For each goal it researches recent activity, drafts a short bulleted form and a long form with all links, then **posts the update directly onto the Atlas goal** using the Atlassian Goals GraphQL API (`goals_createUpdate`). It does not write to Confluence.

## Publishing target

Each goal's update is posted to its own Atlas updates feed at:
`https://home.atlassian.com/o/baede55a-3fe5-4ac5-a2e3-6467bef08ffe/s/9dfc393f-ac2d-4cef-8b1c-0657da26067f/goal/<KEY>/updates`

- **GraphQL endpoint:** `https://xsolla.atlassian.net/gateway/api/graphql`
- **Auth:** Basic, `ATLASSIAN_EMAIL:ATLASSIAN_API_TOKEN` base64-encoded
- **Required directive:** `@optIn(to: "Townsquare")` on every query/mutation that touches goals fields

## Required environment

| Variable | Example | Notes |
|----------|---------|-------|
| `ATLASSIAN_EMAIL` | `sam@xsolla.com` | Account email for Basic auth |
| `ATLASSIAN_API_TOKEN` | `ATATT3x…` | Create at id.atlassian.com/manage-profile/security/api-tokens — must be a classic (unscoped) token, or include Townsquare scopes |
| `ATLASSIAN_SITE` | `xsolla.atlassian.net` | Site subdomain, no scheme |

### Optional research env (skill skips a source if its var is unset)

| Variable | Where to get it |
|----------|-----------------|
| `SLACK_BOT_TOKEN` | Slack app → OAuth & Permissions; scopes `search:read`, `channels:history`. Starts with `xoxb-…`. |
| `GOOGLE_OAUTH_TOKEN` | A short-lived OAuth access token with `drive.readonly` scope (refresh via service account or `gcloud auth print-access-token`). |

## Goal Definitions

Read and understand the full scope of each goal BEFORE searching. Do not narrow your research to a single team or ticket — each goal spans multiple systems.

### XSOLLA-8722 — Platform Infrastructure

**Scope:** Resolve all main infrastructure blockers required to build and ship XLA Pages. This covers Shop Builder (page assembly, plugin system, dynamic rendering), Xsolla ID (auth modal, SSO, PayStation token exchange), Backpack (overlay API, session inheritance), and the Universal Games Catalogue (UGC-S service layer, game metadata API). Goal: finalize platform architecture by Q2 2026.
**Atlas link:** https://home.atlassian.com/o/baede55a-3fe5-4ac5-a2e3-6467bef08ffe/s/9dfc393f-ac2d-4cef-8b1c-0657da26067f/goal/XSOLLA-8722/updates
**Key Jira tickets:** XLAPAGES-65, XLAPAGES-68, XLAPAGES-69, XLAPAGES-26, XLAPAGES-118, DEVALL-1512, DEVALL-714, DEVALL-824
**Key people:** Jeff Greenberg (arch gap analysis), Denis Desiatov (UGC), Victoria Zabolotnykh (Xsolla ID), Stas Kapinus (Backpack), Artem Liubutov (Shop Builder)

### XSOLLA-8723 — XLA Pages Build

**Scope:** Design, build, and deliver the full XLA Pages product — all page frames (Payment, Game, Influencer, Telecom, Retail) and all 8 MVP plugins. Includes PRD delivery, Figma flows, plugin board process, Jira plan, and coordinating the full build across Shop Builder, UGC, Xsolla ID, and Backpack. Target: Q3 2026 launch.
**Atlas link:** https://home.atlassian.com/o/baede55a-3fe5-4ac5-a2e3-6467bef08ffe/s/9dfc393f-ac2d-4cef-8b1c-0657da26067f/goal/XSOLLA-8723/updates
**Key Jira tickets:** XLAPAGES-26, XLAPAGES-64, XLAPAGES-65, XLAPAGES-66, XLAPAGES-67, XLAPAGES-27, XLAPAGES-51, XLAPAGES-118
**Key people:** Aleksandr Belomoev (product/PRD), Kirill Tokarev (strategy), Jeremy MacKay (Shop Builder alignment), Sam Tubtimcharoon (process/plan)

### XSOLLA-8731 — SEO & Organic Traffic

**Scope:** Build the SEO foundation for 10,000+ auto-generated XLA pages. Covers meta tag and structured data strategy, programmatic sitemap generation, canonicalization rules, crawl/indexing monitoring, URL structure, and multi-language support. Also tracks the strategic impact of AI on organic search. Owner: Tyler Erickson.
**Atlas link:** https://home.atlassian.com/o/baede55a-3fe5-4ac5-a2e3-6467bef08ffe/s/9dfc393f-ac2d-4cef-8b1c-0657da26067f/goal/XSOLLA-8731/updates
**Key Jira tickets:** XLAPAGES-29, XLAPAGES-83, XLAPAGES-90, XLAPAGES-91, XLAPAGES-92
**Key people:** Tyler Erickson, Kirill Tokarev, Denis Desiatov (catalogue/SEO field overlap)

### XSOLLA-8733 — ELIAA (Every Link Is An Affiliate)

**Scope:** Make every link on XLA Pages carry attribution — building the affiliate infrastructure directly into the page layer. Per Shurik's directive, all affiliate offerings must be built around and for Xsolla Pages, aligned with creator, telecom, and non-gaming platform offerings. Currently blocked on team ownership and technical integration design. Preferred path: acquihire or acquisition of an experienced team.
**Atlas link:** https://home.atlassian.com/o/baede55a-3fe5-4ac5-a2e3-6467bef08ffe/s/9dfc393f-ac2d-4cef-8b1c-0657da26067f/goal/XSOLLA-8733/updates
**Key Jira tickets:** XLAPAGES-14, XLAPAGES-70, XLAPAGES-113
**Key people:** Kirill Tokarev, Jeremy MacKay (escalating to Moin), Maxim Silaev (potential contact)

### XSOLLA-8861 — Payments MVP / First Partner Go-Live

**Scope:** Ship the first live XLA Payment Page with a real partner by June 15, 2026. Primary partner: Paze (hard deadline tied to their merchant marketing campaign). Secondary: ShopeePay. Covers partner onboarding, page config, content review cycle, Shop Builder integration, DevAll ticket process, and go-live sign-off. Vertical priority: payments → telecoms → retail.
**Atlas link:** https://home.atlassian.com/o/baede55a-3fe5-4ac5-a2e3-6467bef08ffe/s/9dfc393f-ac2d-4cef-8b1c-0657da26067f/goal/XSOLLA-8861/updates
**Key Jira tickets:** XLAPAGES-71, XLAPAGES-111, XLAPAGES-112, DEVALL-1512, DEVALL-639, DEVALL-1289
**Key people:** Kirill Tokarev, Aleksandr Belomoev, Sam Tubtimcharoon

## Step 1: Resolve each goal and read its latest update

For every goal key (XSOLLA-8722, 8723, 8731, 8733, 8861), call `goals_byKey` to resolve the human key to an Atlas ARI and pull the most recent update. The `containerId` is always `ari:cloud:townsquare::site/9dfc393f-ac2d-4cef-8b1c-0657da26067f`.

```graphql
query Resolve($key: String!, $cid: ID!) {
  goals_byKey(goalKey: $key, containerId: $cid) @optIn(to: "Townsquare") {
    id key name
    state { value }
    latestUpdate { creationDate status { value } newScore summary }
  }
}
```

Variables: `{ "key": "XSOLLA-8731", "cid": "ari:cloud:townsquare::site/9dfc393f-ac2d-4cef-8b1c-0657da26067f" }`

Record `id` (the ARI you'll post against) and `latestUpdate.creationDate` (research window cutoff). Skip a goal if its `latestUpdate.creationDate` is within the last 3 days (likely duplicate run).

## Step 2: Research Each Goal (MCP tools — Jira + Confluence)

Use the Atlassian MCP tools directly. No curl needed for research.

### 2a. Jira

For each goal's key tickets, call `getJiraIssue` with `cloudId: xsolla.atlassian.net` and `fields: ["summary","status","assignee","updated","description","comment"]`.

Then run JQL searches:

```
project = XLAPAGES AND updated >= "<SINCE>" ORDER BY updated DESC
project = DEVALL AND summary ~ "XLA" AND updated >= "<SINCE>" ORDER BY updated DESC
```

Use `searchJiraIssuesUsingJql` with `cloudId: xsolla.atlassian.net`.

### 2b. Confluence

Use `searchConfluenceUsingCql` with `cloudId: xsolla.atlassian.net`:

```
space = "XNTWRK" AND lastmodified >= "<SINCE>" ORDER BY lastmodified DESC
```

Also use the Rovo `search` tool for keyword lookups: "Shop Builder", "Paze", "ELIAA", "SEO", "Tyler Erickson", "gap analysis", "Xsolla ID", "UGC".

### 2c. Slack (skip if SLACK_BOT_TOKEN unset)

```bash
[ -z "$SLACK_BOT_TOKEN" ] && echo "Slack: skipping" || \
curl -sS -G -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  --data-urlencode 'query=<search terms> after:<SINCE>' \
  --data-urlencode 'count=20' \
  "https://slack.com/api/search.messages"
```

Per-goal Slack queries are listed in the Slack section below.

### 2d. Google Drive (skip if GOOGLE_OAUTH_TOKEN unset)

```bash
[ -z "$GOOGLE_OAUTH_TOKEN" ] && echo "Drive: skipping" || \
curl -sS -G -H "Authorization: Bearer $GOOGLE_OAUTH_TOKEN" \
  --data-urlencode "q=fullText contains 'XLA Pages' and modifiedTime > '<SINCE>T00:00:00Z'" \
  --data-urlencode 'fields=files(id,name,webViewLink,modifiedTime)' \
  "https://www.googleapis.com/drive/v3/files"
```

## Step 3: Write the Updates

For each goal, produce two versions.

### Short Form

- 5 to 7 tight bullets
- Each bullet = one specific action taken, decision made, ticket created, person confirmed, or blocker identified
- Include inline Jira/Confluence/Slack links
- Ordered: most important or most recent first
- Never write generic filler — every bullet must be verifiable from research

### Long Form

- 2 to 4 paragraphs of connected prose
- Cover what happened, what decisions were made, what is blocked, what is next
- Link every Jira ticket, Confluence page, Slack thread, and Drive doc that is relevant
- Call out owners by name where confirmed
- If no new signal exists for a goal since last update, say so explicitly

## Step 4: Publish to Atlas (one update per goal)

For each of the five goals, post a separate update via `goals_createUpdate`. Use the helper script `scripts/post-atlas-update.sh` (preferred) or call the mutation directly:

```graphql
mutation Post($input: TownsquareGoalsCreateUpdateInput!) {
  goals_createUpdate(input: $input) @optIn(to: "Townsquare") {
    success
    errors { message }
    update { id url creationDate updateType }
  }
}
```

Input fields:
- `goalId` — the ARI from Step 1
- `status` — `pending` | `on_track` | `at_risk` | `off_track` | `done` | `cancelled`. Choose based on signal: shipped scope → `on_track`; partner deadlines slipping or unresolved blockers → `at_risk`; missed milestones or no path forward → `off_track`. For XSOLLA-8733 (ELIAA) default to `at_risk` while team ownership is unresolved.
- `summary` — **JSON-stringified ADF** (a String scalar, not an object). Build the ADF doc, then pass `JSON.stringify(adf)` or `jq -c '.'` as the string value.
- `score` — optional 0–100 progress estimate; only set when there is a measurable milestone signal
- `targetDate` — only include if the goal's target is genuinely shifting; format `{ date: "YYYY-MM-DD", confidence: DAY }`

### ADF summary template

Produce one ADF doc per goal containing a **Short** heading with a bullet list, then a **Long** heading with prose paragraphs. Hyperlinks are `text` nodes carrying a `link` mark. After building the ADF object, **stringify it to a JSON string** before placing it in the `summary` field.

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 3 }, "content": [{ "type": "text", "text": "Short" }] },
    { "type": "bulletList", "content": [
      { "type": "listItem", "content": [{ "type": "paragraph", "content": [
        { "type": "text", "text": "Shop Builder gap analysis closed by " },
        { "type": "text", "text": "XLAPAGES-65", "marks": [{ "type": "link", "attrs": { "href": "https://xsolla.atlassian.net/browse/XLAPAGES-65" } }] },
        { "type": "text", "text": " — owner Jeff Greenberg." }
      ]}]}
    ]},
    { "type": "heading", "attrs": { "level": 3 }, "content": [{ "type": "text", "text": "Long" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "<2–4 paragraphs of prose with inline links>" }] }
  ]
}
```

When using the helper script, write the ADF doc to a `.json` file and pass the path — the script handles stringification automatically.

### After posting

- Read back `data.goals_createUpdate.success` — abort the run if any goal returns `false` and surface the `errors[].message`.
- Print the returned `update.url` for each goal so the operator can spot-check.
- Collect every successful `update.url` for use in Step 5.

## Step 5: Schedule review reminder via Google Calendar

After all goals have posted successfully, create one calendar event on `s.tubtimcharoon@xsolla.com`'s primary calendar **2 hours after post completion**. The event is a reminder to spot-check the posted updates while they are still fresh.

- **Summary:** `Review Atlas bi-weekly updates`
- **Start:** `now + 2h` (use the post-completion timestamp, not the script start)
- **End:** start + 30 min
- **Time zone:** `Asia/Bangkok` (operator's tz). Pass `timeZone: "Asia/Bangkok"` and naive ISO times — the API resolves them.
- **Reminders:** one `popup` reminder at 0 minutes (fires when the event starts).
- **Description:** one line per posted goal, with the goal key, status used, and the returned `update.url`. Format each as a clickable HTML anchor (`<a href="…">…</a>`) — Calendar renders HTML in the description.

### MCP path (interactive Claude Code session)

Call `mcp__claude_ai_Google_Calendar__create_event` with the fields above. The `description` accepts HTML.

### Workflow path (no MCP — curl)

```bash
[ -z "$GOOGLE_OAUTH_TOKEN" ] && echo "Calendar: skipping (no token)" || \
curl -sS -X POST \
  -H "Authorization: Bearer $GOOGLE_OAUTH_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- \
  "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none" <<JSON
{
  "summary": "Review Atlas bi-weekly updates",
  "description": "<a href=\"$URL_8722\">XSOLLA-8722</a> ($STATUS_8722)<br><a href=\"$URL_8723\">XSOLLA-8723</a> ($STATUS_8723)<br>…",
  "start": { "dateTime": "$START_ISO", "timeZone": "Asia/Bangkok" },
  "end":   { "dateTime": "$END_ISO",   "timeZone": "Asia/Bangkok" },
  "reminders": { "useDefault": false, "overrides": [{ "method": "popup", "minutes": 0 }] }
}
JSON
```

The `GOOGLE_OAUTH_TOKEN` used for the Drive research step in 2d must have the `https://www.googleapis.com/auth/calendar.events` scope as well. If only Drive scope is granted, the calendar step skips silently — never block the whole run on calendar failure.

## Gotchas

- The `@optIn(to: "Townsquare")` directive is required — without it, goals fields return empty.
- Goal ARIs are **site-scoped**. Don't reuse them across orgs.
- Scoped API tokens currently miss Townsquare scopes; use a classic API token if `goals_search` returns auth errors.
- Use `goals_byKey(goalKey, containerId)` to resolve a goal — `goals_search` is unreliable and accepts different arguments.
- `containerId` is always `ari:cloud:townsquare::site/9dfc393f-ac2d-4cef-8b1c-0657da26067f`.
- `summary` is a **String scalar** — pass a JSON-stringified ADF, not a raw ADF object. Passing an object yields "Invalid ADF".
- Don't post if `latestUpdate.creationDate` is within the last 3 days — monthly cron retries can double-post.
- This skill runs without MCP servers. Every research call is plain `curl`. If a curl returns non-200 / `"ok":false`, log it and continue — never fail the whole run because one source is down.

## Quality Rules

- Understand the full goal scope before writing — do not reduce a cross-system goal to one team
- Every bullet must reference a specific fact, person, ticket, or decision
- Long form must have at least 3 inline links per goal where available
- If a Slack message, Confluence page, or Drive doc contains relevant signal, link to it directly
- Do not repeat content from the previous update unless it is still the most current status
