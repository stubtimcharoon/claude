#!/usr/bin/env bash
# Post an update directly to an Atlas goal via the Goals GraphQL API.
#
# Usage:
#   post-atlas-update.sh <goal-key> <status> <summary-adf.json> [score] [target-date]
#
# Requires env: ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_SITE
#
# Example:
#   post-atlas-update.sh XSOLLA-8731 on_track ./8731.adf.json 65 2026-09-30

set -euo pipefail

GOAL_KEY="${1:?goal key required (e.g. XSOLLA-8731)}"
STATUS="${2:?status required (pending|on_track|at_risk|off_track|done|cancelled)}"
SUMMARY_FILE="${3:?path to ADF JSON summary file required}"
SCORE="${4:-}"
TARGET_DATE="${5:-}"

: "${ATLASSIAN_EMAIL:?ATLASSIAN_EMAIL not set}"
: "${ATLASSIAN_API_TOKEN:?ATLASSIAN_API_TOKEN not set}"
: "${ATLASSIAN_SITE:?ATLASSIAN_SITE not set (e.g. xsolla.atlassian.net)}"

ENDPOINT="https://${ATLASSIAN_SITE}/gateway/api/graphql"
CONTAINER_ID="ari:cloud:townsquare::site/9dfc393f-ac2d-4cef-8b1c-0657da26067f"

api() {
  curl -sS --fail-with-body -X POST "$ENDPOINT" \
    -u "${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "X-ExperimentalApi: opt-in" \
    --data "$1"
}

# 1. Resolve goal key -> ARI and read latest update
LOOKUP_QUERY='query Resolve($key:String!,$cid:ID!){goals_byKey(goalKey:$key,containerId:$cid)@optIn(to:"Townsquare"){id key name}}'
LOOKUP_PAYLOAD="$(jq -nc --arg key "$GOAL_KEY" --arg cid "$CONTAINER_ID" --arg query "$LOOKUP_QUERY" '{query:$query,variables:{key:$key,cid:$cid}}')"
LOOKUP_RESP="$(api "$LOOKUP_PAYLOAD")"

GOAL_ARI="$(jq -r '.data.goals_byKey.id // empty' <<<"$LOOKUP_RESP")"
if [[ -z "$GOAL_ARI" ]]; then
  echo "Could not resolve ARI for goal $GOAL_KEY" >&2
  echo "$LOOKUP_RESP" >&2
  exit 1
fi

# 3-day duplicate guard: check most recent update via goals_updates connection.
UPDATES_QUERY='query LastUpdate($id:ID!){node(id:$id){... on TownsquareGoal{updates(first:1){edges{node{creationDate}}}}}}'
UPDATES_PAYLOAD="$(jq -nc --arg id "$GOAL_ARI" --arg query "$UPDATES_QUERY" '{query:$query,variables:{id:$id}}')"
UPDATES_RESP="$(api "$UPDATES_PAYLOAD" 2>/dev/null || true)"
LAST_UPDATE="$(jq -r '.data.node.updates.edges[0].node.creationDate // empty' <<<"$UPDATES_RESP" 2>/dev/null || true)"
if [[ -n "$LAST_UPDATE" ]]; then
  if [[ "$(date -u -d "$LAST_UPDATE" +%s 2>/dev/null || echo 0)" -gt "$(date -u -d '3 days ago' +%s)" ]]; then
    echo "Skipping $GOAL_KEY: latest update at $LAST_UPDATE is within 3 days." >&2
    exit 0
  fi
fi

echo "Resolved $GOAL_KEY -> $GOAL_ARI"

# 2. Build mutation input — summary must be a JSON-stringified ADF string
SUMMARY_STRING="$(jq -c '.' "$SUMMARY_FILE")"
INPUT="$(jq -nc \
  --arg goalId "$GOAL_ARI" \
  --arg status "$STATUS" \
  --arg summary "$SUMMARY_STRING" \
  '{goalId:$goalId, status:$status, summary:$summary}')"

if [[ -n "$SCORE" ]]; then
  INPUT="$(jq -c --argjson score "$SCORE" '. + {score:$score}' <<<"$INPUT")"
fi
if [[ -n "$TARGET_DATE" ]]; then
  INPUT="$(jq -c --arg d "$TARGET_DATE" '. + {targetDate:{date:$d, confidence:"DAY"}}' <<<"$INPUT")"
fi

# 3. Post update
MUTATION='mutation($input:TownsquareGoalsCreateUpdateInput!){goals_createUpdate(input:$input)@optIn(to:"Townsquare"){success errors{message} update{id url creationDate updateType newScore}}}'
PAYLOAD="$(jq -nc --arg query "$MUTATION" --argjson input "$INPUT" '{query:$query,variables:{input:$input}}')"
RESP="$(api "$PAYLOAD")"

SUCCESS="$(jq -r '.data.goals_createUpdate.success // false' <<<"$RESP")"
if [[ "$SUCCESS" != "true" ]]; then
  echo "Update failed for $GOAL_KEY:" >&2
  jq . <<<"$RESP" >&2
  exit 1
fi

jq '.data.goals_createUpdate.update' <<<"$RESP"
