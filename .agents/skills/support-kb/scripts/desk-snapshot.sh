#!/usr/bin/env bash
# Desk state snapshot: everything in the repo and on the course side that could change during a round.
R=wojciechbednarz/mega-s01e03-kb
echo "## issues"; gh issue list -R $R --state all --limit 100 --json number,title,state,stateReason,labels,comments,updatedAt -q '.[] | "#\(.number) \(.state)/\(.stateReason) labels=\([.labels[].name]|join(",")) comments=\(.comments|length) updated=\(.updatedAt) \(.title)"'
echo "## comments by others"; gh api repos/$R/issues/comments -q '.[] | select(.user.login!="wojciechbednarz") | "\(.created_at) \(.user.login): \(.body[0:300])"'
echo "## events by others"; gh api repos/$R/events -q '.[] | select(.actor.login!="wojciechbednarz") | "\(.created_at) \(.type) \(.actor.login)"'
echo "## branches"; gh api repos/$R/branches -q '.[].name'
echo "## export"; curl -s https://hq.mega.dev/media/what-it-shows/kb-export-267efc5e.zip | sha256sum
