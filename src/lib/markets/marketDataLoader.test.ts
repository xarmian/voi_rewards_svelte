import { test } from "vitest";
import assert from "node:assert/strict";
import {
  createMarketDataLoader,
  EMPTY_AGGREGATES,
} from "./marketDataLoader.ts";
import type { MarketDataState } from "./marketDataLoader.ts";

function deferredFetch() {
  const requests = new Map<
    string,
    {
      resolve: (response: Response) => void;
      reject: (reason: Error) => void;
    }[]
  >();
  const fetchFn = (url: string) =>
    new Promise<Response>((resolve, reject) => {
      const pending = requests.get(url) ?? [];
      pending.push({ resolve, reject });
      requests.set(url, pending);
    });
  const request = (tokenId: number, index = 0) => {
    const pending = requests.get(`/api/markets?tokenId=${tokenId}`)?.[index];
    assert.ok(pending, `Missing request for token ${tokenId}`);
    return pending;
  };
  return { fetchFn, requests, request };
}

const token1Rows = [{ pair: "ONE/VOI" }];
const token2Rows = [{ pair: "TWO/VOI" }];
const aggregates = { totalVolume: 12, totalTvl: 34, weightedAveragePrice: 0.1 };
const supply = { circulatingSupply: 100, percentDistributed: 20 };
const seeded: Partial<MarketDataState> = {
  tokenId: 1,
  marketData: token1Rows,
  aggregates,
  circulatingSupply: supply,
  voiUsdStatus: "stale",
  voiUsdAsOf: "2026-10-25T10:00:00Z",
};

function setup(initial?: Partial<MarketDataState>) {
  const fake = deferredFetch();
  const states: MarketDataState[] = [];
  const loader = createMarketDataLoader(
    fake.fetchFn,
    (state) => states.push(state),
    initial,
  );
  return { ...fake, loader, states };
}

test("race: a late token 1 result cannot replace token 2", async () => {
  const { loader, request } = setup();
  const first = loader.load(1);
  const second = loader.load(2);
  request(2).resolve(
    Response.json({
      marketData: token2Rows,
      aggregates,
      circulatingSupply: supply,
    }),
  );
  assert.equal(await second, true);
  const currentState = loader.state;
  request(1).resolve(Response.json({ marketData: token1Rows }));
  assert.equal(await first, false);
  assert.deepEqual(loader.state.marketData, token2Rows);
  assert.equal(loader.state.tokenId, 2);
  assert.strictEqual(loader.state, currentState);
  assert.deepEqual(loader.state.aggregates, aggregates);
  assert.deepEqual(loader.state.circulatingSupply, supply);
});

test("race: a late token 1 rejection cannot change token 2 or its error", async () => {
  const { loader, request } = setup();
  const first = loader.load(1);
  const second = loader.load(2);
  request(2).resolve(Response.json({ marketData: token2Rows }));
  assert.equal(await second, true);
  request(1).reject(new Error("Old request failed"));
  assert.equal(await first, false);
  assert.equal(loader.state.tokenId, 2);
  assert.deepEqual(loader.state.marketData, token2Rows);
  assert.equal(loader.state.error, null);
  assert.equal(loader.state.loading, false);
});

test("failed switch clears rows and aggregates for the newly selected token", async () => {
  const { loader, request } = setup(seeded);
  const pending = loader.load(2);
  request(2).resolve(new Response("Server error", { status: 500 }));
  assert.equal(await pending, true);
  assert.equal(loader.state.tokenId, 2);
  assert.deepEqual(loader.state.marketData, []);
  assert.deepEqual(loader.state.aggregates, EMPTY_AGGREGATES);
  assert.ok(loader.state.error);
  assert.equal(loader.state.loading, false);
  assert.deepEqual(loader.state.circulatingSupply, supply);
});

test("switch clears rows immediately before the response resolves", async () => {
  const { loader, request, states } = setup(seeded);
  const pending = loader.load(2);
  assert.deepEqual(states.at(-1), {
    tokenId: 2,
    marketData: [],
    aggregates: EMPTY_AGGREGATES,
    circulatingSupply: supply,
    voiUsdStatus: null,
    voiUsdAsOf: null,
    loading: true,
    error: null,
  });
  request(2).resolve(Response.json({ marketData: token2Rows }));
  await pending;
});

test("dedupe skips seeded rows, force refreshes, and concurrent loads share a promise", async () => {
  const { loader, request, requests } = setup(seeded);
  assert.equal(await loader.load(1), false);
  assert.equal(requests.size, 0);
  const refresh = loader.load(1, { force: true });
  assert.deepEqual(loader.state.marketData, token1Rows);
  assert.equal(loader.state.loading, true);
  request(1).resolve(Response.json({ marketData: token1Rows }));
  assert.equal(await refresh, true);
  const first = loader.load(3);
  const second = loader.load(3);
  assert.strictEqual(first, second);
  assert.equal(requests.get("/api/markets?tokenId=3")?.length, 1);
  request(3).resolve(Response.json({ marketData: [{ pair: "THREE/VOI" }] }));
  assert.equal(await first, true);
  assert.equal(await second, true);
});

test("TASK-27: a seeded empty result for the same token is settled and not refetched", async () => {
  const { loader, requests } = setup({ ...seeded, marketData: [] });
  assert.equal(await loader.load(1), false);
  assert.equal(requests.size, 0);
});

test("TASK-27: a seeded server failure is retried for the same token", async () => {
  const { loader, request, requests } = setup({
    ...seeded,
    marketData: [],
    error: "Failed to fetch market data",
  });
  const pending = loader.load(1);
  assert.equal(requests.get("/api/markets?tokenId=1")?.length, 1);
  request(1).resolve(Response.json({ marketData: token1Rows }));
  assert.equal(await pending, true);
  assert.deepEqual(loader.state.marketData, token1Rows);
  assert.equal(loader.state.error, null);
});

test("TASK-27: an empty result loaded on the client is reused for the same token", async () => {
  const { loader, request, requests } = setup();
  const first = loader.load(5);
  request(5).resolve(Response.json({ marketData: [] }));
  assert.equal(await first, true);
  assert.equal(await loader.load(5), false);
  assert.equal(requests.get("/api/markets?tokenId=5")?.length, 1);
});

test("a JSON error on HTTP 200 is a failure and clears refreshed rows", async () => {
  const { loader, request } = setup(seeded);
  const pending = loader.load(1, { force: true });
  request(1).resolve(Response.json({ error: "x" }));
  assert.equal(await pending, true);
  assert.equal(loader.state.error, "x");
  assert.deepEqual(loader.state.marketData, []);
  assert.deepEqual(loader.state.aggregates, EMPTY_AGGREGATES);
  assert.equal(loader.state.loading, false);
});

test("isCurrent rejects an older request id after a newer load", async () => {
  const { loader, request } = setup();
  const first = loader.load(1);
  const oldId = loader.currentRequestId;
  assert.equal(loader.isCurrent(oldId), true);
  const second = loader.load(2);
  assert.ok(loader.currentRequestId > oldId);
  assert.equal(loader.isCurrent(oldId), false);
  assert.equal(loader.isCurrent(loader.currentRequestId), true);
  request(1).resolve(Response.json({ marketData: token1Rows }));
  request(2).resolve(Response.json({ marketData: token2Rows }));
  await Promise.all([first, second]);
});

test("a forced request supersedes an in-flight request for the same token", async () => {
  const { loader, request } = setup();
  const first = loader.load(1);
  const second = loader.load(1, { force: true });
  request(1, 1).reject(new Error("Network unavailable"));
  assert.equal(await second, true);
  assert.equal(loader.state.error, "Network unavailable");
  request(1).resolve(Response.json({ marketData: token1Rows }));
  assert.equal(await first, false);
  assert.deepEqual(loader.state.marketData, []);
  assert.equal(loader.state.error, "Network unavailable");
});

test("success guards non-array rows, defaults aggregates, and retains supply", async () => {
  const { loader, request } = setup(seeded);
  const pending = loader.load(2);
  request(2).resolve(Response.json({ marketData: {} }));
  assert.equal(await pending, true);
  assert.deepEqual(loader.state.marketData, []);
  assert.deepEqual(loader.state.aggregates, EMPTY_AGGREGATES);
  assert.deepEqual(loader.state.circulatingSupply, supply);
  assert.equal(loader.state.error, null);
  assert.equal(loader.state.loading, false);
});


test("VOI/USD status and asOf are initially null and applied on success", async () => {
  const { loader, request } = setup();
  assert.equal(loader.state.voiUsdStatus, null);
  assert.equal(loader.state.voiUsdAsOf, null);
  for (const voiUsdStatus of ["ok", "stale", "invalid", "unavailable"] as const) {
    const pending = loader.load(1, { force: true });
    const voiUsdAsOf = "2026-10-25T11:00:00Z";
    request(1, ["ok", "stale", "invalid", "unavailable"].indexOf(voiUsdStatus)).resolve(
      Response.json({ marketData: token1Rows, voiUsdStatus, voiUsdAsOf }),
    );
    await pending;
    assert.equal(loader.state.voiUsdStatus, voiUsdStatus);
    assert.equal(loader.state.voiUsdAsOf, voiUsdAsOf);
  }
});

test("VOI/USD status and asOf reset immediately on token switch", async () => {
  const { loader, request } = setup(seeded);
  const pending = loader.load(2);
  assert.equal(loader.state.voiUsdStatus, null);
  assert.equal(loader.state.voiUsdAsOf, null);
  request(2).resolve(Response.json({ marketData: token2Rows }));
  await pending;
  assert.equal(loader.state.voiUsdStatus, null);
  assert.equal(loader.state.voiUsdAsOf, null);
});

test("VOI/USD status and asOf reset on refresh failure", async () => {
  const { loader, request } = setup(seeded);
  const pending = loader.load(1, { force: true });
  assert.equal(loader.state.voiUsdStatus, seeded.voiUsdStatus);
  assert.equal(loader.state.voiUsdAsOf, seeded.voiUsdAsOf);
  request(1).reject(new Error("Network unavailable"));
  await pending;
  assert.equal(loader.state.voiUsdStatus, null);
  assert.equal(loader.state.voiUsdAsOf, null);
});
