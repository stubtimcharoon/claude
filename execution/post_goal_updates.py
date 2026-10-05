#!/usr/bin/env python3
"""Stage B of the Atlas goal update pipeline: post drafted updates, deterministically.

Stage A (the atlas-goal-update skill) researches and writes one drafts/<KEY>.json per
goal. This script reads those drafts, chunks each body to the Atlas 280-visible-character
limit, posts each chunk as its own goal update, and verifies every post landed.

No AI, no Google Sheets. Standard library plus requests.

The one rule this script exists to enforce: a run that posts nothing exits non-zero.
The Atlassian API returns HTTP 200 with success=false on rejection, so HTTP status
proves nothing. Only data.goals_createUpdate.success does.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from typing import Any

import requests

from goals import ARI_PREFIX, CONTAINER_ID, GOALS, MAX_VISIBLE_CHARS, ari_for

TIMEOUT = 30

# Every operation against the Goals API needs the Townsquare opt-in directive.
# The legacy bash helper omits it on its duplicate-guard query; that is a bug, not a pattern.
Q_RESOLVE = (
    'query Resolve($key:String!,$cid:ID!){'
    'goals_byKey(goalKey:$key,containerId:$cid)@optIn(to:"Townsquare")'
    "{id key name state{value}}}"
)
Q_LAST_UPDATE = (
    'query LastUpdate($key:String!,$cid:ID!){'
    'goals_byKey(goalKey:$key,containerId:$cid)@optIn(to:"Townsquare")'
    "{id updates(first:1){edges{node{creationDate}}}}}"
)
M_CREATE_UPDATE = (
    "mutation($input:TownsquareGoalsCreateUpdateInput!){"
    'goals_createUpdate(input:$input)@optIn(to:"Townsquare")'
    "{success errors{message} update{id url creationDate}}}"
)

REQUIRED_FIELDS = ("goal_key", "goal_ari", "status_passthrough", "body")


class GoalError(Exception):
    """A per-goal failure. Recorded against the goal, never silently swallowed."""


# --------------------------------------------------------------------------- chunking


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def _split_further(piece: str, budget: int) -> list[str]:
    """Break one over-budget piece down: phrase boundaries, then words, then hard split."""
    if len(piece) <= budget:
        return [piece]

    for sep in ("; ", ", "):
        if sep in piece:
            bits, out, cur = piece.split(sep), [], ""
            for i, bit in enumerate(bits):
                tail = sep.rstrip() if i < len(bits) - 1 else ""
                cand = f"{cur}{sep}{bit}".strip() if cur else bit
                if len(cand) + len(tail) <= budget:
                    cur = cand
                else:
                    if cur:
                        out.append(cur)
                    cur = bit
            if cur:
                out.append(cur)
            if all(len(o) <= budget for o in out):
                return out

    # Word boundaries.
    out, cur = [], ""
    for word in piece.split():
        cand = f"{cur} {word}".strip()
        if len(cand) <= budget:
            cur = cand
        else:
            if cur:
                out.append(cur)
            # A single word longer than the budget: hard split rather than loop forever.
            while len(word) > budget:
                out.append(word[:budget])
                word = word[budget:]
            cur = word
    if cur:
        out.append(cur)
    return out


def _pack(pieces: list[str], budget: int) -> list[str]:
    out, cur = [], ""
    for piece in pieces:
        for sub in _split_further(piece, budget):
            cand = f"{cur} {sub}".strip() if cur else sub
            if len(cand) <= budget:
                cur = cand
            else:
                if cur:
                    out.append(cur)
                cur = sub
    if cur:
        out.append(cur)
    return out


def chunk_body(body: str, limit: int = MAX_VISIBLE_CHARS) -> list[str]:
    """Split body into chunks that each fit `limit` VISIBLE characters, suffix included.

    A single chunk carries no suffix. Multiple chunks each get " (i/N)" appended, and the
    suffix width is reserved from the packing budget first, because the suffix is itself
    visible text that counts toward the cap.

    Note: Francis's original chunks on the escaped JSON length (800). That measures the
    wrong thing. Atlassian rejects on visible length at 280.
    """
    body = (body or "").strip()
    if not body:
        return []

    sentences = _split_sentences(body)

    chunks = _pack(sentences, limit)
    if len(chunks) <= 1:
        result = chunks
    else:
        # N is unknown until packed, and reserving changes the packing, so iterate.
        n = len(chunks)
        for _ in range(5):
            reserve = len(f" ({n}/{n})")
            repacked = _pack(sentences, limit - reserve)
            if len(repacked) == n:
                break
            n = len(repacked)
        total = len(repacked)
        if total == 1:
            result = repacked
        else:
            result = [f"{c} ({i}/{total})" for i, c in enumerate(repacked, 1)]

    for c in result:
        assert len(c) <= limit, f"chunk exceeds {limit} visible chars: {len(c)}"
    return result


# ------------------------------------------------------------------------------- api


def adf_summary(text: str) -> str:
    """Build the ADF doc and JSON-stringify it.

    `summary` is a String scalar holding a serialised ADF document, NOT an object.
    Passing an object is the single most common way this mutation fails silently.
    """
    doc = {
        "version": 1,
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }
    return json.dumps(doc, separators=(",", ":"))


class GoalsClient:
    def __init__(self, site: str, email: str, token: str) -> None:
        self.endpoint = f"https://{site}/gateway/api/graphql"
        self.auth = (email, token)

    def _call(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        resp = requests.post(
            self.endpoint,
            auth=self.auth,
            headers={"Content-Type": "application/json", "X-ExperimentalApi": "opt-in"},
            json={"query": query, "variables": variables},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            raise GoalError(f"HTTP {resp.status_code} from Goals API: {resp.text[:300]}")
        payload = resp.json()
        if payload.get("errors"):
            raise GoalError(f"GraphQL errors: {json.dumps(payload['errors'])[:400]}")
        return payload.get("data") or {}

    def resolve(self, key: str) -> dict[str, Any]:
        data = self._call(Q_RESOLVE, {"key": key, "cid": CONTAINER_ID})
        goal = data.get("goals_byKey")
        if not goal or not goal.get("id"):
            raise GoalError(f"could not resolve goal {key}")
        return goal

    def updated_today(self, key: str) -> bool:
        data = self._call(Q_LAST_UPDATE, {"key": key, "cid": CONTAINER_ID})
        edges = (((data.get("goals_byKey") or {}).get("updates") or {}).get("edges")) or []
        if not edges:
            return False
        created = (edges[0].get("node") or {}).get("creationDate")
        if not created:
            return False
        try:
            when = dt.datetime.fromisoformat(created.replace("Z", "+00:00"))
        except ValueError:
            return False
        return when.astimezone(dt.timezone.utc).date() == dt.datetime.now(dt.timezone.utc).date()

    def post_chunk(self, goal_ari: str, status: str, text: str) -> str:
        payload = {"goalId": goal_ari, "status": status, "summary": adf_summary(text)}
        data = self._call(M_CREATE_UPDATE, {"input": payload})
        result = data.get("goals_createUpdate") or {}
        # HTTP 200 with success=false is the documented rejection path. Check it.
        if not result.get("success"):
            msgs = "; ".join(e.get("message", "?") for e in (result.get("errors") or []))
            raise GoalError(f"API returned success=false: {msgs or 'no message'}")
        return ((result.get("update") or {}).get("url")) or "(no url returned)"


# ----------------------------------------------------------------------------- drafts


def load_draft(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as fh:
        draft = json.load(fh)
    if not isinstance(draft, dict):
        raise GoalError("draft is not a JSON object")
    missing = [f for f in REQUIRED_FIELDS if not draft.get(f)]
    if missing:
        raise GoalError(f"draft missing required field(s): {', '.join(missing)}")
    key = draft["goal_key"]
    if key not in GOALS:
        raise GoalError(f"unknown goal key {key}")
    if draft["goal_ari"] != ari_for(key):
        raise GoalError(f"goal_ari does not match the known ARI for {key}")
    if not draft["goal_ari"].startswith(ARI_PREFIX):
        raise GoalError(f"goal_ari has unexpected prefix for {key}")
    return draft


# ------------------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser(description="Post drafted Atlas goal updates.")
    ap.add_argument("--dry-run", action="store_true", help="validate and chunk; post nothing")
    ap.add_argument("--drafts-dir", default="drafts")
    ap.add_argument("--only", action="append", default=[], metavar="GOAL_KEY")
    args = ap.parse_args()

    if not os.path.isdir(args.drafts_dir):
        print(f"ERROR: drafts dir not found: {args.drafts_dir}", file=sys.stderr)
        return 1

    paths = sorted(
        os.path.join(args.drafts_dir, f)
        for f in os.listdir(args.drafts_dir)
        if f.endswith(".json")
    )
    if not paths:
        print(f"ERROR: no draft JSON files in {args.drafts_dir}", file=sys.stderr)
        return 1

    client = None
    if not args.dry_run:
        env = {k: os.environ.get(k, "") for k in ("ATLASSIAN_SITE", "ATLASSIAN_EMAIL", "ATLASSIAN_API_TOKEN")}
        missing = [k for k, v in env.items() if not v]
        if missing:
            print(f"ERROR: missing env: {', '.join(missing)}", file=sys.stderr)
            return 1
        client = GoalsClient(env["ATLASSIAN_SITE"], env["ATLASSIAN_EMAIL"], env["ATLASSIAN_API_TOKEN"])

    rows: list[dict[str, Any]] = []
    failures = 0

    for path in paths:
        # Seed key from the filename so a draft that fails validation is still
        # identifiable in the report rather than showing up as "?".
        stem = os.path.splitext(os.path.basename(path))[0]
        row: dict[str, Any] = {"file": os.path.basename(path), "key": stem, "intended": 0,
                               "landed": 0, "state": "", "urls": [], "error": ""}
        try:
            draft = load_draft(path)
            key = row["key"] = draft["goal_key"]
            if args.only and key not in args.only:
                row["state"] = "filtered out"
                rows.append(row)
                continue

            chunks = chunk_body(draft["body"])
            if not chunks:
                raise GoalError("body is empty after chunking")
            row["intended"] = len(chunks)

            if args.dry_run:
                row["state"] = "DRY RUN"
                print(f"\n--- {key}  status={draft['status_passthrough']}  {len(chunks)} chunk(s)")
                for i, c in enumerate(chunks, 1):
                    print(f"  [{i}/{len(chunks)}] {len(c):>3} chars: {c}")
                rows.append(row)
                continue

            live = client.resolve(key)
            if live["id"] != draft["goal_ari"]:
                raise GoalError(f"live ARI {live['id']} != draft ARI {draft['goal_ari']}")

            # A skip is not a failure and must not turn the run red.
            if client.updated_today(key):
                row["state"] = "skipped (already updated today)"
                rows.append(row)
                print(f"{key}: skipping, already has an update dated today UTC")
                continue

            status = draft["status_passthrough"]
            for i, chunk in enumerate(chunks, 1):
                url = client.post_chunk(draft["goal_ari"], status, chunk)
                row["landed"] += 1
                row["urls"].append(url)
                print(f"{key}: posted {i}/{len(chunks)} -> {url}")
            row["state"] = "posted"

        except (GoalError, json.JSONDecodeError, OSError) as exc:
            row["error"] = str(exc)
            row["state"] = "FAILED"
            failures += 1
            print(f"ERROR {row['key']} ({row['file']}): {exc}", file=sys.stderr)

        rows.append(row)

    # Any intended chunk that did not land is a failure, regardless of exceptions.
    shortfall = sum(
        r["intended"] - r["landed"]
        for r in rows
        if r["state"] == "posted" or r["state"] == "FAILED"
    )

    lines = ["", "goal            intended  landed  state", "-" * 60]
    for r in rows:
        lines.append(f"{r['key']:<15} {r['intended']:>8}  {r['landed']:>6}  {r['state']}{(' :: ' + r['error']) if r['error'] else ''}")
    report = "\n".join(lines)
    print(report)

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as fh:
            fh.write("\n### Atlas goal updates\n\n")
            fh.write("| goal | intended | landed | state |\n|---|---|---|---|\n")
            for r in rows:
                state = r["state"] + (f" :: {r['error']}" if r["error"] else "")
                fh.write(f"| {r['key']} | {r['intended']} | {r['landed']} | {state} |\n")

    if args.dry_run:
        print("\nDry run: nothing was posted.")
        # A dry run exists to validate. Invalid drafts must fail it, or the rehearsal
        # gives false confidence and the real run is the first to find out.
        if failures:
            print(f"FAILED: {failures} draft(s) did not validate.", file=sys.stderr)
            return 1
        return 0

    if failures or shortfall:
        print(f"\nFAILED: {failures} goal(s) errored, {shortfall} intended chunk(s) did not land.", file=sys.stderr)
        return 1

    posted = sum(r["landed"] for r in rows)
    print(f"\nOK: {posted} update(s) posted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
