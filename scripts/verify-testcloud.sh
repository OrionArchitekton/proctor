#!/usr/bin/env bash
# verify-testcloud.sh — READ-ONLY connectivity probe for the UiPath tenant.
#
# Run this the moment UiPath credentials are available (env or `doppler run`).
# It validates auth, then discovers the IDs the TestCloudGateway needs
# (folder id, release key, test set id) so you can finish populating env
# without digging through the UI.
#
# Usage:  bash scripts/verify-testcloud.sh
#    or:  doppler run -p <project> -c <config> -- bash scripts/verify-testcloud.sh
# Reads:  UIPATH_BASE_URL, UIPATH_ORG, UIPATH_TENANT, UIPATH_PAT
#         (sourced from ./.env automatically if present and vars unset)
# Makes NO mutating calls — GETs only.

set -u

if [ -f .env ] && [ -z "${UIPATH_PAT:-}" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

missing=0
for v in UIPATH_BASE_URL UIPATH_ORG UIPATH_TENANT UIPATH_PAT; do
  if [ -z "${!v:-}" ]; then echo "MISSING env: $v"; missing=1; fi
done
[ "$missing" = "1" ] && { echo "Populate env first (see README 'Connecting real UiPath Test Cloud')."; exit 1; }

ORCH="${UIPATH_BASE_URL}/${UIPATH_ORG}/${UIPATH_TENANT}/orchestrator_"
AUTH="Authorization: Bearer ${UIPATH_PAT}"
fail=0
PROBE_BODY=""

probe() { # probe <label> <url> [folder_id] — body lands in $PROBE_BODY
  local label="$1" url="$2" folder="${3:-}"
  local hdr=(-H "$AUTH" -H "Content-Type: application/json")
  [ -n "$folder" ] && hdr+=(-H "X-UIPATH-OrganizationUnitId: $folder")
  local out code
  out=$(curl -sS --max-time 20 -w '\n%{http_code}' "${hdr[@]}" "$url" 2>&1)
  code=${out##*$'\n'}
  PROBE_BODY=${out%$'\n'*}
  if [ "$code" = "200" ]; then
    echo "PASS  [$label]  HTTP 200"
    return 0
  fi
  echo "FAIL  [$label]  HTTP $code"
  echo "${PROBE_BODY:0:400}"
  fail=1
  return 1
}

# NOTE: python snippets deliberately avoid f-string escapes (SyntaxError on
# Python <3.12) and do NOT suppress stderr — parse errors must surface, not hide.

echo "=== Proctor → UiPath tenant probe (read-only) ==="
echo "Orchestrator base: $ORCH"
echo

echo "--- 1) Auth + Folders (copy an Id → UIPATH_FOLDER_ID) ---"
if probe "folders" "$ORCH/odata/Folders"; then
  echo "$PROBE_BODY" | python3 -c '
import sys, json
d = json.load(sys.stdin)
for f in d.get("value", []):
    print("  folder  Id=%s  Name=%s  Type=%s" % (f.get("Id"), f.get("DisplayName"), f.get("FolderType", "?")))'
  FOLDER="${UIPATH_FOLDER_ID:-$(echo "$PROBE_BODY" | python3 -c 'import sys,json; v=json.load(sys.stdin).get("value",[]); print(v[0]["Id"] if v else "")')}"
else
  FOLDER="${UIPATH_FOLDER_ID:-}"
fi
echo

if [ -n "$FOLDER" ]; then
  echo "(probing with folder: $FOLDER)"
  echo

  echo "--- 2) Releases in folder $FOLDER (copy Key → UIPATH_PROCTOR_RELEASE_KEY) ---"
  if probe "releases" "$ORCH/odata/Releases?\$top=10" "$FOLDER"; then
    echo "$PROBE_BODY" | python3 -c '
import sys, json
v = json.load(sys.stdin).get("value", [])
if not v: print("  (no releases/processes published in this folder yet — publish a process to enable triggeredRun)")
for r in v:
    print("  release  Key=%s  Name=%s" % (r.get("Key"), r.get("Name")))'
  fi
  echo

  echo "--- 3) Test Sets in folder $FOLDER (copy Id → UIPATH_TEST_SET_ID) ---"
  if probe "testsets" "$ORCH/odata/TestSets?\$top=10" "$FOLDER"; then
    echo "$PROBE_BODY" | python3 -c '
import sys, json
v = json.load(sys.stdin).get("value", [])
if not v: print("  (no test sets in this folder yet — create one in Orchestrator Testing to enable pushTestResult)")
for t in v:
    print("  testset  Id=%s  Name=%s" % (t.get("Id"), t.get("Name")))'
  fi
  echo

  echo "--- 4) Tasks API reachability (Action Center) ---"
  if probe "tasks" "$ORCH/odata/Tasks?\$top=1" "$FOLDER"; then
    echo "  Action Center tasks API reachable."
  else
    case "$PROBE_BODY" in
      *2484*|*licenses*) echo "  HINT: HTTP 403 errorCode 2484 = your user lacks an Action Center license. Fix in Admin → Licenses / Manage Access (tenant-side, not code)." ;;
    esac
  fi
  echo
else
  echo "SKIP 2-4: no folder id available (folders call failed?)"
  fail=1
fi

echo "=== Probe complete ==="
if [ "$fail" = "0" ]; then
  echo "RESULT: PASS — auth works and all surfaces reachable. Fill UIPATH_FOLDER_ID / UIPATH_PROCTOR_RELEASE_KEY / UIPATH_TEST_SET_ID from the IDs above, then run a live cycle with PROCTOR_GATEWAY=testcloud."
else
  echo "RESULT: ISSUES — see FAIL lines above (401=bad/expired PAT or missing scopes; 403+2484=Action Center license; 404=wrong org/tenant segment; base=$UIPATH_BASE_URL)."
  exit 1
fi
