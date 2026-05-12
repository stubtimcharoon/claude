#!/usr/bin/env bash
# Post an update to an Atlas goal via the Goals GraphQL API.
#
# Usage:
#   post-atlas-update.sh <goal-key> <status> <summary-file.json> [score] [target-date]
#
# Requires env: ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN, ATLASSIAN_SITE
#
# Example:
#   post-atlas-update.sh XSOLLA-8731 on_track ./summary.adf.json 65 2026-09-30

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
AUTH="$(printf '%s:%s' "$ATLASSIAN_EMAIL" "$ATLASSIAN_API_TOKEN" | base64 -w0)"

api() {
  curl -sS --fail-with-body -X POST "$ENDPOINT" \
    -H "Authorization: Basic $AUTH" \
    -H "Content-Type: application/json" \
    -H "X-ExperimentalApi: opt-in" \
    --data "$1"
}

# 1. Resolve goal key -> ARI
SEARCH_QUERY='query($q:String!){goals_search(first:1,input:{search:$q})@optIn(to:"Townsquare"){edges{node{id key name latestUpdate{creationDate}}}}}'
SEARCH_PAYLOAD="$(jq -nc --arg q "$GOAL_KEY" --arg query "$SEARCH_QUERY" '{query:$query,variables:{q:$q}}')"
SEARCH_RESP="$(api "$SEARCH_PAYLOAD")"

GOAL_ARI="$(jq -r '.data.goals_search.edges[0].node.id // empty' <<<"$SEARCH_RESP")"
if [[ -z "$GOAL_ARI" ]]; then
  echo "Could not resolve ARI for goal $GOAL_KEY" >&2
  echo "$SEARCH_RESP" >&2
  exit 1
fi
echo "Resolved $GOAL_KEY -> $GOAL_ARI"

# 2. Build input
INPUT="$(jq -nc \
  --arg goalId "$GOAL_ARI" \
  --arg status "$STATUS" \
  --slurpfile summary "$SUMMARY_FILE" \
  '{goalId:$goalId, status:$status, summary:$summary[0]}')"

if [[ -n "$SCORE" ]]; then
  INPUT="$(jq -c --argjson score "$SCORE" '. + {score:$score}' <<<"$INPUT")"
fi
if [[ -n "$TARGET_DATE" ]]; then
  INPUT="$(jq -c --arg d "$TARGET_DATE" '. + {targetDate:{date:$d, confidence:"DAY"}}' <<<"$INPUT")"
fi

# 3. Mutate
MUTATION='mutation($input:goals_CreateUpdateInput!){goals_createUpdate(input:$input)@optIn(to:"Townsquare"){success errors{message} update{id url creationDate updateType newScore}}}'
PAYLOAD="$(jq -nc --arg query "$MUTATION" --argjson input "$INPUT" '{query:$query,variables:{input:$input}}')"
RESP="$(api "$PAYLOAD")"

SUCCESS="$(jq -r '.data.goals_createUpdate.success // false' <<<"$RESP")"
if [[ "$SUCCESS" != "true" ]]; then
  echo "Update failed:" >&2
  jq . <<<"$RESP" >&2
  exit 1
fi

jq '.data.goals_createUpdate.update' <<<"$RESP"
