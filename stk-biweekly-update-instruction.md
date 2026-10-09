# STK Bi-Weekly Update - Standing Instruction

Last revised 2026-10-09. Tracked set reduced from 9 to 7.

Run autonomously, no clarifying questions. Never use Sam's own Jira follow-up
comments (ending in "#followup sent via 'send follow-up' action button") as a
signal. Never edit pages not created by Sam. No em dashes or en dashes anywhere.

Deploy one research agent per ticket in parallel. Orchestrator on Opus, agents on
Sonnet. The orchestrator verifies each agent actually ran and returned items. A
"no signals" verdict is only acceptable when the agent has searched thoroughly
across a good number of sources, and the orchestrator must show the tool-call
count per agent before accepting it.

## STEP 1: PERIOD

- Last 10 days through today. START = today minus 10 days, END = today.
- Slack after:/before: are exclusive, so search with after:(START-1) before:(END+1).

Known defect: the cycle is bi-weekly (14 days) but the window is 10 days, so
4 days of signal are dropped every cycle. Either widen the window to 14 days or
accept the gap deliberately. Flag it in the run output until it is decided.

## STEP 2: GATHER SIGNALS (Slack + Jira)

- Only use signals inside the period. If none: "No new signals this period."
- Broad keyword searches ("streamer", "marketing balance") return huge noisy
  results. Prefer slack_read_channel with oldest = unix timestamp of START on
  primary channels, then filter by date.
- Channels get renamed to #current-*. Use IDs:
  - #current-xla-pages-workgroup C09JA0JH17V
  - #chat C0B50D99484
  - #current-tiktok-shop C0AG8BGRKLJ (old name #proj-tiktok-shop)
  - #gamepix-overlay C0B64S8MP7X
- Also check the linked development ticket for each STK (listed below). Slack
  alone under-reports: the Sep 25 to Oct 5 run wrongly showed STK-2746 as having
  no activity because its work lives in Jira and Figma, not Slack.
- Sam's own follow-up comments must never be cited as a signal. They may be read
  only to avoid asserting "no activity" when the ticket plainly had some. If they
  are the only evidence, say "no citable signal this period" rather than "no
  activity".

### Tracked tickets (7)

1. **STK-3261 Overlay and Items Scope Planning** (Alexander Menshikov)
   Search "overlay items scope planning STK-3261". Also search broadly "gamepix
   overlay". Dev: XOVL board, epic XOVL-193; DEVALL-2303, DEVALL-2155.

2. **STK-3184 Streamer Prediction Mini-Game** (Alexander Menshikov)
   Search "gamepix streamer prediction mini-game STK-3184".
   Dev: MED-119 (spec, To Do), XPNDIS-177 (MVP, Backlog). Design DSD-395,
   DSD-1002, DSD-2414 all Done. Legal LEGALINT-24731 Closed.
   Ignore the Sep 8 Sam/Aleksandr Belomoev "minigame" DM (DSD-9761, unrelated).
   MIT-8149 is Disney Korea webshop work and is NOT related to this ticket.

3. **STK-2746 Streamer Brand Assets Briefing** (Sam)
   Search "streamer brand assets briefing STK-2746".
   Tracking: XLME-1530 (creator brand survey SQ-56, Done), IN board for TwitchCon
   activations, DSD-10365 for GCMX sponsorship assets.

4. **STK-1306 Currency Replenishment Kiosk in TikTok** (Alexander Menshikov)
   Jira title is "Discussion on Setting Up a Currency Replenishment Kiosk in
   TikTok". Read #current-tiktok-shop. Also search "tiktok shop kiosk currency
   strategy". Dev: DEVALL-1597 (Paused). Blocked on executive legal sign-off.

5. **STK-2422 Reseller Gift Cards - XPN** (Sam)
   Search "reseller gift cards XPN InComm STK-2422". Legal: LEGAL-6469
   (Pending Reporter Feedback, unsigned). No dev ticket yet, by design.

6. **STK-960 Payment Pages - Project Coordination and Design Revamp**
   (Kirill Tokarev)
   PRIMARY: read #current-xla-pages-workgroup. Also search "xsolla pages payment
   pages STK-960". Dev: DEVALL-1656 (Plugin Approved), DEVALL-2245,
   XLAPAGESN-203, XLAPAGESN-207.

7. **STK-4513 Omni Chat / Overlay Concept** (Alexander Menshikov)
   PRIMARY: read #chat. Also search "STK-4513 omni chat overlay".
   Dev: MED-205 (In Progress), MED-294, MED-297, MED-298, XLAPAGESN-214.

### Retired, do not track

- STK-1433 - No Longer Needed.
- STK-2541 Xsolla Reseller Program XPN - 8 Done, 9 Oct 2026. Build continues in
  DEVALL-59 and MAX-115.
- STK-956 Marketing Balance: Influencer Engagement Strategy - 8 Done,
  9 Oct 2026. Live-service work continues in OFWTECH.

Open follow-up: the influencer engagement half of STK-956 has no home. If a
replacement STK is opened for it, add it to the tracked set.

## STEP 3: CREATE CONFLUENCE PAGE

- cloudId: 9dfc393f-ac2d-4cef-8b1c-0657da26067f
- spaceId: 22259598233
- parentId: 24751538613
- title: STK Weekly Updates - [START] - [END], [YEAR] (plain hyphens)
- contentFormat: markdown

Per ticket:

```
### [STK-XXXX](https://xsolla.atlassian.net/browse/STK-XXXX) - Title

**Update:** max 3 sentences, max 15 words each, period signals only

**Next Steps:** what comes next based on signals

**Sources:** Slack channels, Jira tickets, dates
```

Use the Jira summary as the title, not a remembered one. Several differ from
earlier versions of this instruction.

End the page with: `_Generated: [today] | Next update: ~[today + 14 days]_`

Do NOT post any Jira comments. Confluence only.

Publish via the Atlassian MCP if it responds. If it shows needs_reconnect, say so
and ask the user to reauthorize the connector. There is no CLI or REST fallback:
this container has no acli, no Jira token, and xsolla.atlassian.net is blocked by
the environment network policy. If publishing is impossible, save the page as
"STK Weekly Updates - ... (DRAFT).md" in this folder and say so.

## STEP 4: FOLLOW-UP CHECK (read-only)

Run JQL:

```
issueKey in (STK-3261, STK-3184, STK-2746, STK-1306, STK-2422, STK-960, STK-4513)
AND updated >= "YYYY-MM-DD" (today)
```

Report a two-column checklist: ticket key + Posted or MISSING (comment created
today, excluding Sam's own meta follow-up comments). Do not post comments.

## STEP 5: CLOSE CANDIDATES

STK is a planning board. An STK ticket is Done when the plan, product definition,
PRD and design are complete and submitted to devs. It is not waiting for the
product to launch. Once work is allocated in DEVALL or another build board, the
STK can be marked 8 Done.

Each run, assess every tracked ticket against that test and report:
- the linked development ticket and its current status;
- whether the plan actually reached a dev team;
- a recommended transition where one applies.

Workflow transitions on the STK board: 51 "1 Original Request", 61 "2
Formalization", 71 "3 Task Breakdown", 81 "4 Off Track", 91 "5 No Resources",
101 "6 On Track", 111 "7 No Longer Needed", 121 "8 Done".

Do not recommend 8 Done where the plan never reached a dev team. Use 5 No
Resources for a complete plan with no allocation, and 4 Off Track or 5 No
Resources for one blocked upstream. Draft the closing comment, link the core
development ticket, and let Sam transition it. Never transition a ticket without
being asked.

## FINAL OUTPUT

Page link (or draft path), the STEP 4 checklist, and the STEP 5 close candidates.
