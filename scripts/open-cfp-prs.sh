#!/usr/bin/env bash
# Turns each proposal from the Claude jobs in check-deadlines.yml into a pull request.
#
# Runs in its own job, the only one holding a token that can write to the repo, and
# never runs Claude. Each <root>/proposal-<id>/ holds: id, change.patch, body.md and
# sources.md (the official pages and the detector's findings, from cfp-report.json).
# A proposal becomes a PR only if it applies cleanly to main, touches exactly one
# conferences/*.yml file, passes scripts/guard-cfp-proposal.ts, and passes
# validate + tests.
#
#   scripts/open-cfp-prs.sh proposals
set -euo pipefail
shopt -s nullglob

root=${1:-proposals}
tmp=${RUNNER_TEMP:-$(mktemp -d)}
status=0

refuse() {
  echo "::error title=CFP proposal refused::$1"
  git reset -q --hard
  status=1
}

git fetch -q origin main

for dir in "$root"/proposal-*/; do
  id=$(tr -d '[:space:]' < "$dir/id")
  if [[ ! $id =~ ^[a-z0-9-]+$ ]]; then
    refuse "bad edition id in $dir"
    continue
  fi
  branch="cfp-bot/$id"
  echo "::group::$id"

  git switch -q --detach origin/main
  if ! git apply --index "$dir/change.patch"; then
    refuse "$id: the patch does not apply to main"
    echo "::endgroup::"
    continue
  fi

  mapfile -t files < <(git diff --cached --name-only)
  if [[ ${#files[@]} -ne 1 || ! ${files[0]} =~ ^conferences/[a-z0-9-]+\.yml$ ]]; then
    refuse "$id: the proposal touches '${files[*]:-nothing}', not one conferences/*.yml file"
    echo "::endgroup::"
    continue
  fi
  file=${files[0]}

  git show "origin/main:$file" > "$tmp/before.yml"
  if ! npx tsx scripts/guard-cfp-proposal.ts --id "$id" --before "$tmp/before.yml" --after "$file"; then
    refuse "$id: the proposal edits fields a CFP check may not"
    echo "::endgroup::"
    continue
  fi

  if ! npm run -s validate || ! npm test --silent; then
    refuse "$id: validate or tests fail with the proposal applied"
    echo "::endgroup::"
    continue
  fi

  # Title: first line of body.md. Everything in body.md came via a web page, so it
  # only ever travels as an argument or a file, and @-mentions are defused.
  title=$(head -n1 "$dir/body.md" | tr -d '\r' | sed -E 's/^#+[[:space:]]*//' | cut -c1-120)
  [[ -n $title ]] || title="CFP check: $id"
  [[ $title == "CFP check:"* ]] || title="CFP check: $title"
  {
    if [[ -s $dir/sources.md ]]; then
      cat "$dir/sources.md"
      printf '\n### What Claude found\n\n'
    fi
    tail -n +2 "$dir/body.md" | sed -E 's/@([A-Za-z0-9_-])/@\&#8203;\1/g'
    printf '\n---\n'
    printf 'Proposed by the daily CFP check (`.github/workflows/check-deadlines.yml`). '
    printf 'Check every change against the quoted official page before merging.\n\n'
    printf '🤖 Generated with [Claude Code](https://claude.com/claude-code)\n'
  } > "$tmp/body.md"

  git commit -q -m "$title" -m "Proposed by the daily CFP check."
  if ! git push -q --force origin "HEAD:refs/heads/$branch"; then
    refuse "$id: could not push $branch"
    echo "::endgroup::"
    continue
  fi
  if [[ -n $(gh pr list --head "$branch" --state open --json number --jq '.[].number') ]]; then
    echo "$id: a pull request for $branch is already open; pushed the update to it."
  elif ! gh pr create --base main --head "$branch" --title "$title" --body-file "$tmp/body.md"; then
    refuse "$id: pushed $branch but could not open the pull request"
  fi
  echo "::endgroup::"
done

git switch -q --detach origin/main
exit $status
