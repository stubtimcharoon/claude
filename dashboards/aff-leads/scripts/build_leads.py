#!/usr/bin/env python3
"""
Build the AFF web shop lead list from the GET-864 capture-rate research.

Reads the raw sheet dumps produced from GET-864_AFF_webshop_capture_rate.xlsx
and emits dashboards/aff-leads/data/leads.json: normalised rows plus a
deterministic priority tier per lead.

Scoring (see README.md for the reasoning):

    total_sales = ws_sales_month + mobile_sales_month
    headroom    = max(0, BENCHMARK - capture_90d)
    recoverable = headroom * total_sales      # incremental $/month at BENCHMARK

BENCHMARK is 0.40 because 40 shops in this same population sustain >= 36.88%
capture, so 40% is demonstrably reachable rather than aspirational.

Tier cuts are money bands so they can be argued in dollars:
    P0   recoverable >= $1M/month
    P1   $250k - $1M
    P2   $50k - $250k
    OUT  < $50k, or any hard blocker
A soft blocker downgrades one tier, with a floor of P2.
"""

import hashlib
import json
import os
import re
import unicodedata
from datetime import date, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))

BENCHMARK = 0.40          # target capture rate, from the Top-40 observed floor
UPSIDE_BENCHMARK = 0.10   # the sheet's own benchmark, kept only as a cross-check

P0_FLOOR = 1_000_000.0
P1_FLOOR = 250_000.0
P2_FLOOR = 50_000.0

GATES = {
    "webshop100k": {
        "label": "Web shop > $100k/mo",
        "note": "Xsolla web shop sales at or above $100k/month, shop live and transacting.",
        "min_ws_sales_month": 100_000.0,
        "min_mobile_sales_month": None,
        "max_capture": None,
    },
    "underperformer": {
        "label": "Underperformer upside",
        "note": "Mobile store sales at or above $333k/month with capture below 5%. The Bottom 40 logic.",
        "min_ws_sales_month": None,
        "min_mobile_sales_month": 333_000.0,
        "max_capture": 0.05,
    },
}
DEFAULT_GATE = "webshop100k"

NOT_PARTNER = {"Not a Partner", "Former Partner"}
# Only a genuine publisher mismatch is a blocker. "no lookup match" covers 419
# of 499 rows and merely means the public dataset had no entry, which says
# nothing about the lead, so it is an informational flag instead.
WEAK_MATCH = {"unverified"}
DIVERGENCE_PP = 0.10


# ---------------------------------------------------------------- normalising

def num(v):
    """Cell -> float or None. The sheet stores real numbers, but be tolerant."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s:
        return None
    pct = s.endswith("%")
    s = s.rstrip("%").replace(",", "").replace("$", "").strip()
    if s in ("", "-", "n/a", "N/A", "no data"):
        return None
    try:
        f = float(s)
    except ValueError:
        return None
    return f / 100.0 if pct else f


def txt(v):
    """Cell -> trimmed string or None. Never the literal 'None'."""
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()[:10]
    s = str(v).strip()
    return s or None


def intish(v):
    f = num(v)
    return None if f is None else int(round(f))


def split_list(v, sep=","):
    s = txt(v)
    if not s:
        return []
    return [p.strip() for p in s.split(sep) if p.strip()]


def iso_date(v):
    """'Sep 22, 2020' and '2026-06-14' both -> '2020-09-22' / '2026-06-14'."""
    s = txt(v)
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%b %d, %Y", "%B %d, %Y", "%d %b %Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return s


def slug(s):
    """ASCII slug, with a stable hash suffix when the title is mostly non-ASCII.

    Many titles are CJK only. Stripping to ASCII collapses them all to the same
    string, which would silently merge their pipeline state, so any title that
    does not survive transliteration keeps a short digest of the original.
    """
    original = (s or "").strip()
    t = unicodedata.normalize("NFKD", original)
    t = t.encode("ascii", "ignore").decode("ascii").lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    # Any character lost to transliteration means the slug is not unique on its
    # own: "...방치형 RPG..." and "...王道バトルRPG" both reduce to "rpg".
    if not original.isascii():
        digest = hashlib.sha1(original.encode("utf-8")).hexdigest()[:8]
        return f"{t}-{digest}" if len(t) >= 3 else f"x{digest}"
    return t or "untitled"


# ---------------------------------------------------------------- blockers

def blockers(r, excluded):
    """Return (hard, soft, flags).

    hard  - disqualifies the lead outright
    soft  - moves it down one tier; kept deliberately rare so it still means
            something. A condition true of most of the file is not a blocker.
    flags - shown on the card, never scored
    """
    hard, soft, flags = [], [], []

    status = r["partnership_status"] or ""
    # "Current Partner, Former Partner" counts as current.
    if status in NOT_PARTNER:
        hard.append(f"Partnership status: {status}")
    if r["link_status"] == "URL deleted in source":
        hard.append("Web shop URL deleted in source")
    if r["capture_90d"] is not None and r["capture_90d"] >= BENCHMARK:
        hard.append(f"Capture already at or above {BENCHMARK:.0%}, nothing to recover")
    if excluded:
        hard.append("On the Excluded tab: no valid capture rate")

    if not r["owner"]:
        soft.append("No BD/CSM owner")
    if not r["company_sf"]:
        soft.append("No Salesforce account to join to")
    if r["gambling"] == "Yes":
        soft.append("Gambling content, compliance review needed")
    c90, c12 = r["capture_90d"], r["capture_12m"]
    if c90 is not None and c12 is not None and abs(c90 - c12) > DIVERGENCE_PP:
        soft.append(f"Capture unstable: 90d {c90:.1%} vs 12m {c12:.1%}")
    if (r["public_source_match"] or "") in WEAK_MATCH:
        soft.append("Publisher does not match the public source")

    # Informational: common in this file and not a reason to deprioritise.
    if r["link_status"] == "not published in exports":
        flags.append("No web shop URL in the export")
    if (r["public_source_match"] or "") == "no lookup match":
        flags.append("No public-source lookup match")
    if r["features_enabled"] == 0:
        flags.append("No web shop features switched on")
    if r["site_builder"] == "Yes":
        flags.append("Site Builder shop, quick to iterate")
    if r["integration"] == "LAPI":
        flags.append("LAPI integration")
    if r["data_quality_note"]:
        flags.append(r["data_quality_note"])

    return hard, soft, flags


def tier_for(recoverable, hard, soft):
    if hard:
        return "OUT", "hard blocker"
    if recoverable is None:
        return "OUT", "no capture rate to score"

    if recoverable >= P0_FLOOR:
        base = "P0"
    elif recoverable >= P1_FLOOR:
        base = "P1"
    elif recoverable >= P2_FLOOR:
        base = "P2"
    else:
        return "OUT", f"recoverable ${recoverable:,.0f}/mo below the ${P2_FLOOR:,.0f} floor"

    if soft:
        # One step down, floored at P2 so a single soft flag never kills a lead.
        stepped = {"P0": "P1", "P1": "P2", "P2": "P2"}[base]
        if stepped != base:
            return stepped, f"{base} on ${recoverable:,.0f}/mo, down one tier for {len(soft)} soft blocker(s)"
        return base, f"recoverable ${recoverable:,.0f}/mo"
    return base, f"recoverable ${recoverable:,.0f}/mo"


def passes(r, gate):
    g = GATES[gate]
    if not r["live"]:
        return False
    if g["min_ws_sales_month"] is not None:
        if (r["ws_sales_month"] or 0) < g["min_ws_sales_month"]:
            return False
    if g["min_mobile_sales_month"] is not None:
        if (r["mobile_sales_month"] or 0) < g["min_mobile_sales_month"]:
            return False
    if g["max_capture"] is not None:
        if r["capture_90d"] is None or r["capture_90d"] >= g["max_capture"]:
            return False
    return True


# ---------------------------------------------------------------- build

def load(name):
    with open(os.path.join(DATA, name)) as f:
        return json.load(f)


def rowdicts(blob):
    heads = blob["headers"]
    for row in blob["rows"]:
        yield dict(zip(heads, row))


def shape(g, excluded=False):
    """One sheet row -> one normalised lead record."""
    title = txt(g.get("Game title")) or "Untitled shop"
    pid = intish(g.get("Project ID"))

    ws_m = num(g.get("Xsolla WS sales / month, $"))
    mob_m = num(g.get("Mobile store sales / month, $"))
    ws_90 = num(g.get("Xsolla WS sales, 90d, $"))
    payers_90 = num(g.get("Payers, 90d"))

    r = {
        "id": f"p{pid}" if pid else f"t{slug(title)}",
        "project_id": pid,
        "title": title,
        "list": txt(g.get("List")),
        "excluded": excluded,
        "rank": intish(g.get("Overall rank")),

        "company_partner": txt(g.get("Company (partner)")),
        "company_sf": txt(g.get("Company (SF account)")),
        "owner": txt(g.get("BD / CSM (AM)")),

        "ws_link": txt(g.get("Web shop link")),
        "link_status": txt(g.get("Link status")),
        "app_store_link": txt(g.get("App Store link")),

        "capture_90d": num(g.get("Capture rate, 90d")),
        "capture_12m": num(g.get("Capture rate, 12m")),
        "ws_sales_month": ws_m,
        "ws_revenue_month": num(g.get("Xsolla WS revenue / month, $")),
        "mobile_sales_month": mob_m,
        "ws_sales_90d": ws_90,
        "mobile_sales_90d": num(g.get("Mobile store sales, 90d, $")),
        "purchases_month": num(g.get("Purchases (invoices) / month")),
        "payers_month": num(g.get("Payers / month")),
        "payers_90d": payers_90,
        "arppu": num(g.get("ARPPU, 90d, $")),
        "upside_at_10": num(g.get("Upside / month at 10% capture, $")),
        "yoy_delta": num(g.get("Mobile sales YoY delta")),

        "genre": txt(g.get("Genre")),
        "genres_all": split_list(g.get("Genre - all sources"), "|"),
        "geo": split_list(g.get("GEO - top countries")),
        "avg_age": num(g.get("Avg. age of users (Sensor Tower, US)")),
        "gender_split": txt(g.get("Gender split (Sensor Tower, US)")),
        "monetization": split_list(g.get("Monetization model")),
        "licensed_ip": txt(g.get("Licensed IP")),
        "store_rating": num(g.get("Store rating")),
        "localisations": intish(g.get("Localisations")),
        "countries_available": intish(g.get("Countries available in")),
        "publisher": txt(g.get("App Store publisher")),
        "publisher_country": txt(g.get("Publisher country")),

        "gambling": txt(g.get("Gambling content")),
        "gambling_basis": txt(g.get("Gambling flag basis")),
        "age_rating": txt(g.get("Age rating (App Store)")),
        "content_advisories": split_list(g.get("Content advisories (App Store)"), ";"),

        "solution": txt(g.get("Solution")),
        "abcd": txt(g.get("ABCD segment")),
        "site_builder": txt(g.get("Site Builder")),
        "custom_ws": txt(g.get("Custom WS")),
        "partnership_status": txt(g.get("Partnership status")),
        "integration": txt(g.get("Integration")),
        "support_level": txt(g.get("Support level")),
        "ws_launch_date": iso_date(g.get("WS launch date")),
        "features_enabled": intish(g.get("Features enabled")),
        "integration_score": num(g.get("Integration score")),
        "take_rate": num(g.get("Take rate")),
        "visits_6m": intish(g.get("Visits, 6m")),
        "cvr": num(g.get("Visit-to-payment CVR, %")),

        "public_source_match": txt(g.get("Public-source match")),
        "public_source_note": txt(g.get("Public-source match note")),
        "similarweb_status": txt(g.get("Similarweb status")),
        "data_quality_note": txt(g.get("Data quality note")),
        "excluded_because": txt(g.get("Excluded because")),
    }

    # Live and transacting: real web shop money and real payers in the window.
    r["live"] = bool((ws_90 or 0) > 0 and (payers_90 or 0) > 0)

    if r["capture_90d"] is not None:
        total = (ws_m or 0.0) + (mob_m or 0.0)
        r["total_sales_month"] = total
        r["headroom"] = max(0.0, BENCHMARK - r["capture_90d"])
        r["recoverable"] = r["headroom"] * total
    else:
        r["total_sales_month"] = (ws_m or 0.0) + (mob_m or 0.0)
        r["headroom"] = None
        r["recoverable"] = None

    hard, soft, flags = blockers(r, excluded)
    r["hard_blockers"] = hard
    r["soft_blockers"] = soft
    r["flags"] = flags
    tier, why = tier_for(r["recoverable"], hard, soft)
    r["tier"] = tier
    r["tier_reason"] = why
    r["gates"] = {k: passes(r, k) for k in GATES}
    return r


def main():
    leads = [shape(g) for g in rowdicts(load("raw_all_web_shops.json"))]
    leads += [shape(g, excluded=True) for g in rowdicts(load("raw_excluded.json"))]

    # Key integrity. Duplicate ids would silently merge pipeline state.
    seen, dupes = set(), []
    for r in leads:
        if r["id"] in seen:
            dupes.append(r["id"])
        seen.add(r["id"])

    leads.sort(key=lambda r: (-(r["recoverable"] or -1), r["title"]))

    out = {
        "meta": {
            "source_file": "GET-864_AFF_webshop_capture_rate.xlsx",
            "source_sha256": "34b5230b29c7d277f9462981a5355981575ba312c280509006e64dcc29ddfd21",
            "source_modified": "2026-09-29",
            "window": "90 days, 26.05.2026 - 26.08.2026; per-month figures are the window / 3",
            "built_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "benchmark": BENCHMARK,
            "upside_benchmark": UPSIDE_BENCHMARK,
            "tier_floors": {"P0": P0_FLOOR, "P1": P1_FLOOR, "P2": P2_FLOOR},
            "divergence_pp": DIVERGENCE_PP,
            "gates": GATES,
            "default_gate": DEFAULT_GATE,
            "counts": {
                "rows": len(leads),
                "rankable": sum(1 for r in leads if not r["excluded"]),
                "excluded": sum(1 for r in leads if r["excluded"]),
                "top_performer": sum(1 for r in leads if r["list"] == "Top performer"),
                "underperformer": sum(1 for r in leads if r["list"] == "Underperformer"),
                "duplicate_ids": dupes,
            },
        },
        "leads": leads,
    }

    # Drop empty values. At 541 rows the nulls are most of the payload, and the
    # page reads every field with optional access anyway.
    def prune(d):
        return {k: v for k, v in d.items()
                if v is not None and v != [] and v != ""}
    out["leads"] = [prune(r) for r in out["leads"]]

    path = os.path.join(DATA, "leads.json")
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)

    # ---- report
    print(f"wrote {path}  ({os.path.getsize(path):,} bytes)")
    c = out["meta"]["counts"]
    print(f"rows={c['rows']} rankable={c['rankable']} excluded={c['excluded']} "
          f"top40={c['top_performer']} bottom40={c['underperformer']} dupes={c['duplicate_ids']}")

    for gate in GATES:
        g = [r for r in leads if r["gates"][gate]]
        tiers = {t: sum(1 for r in g if r["tier"] == t) for t in ("P0", "P1", "P2", "OUT")}
        money = sum(r["recoverable"] or 0 for r in g if r["tier"] in ("P0", "P1", "P2"))
        onlist = {"Top performer": 0, "Underperformer": 0, None: 0}
        for r in g:
            onlist[r["list"] if r["list"] in onlist else None] += 1
        print(f"\ngate {gate:<15} leads={len(g):<4} {tiers}")
        print(f"     recoverable in P0-P2 = ${money:,.0f}/month")
        print(f"     of which Top 40={onlist['Top performer']} "
              f"Bottom 40={onlist['Underperformer']} unlisted={onlist[None]}")

    print("\n--- assertions ---")
    def find(t):
        return next((r for r in leads if r["title"] == t), None)
    for t in ("WWE Champions", "Azur Lane"):
        r = find(t)
        if not r:
            print(f"  {t}: NOT FOUND")
            continue
        print(f"  {t}: capture={r['capture_90d']:.4%} ws=${r['ws_sales_month']:,.0f}/mo "
              f"mobile=${r['mobile_sales_month']:,.0f}/mo recoverable=${r['recoverable']:,.0f}/mo "
              f"tier={r['tier']} gates={r['gates']}")
        print(f"        reason: {r['tier_reason']}")
        if r["hard_blockers"]:
            print(f"        hard: {r['hard_blockers']}")
        if r["soft_blockers"]:
            print(f"        soft: {r['soft_blockers']}")


if __name__ == "__main__":
    main()
