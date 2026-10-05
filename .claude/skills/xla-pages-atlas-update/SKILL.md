---
name: xla-pages-atlas-update
description: Researches and publishes Atlas goal updates on the 8th and 22nd of every month for the five XLA Pages goals. Pulls signal from Slack (primary), Jira, Confluence, and Drive, drafts a short "Key wins:" paragraph per goal, and posts via goals_createUpdate. Runs on the same schedule as xpn-goal-update. Use when posting twice-monthly Atlas progress updates for XLA Pages.
---

# XLA Pages Atlas Update Skill

Posts twice-monthly updates (8th and 22nd) to five XLA Pages Atlas goals via `goals_createUpdate`. One short paragraph per goal in "Key wins:" format (Atlas caps the summary at 280 visible characters). **Status defaults to the goal's current `state.value`** (passthrough). Only change it when signal clearly warrants.

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
| XSOLLA-8722 | Platform Infrastructure | Shop Builder, Xsolla ID, Backpack, UGC-S service layer. Target date needs re-verifying against the live goal (the old "Q2 2026" is past). | XLAPAGES-65, 68, 69, 26, 118; DEVALL-1512, 714, 824 | Jeff Greenberg, Denis Desiatov, Victoria Zabolotnykh, Stas Kapinus, Artem Liubutov |
| XSOLLA-8723 | XLA Pages Build | Page frames (Payment/Game/Influencer/Telecom/Retail), 8 MVP plugins, PRD, Figma, Jira plan. Launch targeted 2026-10-15 per Kirill Tokarev; Rene Valen is PM, Vladimir Melekhin dev lead. | XLAPAGESN-174, 166; SB-8574, 8800, 8577 | Rene Valen, Vladimir Melekhin, Aleksandr Belomoev, Kirill Tokarev, Sam Tubtimcharoon |
| XSOLLA-8731 | SEO & Organic Traffic | SEO foundation for 10k+ auto-generated pages: meta, sitemap, canonicalization, hreflang, AI-search impact. | XLAPAGES-29, 83, 90–92 | Tyler Erickson, Kirill Tokarev, Denis Desiatov |
| XSOLLA-8733 | ELIAA | Affiliate attribution baked into Pages. **Maxim Silaev is product owner and is actively progressing the PRD**: ownership is resolved, do not describe this goal as blocked on ownership or pending an acquihire. Status is passthrough like every other goal. | XLAPAGES-14, 70, 113; STK-1090 | Maxim Silaev (product owner), Kirill Tokarev, Jeremy MacKay |
| XSOLLA-8861 | Payments MVP / Paze | First live XLA Payment Page with a real partner. Primary: Paze. Secondary: ShopeePay. The old 2026-06-15 deadline is past: re-verify the current target date against the live goal before citing one. | XLAPAGES-71, 111, 112; DSD-10293; DEVALL-1512, 639, 1289 | Kirill Tokarev, Aleksandr Belomoev, Sam Tubtimcharoon |

## Step 1: Resolve each goal

Call `goals_byKey(goalKey, containerId)` and record `id` (ARI) and `state.value` (= passthrough status). **Skip goals whose last update is <3 days old**: the helper script handles this automatically.

The helper script's own lookup requests only `id key name`, so it does **not** give you `state.value`. Query it yourself before posting:

```bash
curl -sS -X POST "https://$ATLASSIAN_SITE/gateway/api/graphql" \
  -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -H "Content-Type: application/json" -H "X-ExperimentalApi: opt-in" \
  --data '{"query":"query Resolve($k:String!,$c:ID!){goals_byKey(goalKey:$k,containerId:$c)@optIn(to:\"Townsquare\"){id key name state{value}}}","variables":{"k":"<KEY>","c":"ari:cloud:townsquare::site/9dfc393f-ac2d-4cef-8b1c-0657da26067f"}}'
```

Pass that `state.value` straight through as the status argument. Don't change a goal's status unless a hard deadline is actually slipping.

## Step 2: Research (Slack primary, then supplements)

Window: since the goal's previous Atlas update, falling back to **14 days** (one cycle, since runs land on the 8th and 22nd). Caps per source: **Slack 15, Jira 20, Confluence 10, Drive 10.**

### Slack: primary
Channel-scoped first: channel ID `C09JA0JH17V` (`#current-xla-pages-workgroup`, private, the canonical workgroup). Then keyword search across public channels (e.g. "Paze", "ELIAA", "SEO PRD", "gap analysis") only if channel-scoped is thin.

Interactive (Claude Code): `mcp__Slack__slack_read_channel` with `channel_id: C09JA0JH17V` and `oldest` set to the window start as a Unix timestamp, paginating with `cursor`; `mcp__Slack__slack_read_thread` for substantive threads. This is the path that works when the Atlassian connector is down, since Slack is a separate connector.

```bash
[ -z "$SLACK_BOT_TOKEN" ] || curl -sS -G -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  --data-urlencode "query=in:<#C09JA0JH17V> after:<SINCE>" \
  --data-urlencode 'count=15' https://slack.com/api/search.messages
```

### Jira: supplement
Hit each goal's key tickets via `mcp__Atlassian__getJiraIssue`, plus one JQL via `mcp__Atlassian__searchJiraIssuesUsingJql`: `project = XLAPAGES AND updated >= "<SINCE>" ORDER BY updated DESC` (cap 20). Note the active Jira project was migrated to **XLAPAGESN**, so query that key too.

### Confluence: supplement
One CQL via `mcp__Atlassian__searchConfluenceUsingCql`: `space = "XNTWRK" AND lastmodified >= "<SINCE>" ORDER BY lastmodified DESC` (cap 10).

### Drive: optional supplement
Skip unless `GOOGLE_OAUTH_TOKEN` set. Query: `fullText contains 'XLA Pages' and modifiedTime > '<SINCE>T00:00:00Z'`.

## Step 3: Write the update (one paragraph, 280 char hard cap)

For each goal, an ADF doc with **one `paragraph`** in `"Key wins: <comma list>. <follow-up>."` format. No bullets, no headings, no inline links: Atlas rejects anything over 280 visible characters.

Rules:
- Start with `Key wins:` then 4–7 comma-separated phrases, each a concrete fact: decision, ticket, person, blocker, shipped scope. No filler. Then 1–2 short follow-up sentences for work in progress.
- Order most important first.
- Preserve numbers exactly (counts, percentages, revenue). Don't paraphrase precision away.
- **No links in the summary**: they don't fit. Links belong in the Step 5 calendar description, which carries the clickable references for every Jira key, Confluence page, and Slack permalink that drove the update.
- Don't repeat content from the prior update unless still current.
- No em-dashes anywhere. Substitute a period, colon, parens, or comma.
- **Count the characters before posting** and trim phrases until ≤ 280.

Shape: `{ "version": 1, "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Key wins: …" }] }] }`.

## Step 4: Publish

Write the ADF to `/tmp/<KEY>.adf.json`, then call the helper:

```bash
scripts/post-atlas-update.sh "$GOAL_KEY" "$STATUS_PASSTHROUGH" "/tmp/$GOAL_KEY.adf.json"
```

The script resolves the ARI, applies the 3-day duplicate-guard, stringifies the ADF, posts the mutation, and prints `update.url`. Collect every URL for Step 5. If any goal fails, surface `errors[].message` but continue with the rest.

## Step 5: Schedule review reminder (Google Calendar)

After all goals post, create **one** event on `s.tubtimcharoon@xsolla.com`'s primary calendar:

- Summary: `Review Atlas bi-weekly updates (XLA Pages)`
- Start: `now + 2h`, end: start + 30 min, time zone: `Asia/Bangkok`
- Reminder: one `popup` at 0 minutes
- Description: HTML `<ul>` with one `<li>` per posted goal. Each list item: `<a href="$URL">$KEY</a> $NAME ($STATUS)`. Hyperlink the goal key, not the surrounding prose. Use the `<ul><li>` structure, not `<br>`-separated lines.

Workflow path (curl), skipped silently if no token / wrong scope:

```bash
[ -z "$GOOGLE_OAUTH_TOKEN" ] || curl -sS -X POST \
  -H "Authorization: Bearer $GOOGLE_OAUTH_TOKEN" -H "Content-Type: application/json" \
  --data "$EVENT_JSON" \
  "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none"
```

Interactive (Claude Code) path: use the `mcp__Google-Calendar__create_event` tool with the same fields.

If this skill and `xpn-goal-update` run in the same cycle, they each create their own reminder, so expect two events. To get a single combined reminder covering all six goals, run the two skills from one prompt and create one event at the end instead.

## Gotchas

- `@optIn(to: "Townsquare")` is mandatory on every op.
- Use a **classic** API token: scoped tokens lack Townsquare access.
- `summary` is a **String scalar**: pass `JSON.stringify(adf)`, not the ADF object. The helper script handles this.
- Status defaults to passthrough (the goal's current `state.value`). Change only when signal explicitly warrants.
- If a research source errors, log and continue: never fail the whole run on one source.
- **Where this skill can actually run.** Atlas goal updates exist only behind the Townsquare GraphQL endpoint, which needs direct HTTPS to `xsolla.atlassian.net`. The Atlassian MCP connector does **not** expose `goals_byKey` or `goals_createUpdate`, so a working Confluence/Jira connector is not a substitute. Run this skill from GitHub Actions (`.github/workflows/xla-pages-atlas-update.yml`) or any environment with unrestricted egress, not from a sandboxed Claude Code session.
- **Distinguish a network block from a bad token.** `curl: (56) CONNECT tunnel failed, response 403` (or any `HTTP:000`) is the egress proxy refusing the host, before auth is ever attempted. That is network policy, not credentials: do **not** retry with another token, and do not conclude the token rotated. Confirm with `curl -sS "$HTTPS_PROXY/__agentproxy/status"` and look for `connect_rejected` against `xsolla.atlassian.net:443`. A genuine credential failure looks different: the connection succeeds and the API returns **401**, which does mean the token was rotated and needs replacing.
- When the endpoint is unreachable, don't fail silently: finish the research, save each drafted ADF to `/tmp/<KEY>.adf.json`, report the exact blocker plus every drafted summary so they can be posted from an allowed environment, and say clearly that nothing was posted.
- **Atlas hard-caps `summary` at 280 visible characters.** Over that returns `"That's a pretty long update mate..."` with `success: false`. Per goal, use a single short paragraph in `"Key wins: <comma list>. <follow-up>."` format: no bullets, no headings, no inline links. Count before posting and trim phrases until ≤ 280 chars.
