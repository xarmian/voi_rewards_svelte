# Voi Rewards Auditor

VOI Rewards Auditor is a tool to help estimate and calculate rewards for running a node on the VOI blockchain network.

The network is currently in TestNet, and TestNet is a game. Token amounts will reset prior to MainNet.

This is the source code for the website, located at [https://voirewards.com](https://voirewards.com).
This website is an unofficial resource. It is not affiliated with the VOI Core Team.

The website is written using the [Svelte framework](https://svelte.dev).

To run locally:

```
git clone https://github.com/xarmian/voi_rewards_svelte.git
cd voi_rewards_svelte
npm i
npm run dev
```

## Deployments

Vercel runs `scripts/vercel-ignore.sh` before every build (`vercel.json` `ignoreCommand`) to save build minutes:

- **Production (main):** builds unless the merge changed only docs or tests (`*.md` outside `src/` and `static/`, `*.test.ts`, `tests/`, `.github/`, `scripts/` other than `generateFaqData.js` and the ignore script). If the previous deployment's SHA is missing or the diff fails, it builds.
- **Previews (other branches):** build only when the commit message contains `[preview]`. Add it to the last commit you want a preview of, e.g. `git commit --allow-empty -m "chore: [preview]"`. Squash merges drop it.

Test the rules with `bash scripts/vercel-ignore.test.sh`.
