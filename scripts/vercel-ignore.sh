#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand), TASK-105.
# Exit 0 = skip the build, exit 1 = build. Any unexpected failure exits
# non-zero, so production fails open (builds).
#
# - Production: build unless every file changed since the last production
#   deployment is docs or tests only. No previous SHA, or a failed diff: build.
# - Any other environment (previews): build only when the commit message
#   contains "[preview]".

decide() {
	echo "vercel-ignore: $2"
	exit "$1"
}

# Docs/tests-only paths. Markdown under src/ and static/ is site content
# (static/content/faq feeds the build), and generateFaqData.js and this script
# drive the build, so changes to those always build.
is_skippable() {
	case "$1" in
		src/* | static/*) [[ "$1" == *.test.ts ]] ;;
		scripts/generateFaqData.js | scripts/vercel-ignore.sh) return 1 ;;
		*.md | *.test.ts | tests/* | .github/* | scripts/*) return 0 ;;
		*) return 1 ;;
	esac
}

if [ "${VERCEL_ENV:-}" != "production" ]; then
	case "${VERCEL_GIT_COMMIT_MESSAGE:-}" in
		*"[preview]"*) decide 1 "build: ${VERCEL_ENV:-unset} commit message contains [preview]" ;;
		*) decide 0 "skip: ${VERCEL_ENV:-unset} commit message has no [preview] tag" ;;
	esac
fi

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
head="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
[ -n "$prev" ] || decide 1 "build: production with no VERCEL_GIT_PREVIOUS_SHA"

if ! changed=$(git diff --name-only "$prev" "$head" 2>/dev/null); then
	decide 1 "build: production, git diff $prev..$head failed"
fi
[ -n "$changed" ] || decide 1 "build: production, empty diff $prev..$head"

while IFS= read -r file; do
	is_skippable "$file" || decide 1 "build: production, $file changed since $prev"
done <<< "$changed"

decide 0 "skip: production, only docs/tests changed since $prev ($(wc -l <<< "$changed") files)"
