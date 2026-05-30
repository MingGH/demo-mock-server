import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cases } from "./cases.mjs";

const mode = process.argv[2];
const target = process.argv[3] || "http://127.0.0.1:8080";
const outFile = process.argv[4] || "temp/regression/latest.json";

if (!["capture", "compare"].includes(mode)) {
  console.error("Usage: node tests/regression/run-regression.mjs capture|compare <baseUrl> <outputOrBaseline>");
  process.exit(2);
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function stable(value) {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function shape(value) {
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [shape(value[0])];
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])]));
  }
  return typeof value;
}

function comparable(record) {
  return record.compare === "structure"
    ? { status: record.status, body: shape(record.body) }
    : { status: record.status, body: stable(record.body) };
}

async function request(baseUrl, testCase) {
  const headers = { Accept: "application/json" };
  const options = { method: testCase.method, headers };
  if (testCase.body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(testCase.body);
  }

  const started = Date.now();
  try {
    const response = await fetch(new URL(testCase.path, baseUrl), options);
    const contentType = response.headers.get("content-type") || "";
    let body;
    if (contentType.includes("application/json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }
    return {
      name: testCase.name,
      method: testCase.method,
      path: testCase.path,
      compare: testCase.compare,
      status: response.status,
      elapsedMs: Date.now() - started,
      body
    };
  } catch (error) {
    return {
      name: testCase.name,
      method: testCase.method,
      path: testCase.path,
      compare: testCase.compare,
      status: 0,
      elapsedMs: Date.now() - started,
      error: String(error && error.stack ? error.stack : error)
    };
  }
}

async function capture(baseUrl) {
  const results = [];
  for (const testCase of cases) {
    const result = await request(baseUrl, testCase);
    results.push(result);
    const marker = result.status >= 200 && result.status < 300 ? "ok" : "warn";
    console.log(`${marker} ${result.status} ${testCase.name} ${result.elapsedMs}ms`);
    await sleep(30);
  }
  return {
    capturedAt: new Date().toISOString(),
    baseUrl,
    results
  };
}

if (mode === "capture") {
  const data = await capture(target);
  mkdirSync(dirname(resolve(outFile)), { recursive: true });
  writeFileSync(outFile, JSON.stringify(data, null, 2));
  console.log(`wrote ${outFile}`);
} else {
  const baselineFile = outFile;
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
  const current = await capture(target);
  const byName = new Map(baseline.results.map((result) => [result.name, result]));
  const diffs = [];

  for (const result of current.results) {
    const expected = byName.get(result.name);
    if (!expected) {
      diffs.push({ name: result.name, reason: "missing baseline", actual: result });
      continue;
    }
    const expectedValue = comparable(expected);
    const actualValue = comparable(result);
    if (JSON.stringify(expectedValue) !== JSON.stringify(actualValue)) {
      diffs.push({
        name: result.name,
        method: result.method,
        path: result.path,
        compare: result.compare,
        expected: expectedValue,
        actual: actualValue
      });
    }
  }

  const report = {
    comparedAt: new Date().toISOString(),
    baseline: baselineFile,
    baseUrl: target,
    total: current.results.length,
    passed: current.results.length - diffs.length,
    failed: diffs.length,
    diffs
  };
  const reportFile = "temp/regression/compare-report.json";
  mkdirSync(dirname(resolve(reportFile)), { recursive: true });
  writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`passed=${report.passed} failed=${report.failed}`);
  console.log(`wrote ${reportFile}`);
  if (diffs.length > 0) {
    for (const diff of diffs.slice(0, 20)) {
      console.log(`diff ${diff.name} ${diff.method} ${diff.path}`);
    }
    process.exit(1);
  }
}
