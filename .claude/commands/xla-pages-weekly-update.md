---
description: Research and publish the XLA Pages weekly update page in Confluence
argument-hint: "[optional: date override, e.g. 2026-09-23]"
---

# XLA Pages weekly update

Produce one Confluence page summarising the five parallel XLA Pages workstreams, then
update the standing status table. Reference output: page 25130106943,
"XLA Pages Weekly Update - September 9, 2026". Read it before writing anything, it is
the format of record.

Run `date +%Y-%m-%d` first. Call the result RUN_DATE. Use `$ARGUMENTS` instead if a date
was passed.

## Hard rules

- No em dashes anywhere. Use a hyphen, comma, colon, or period.
- Bullets are FRAGMENTS, not sentences. No subject-verb-object, no connectives, no
  "which means", no explaining. Write "Vova is the dev, onboarded Aug 31", not
  "Vladimir Melekhin has been onboarded as the developer since August 31". Under 15
  words per bullet. Cut every word that is not load-bearing.
- Jira is READ ONLY. Never edit, comment on, or transition a ticket.
- Never post to Slack. Reading Slack is fine, posting is not.
- Only two writes are permitted: update page 25128960289, and create one new child page
  under page 24756453805.
- LINK STYLE: no smart links, no link cards, no `data-card-appearance` anywhere.
  Hyperlink the ticket key itself inline:
  `<a href="https://xsolla.atlassian.net/browse/DSD-8749">DSD-8749</a>`. Cards pull the
  full Jira summary through the API and blow out the column width. Confluence pages get
  a plain `<a href>` on a short label such as "PRD" or "tracker". There is no links
  column, links live in the sentence that names the thing.
- Atlassian cloudId: `9dfc393f-ac2d-4cef-8b1c-0657da26067f` (xsolla.atlassian.net).

## What counts as signal

Jira ticket states alone are near worthless here. "In Progress" and "To Do" say nothing
about whether work is moving. Real state lives in three places, in this order:

1. **Google Calendar meeting notes.** Search Calendar for "Xla Pages - team", take the
   most recent instance before RUN_DATE, read its "Notes by Gemini" attachment via
   Google Drive `read_file_content`. Usually the freshest and most authoritative source,
   often ahead of Slack and Jira because meeting decisions have not been written back
   yet. Gemini's transcription mangles product names: "Zola" means "XLA", "Exola" means
   "Xsolla". Normalize silently. If a term is unclear and unattested anywhere else, do
   not invent a meaning, note the uncertainty instead. Watch for brand new workstreams
   raised in a meeting and add a row for any, flagging it for confirmation.
2. **Slack** `#current-xla-pages-workgroup`, channel `C09JA0JH17V`, last two to three
   weeks. Kirill Tokarev, Aleksandr Belomoev, Rene Valen, Vladimir Melekhin and Andrey
   Pyanzin post the real state here.
3. **Jira and Confluence**, for confirmation only, and to find where a design request
   actually sits in a queue. A request in Backlog or Approval is not moving, whatever
   anyone claims.

Where these disagree, trust meeting notes, then Slack, then Jira, and say so in the
report. If a source is unreachable or genuinely ambiguous, write "not checked this week"
in that cell rather than guessing.

## The five workstreams

Baseline as of the Sep 9, 2026 meeting, so you can tell what changed:

- **Pages (core dev)**, owner Rene Valen. Vova (Vladimir Melekhin) targets MVP by end of
  September, two weeks testing after. Payment blocker closed: 5 providers confirmed,
  Belomoev sending logos, text, descriptions. Game list blocker closed differently:
  10-game shortlist dropped, sourcing from the UGC catalog (~200 games) via Andrey
  Pyanzin. Figma confusion closed by pointing at Fan's (XPN) working prototype. Tickets:
  DEVALL-1656 (Vova's plugin ticket), DEVALL-1512 (paused payment page ticket). Docs:
  Confluence 25090556268 (October MVP PRD, Rene owns), 24441520165 (Payment Page MVP
  v2.0, stale since Apr 15).
- **B2C event items**, owner Sam and Rene Valen, TGS Sep 17. Design done, Sep 4
  walkthrough cut claim to two steps. Sam raised whether it needs Backpack integration at
  all, unresolved. If it does: Backpack "further delayed" per the Aug 20 Xsolla ID sync,
  Van Pham targets mid November. Epic BACKPACK-1282 (query
  `parent = BACKPACK-1282 ORDER BY key ASC` with only summary, status, assignee, updated,
  labels, or the response is too large to read). Tracker: Confluence 25090425343 (DSGN).
- **3D item plugin**, owner Sam, no date set. Prototype done
  (`prototype.xsolla.dev/mini-apps/xla-3d-items`), needs a full designer. DSD-8749
  (Rozhko) sat in Approval since Sep 8. Design planning sessions run with Yulia
  Karpukhina.
- **The Tome**, owner Kirill Tokarev, kickoff Sep 10. A wiki-like page per 3D item:
  story, rarity, provenance, ownership chain. Kicked off with the Xsolla dev team. Not
  scoped against DSD-8749. Sits outside the Backpack dependency, its constraint is dev
  and design bandwidth.
- **Social network (XLA Profile)**, owner Aleksandr Belomoev, no date set. PRD Confluence
  25122406554 published Sep 8, prototype `prototype.xsolla.dev/mini-apps/xla-user-pages-mock`
  stale at v0.1.9 from July 15. DSD-2737 (Profile Plugin, Sandro) in Backlog. Open
  decisions D-1 (release owner) and D-4 (collision with the October MVP, claim and
  Backpack out of October scope) both unresolved. The decisions table has gaps: no D-5,
  section 6.5 cites an absent D-12, D-6 has no named decision maker.

## Step 1: update the standing table

Update Confluence page 25128960289 in place, `contentFormat: "html"`. Call
`getContentFormatGuide` with `toolName: "updateConfluencePage"` first.

- Read it first. Refresh only the Status and "What's actually true" cells that actually
  changed. Leave the Links column and every `data-colwidth` value alone.
- Preserve existing `data-local-id` values on any status lozenge whose text is unchanged.
- Its title carries a date. Retitle to the same pattern with RUN_DATE so it is not stale.
- If it still lacks a Tome row, add one matching the existing column structure.
- `versionMessage` names the run date.

## Step 2: create the weekly page

New child page under 24756453805 ("XLA Pages Cadence Updates"). It lives in space
`~7120204b542ae7645d4db1a0eb96a12caed4ce` (Sam's personal space), NOT XNTWRK. Pass that
space key as `spaceId` or the create returns 404.

- Title: `XLA Pages Weekly Update - [Month D, YYYY]` from RUN_DATE.
- `contentFormat: "html"`.
- Structure:
  1. Info panel, one line: the week, plus a plain hyperlink to page 25128960289 reading
     "Parallel Workstreams Status".
  2. One table: `<table data-layout="full-width" data-display-mode="fixed">`, four
     columns, exact headers and widths: "Workstream" 160, "Status" 110,
     "Current status" 430, "Next steps" 460.
  3. Rows in order: Pages (core dev), B2C event items, 3D item plugin, The Tome,
     Social network (XLA Profile).
  4. Workstream cell: the name, then the owner and the due date (or "No date set") on
     separate lines in `<em>`. Carry forward unless research changes them.
  5. Status cell: one bold status lozenge, one or two words, or it overflows the column.
     Red only when genuinely blocked, yellow for in progress, waiting, or newly
     reframed, green when done. Never a Jira status name.
  6. "Current status" cell, two parts: a single `<p>` of ONE sentence saying what the
     project is for a reader who does not know it (no status in it, stable week to
     week), then a `<ul>` of three to five fragment bullets of real state. Lead with what
     changed, from the meeting notes first if there was a meeting.
  7. "Next steps" cell: two to three bullets, each `<strong>Name</strong>: verb plus
     object`. Nothing else. No justification clause, the status column already carries
     the why.
  8. Close with a warning panel naming the cross-workstream pattern if one holds. This is
     the one place prose is allowed. Re-derive it, do not restate last week's. The
     picture shifts: on Sep 9 the Backpack dependency went from a certainty to an open
     question, and the Tome arrived outside it entirely.

## Step 3: report back

Print both page URLs, what changed since last week and which source established it,
anything marked "not checked this week" and why, any place the three sources disagreed,
and any owner inferred from a document rather than confirmed by a person. Do not post to
Slack.
