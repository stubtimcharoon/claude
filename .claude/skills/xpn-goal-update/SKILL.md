---
name: xpn-goal-update
description: Reads the latest XPN Builders & Sellers Sync page in Confluence (children of XNTWRK/23096623175), converts it into a themed bulleted ADF, posts as a bi-weekly Atlas goal update on XSOLLA-7370 via goals_createUpdate, and schedules a Google Calendar reminder 2h later to spot-check. Use for bi-weekly XPN progress posts.
---

# XPN Goal Update Skill

Posts a bi-weekly update to Atlas goal **XSOLLA-7370** (XPN program). One ADF doc grouped by theme (BD, Platform & Product, AI & Automation, IR, Marketing, Revenue, Blockers, Next 2 weeks). Status defaults to the goal's current `state.value` (passthrough); change only on explicit signal.

## Constants

- GraphQL endpoint: `https://xsolla.atlassian.net/gateway/api/graphql` (Basic auth: `ATLASSIAN_EMAIL:ATLASSIAN_API_TOKEN`).
- Every op needs `@optIn(to: "Townsquare")`.
- `containerId`: `ari:cloud:townsquare::site/9dfc393f-ac2d-4cef-8b1c-0657da26067f`.
- Goal key: `XSOLLA-7370`. Update page: `https://home.atlassian.com/o/baede55a-3fe5-4ac5-a2e3-6467bef08ffe/s/9dfc393f-ac2d-4cef-8b1c-0657da26067f/goal/XSOLLA-7370/updates`.

## Required env

`ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` (classic / unscoped), `ATLASSIAN_SITE`.

Optional:
- `GOOGLE_OAUTH_TOKEN` — `calendar.events` scope (Step 5 reminder; skipped silently if missing).

## Goal scope

| Key | Initiative | Themes typically covered |
|---|---|---|
| XSOLLA-7370 | XPN — Xsolla Partner Network | Business Development · Platform & Product · AI & Automation · Influencer Relations · Marketing · Revenue · Blockers & Risks · Next 2 Weeks |

## Source of truth

The **XPN Builders & Sellers Sync** Confluence page (XNTWRK / id `23096623175`) is the parent of one child page per sync cycle. The skill always uses the **most recently created** descendant as the source. Do not invent content; convert what is on the page.

Parent page: https://xsolla.atlassian.net/wiki/spaces/XNTWRK/pages/23096623175/XPN+Builders+Sellers+Sync

## Step 1: Resolve the goal

Call `goals_byKey(goalKey: "XSOLLA-7370", containerId)`. Record `id` (ARI), `state.value` (= passthrough status), `latestUpdate.creationDate`. **Skip if last update is <3 days old** — the helper script handles this.

## Step 2: Fetch the latest sync page

1. **List descendants** of page `23096623175` and pick the most recently created.

   Interactive: `mcp__claude_ai_Atlassian__getConfluencePageDescendants` with `cloudId: xsolla.atlassian.net`, `pageId: 23096623175`. Sort the response by `createdAt` desc and take the first whose `createdAt` falls within the current run window (fall back to most recent if window is empty).

   Workflow (curl):
   ```bash
   curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
     "https://$ATLASSIAN_SITE/wiki/api/v2/pages/23096623175/descendants?limit=50&sort=-created-date"
   ```

   Abort if the latest descendant is older than the goal's last Atlas update — there's nothing new to post.

2. **Read the chosen page in body-storage form** (preserves headings, lists, links).

   Interactive: `mcp__claude_ai_Atlassian__getConfluencePage` with the child `pageId`.

   Workflow:
   ```bash
   curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
     "https://$ATLASSIAN_SITE/wiki/api/v2/pages/<CHILD_ID>?body-format=storage"
   ```

3. Record the child page URL and title — both go into the Atlas update so readers can click through to the full sync notes.

## Step 3: Convert the sync page into a single "Key wins" line

Atlas hard-caps the goal-update summary at **≈300 visible chars** — bulleted, themed bodies get rejected with `"That's a pretty long update mate..."`. So the posted update is **one short paragraph in `"Key wins: <comma list>. <follow-up sentences>."` format**.

Format:
- Single ADF `paragraph` node (no `bulletList`, no `heading`).
- Starts with `Key wins:` then 5–8 comma-separated phrases, each a concrete fact (decision, ticket, number, person). Period. Then 1–2 short follow-up sentences for things in progress, post-analysis, or partner-joining items.
- Preserve numbers exactly (revenue, sales, MoM%, creator counts). Don't paraphrase precision away.
- **No links inside the summary** — they don't fit and the goal page already shows the goal context. The richer themed view lives on the Confluence sync page itself.
- Cap the total at **~280 visible chars** to stay safely under the limit.

Example (real, ≈285 chars):
> Key wins: 3 Astragon campaigns live, first China publisher, TwitchCon EU 42 creators + panel approved, KYC legacy rollout complete, Lightstream Layer Groups shipped, v1 product dashboard live, Apr revenue $20.4K (+152% MoM). LATAM Bundle 591 sales wrapped, post-analysis in progress. Purple Tree joining XPN; XPN EU field trip in planning.

ADF shape:
```
{ "version": 1, "type": "doc", "content": [
  { "type": "paragraph", "content": [{ "type": "text", "text": "Key wins: …" }] }
] }
```

## Step 4: Publish

Write the ADF to `/tmp/XSOLLA-7370.adf.json`, then call the shared helper:

```bash
.claude/skills/xla-pages-atlas-update/scripts/post-atlas-update.sh XSOLLA-7370 "$STATUS_PASSTHROUGH" /tmp/XSOLLA-7370.adf.json
```

(Reuses the xla-pages-atlas-update helper — same auth, same ARI resolution, same 3-day duplicate guard, same JSON-string ADF handling.) Capture `update.url` for Step 5.

## Step 5: Schedule review reminder (Google Calendar)

After the Atlas post succeeds, create **one** event on `s.tubtimcharoon@xsolla.com`'s primary calendar:

- Summary: `Review XPN bi-weekly update`
- Start: `now + 2h`, end: start + 30 min, time zone: `Asia/Bangkok`
- Reminder: one `popup` at 0 minutes
- Description: `<a href="$URL">XSOLLA-7370 (XPN)</a> · $STATUS · week $ISO_WEEK`

Interactive (Claude Code): use `mcp__claude_ai_Google_Calendar__create_event` with the fields above.

Workflow path (curl), skipped silently if no token / wrong scope:
```bash
[ -z "$GOOGLE_OAUTH_TOKEN" ] || curl -sS -X POST \
  -H "Authorization: Bearer $GOOGLE_OAUTH_TOKEN" -H "Content-Type: application/json" \
  --data "$EVENT_JSON" \
  "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none"
```

`$EVENT_JSON` shape: `{summary, description, start:{dateTime,timeZone}, end:{...}, reminders:{useDefault:false, overrides:[{method:"popup", minutes:0}]}}`.

Skip silently (don't fail the run) if the calendar step errors — the Atlas post already succeeded.

## Gotchas

- `@optIn(to: "Townsquare")` is mandatory on every op.
- Use a **classic** Atlassian token — scoped tokens lack Townsquare access.
- `summary` is a **String scalar**: pass `JSON.stringify(adf)`, not the ADF object. The helper script handles this.
- Numbers in XPN updates aren't decorative — preserve exact figures from the sync page (e.g. `$20.4K +152% MoM`, `591 sales`, `42 creators`).
- Status defaults to passthrough. Only set `at_risk` if the sync page explicitly flags a hard external deadline slipping.
- If the latest descendant of `23096623175` is older than the goal's last Atlas update (no new sync since last post), exit cleanly — don't re-post stale content.
- **Atlas has a hard length cap on `summary`** (≈300 visible chars). Long docs come back as `"That's a pretty long update mate..."` with `success: false`. The "Key wins: …" single-paragraph format in Step 3 is built around this cap — don't reintroduce bullets, headings, or per-theme structure inside the summary.
