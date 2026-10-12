---
name: stk-biweekly-update
description: Researches and publishes the bi-weekly STK status page to Confluence for the 7 tracked STK initiatives. Pulls signal from Slack (primary) and Jira, writes one Update/Next Steps/Sources block per ticket, publishes under Sam's personal space, then reports a follow-up checklist and close candidates. Runs on the 8th and 22nd of every month. Use when running the STK bi-weekly update, STK weekly update, or STK initiative status page.
---

# STK Bi-Weekly Update Skill

Publishes the STK status page for the tracked STK initiatives and reports which
tickets still need a follow-up.

Last revised 2026-10-12.

## Run modes

This skill runs in two environments and they are not equivalent.

- **Cron (GitHub Actions)**: `claude --print --allowedTools "Bash"`. There is no
  Atlassian MCP and no subagents. Every call is curl from Bash, sequential.
  This is the default assumption below.
- **Interactive**: the Atlassian and Slack MCP tools and the Agent tool may be
  available. If they are, prefer them, and fan out one research agent per
  ticket in parallel (Opus orchestrating, Sonnet agents). The orchestrator must
  report the tool-call count per agent and only accept a "no signals" verdict
  from an agent that actually searched broadly.

## Hard rules

- Never cite Sam's own Jira follow-up comments as a signal. They end with
  `#followup sent via "send follow-up" action button`. They may be read only so
  the page can say "no citable signal this period" instead of a false "no
  activity".
- Never edit Confluence pages not created by Sam. This skill only creates.
- Never post Jira comments. Never transition a Jira issue.
- No em dashes or en dashes anywhere in the output.
- Do not invent signals. If a ticket has none, say so.

## Required env

`ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` (classic / unscoped), `ATLASSIAN_SITE`
(for example `xsolla.atlassian.net`), `SLACK_BOT_TOKEN` (needs `search:read` and
`channels:history`).

If `SLACK_BOT_TOKEN` is missing, run Jira only and say so on the page.
If any Atlassian variable is missing, stop and report. Do not publish a partial
page.

## Constants

- cloudId: `9dfc393f-ac2d-4cef-8b1c-0657da26067f`
- spaceId: `22259598233` (Sam's personal space)
- parentId: `24751538613`

## STEP 1: PERIOD

- Cadence is 14 days. START = today minus 14 days, END = today.
- Earlier versions used a 10 day window against a 14 day cadence, which dropped
  4 days of signal every run. Do not reintroduce that.
- Slack `after:` / `before:` are exclusive, so search with
  `after:(START-1) before:(END+1)`.
- For `conversations.history`, `oldest` is the unix timestamp of START.

## STEP 2: GATHER SIGNALS

Only use signals inside the period. If a ticket has none, its Update is
"No new signals this period."

Broad keyword searches ("streamer", "marketing balance") return huge noisy
results. Prefer channel history on the primary channels, then filter by date.

Channels get renamed to `#current-*`, so always use IDs:

| Channel | ID |
|---|---|
| #current-xla-pages-workgroup | C09JA0JH17V |
| #chat | C0B50D99484 |
| #current-tiktok-shop (was #proj-tiktok-shop) | C0AG8BGRKLJ |
| #gamepix-overlay | C0B64S8MP7X |

Slack calls:

```bash
# channel history since START
curl -sS -G -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  --data-urlencode "channel=C09JA0JH17V" \
  --data-urlencode "oldest=$START_EPOCH" \
  --data-urlencode 'limit=100' \
  https://slack.com/api/conversations.history

# keyword search
curl -sS -G -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  --data-urlencode "query=gamepix overlay after:$START_MINUS_1 before:$END_PLUS_1" \
  --data-urlencode 'count=20' \
  https://slack.com/api/search.messages
```

Jira calls:

```bash
# JQL search
curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" -G \
  -H "Accept: application/json" \
  --data-urlencode "jql=$JQL" \
  --data-urlencode 'fields=summary,status,assignee,updated' \
  "https://$ATLASSIAN_SITE/rest/api/3/search/jql"

# recent comments on one issue
curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" -G \
  -H "Accept: application/json" \
  --data-urlencode 'orderBy=-created' \
  --data-urlencode 'maxResults=5' \
  "https://$ATLASSIAN_SITE/rest/api/3/issue/STK-3261/comment"
```

Slack alone under-reports. The 25 Sep to 5 Oct run wrongly showed STK-2746 as
inactive because its work lives in Jira and Figma. Always also check each
ticket's linked development ticket below.

### Tracked tickets (7)

1. **STK-3261 Overlay and Items Scope Planning** (Alexander Menshikov)
   Search "overlay items scope planning STK-3261" and broadly "gamepix overlay".
   Channel C0B64S8MP7X. Dev: XOVL board, epic XOVL-193; DEVALL-2303, DEVALL-2155.

2. **STK-3184 Streamer Prediction Mini-Game** (Alexander Menshikov)
   Search "gamepix streamer prediction mini-game STK-3184".
   Dev: MED-119 (spec, To Do), XPNDIS-177 (MVP, Backlog).
   Design DSD-395, DSD-1002, DSD-2414 all Done. Legal LEGALINT-24731 Closed.
   Ignore the Sep 8 Sam / Aleksandr Belomoev "minigame" DM (DSD-9761, unrelated).
   MIT-8149 is Disney Korea webshop work and is NOT related to this ticket.

3. **STK-2746 Streamer Brand Assets Briefing** (Sam)
   Search "streamer brand assets briefing STK-2746".
   Tracking: XLME-1530 (creator brand survey SQ-56, Done), IN board for TwitchCon
   activations, DSD-10365 for GCMX sponsorship assets.

4. **STK-1306 Discussion on Setting Up a Currency Replenishment Kiosk in TikTok**
   (Alexander Menshikov)
   PRIMARY: channel C0AG8BGRKLJ. Also search "tiktok shop kiosk currency strategy".
   Dev: DEVALL-1597 (Paused). Blocked on executive legal sign-off.

5. **STK-2422 Reseller Gift Cards - XPN** (Sam)
   Search "reseller gift cards XPN InComm STK-2422".
   Legal: LEGAL-6469 (Pending Reporter Feedback, unsigned). No dev ticket yet,
   by design.

6. **STK-960 Payment Pages - Project Coordination and Design Revamp**
   (Kirill Tokarev)
   PRIMARY: channel C09JA0JH17V. Also search "xsolla pages payment pages STK-960".
   Dev: DEVALL-1656 (Plugin Approved), DEVALL-2245, XLAPAGESN-203, XLAPAGESN-207.

7. **STK-4513 Omni Chat / Overlay Concept** (Alexander Menshikov)
   PRIMARY: channel C0B50D99484. Also search "STK-4513 omni chat overlay".
   Dev: MED-205 (In Progress), MED-294, MED-297, MED-298, XLAPAGESN-214.

Use the Jira `summary` as the heading title, not the name above. Several titles
in older instructions were wrong.

### Retired, do not track

- STK-1433 - No Longer Needed.
- STK-2541 Xsolla Reseller Program XPN - 8 Done, 9 Oct 2026. Build continues in
  DEVALL-59 and MAX-115.
- STK-956 Marketing Balance: Influencer Engagement Strategy - 8 Done,
  9 Oct 2026. Live-service work continues in OFWTECH.

Open follow-up: the influencer engagement half of STK-956 has no home. STK-1732
"Xsolla influencers" (Aleksey Treschilov, 2 Formalization) is the obvious
candidate but is not formalized and is not Sam's. If a replacement STK is opened,
add it to the tracked set above.

### Keeping the list honest

Each run, confirm the set is still right:

```bash
# everything on the STK board that moved in the period
curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" -G \
  -H "Accept: application/json" \
  --data-urlencode "jql=project = STK AND updated >= \"$START\" ORDER BY updated DESC" \
  --data-urlencode 'fields=summary,status,assignee,updated' \
  "https://$ATLASSIAN_SITE/rest/api/3/search/jql"
```

The STK board is company-wide. Most daily churn is Grisha Romanyuk's escalation
bot running a bulk sweep around 09:00, which is not Sam's work. Sam's own
follow-up run is a tight cluster of `#followup` comments. Only treat a ticket as
newly in scope if Sam authored a follow-up on it. If one appears, report it and
stop; do not silently add it to the page.

## STEP 3: CREATE THE CONFLUENCE PAGE

Title: `STK Weekly Updates - [START] - [END], [YEAR]` with plain hyphens, for
example `STK Weekly Updates - October 8 - October 22, 2026`.

Per ticket:

```
<h3><a href="https://xsolla.atlassian.net/browse/STK-XXXX">STK-XXXX</a> - Title</h3>
<p><strong>Update:</strong> max 3 sentences, max 15 words each, period signals only</p>
<p><strong>Next Steps:</strong> what comes next based on signals</p>
<p><strong>Sources:</strong> Slack channels, Jira tickets, dates</p>
```

End the page with:
`<p><em>Generated: [today] | Next update: ~[today + 14 days]</em></p>`

Publish with the v2 API. Body representation must be `storage` (XHTML), not
markdown: the v2 endpoint does not convert markdown.

```bash
curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" -X POST \
  -H "Content-Type: application/json" \
  "https://$ATLASSIAN_SITE/wiki/api/v2/pages" \
  -d @- <<JSON
{
  "spaceId": "22259598233",
  "parentId": "24751538613",
  "status": "current",
  "title": "$TITLE",
  "body": { "representation": "storage", "value": $BODY_JSON_STRING }
}
JSON
```

Build `$BODY_JSON_STRING` with `jq -Rs .` so the HTML is escaped correctly.

Confluence only. Do not post Jira comments.

If publishing fails, write the page to
`STK Weekly Updates - <START> - <END> (DRAFT).md` in the repo root, say so in the
run output, and exit non-zero so the cron surfaces as failed.

## STEP 4: FOLLOW-UP CHECK (read-only)

```
issueKey in (STK-3261, STK-3184, STK-2746, STK-1306, STK-2422, STK-960, STK-4513)
AND updated >= "<today>"
```

For each key, fetch its comments and decide Posted or MISSING: Posted means a
comment was created today by Sam. Report a two-column checklist. Do not post
comments.

## STEP 5: CLOSE CANDIDATES

STK is a planning board. An STK ticket is Done when the plan, product
definition, PRD and design are complete and submitted to devs. It is not waiting
for the product to launch. Once work is allocated in DEVALL or another build
board, the STK can be marked 8 Done.

Each run, assess every tracked ticket and report:

- the linked development ticket and its current status;
- whether the plan actually reached a dev team;
- a recommended transition where one applies.

Transitions on the STK board:

| ID | Status |
|---|---|
| 51 | 1 Original Request |
| 61 | 2 Formalization |
| 71 | 3 Task Breakdown |
| 81 | 4 Off Track |
| 91 | 5 No Resources |
| 101 | 6 On Track |
| 111 | 7 No Longer Needed |
| 121 | 8 Done |

Do not recommend 8 Done where the plan never reached a dev team. Use 5 No
Resources for a complete plan with no allocation, and 4 Off Track or 5 No
Resources for one blocked upstream. Draft the closing comment and name the core
development ticket, then leave the transition to Sam. Never transition a ticket.

Standing note: after a close, Grisha's automation asks the accountable person to
link a Confluence repository in the "Repository" field, and tells the supervisor
to move the initiative back to On Track if outcomes do not match the acceptance
criteria. Flag any recently closed STK whose Repository field is still empty.

## STEP 6: OUTPUT

Print the page URL (or the draft path), the STEP 4 checklist, and the STEP 5
close candidates. In cron this goes to the Actions log.
