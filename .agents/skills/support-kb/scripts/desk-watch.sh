#!/usr/bin/env bash
# Desk watch: re-take the desk snapshot every N seconds, and write every change, with the real time,
# to a watch log. Run it in the background for a whole work session, not only around a claim:
# "the desk keeps working while you do".
#
#   desk-watch.sh <out-dir> [interval-seconds=300] [rounds=0 (forever)]
#
# <out-dir> gets snapshots (snap-HHMMSS.txt), last.txt and watch.log. Keep it OUTSIDE this repo
# (the repo holds the deliverable only). Changes made by us show too: they are labelled by the log
# line they come from, so read watch.log next to the challenge log.
# Not covered: the course's resume-challenge reply (an MCP tool, not reachable from a shell) — call it
# by hand when the log shows a change.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:?usage: desk-watch.sh <out-dir> [interval] [rounds]}"; every="${2:-300}"; rounds="${3:-0}"
mkdir -p "$out"; log="$out/watch.log"; n=0
echo "$(date '+%F %T %Z') watch start · every ${every}s · rounds ${rounds}" >> "$log"
while :; do
  n=$((n + 1)); stamp="$(date '+%H%M%S')"; snap="$out/snap-$stamp.txt"
  bash "$here/desk-snapshot.sh" > "$snap" 2>&1
  if [ -f "$out/last.txt" ]; then
    if d="$(diff "$out/last.txt" "$snap")"; then
      echo "$(date '+%F %T %Z') no change" >> "$log"; rm -f "$snap"
    else
      { echo "$(date '+%F %T %Z') CHANGE (snap-$stamp.txt)"; echo "$d" | sed 's/^/    /'; } >> "$log"
      echo "desk changed at $(date '+%T') — see $log"
    fi
  else
    echo "$(date '+%F %T %Z') baseline snap-$stamp.txt" >> "$log"
  fi
  cp "$snap" "$out/last.txt" 2>/dev/null || true
  [ "$rounds" -gt 0 ] && [ "$n" -ge "$rounds" ] && break
  sleep "$every"
done
echo "$(date '+%F %T %Z') watch stop after $n rounds" >> "$log"
