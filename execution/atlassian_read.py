#!/usr/bin/env python3
"""Read-only Atlassian access for Stage A when the Atlassian MCP is not available (GitHub Actions).

Uses ATLASSIAN_SITE / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN. It can only read: there is no
write path in this file. Posting stays in post_goal_updates.py (Stage B).

  python3 execution/atlassian_read.py goal XSOLLA-8723        # status + last 3 updates
  python3 execution/atlassian_read.py jql 'project = MED AND updated >= -14d' [max]
  python3 execution/atlassian_read.py issue MED-369           # summary, status, description, recent comments
  python3 execution/atlassian_read.py cql 'space = XNTWRK AND lastmodified >= now("-14d")' [max]
  python3 execution/atlassian_read.py page 24149524689        # page body as plain text
"""

from __future__ import annotations

import html
import json
import os
import re
import sys

import requests

from goals import CONTAINER_ID

SITE = os.environ.get("ATLASSIAN_SITE", "xsolla.atlassian.net")
AUTH = (os.environ.get("ATLASSIAN_EMAIL", ""), os.environ.get("ATLASSIAN_API_TOKEN", ""))
TIMEOUT = 30

Q_GOAL = (
    "query ReadGoal($key:String!,$cid:ID!){"
    'goals_byKey(goalKey:$key,containerId:$cid)@optIn(to:"Townsquare")'
    "{id key name url state{value} updates(first:3){edges{node{creationDate summary url}}}}}"
)


def _get(path: str, **params) -> dict:
    r = requests.get(f"https://{SITE}{path}", auth=AUTH, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def _text(s: str | None) -> str:
    """HTML or ADF-JSON string -> plain text."""
    if not s:
        return ""
    if s.lstrip().startswith("{"):
        try:
            doc = json.loads(s)
            out: list[str] = []

            def walk(n):
                if isinstance(n, dict):
                    if n.get("type") == "text":
                        out.append(n.get("text", ""))
                    for c in n.get("content", []) or []:
                        walk(c)
                    if n.get("type") in ("paragraph", "listItem", "heading"):
                        out.append("\n")
            walk(doc)
            return "".join(out).strip()
        except ValueError:
            pass
    s = re.sub(r"<(br|/p|/li|/h\d|/tr)[^>]*>", "\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def goal(key: str) -> dict:
    r = requests.post(
        f"https://{SITE}/gateway/api/graphql", auth=AUTH, timeout=TIMEOUT,
        headers={"X-ExperimentalApi": "opt-in"},
        json={"query": Q_GOAL, "variables": {"key": key, "cid": CONTAINER_ID}},
    )
    r.raise_for_status()
    g = (r.json().get("data") or {}).get("goals_byKey")
    if not g:
        raise SystemExit(f"goal {key} not found: {r.text[:300]}")
    return {
        "key": g["key"], "name": g["name"], "url": g.get("url"), "status": g["state"]["value"],
        "updates": [
            {"created": e["node"]["creationDate"], "text": _text(e["node"]["summary"]), "url": e["node"]["url"]}
            for e in g["updates"]["edges"]
        ],
    }


def jql(query: str, limit: int = 30) -> list:
    d = _get("/rest/api/3/search/jql", jql=query, maxResults=limit, fields="summary,status,updated,assignee")
    return [
        {"key": i["key"], "status": i["fields"]["status"]["name"], "updated": i["fields"]["updated"][:10],
         "assignee": (i["fields"].get("assignee") or {}).get("displayName"),
         "summary": i["fields"]["summary"], "url": f"https://{SITE}/browse/{i['key']}"}
        for i in d.get("issues", [])
    ]


def issue(key: str) -> dict:
    d = _get(f"/rest/api/3/issue/{key}", fields="summary,status,updated,description,comment", expand="renderedFields")
    rf = d.get("renderedFields") or {}
    comments = (rf.get("comment") or {}).get("comments") or []
    return {
        "key": key, "summary": d["fields"]["summary"], "status": d["fields"]["status"]["name"],
        "updated": d["fields"]["updated"][:10], "url": f"https://{SITE}/browse/{key}",
        "description": _text(rf.get("description"))[:4000],
        "recent_comments": [{"created": c.get("created"), "author": (c.get("author") or {}).get("displayName"),
                             "text": _text(c.get("body"))[:1500]} for c in comments[-5:]],
    }


def cql(query: str, limit: int = 25) -> list:
    d = _get("/wiki/rest/api/search", cql=query, limit=limit)
    return [
        {"id": (r.get("content") or {}).get("id"), "title": r.get("title"),
         "modified": r.get("lastModified"), "url": f"https://{SITE}/wiki{r.get('url', '')}"}
        for r in d.get("results", [])
    ]


def page(page_id: str) -> dict:
    d = _get(f"/wiki/api/v2/pages/{page_id}", **{"body-format": "storage"})
    return {"id": page_id, "title": d.get("title"), "version": (d.get("version") or {}).get("number"),
            "url": f"https://{SITE}/wiki/pages/viewpage.action?pageId={page_id}",
            "text": _text((d.get("body") or {}).get("storage", {}).get("value"))[:20000]}


CMDS = {"goal": goal, "jql": jql, "issue": issue, "cql": cql, "page": page}

if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in CMDS:
        raise SystemExit(__doc__)
    args = sys.argv[2:]
    if sys.argv[1] in ("jql", "cql") and len(args) > 1:
        args = [args[0], int(args[1])]
    print(json.dumps(CMDS[sys.argv[1]](*args), indent=1, ensure_ascii=False))
