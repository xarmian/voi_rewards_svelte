import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveVoiUsd, VOI_USD_MAX_AGE_MS } from "./voiUsdReference.ts";

const now = Date.parse("2026-10-25T12:00:00Z");
const freshTime = (now - 60_000) / 1000;
const freshIso = new Date(freshTime * 1000).toISOString();

test("a fresh $0.01 VOI value is accepted without a price ceiling", () => {
  assert.deepEqual(resolveVoiUsd([{ time: freshTime, value: 0.01 }], now), {
    voiUsd: 0.01,
    status: "ok",
    asOf: freshIso,
  });
});

test("a fresh $0.000126 VOI value is accepted", () => {
  assert.equal(
    resolveVoiUsd([{ time: freshTime, value: 0.000126 }], now).status,
    "ok",
  );
  assert.equal(
    resolveVoiUsd([{ time: freshTime, value: 0.000126 }], now).voiUsd,
    0.000126,
  );
});

test("zero, negative, non-numeric and non-finite prices are invalid", () => {
  for (const value of [0, -1, NaN, "abc", Infinity]) {
    assert.deepEqual(resolveVoiUsd([{ time: freshTime, value }], now), {
      voiUsd: null,
      status: "invalid",
      asOf: freshIso,
    });
  }
});

test("empty and non-array series are unavailable", () => {
  for (const series of [[], null, {}]) {
    assert.deepEqual(resolveVoiUsd(series, now), {
      voiUsd: null,
      status: "unavailable",
      asOf: null,
    });
  }
});

// Stale keeps the value (the price is valid, only its age is unproven) so the
// markets math does not zero every VOI-quoted pool when the feed lags (TASK-21 r1).
test("two-hour-old points are stale and 59-minute-old points are fresh", () => {
  assert.equal(VOI_USD_MAX_AGE_MS, 60 * 60 * 1000);
  const oldTime = now - 2 * 60 * 60 * 1000;
  assert.deepEqual(
    resolveVoiUsd([{ time: oldTime / 1000, value: 0.01 }], now),
    {
      voiUsd: 0.01,
      status: "stale",
      asOf: new Date(oldTime).toISOString(),
    },
  );
  assert.equal(
    resolveVoiUsd([{ time: (now - 59 * 60_000) / 1000, value: 0.01 }], now)
      .status,
    "ok",
  );
  assert.equal(
    resolveVoiUsd([{ time: freshTime, value: 0.01 }], now, 30_000).status,
    "stale",
  );
});

test("epoch seconds, ISO strings and numeric strings all parse", () => {
  for (const time of [freshTime, freshIso, String(freshTime)]) {
    assert.deepEqual(resolveVoiUsd([{ time, value: "0.01" }], now), {
      voiUsd: 0.01,
      status: "ok",
      asOf: freshIso,
    });
  }
});

test("only the last element determines the reference", () => {
  assert.equal(
    resolveVoiUsd(
      [null, { time: "bad", value: -1 }, { time: freshTime, value: 0.01 }],
      now,
    ).voiUsd,
    0.01,
  );
  assert.equal(
    resolveVoiUsd(
      [
        { time: freshTime, value: 0.01 },
        { time: freshTime, value: 0 },
      ],
      now,
    ).status,
    "invalid",
  );
  assert.equal(resolveVoiUsd([null], now).status, "invalid");
});

test("unparseable times are stale and points beyond five minutes in the future are invalid", () => {
  for (const time of ["not-a-date", "", null, Infinity, 1e20]) {
    assert.deepEqual(resolveVoiUsd([{ time, value: 0.01 }], now), {
      voiUsd: 0.01,
      status: "stale",
      asOf: null,
    });
  }
  const futureTime = now + 5 * 60_000 + 1_000;
  assert.deepEqual(
    resolveVoiUsd([{ time: futureTime / 1000, value: 0.01 }], now),
    {
      voiUsd: null,
      status: "invalid",
      asOf: new Date(futureTime).toISOString(),
    },
  );
  assert.equal(
    resolveVoiUsd([{ time: (now + 5 * 60_000) / 1000, value: 0.01 }], now)
      .status,
    "ok",
  );
});
