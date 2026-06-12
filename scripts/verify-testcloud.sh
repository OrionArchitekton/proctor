#!/usr/bin/env bash
# verify-testcloud.sh — READ-ONLY connectivity probe for the UiPath tenant.
#
# Run this the moment UiPath Labs credentials are in .env. It validates auth,
# then discovers the IDs the TestCloudGateway needs (folder id, release key,
# test set id) so you can finish populating .env without digging through the UI.
#
# Usage:  bash scripts/verify-testcloud.sh
# Reads:  UIPATH_BASE_URL, UIPATH_ORG, UIPATH_TENANT, UIPATH_PAT
#         (sourced from ./.env automatically if present)
# Makes NO mutating calls — GETs only.

set -u

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

missing=0
for v in UIPATH_BASE_URL UIPATH_ORG UIPATH_TENANT UIPATH_PAT; do
  if [ -z "${!v:-}" ]; then echo "MISSING env: $v"; missing=1; fi
done
[ "$missing" = "1" ] && { echo "Populate .env first (see README 'Connecting real UiPath Test Cloud')."; exit 1; }

ORCH="${UIPATH_BASE_URL}/${UIPATH_ORG}/${UIPATH_TENANT}/orchestrator_"
AUTH="Authorization: Bearer ${UIPATH_PAT}"
fail=0

probe() { # probe <label> <url> [folder_id]
  local label="$1" url="$2" folder="${3:-}"
  local hdr=(-H "$AUTH" -H "Content-Type: application/json")
  [ -n "$folder" ] && hdr+=(-H "X-UIPATH-OrganizationUnitId: $folder")
  local body code
  body=$(curl -sS --max-time 20 -w '\n%{http_code}' "${hdr[@]}" "$url" 2>&1)
  code=$(echo "$body" | tail -1)
  body=$(echo "$body" | sed '$d')
  if [ "$code" = "200" ]; then
    echo "PASS  [$label]  HTTP 200"
    echo "$body"
    return 0
  else
    echo "FAIL  [$label]  HTTP $code"
    echo "$body" | head -c 500; echo
    fail=1
    return 1
  fi
}

summarize() { # summarize <jq-less python extraction> reads stdin JSON
  python3 -c "$1" 2>/dev/null || echo "  (could not parse response)"
}

echo "=== Proctor → UiPath tenant probe (read-only) ==="
echo "Orchestrator base: $ORCH"
echo

echo "--- 1) Auth + Folders (copy an Id → UIPATH_FOLDER_ID) ---"
folders_json=$(probe "folders" "$ORCH/odata/Folders") || true
echo "$folders_json" | sed '1d' | summarize '
import sys, json
d = json.load(sys.stdin)
for f in d.get("value", []):
    print(f"  folder  Id={f.get(\"Id\")}  Name={f.get(\"DisplayName\")}  Type={f.get(\"FolderType\",\"?\")}")'
echo

FOLDER="${UIPATH_FOLDER_ID:-}"
if [ -z "$FOLDER" ]; then
  FOLDER=$(echo "$folders_json" | sed '1d' | python3 -c 'import sys,json; d=json.load(sys.stdin); v=d.get("value",[]); print(v[0]["Id"] if v else "")' 2>/dev/null)
  [ -n "$FOLDER" ] && echo "(no UIPATH_FOLDER_ID set — probing with first folder: $FOLDER)"
fi
echo

if [ -n "$FOLDER" ]; then
  echo "--- 2) Releases in folder $FOLDER (copy Key → UIPATH_PROCTOR_RELEASE_KEY) ---"
  probe "releases" "$ORCH/odata/Releases?\$top=10" "$FOLDER" | sed '1d' | summarize '
import sys, json
d = json.load(sys.stdin)
v = d.get("value", [])
if not v: print("  (no releases/processes published in this folder yet)")
for r in v:
    print(f"  release  Key={r.get(\"Key\")}  Name={r.get(\"Name\")}")'
  echo

  echo "--- 3) Test Sets in folder $FOLDER (copy Id → UIPATH_TEST_SET_ID) ---"
  probe "testsets" "$ORCH/odata/TestSets?\$top=10" "$FOLDER" | sed '1d' | summarize '
import sys, json
d = json.load(sys.stdin)
v = d.get("value", [])
if not v: print("  (no test sets in this folder yet — create one in Test Cloud/Orchestrator Testing)")
for t in v:
    print(f"  testset  Id={t.get(\"Id\")}  Name={t.get(\"Name\")}")'
  echo

  echo "--- 4) Tasks API reachability (Action Center) ---"
  probe "tasks" "$ORCH/odata/Tasks?\$top=1" "$FOLDER" >/dev/null && echo "  Action Center tasks API reachable."
  echo
else
  echo "SKIP 2-4: no folder id available (folders call failed?)"
  fail=1
fi

echo "=== Probe complete ==="
if [ "$fail" = "0" ]; then
  echo "RESULT: PASS — auth works. Fill UIPATH_FOLDER_ID / UIPATH_PROCTOR_RELEASE_KEY / UIPATH_TEST_SET_ID from the IDs above, then run a live cycle with PROCTOR_GATEWAY=testcloud."
else
  echo "RESULT: ISSUES — see FAIL lines above (401=bad/expired PAT or missing scopes; 404=wrong org/tenant segment; check UIPATH_BASE_URL=$UIPATH_BASE_URL)."
  exit 1
fi
