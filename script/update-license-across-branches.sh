#!/bin/bash

set -euo pipefail

SOURCE_REF="HEAD"
APPLY=false
CURRENT_BRANCH="$(git branch --show-current)"
COMMIT_MESSAGE="chore(license): unify proprietary license and product naming"

FILES=(
  "LICENSE"
  "README.md"
  "package.json"
  "pnpm-lock.yaml"
  ".npmrc"
  "docker-compose.yml"
  "server/index.ts"
  "server/lib/response-compression.ts"
  "script/force-kill-ports.ts"
  "script/update-license-across-branches.sh"
  "script/validate-lts.sh"
  "scripts/ci-cd/common.sh"
  "scripts/ci-cd/docker-setup.sh"
  "scripts/ci-cd/github-actions.sh"
  "scripts/ci-cd-setup.sh"
  "scripts/ci-cd-setup-monolith-backup.sh"
  "scripts/simple-compliance-test.sh"
  "scripts/test-compliance-system.sh"
  "scripts/test-compliance-system-broken.sh"
  "xlibris-manager.sh"
)

usage() {
  cat <<EOF
Usage:
  ./script/update-license-across-branches.sh [--apply] [--source-ref <ref>] [branch ...]

Description:
  Copies the current licensing and naming files from <source-ref> to the target
  local branches and creates a commit on each branch if changes are detected.

Options:
  --apply            Execute changes. Without this flag the script runs in dry-run mode.
  --source-ref <ref> Git ref to copy files from. Default: HEAD.
  --help, -h         Show this help.

Examples:
  ./script/update-license-across-branches.sh
  ./script/update-license-across-branches.sh --apply dev_07.02.25 main
  ./script/update-license-across-branches.sh --apply --source-ref HEAD~1 dev_08.02.26
EOF
}

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree must be clean before running this script." >&2
  exit 1
fi

declare -a TARGET_BRANCHES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      APPLY=true
      shift
      ;;
    --source-ref)
      SOURCE_REF="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      TARGET_BRANCHES+=("$1")
      shift
      ;;
  esac
done

SOURCE_COMMIT="$(git rev-parse --verify "$SOURCE_REF")"

if [[ ${#TARGET_BRANCHES[@]} -eq 0 ]]; then
  while IFS= read -r branch; do
    [[ "$branch" == "$CURRENT_BRANCH" ]] && continue
    TARGET_BRANCHES+=("$branch")
  done < <(git for-each-ref --format='%(refname:short)' refs/heads)
fi

echo "Source ref: $SOURCE_REF"
echo "Source commit: $SOURCE_COMMIT"
echo "Current branch: $CURRENT_BRANCH"
echo "Target branches: ${TARGET_BRANCHES[*]:-<none>}"
echo "Files to copy:"
printf '  - %s\n' "${FILES[@]}"

if [[ "$APPLY" != "true" ]]; then
  echo
  echo "Dry run complete. Re-run with --apply to perform updates."
  exit 0
fi

cleanup() {
  git checkout "$CURRENT_BRANCH" >/dev/null 2>&1 || true
}

trap cleanup EXIT

for branch in "${TARGET_BRANCHES[@]}"; do
  echo
  echo "==> Updating $branch"
  git checkout "$branch" >/dev/null

  for file in "${FILES[@]}"; do
    if git cat-file -e "$SOURCE_COMMIT:$file" 2>/dev/null; then
      git checkout "$SOURCE_COMMIT" -- "$file"
    else
      echo "Skipping missing source file: $file"
    fi
  done

  if git diff --quiet HEAD -- "${FILES[@]}"; then
    echo "No changes needed on $branch"
    continue
  fi

  git add "${FILES[@]}"
  git commit -m "$COMMIT_MESSAGE"
done

echo
echo "Done. Returned to $CURRENT_BRANCH."
