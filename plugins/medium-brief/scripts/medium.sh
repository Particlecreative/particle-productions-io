#!/usr/bin/env bash
# MEDIUM from Claude desktop / Cowork: queue briefs in the CP and read them back.
#
#   medium.sh generate '<json>'        POST /api/medium/generate          → {"queued":N,"ids":[…]}
#   medium.sh freeform '<json>'        POST /api/medium/freeform          → {"queued":1,"id":"…"}
#   medium.sh hooks '<json>'           POST /api/medium/static-hooks/generate
#   medium.sh briefs <id,id,…>         GET  /api/medium/briefs?ids=…      → {"briefs":[…]}
#   medium.sh brief <id>               GET  /api/medium/briefs/<id>       (the full brief)
#   medium.sh wait <id,id,…> [secs]    poll until none is QUEUED / WRITING (default 480 s), then print them
#   medium.sh overview                 GET  /api/medium/overview          (lanes, products, moves)
#   Pass '-' instead of the JSON to read it from stdin.
#
# Needs MEDIUM_TOKEN in the environment (the CP's Medium service token — set it in your Claude settings "env",
# never in a file inside a repo, never pasted into a chat). Optional MEDIUM_URL (default https://particlepdio.particleface.com).
set -euo pipefail

BASE="${MEDIUM_URL:-https://particlepdio.particleface.com}"
BASE="${BASE%/}/api/medium"

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
[ $# -ge 1 ] || usage
if [ -z "${MEDIUM_TOKEN:-}" ]; then
  echo "MEDIUM_TOKEN is not set. Ask your CP admin for the Medium token and add it to the \"env\" block of your Claude settings (not to a chat or a repo file)." >&2
  exit 3
fi

# One request. The token goes to curl through stdin (-K -), so it never shows in the process list.
call() {
  local method="$1" path="$2" body="${3:-}" out code=000 rc=0
  out="$(mktemp)"
  if [ -n "$body" ]; then
    code="$(printf 'header = "X-Medium-Token: %s"\n' "$MEDIUM_TOKEN" | curl -sS -K - -X "$method" -H 'Content-Type: application/json' \
      --data-binary "$body" -o "$out" -w '%{http_code}' --max-time 60 "$BASE$path")" || rc=$?
  else
    code="$(printf 'header = "X-Medium-Token: %s"\n' "$MEDIUM_TOKEN" | curl -sS -K - -X "$method" \
      -o "$out" -w '%{http_code}' --max-time 60 "$BASE$path")" || rc=$?
  fi
  if [ "$rc" -ne 0 ]; then rm -f "$out"; echo "Could not reach MEDIUM at $BASE" >&2; return 1; fi
  cat "$out"; echo; rm -f "$out"
  if [ "$code" -ge 400 ]; then echo "MEDIUM answered HTTP $code" >&2; return 1; fi
}

body_of() { if [ "${1:-}" = "-" ]; then cat; else printf '%s' "${1:-}"; fi; }
ids_ok() { [[ "${1:-}" =~ ^[0-9a-fA-F-]{36}(,[0-9a-fA-F-]{36})*$ ]] || { echo "Brief ids look like 7e4c85f3-…, comma-separated" >&2; exit 2; }; }

cmd="$1"; shift
case "$cmd" in
  generate) b="$(body_of "${1:-}")"; [ -n "$b" ] || usage; call POST /generate "$b" ;;
  freeform) b="$(body_of "${1:-}")"; [ -n "$b" ] || usage; call POST /freeform "$b" ;;
  hooks)    b="$(body_of "${1:-}")"; [ -n "$b" ] || usage; call POST /static-hooks/generate "$b" ;;
  briefs)   ids_ok "${1:-}"; call GET "/briefs?ids=$1" ;;
  brief)    ids_ok "${1:-}"; call GET "/briefs/$1" ;;
  overview) call GET /overview ;;
  wait)
    ids_ok "${1:-}"
    limit="${2:-480}"; start="$(date +%s)"
    while :; do
      json="$(call GET "/briefs?ids=$1")" || exit 1
      if ! printf '%s' "$json" | grep -Eq '"status":"(QUEUED|WRITING)"'; then printf '%s\n' "$json"; exit 0; fi
      if [ $(( $(date +%s) - start )) -ge "$limit" ]; then
        printf '%s\n' "$json"; echo "Still writing after ${limit}s — check again later with: medium.sh briefs $1" >&2; exit 4
      fi
      sleep 10
    done ;;
  *) usage ;;
esac
