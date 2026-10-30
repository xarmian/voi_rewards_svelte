#!/usr/bin/env bash
# Seat gate (TASK-33): fail when a file this branch changes has a svelte-check error that the
# same file does not have at the merge base with origin/main. Errors are matched per file by
# message, ignoring line numbers, so code that only moves is not reported as new.
# Usage: scripts/check-changed.sh [base-ref]   (default origin/main; run after npm ci)
set -euo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"
base=$(git merge-base "${1:-origin/main}" HEAD)

# svelte-kit sync types $env/static/* from the environment; placeholders give the same types.
for name in PUBLIC_SUPABASE_URL PUBLIC_SUPABASE_ANON_KEY PUBLIC_MIMIR_URL PUBLIC_MIMIR_ANON_KEY \
	PUBLIC_WALLETCONNECT_PROJECT_ID PUBLIC_DS_GALLERY PRIVATE_SUPABASE_ROLE_KEY; do
	export "$name=${!name:-x}"
done

mapfile -t changed < <(
	{
		git diff --name-only --diff-filter=d "$base" -- 'src/**'
		git ls-files --others --exclude-standard -- 'src/**'
	} | grep -E '\.(svelte|ts|js)$' | sort -u
)
if [ ${#changed[@]} -eq 0 ]; then
	echo "check-changed: no changed source files against ${base:0:7}"
	exit 0
fi

tmp=$(mktemp -d)
cleanup() {
	git worktree remove --force "$tmp/base" >/dev/null 2>&1 || true
	rm -rf "$tmp"
}
trap cleanup EXIT

errors() { # $1 = checkout dir, $2 = output file
	(cd "$1" && npx svelte-kit sync >/dev/null && npx svelte-check --tsconfig ./tsconfig.json --output machine) \
		>"$2" 2>/dev/null || true
	grep -q ' COMPLETED ' "$2" || { echo "check-changed: svelte-check did not complete in $1" >&2; exit 2; }
}

errors "$root" "$tmp/head.txt"
git worktree add --detach --quiet "$tmp/base" "$base"
# svelte-check only reads dependencies, so the base checkout borrows this one's.
ln -s "$root/node_modules" "$tmp/base/node_modules"
errors "$tmp/base" "$tmp/base.txt"

printf '%s\n' "${changed[@]}" >"$tmp/changed.txt"
node - "$tmp/changed.txt" "$tmp/base.txt" "$tmp/head.txt" <<'EOF'
const fs = require('fs');
const [changedFile, baseFile, headFile] = process.argv.slice(2);
const changed = new Set(fs.readFileSync(changedFile, 'utf8').split('\n').filter(Boolean));
// Machine lines: <time> ERROR "<file>" <line>:<col> "<message>"
const parse = (file) => {
	const counts = new Map();
	const lines = [];
	for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
		const m = line.match(/^\d+ ERROR "([^"]+)" (\d+:\d+) (".*")$/);
		if (!m || !changed.has(m[1])) continue;
		const key = `${m[1]}\u0000${m[3]}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
		lines.push({ key, file: m[1], at: m[2], message: JSON.parse(m[3]) });
	}
	return { counts, lines };
};
const base = parse(baseFile);
const head = parse(headFile);
const fresh = [];
for (const [key, count] of head.counts) {
	const extra = count - (base.counts.get(key) ?? 0);
	if (extra > 0) fresh.push(...head.lines.filter((l) => l.key === key).slice(-extra));
}
const total = (r) => [...r.counts.values()].reduce((a, b) => a + b, 0);
console.log(
	`check-changed: ${changed.size} changed files; errors in them: base ${total(base)}, head ${total(head)}, new ${fresh.length}`
);
for (const l of fresh) console.log(`NEW ${l.file}:${l.at} ${l.message.split('\n')[0]}`);
process.exit(fresh.length ? 1 : 0);
EOF
