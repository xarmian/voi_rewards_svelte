#!/usr/bin/env bash
# Table test for scripts/vercel-ignore.sh (TASK-105). Builds a throwaway git
# repo with one commit per case and checks the exit code (0 = skip, 1 = build).
# usage: bash scripts/vercel-ignore.test.sh

script="$(cd "$(dirname "$0")" && pwd)/vercel-ignore.sh"
repo=$(mktemp -d)
trap 'rm -rf "$repo"' EXIT
cd "$repo" || exit 2
git init -q
git config user.email t@example.com
git config user.name t

commit() { # commit <path>...: touch each path and commit; prints the new sha
	for p in "$@"; do
		mkdir -p "$(dirname "$p")"
		echo "$RANDOM" >> "$p"
	done
	git add -A
	git commit -qm "change $*"
	git rev-parse HEAD
}

base=$(commit src/app.ts README.md)
code=$(commit src/routes/+page.svelte)
docs=$(commit README.md src/lib/x.test.ts tests/e2e.spec.ts .github/workflows/ci.yml scripts/check-changed.sh)
faq=$(commit static/content/faq/a.md)
gen=$(commit scripts/generateFaqData.js)
self=$(commit scripts/vercel-ignore.sh)
mixed=$(commit README.md src/lib/y.ts)
srcmd=$(commit src/lib/notes.md)
root=$(commit package.json vite.config.ts)
supa=$(commit supabase/functions/f/index.ts)

fail=0
check() { # check <name> <expected exit> <env assignments...>
	local name=$1 want=$2
	shift 2
	out=$(env -i PATH="$PATH" "$@" bash "$script" 2>&1)
	got=$?
	if [ "$got" = "$want" ]; then
		echo "PASS $name -> $got ($out)"
	else
		echo "FAIL $name: want $want, got $got ($out)"
		fail=1
	fi
}

check "main code change builds" 1 VERCEL_ENV=production VERCEL_GIT_PREVIOUS_SHA="$base" VERCEL_GIT_COMMIT_SHA="$code"
check "main docs/tests-only skips" 0 VERCEL_ENV=production VERCEL_GIT_PREVIOUS_SHA="$code" VERCEL_GIT_COMMIT_SHA="$docs"
check "main with no previous sha builds" 1 VERCEL_ENV=production VERCEL_GIT_COMMIT_SHA="$docs"
check "branch without the tag skips" 0 VERCEL_ENV=preview VERCEL_GIT_COMMIT_MESSAGE="fix: thing"
check "branch with the tag builds" 1 VERCEL_ENV=preview VERCEL_GIT_COMMIT_MESSAGE="chore: [preview]"
check "main unknown previous sha builds" 1 VERCEL_ENV=production VERCEL_GIT_PREVIOUS_SHA=0123456789abcdef0123456789abcdef01234567 VERCEL_GIT_COMMIT_SHA="$docs"
check "main FAQ content .md builds" 1 VERCEL_ENV=production VERCEL_GIT_PREVIOUS_SHA="$docs" VERCEL_GIT_COMMIT_SHA="$faq"
check "main generateFaqData.js builds" 1 VERCEL_ENV=production VERCEL_GIT_PREVIOUS_SHA="$faq" VERCEL_GIT_COMMIT_SHA="$gen"
check "main ignore-script change builds" 1 VERCEL_ENV=production VERCEL_GIT_PREVIOUS_SHA="$gen" VERCEL_GIT_COMMIT_SHA="$self"
check "main docs plus code builds" 1 VERCEL_ENV=production VERCEL_GIT_PREVIOUS_SHA="$self" VERCEL_GIT_COMMIT_SHA="$mixed"
check "main .md under src builds" 1 VERCEL_ENV=production VERCEL_GIT_PREVIOUS_SHA="$mixed" VERCEL_GIT_COMMIT_SHA="$srcmd"
check "main empty diff builds" 1 VERCEL_ENV=production VERCEL_GIT_PREVIOUS_SHA="$code" VERCEL_GIT_COMMIT_SHA="$code"
check "main root config change builds" 1 VERCEL_ENV=production VERCEL_GIT_PREVIOUS_SHA="$srcmd" VERCEL_GIT_COMMIT_SHA="$root"
check "main supabase change builds" 1 VERCEL_ENV=production VERCEL_GIT_PREVIOUS_SHA="$root" VERCEL_GIT_COMMIT_SHA="$supa"
check "unset VERCEL_ENV without tag skips" 0 VERCEL_GIT_COMMIT_MESSAGE="x"

[ "$fail" = 0 ] && echo "ALL PASS" || echo "SOME FAIL"
exit "$fail"
