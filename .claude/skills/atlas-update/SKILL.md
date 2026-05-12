---
name: atlas-update
description: Researches and publishes bi-weekly Atlas goal updates directly to each Atlas goal via the Atlassian Goals GraphQL API. For each goal, reads the correct goal scope, searches Slack, Confluence, Jira, and Google Drive for recent movements, then writes short bulleted and long-form updates with all relevant links and posts them with goals_createUpdate. Use when updating Atlas goals or posting bi-weekly progress updates.
---

# Atlas Goal Update Skill

This skill produces bi-weekly Atlas goal updates for the XLA Pages project. For each goal it researches recent activity, drafts a short bulleted form and a long form with all links, then **posts the update directly onto the Atlas goal** using the Atlassian Goals GraphQL API (`goals_createUpdate`). It does not write to Confluence.

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

For every goal key (XSOLLA-8722, 8723, 8731, 8733, 8861), call `goals_search` to resolve the human key to an Atlas ARI (`ari:cloud:townsquare:{siteId}:goal/{uuid}`) and pull the most recent update so you know the date to research from and what was already said:

```graphql
query Resolve($q: String!) {
  goals_search(first: 1, input: { search: $q }) @optIn(to: "Townsquare") {
    edges { node {
      id key name
      state { value }
      latestUpdate { creationDate status { value } newScore summary }
    } }
  }
}
```

Record `id` (the ARI you'll post against) and `latestUpdate.creationDate` (research window cutoff — use this date instead of the hard-coded `2026-04-12` examples below). Skip a goal if its `latestUpdate.creationDate` is within the last 3 days (likely duplicate run).

## Step 2: Research Each Goal

Run all of the following for each goal. Use the correct goal scope above — do not narrow searches to a single team or system.

### 2a. Jira — Fetch key epics and recent child tickets

Use `getJiraIssue` for each goal's key tickets. Extract status, description, assignee, and all comments.

Also run per goal:

```
project = XLAPAGES AND updated >= -30d ORDER BY updated DESC
```

And for Shop Builder / DevAll cross-cutting work:

```
project = DEVALL AND summary ~ "XLA" ORDER BY updated DESC
```

### 2b. Confluence — Search for recent pages

```
searchConfluenceUsingCql: space = "XNTWRK" AND lastmodified >= "2026-04-12" ORDER BY lastmodified DESC
```

Also search by goal-specific keywords: "Shop Builder", "gap analysis", "Xsolla ID", "Backpack", "games catalogue", "UGC", "Paze", "ELIAA", "SEO", "Tyler Erickson".

### 2c. Slack — Search by goal scope (not just product name)

Use `slack_search_public_and_private`. Run these searches:

**XSOLLA-8722 (Platform Infrastructure):**
- `"shop builder" XLA pages architecture after:2026-04-12`
- `"gap analysis" XLA after:2026-04-12`
- `"Xsolla ID" XLA pages after:2026-04-12`
- `"games catalogue" OR "UGC" XLA after:2026-04-12`
- `DEVALL-1512 OR DEVALL-714 OR DEVALL-824 after:2026-04-12`
- Search channels: `#shop-builder-x-pages`, `#xla-pages-workgroup`, `#plugin-board-xsolla-pages-frames`

**XSOLLA-8723 (XLA Pages Build):**
- `XLA pages plan OR plugins OR frames after:2026-04-12`
- `"payment page" MVP PRD after:2026-04-12`
- `"plugin board" XLA after:2026-04-12`
- Search channels: `#xla-pages-workgroup`, `#plugin-board-xsolla-pages-frames`

**XSOLLA-8731 (SEO):**
- `"Tyler Erickson" SEO XLA after:2026-04-12`
- `SEO "xla pages" OR "x.la" after:2026-04-12`
- `sitemap OR canonicalization XLA after:2026-04-12`

**XSOLLA-8733 (ELIAA):**
- `ELIAA OR "every link" OR affiliate XLA after:2026-04-12`
- `"Shurik" affiliate pages after:2026-04-12`
- `XLAPAGES-113 OR XLAPAGES-70 after:2026-04-12`

**XSOLLA-8861 (Payments MVP):**
- `Paze XLA OR "payment page" after:2026-04-12`
- `DEVALL-1512 OR DEVALL-639 OR DEVALL-1289 after:2026-04-12`
- `ShopeePay after:2026-04-12`
- Search channels: `#shop-builder-x-pages`, `#xla-pages-workgroup`

### 2d. Google Drive — Search for recent documents

Use `search_files` with: `fullText contains 'XLA Pages' and modifiedTime > '2026-04-12T00:00:00Z'`

Also search: `fullText contains 'Paze'`, `fullText contains 'ELIAA'`, `fullText contains 'games catalogue'`.

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

For each of the five goals, post a separate update via `goals_createUpdate`. The `summary` field must be an ADF (Atlassian Document Format) document — combine the short bullets and long prose into a single body. Use the helper script `scripts/post-atlas-update.sh` (preferred) or call the mutation directly:

```graphql
mutation Post($input: goals_CreateUpdateInput!) {
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
- `summary` — ADF doc; see template below
- `score` — optional 0–100 progress estimate; only set when there is a measurable milestone signal
- `targetDate` — only include if the goal's target is genuinely shifting; format `{ date: "YYYY-MM-DD", confidence: DAY }`

### ADF summary template

Produce one ADF doc per goal containing a **Short** heading with a bullet list, then a **Long** heading with prose paragraphs. Hyperlinks are `text` nodes carrying a `link` mark — every Jira key, Confluence page, Slack permalink, and Drive URL surfaced in research must be linked, not bare text.

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

### After posting

- Read back `data.goals_createUpdate.success` — abort the run if any goal returns `false` and surface the `errors[].message`.
- Print the returned `update.url` for each goal so the operator can spot-check.

## Gotchas

- The `@optIn(to: "Townsquare")` directive is required — without it, goals fields return empty.
- Goal ARIs are **site-scoped**. Don't reuse them across orgs.
- Scoped API tokens currently miss Townsquare scopes; use a classic API token if `goals_search` returns auth errors.
- `goals_search` matches name, tags, and key — searching by the bare key (`XSOLLA-8722`) is the reliable lookup path.
- Don't post if `latestUpdate.creationDate` is within the last 3 days — biweekly cron retries can double-post.

## Quality Rules

- Understand the full goal scope before writing — do not reduce a cross-system goal to one team
- Every bullet must reference a specific fact, person, ticket, or decision
- Long form must have at least 3 inline links per goal where available
- If a Slack message, Confluence page, or Drive doc contains relevant signal, link to it directly
- Do not repeat content from the previous update unless it is still the most current status
