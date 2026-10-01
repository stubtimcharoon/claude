# AFF Capture Pipeline

A Salesforce-style working surface over the GET-864 web shop capture-rate research.

- **Artifact:** https://claude.ai/artifact/Qc3EGAKypfg9iVdPTibzBx (private; share from the page's Share menu)
- **Source:** `GET-864_AFF_webshop_capture_rate.xlsx`, owner `e.borodianskiy@xsolla.com`, modified 2026-09-29
  (sha256 `34b5230b…29ddfd21`), tab `All web shops (499)` plus `Excluded (42)`
- **Window:** 90 days, 26.05.2026 to 26.08.2026. Per-month figures are that window divided by 3.

## Why this exists

The research ranks 499 Xsolla-hosted web shops by capture rate, the share of a game's
revenue going through the web shop rather than the mobile stores. It was research output
with no way to screen, prioritise or track outreach against it. The `Top 40` tab even
carries an empty `Priority` column, so the workflow was started in the sheet and dropped.

## The gate, and the tension in it

The default gate is **Xsolla web shop sales at or above $100k/month**. That gate selects
shops whose web shop already converts, which is close to the opposite of the research's
own thesis: the Bottom 40 carry $483M/month of mobile sales at 0.0017% to 0.840% capture,
and most of them have tiny web shop revenue *because* capture is near zero.

Measured, at the shipped thresholds:

| Gate | Leads | P0 | P1 | P2 | Out | Recoverable (P0-P2) | Bottom 40 caught |
|---|---|---|---|---|---|---|---|
| Web shop >= $100k/mo | 119 | 22 | 25 | 20 | 52 | $159.9M/mo | **2 of 40** |
| Underperformer upside | 91 | 34 | 33 | 16 | 8 | $194.8M/mo | 40 of 40 |
| All 541 | 541 | 46 | 61 | 113 | 321 | $262.2M/mo | 40 of 40 |

So the page does not hardcode either gate. It ships both as presets plus a live numeric
threshold, and every tile, tier and chart recomputes. Manual overrides and pipeline state
are keyed to the lead, so switching gates never destroys work already done.

## Scoring

```
total_sales = ws_sales_month + mobile_sales_month
headroom    = max(0, BENCHMARK - capture_90d)
recoverable = headroom * total_sales      # extra $/month at BENCHMARK capture
```

`BENCHMARK = 0.40`, because 40 shops in this same population sustain at or above 36.88%
capture. It is a demonstrated level, not an aspiration.

The sheet's own `Upside / month at 10% capture, $` column is **not** used for scoring: at a
10% benchmark it reads `0` for every shop that clears a $100k web-shop gate (WWE Champions
sits at 73.4% capture). It stays visible on the lead card as a cross-check.

Tier cuts are money bands, so they can be argued in dollars rather than score points:

| Tier | Rule |
|---|---|
| P0 | recoverable >= $1M/month |
| P1 | $250k to $1M |
| P2 | $50k to $250k |
| Out | below $50k, or any hard blocker |

A **soft blocker** moves a lead down one tier, floored at P2. Soft blockers are kept rare
on purpose: a condition true of most of the file is not a blocker. Two were demoted to
informational flags during the build for exactly that reason, after they flattened the
tiering to zero P0s:

- `Public-source match = "no lookup match"` covers **419 of 499** rows and only means the
  public dataset had no entry for the title.
- `Link status = "not published in exports"` covers **312 of 499** rows.

Hard blockers: not a partner or former partner, web shop URL deleted in source, capture
already at or above the benchmark, or the row is on the `Excluded` tab.

## Stage counting

Nine stages: Lead, Qualified, Emailed, Responded, Meet, Sign, Integrate, Closed Won,
Closed Lost. The tiles will not sum to the total, because a lead at Meet was already
emailed. So each tile shows both: the large number is **ever reached**, the small number is
**currently here**, with step-to-step conversion between them.

Moving a lead to a linear stage backfills the earlier linear stages, which keeps the funnel
monotonic so the conversion percentages mean something.

## Where state lives

- `data/leads.json` holds the source rows and the formula tier. Rebuilt from the xlsx.
- The artifact's `db` holds **only decisions made by a person or an AI batch move**:
  `leads/{leadId}` (stage, priority, reached, owner override, next step, notes) and
  `activity/{autoId}` (an append-only audit log that makes a batch move reversible).

Formula tiers are deliberately **not** seeded into `db`. Writing them would mark all 119
leads as triaged and destroy the untriaged counter, which is the point of the screening
queue.

`leadId` is `p{Project ID}`, falling back to `t{slug(title)}`. `Project ID` is populated on
only 368 of 499 rows, and titles are unique but include CJK, so any non-ASCII title carries
a sha1 suffix. Without it, Korean and Japanese titles both reduced to `rpg` and would have
silently shared pipeline state.

Grain is the **web shop, not the company**: 307 companies over 499 rows (NetEase 14 shops,
DECA Games 10, Miniclip 10).

## Refreshing the data

```bash
cd dashboards/aff-leads
# 1. Re-export the two sheets to data/raw_all_web_shops.json and data/raw_excluded.json
#    (shape: {"headers": [...], "rows": [[...]]}, values raw from openpyxl data_only=True)
# 2. Rebuild and re-score:
python3 scripts/build_leads.py
# 3. Republish the page plus the data file to the same URL.
```

`build_leads.py` prints row counts, per-gate tier splits, and assertions against two known
rows, so a bad export is visible immediately. It asserts the workbook's own README figures:
499 rankable, 42 excluded, 40 top, 40 bottom.

## Known data caveats

- `Last payment` is the export snapshot date (2026-06-14) for 273 of 324 populated rows, so
  it is useless as a recency signal and is not surfaced.
- `Company (SF account)` is blank on 10 rows and `BD / CSM (AM)` on 12. Both are soft
  blockers and form a data-cleanup queue.
- One `Company (partner)` value is an email address rather than a company name.
- The 42 `Excluded` rows all share one cause: mobile store sales read 0 because data.ai had
  no match, so capture rate falsely reads 100%. Several are large (Solitaire TriPeaks:
  $4.35M/90d Xsolla sales). They are included as hard-blocked rather than dropped.

## Data handling

The rows carry partner revenue, company names and internal BD/CSM owners. The artifact is
private and its shared store requires sign-in. Share it to named people or the
organization, never by public link.
