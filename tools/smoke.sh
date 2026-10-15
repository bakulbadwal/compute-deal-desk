#!/usr/bin/env bash
# Load every route in headless Chrome and fail if a step errors or renders without a solved readout.
# Needs the local server: python3 tools/serve.py (port 8817).
set -u
CH="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
BASE="${BASE:-http://localhost:8817}"
PROFILE="$(mktemp -d)"
fail=0
for r in "" s0 s1 s2 s3 s4 s5 s6 s7 s8 cap test; do
  dom="$("$CH" --headless=new --disable-gpu --user-data-dir="$PROFILE" --virtual-time-budget=12000 --dump-dom "$BASE/#/$r" 2>/dev/null)"
  if grep -q "Something went wrong" <<<"$dom"; then echo "FAIL  #/$r  (error callout)"; fail=1
  elif [ -n "$r" ] && ! grep -q 'class="stepnav"' <<<"$dom"; then echo "FAIL  #/$r  (step did not finish rendering)"; fail=1
  else echo "ok    #/$r"; fi
done
exit $fail
