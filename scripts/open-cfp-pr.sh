#!/usr/bin/env bash
# Gathers the proposals from the Claude jobs in check-deadlines.yml into ONE rolling
# pull request, from the branch cfp-bot/checks.
#
# Runs in its own job, the only one holding a token that can write to the repo, and
# never runs Claude. Each <root>/proposal-<id>/ holds: id, change.patch, body.md and
# sources.md (the official pages and the detector's findings, from cfp-report.json).
#
# Every edition is one commit on the branch, its PR section in the commit message and
# its id in a `CFP-Edition:` trailer (which the detect job reads to skip editions
# already under review). While that pull request is open, each run rebuilds the branch
# on today's main, carrying its commits over, adds the new proposals on top, and
# rewrites the PR's title and body from the commits. A commit that no longer applies
# is dropped, with a comment on the PR; the next check proposes that edition afresh.
#
# A proposal becomes a commit only if it applies cleanly, touches exactly one
# conferences/*.yml or events/*.yml file, passes scripts/guard-cfp-proposal.ts, and
# passes validate + tests.
#
#   scripts/open-cfp-pr.sh proposals
set -euo pipefail
shopt -s nullglob

root=${1:-proposals}
branch=cfp-bot/checks
trailer=CFP-Edition
tmp=${RUNNER_TEMP:-$(mktemp -d)}
status=0
added=0
: > "$tmp/dropped.md"

refuse() {
  echo "::error title=CFP proposal refused::$1"
  git reset -q --hard
  status=1
}

# Text that came via a web page: defuse @-mentions so the PR notifies nobody.
defuse() { sed -E 's/@([A-Za-z0-9_-])/@\&#8203;\1/g'; }

git fetch -q origin main
git fetch -q origin "+refs/heads/$branch:refs/remotes/origin/$branch" 2>/dev/null || true
old=$(git rev-parse -q --verify "refs/remotes/origin/$branch" || true)

# The open pull request, if any. Only this repo's own branch counts.
pr=$(gh pr list --head "$branch" --state open --json number,isCrossRepository \
  --jq '[.[] | select(.isCrossRepository | not) | .number] | first // empty')

git switch -q --detach origin/main

# 1. Carry the open pull request's commits over to today's main.
if [[ -n $pr && -n $old ]]; then
  echo "::group::Carry over #$pr"
  for commit in $(git rev-list --reverse --no-merges "origin/main..$old"); do
    if git cherry-pick --cleanup=verbatim "$commit" > /dev/null 2>&1; then
      continue
    fi
    if git diff --quiet && git diff --cached --quiet; then
      git cherry-pick --skip # its change is on main already
    else
      git cherry-pick --abort
      subject=$(git log -1 --format=%s "$commit")
      echo "::warning title=CFP check::Dropped '$subject' ($commit): it no longer applies to main."
      echo "- $subject ($commit)" >> "$tmp/dropped.md"
    fi
  done
  if ! npm run -s validate || ! npm test --silent; then
    echo "::warning title=CFP check::#$pr fails validate or tests on today's main; starting it over."
    git log --reverse --format='- %s (%H)' origin/main..HEAD >> "$tmp/dropped.md"
    git reset -q --hard origin/main
  fi
  echo "::endgroup::"
fi

# 2. One commit per new proposal.
for dir in "$root"/proposal-*/; do
  id=$(tr -d '[:space:]' < "$dir/id")
  if [[ ! $id =~ ^[a-z0-9-]+$ ]]; then
    refuse "bad edition id in $dir"
    continue
  fi
  echo "::group::$id"

  if ! git apply --index --3way "$dir/change.patch"; then
    refuse "$id: the patch does not apply"
    echo "::endgroup::"
    continue
  fi

  mapfile -t files < <(git diff --cached --name-only)
  if [[ ${#files[@]} -ne 1 || ! ${files[0]} =~ ^(conferences|events)/[a-z0-9-]+\.yml$ ]]; then
    refuse "$id: the proposal touches '${files[*]:-nothing}', not one conferences/ or events/ YAML file"
    echo "::endgroup::"
    continue
  fi
  file=${files[0]}

  # Guarded against the branch as it stands, so each commit is checked on its own.
  if ! git show "HEAD:$file" > "$tmp/before.yml" 2> /dev/null \
    || ! npx tsx scripts/guard-cfp-proposal.ts --id "$id" --before "$tmp/before.yml" --after "$file"; then
    refuse "$id: the proposal edits fields a CFP check may not"
    echo "::endgroup::"
    continue
  fi

  if ! npm run -s validate || ! npm test --silent; then
    refuse "$id: validate or tests fail with the proposal applied"
    echo "::endgroup::"
    continue
  fi

  # Subject: first line of body.md. Everything in body.md came via a web page, so it
  # only ever travels as a file.
  subject=$(head -n1 "$dir/body.md" | tr -d '\r' | sed -E 's/^#+[[:space:]]*//' | cut -c1-120)
  [[ -n $subject ]] || subject="CFP check: $id"
  [[ $subject == "CFP check:"* ]] || subject="CFP check: $subject"
  {
    printf '%s\n\n' "$subject"
    if [[ -s $dir/sources.md ]]; then
      cat "$dir/sources.md"
      printf '\n### What Claude found\n\n'
    fi
    tail -n +2 "$dir/body.md" | sed "/^$trailer:/d"
    printf '\n%s: %s\n' "$trailer" "$id"
  } | defuse > "$tmp/message"
  git commit -q --cleanup=verbatim -F "$tmp/message"
  added=$((added + 1))
  echo "::endgroup::"
done

# 3. Publish.
if [[ $added -eq 0 && ! -s $tmp/dropped.md ]]; then
  echo "Nothing new for the CFP check pull request."
  git switch -q --detach origin/main
  exit $status
fi

if [[ $(git rev-list --count origin/main..HEAD) -eq 0 ]]; then
  if [[ -n $pr ]]; then
    { printf 'None of these changes apply to main any more; the next check proposes them afresh.\n\n'
      cat "$tmp/dropped.md"; } | defuse > "$tmp/comment.md"
    gh pr close "$pr" --comment "$(cat "$tmp/comment.md")"
  fi
  git switch -q --detach origin/main
  exit $status
fi

mapfile -t commits < <(git rev-list --reverse origin/main..HEAD)
editions=0
for commit in "${commits[@]}"; do
  if [[ -n $(git log -1 --format="%(trailers:key=$trailer,valueonly)" "$commit") ]]; then
    editions=$((editions + 1))
  fi
done
if [[ $editions -eq 1 ]]; then title='CFP check: 1 edition re-checked'
else title="CFP check: $editions editions re-checked"; fi

{
  # One row per commit. Subjects read "CFP check: <Name> <year> – <result>"; pipes are
  # escaped because the subject came via a web page.
  printf '| Edition | Result | Commit |\n|---|---|---|\n'
  for commit in "${commits[@]}"; do
    subject=$(git log -1 --format=%s "$commit" | sed -e 's/^CFP check: //' -e 's/|/\\|/g')
    name=${subject%% – *}
    result=${subject#"$name"}
    result=${result# – }
    printf '| %s | %s | %s |\n' "$name" "$result" "$(git rev-parse --short=8 "$commit")"
  done
  for commit in "${commits[@]}"; do
    [[ -n $(git log -1 --format="%(trailers:key=$trailer,valueonly)" "$commit") ]] || continue
    printf '\n---\n\n## %s\n\n' "$(git log -1 --format=%s "$commit" | sed 's/^CFP check: //')"
    git log -1 --format=%b "$commit" | sed "/^$trailer:/d"
  done
} | defuse | cat -s > "$tmp/sections.md"
{
  if [[ $(wc -c < "$tmp/sections.md") -gt 60000 ]]; then
    head -c 60000 "$tmp/sections.md"
    printf '\n\n*Truncated: each commit message holds its full section.*\n'
  else
    cat "$tmp/sections.md"
  fi
  printf '\n---\n'
  printf 'Proposed by the daily CFP check (`.github/workflows/check-deadlines.yml`), which '
  printf 'keeps adding to this pull request until it is merged or closed. '
  printf 'Check every change against the quoted official page before merging.\n\n'
  printf '🤖 Generated with [Claude Code](https://claude.com/claude-code)\n'
} > "$tmp/body.md"

# The lease refuses to overwrite a push somebody made to the branch during this run.
if ! git push -q --force-with-lease="refs/heads/$branch:$old" origin "HEAD:refs/heads/$branch"; then
  echo "::error title=CFP check::could not push $branch"
  exit 1
fi
if [[ -n $pr ]]; then
  gh pr edit "$pr" --title "$title" --body-file "$tmp/body.md"
  if [[ -s $tmp/dropped.md ]]; then
    { printf 'Dropped from this pull request because they no longer apply to main; '
      printf 'the next check proposes them afresh:\n\n'
      cat "$tmp/dropped.md"; } | defuse > "$tmp/comment.md"
    gh pr comment "$pr" --body-file "$tmp/comment.md"
  fi
elif ! gh pr create --base main --head "$branch" --title "$title" --body-file "$tmp/body.md"; then
  echo "::error title=CFP check::pushed $branch but could not open the pull request"
  status=1
fi

git switch -q --detach origin/main
exit $status
