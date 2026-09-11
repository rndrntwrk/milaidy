import assert from "node:assert/strict";
import test from "node:test";

import {
  AliceBuildkitTimingError,
  buildAliceBuildkitTimingReport,
  parseConcatenatedJson,
} from "./alice_buildkit_timing.mjs";

function span(name, startSeconds, endSeconds) {
  const iso = (seconds) =>
    `2026-08-31T00:00:${String(seconds).padStart(2, "0")}.000000000Z`;
  return JSON.stringify(
    { Name: name, StartTime: iso(startSeconds), EndTime: iso(endSeconds) },
    null,
    2,
  );
}

async function expectPredicate(fn, predicateId) {
  await assert.rejects(fn, (error) => {
    assert.ok(error instanceof AliceBuildkitTimingError);
    assert.equal(error.predicateId, predicateId);
    return true;
  });
}

test("concatenated pretty JSON is parsed without relying on line boundaries", () => {
  const values = parseConcatenatedJson(
    `${span("one", 0, 1)}\n${span("two", 1, 3)}\n`,
  );
  assert.equal(values.length, 2);
  assert.equal(values[1].Name, "two");
});

test("report extracts exact critical operations and percentages", () => {
  const text = [
    span("build .", 0, 20),
    span("[linux/amd64] generating sbom using scanner", 0, 8),
    span("export layers", 8, 12),
    span("[stage-3 5/6] COPY --from=pruner /app /app", 12, 15),
    span(
      "[pruner 5/20] RUN bun install --ignore-scripts --frozen-lockfile",
      15,
      17,
    ),
    span("[internal] load build context", 17, 18),
  ].join("\n");
  const report = buildAliceBuildkitTimingReport({
    otlpText: text,
    buildRunId: "123",
    sourceCommit: "a".repeat(40),
  });
  assert.equal(report.totalBuildMs, 20000);
  assert.equal(report.operations.sbom.durationMs, 8000);
  assert.equal(report.operations.copyPrunerRoot.durationMs, 3000);
  assert.equal(report.findings.sbomPercentOfBuild, 40);
  assert.match(report.reportSha256, /^sha256:[a-f0-9]{64}$/);
});

test("duplicate names use the longest matching span deterministically", () => {
  const report = buildAliceBuildkitTimingReport({
    otlpText: [
      span("build .", 0, 20),
      span("export layers", 0, 2),
      span("export layers", 0, 5),
    ].join("\n"),
  });
  assert.equal(report.operations.exportLayers.durationMs, 5000);
});

test("truncated OTLP and missing total build fail closed", async () => {
  await expectPredicate(
    async () => parseConcatenatedJson('{"Name":"x"'),
    "OTLP_TRUNCATED",
  );
  await expectPredicate(
    async () =>
      buildAliceBuildkitTimingReport({
        otlpText: span("not build", 0, 1),
      }),
    "TOTAL_BUILD_SPAN_MISSING",
  );
});
