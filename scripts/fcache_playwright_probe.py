#!/usr/bin/env python3
"""
Run a reproducible F-Cache probe against the deployed demo page by using
Playwright inside the official Docker image.

Usage:
  python3 scripts/fcache_playwright_probe.py
  python3 scripts/fcache_playwright_probe.py --iterations 5 --strict
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_URL = "https://numfeel.996.ninja/pages/favicon-supercookie/"
DEFAULT_IMAGE = "mcr.microsoft.com/playwright:v1.52.0-noble"
DEFAULT_PW_VERSION = "1.52.0"


def build_runner_source(url: str, iterations: int, wait_ms: int, headless: bool) -> str:
    return textwrap.dedent(
        f"""
        import {{ chromium }} from "playwright";

        const URL = {json.dumps(url)};
        const ITERATIONS = {iterations};
        const WAIT_MS = {wait_ms};
        const HEADLESS = {str(headless).lower()};

        function summarize(logs) {{
          const assigned = [];
          const restored = [];
          const uncertain = [];

          for (const line of logs) {{
            const m1 = line.match(/分配 ID: (\\d+) \\(([01]+)\\)/);
            if (m1) assigned.push({{ id: Number(m1[1]), binary: m1[2] }});

            const m2 = line.match(/还原 ID: (\\d+) \\(([01]+)\\)/);
            if (m2) restored.push({{ id: Number(m2[1]), binary: m2[2] }});

            const m3 = line.match(/探测结果不可靠：(.*)$/);
            if (m3) uncertain.push(m3[1]);
          }}

          const assignedLast = assigned.length ? assigned[assigned.length - 1] : null;
          const restoredLast = restored.length ? restored[restored.length - 1] : null;

          return {{
            assigned,
            restored,
            uncertain,
            assignedLast,
            restoredLast,
          }};
        }}

        const userDataDir = "/work/pw-user-data";
        const context = await chromium.launchPersistentContext(userDataDir, {{
          headless: HEADLESS,
          viewport: {{ width: 1400, height: 1200 }},
          ignoreHTTPSErrors: true,
        }});

        const results = [];

        for (let i = 1; i <= ITERATIONS; i++) {{
          const page = context.pages()[0] || await context.newPage();
          const logs = [];

          page.on("console", (msg) => {{
            const text = msg.text();
            if (text.includes("[F-Cache ")) logs.push(text);
          }});

          await page.goto(URL, {{ waitUntil: "domcontentloaded", timeout: 30000 }});
          await page.waitForTimeout(WAIT_MS);

          console.log(`\\n=== Iteration ${{i}} ===`);
          for (const line of logs) console.log(line);

          const summary = summarize(logs);
          results.push(summary);
          console.log("SUMMARY", JSON.stringify(summary));

          if (i < ITERATIONS) {{
            await page.reload({{ waitUntil: "domcontentloaded", timeout: 30000 }});
            await page.waitForTimeout(1000);
          }}
        }}

        console.log("\\nFINAL_SUMMARY " + JSON.stringify(results));
        await context.close();
        """
    ).strip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Probe the online favicon-supercookie demo via Docker Playwright."
    )
    parser.add_argument("--url", default=DEFAULT_URL, help="Target page URL")
    parser.add_argument("--iterations", type=int, default=3, help="Number of reload cycles")
    parser.add_argument("--wait-ms", type=int, default=12000, help="Wait after each load")
    parser.add_argument("--image", default=DEFAULT_IMAGE, help="Docker image to use")
    parser.add_argument(
        "--docker-network",
        default=None,
        help="Optional docker network mode, e.g. host",
    )
    parser.add_argument(
        "--playwright-version",
        default=DEFAULT_PW_VERSION,
        help="Playwright npm package version installed inside the container",
    )
    parser.add_argument(
        "--headful",
        action="store_true",
        help="Run Chromium in headed mode inside the container",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero when any iteration restores a different ID than assigned",
    )
    return parser.parse_args()


def ensure_docker() -> None:
    if shutil.which("docker") is None:
        print("docker is required but was not found in PATH", file=sys.stderr)
        sys.exit(2)


def run_probe(args: argparse.Namespace) -> tuple[int, list[dict]]:
    with tempfile.TemporaryDirectory(prefix="fcache-playwright-") as workdir:
        workdir_path = Path(workdir)
        runner_path = workdir_path / "run.mjs"
        runner_path.write_text(
            build_runner_source(
                url=args.url,
                iterations=args.iterations,
                wait_ms=args.wait_ms,
                headless=not args.headful,
            ),
            encoding="utf-8",
        )

        docker_cmd = [
            "docker",
            "run",
            "--rm",
        ]

        if args.docker_network:
            docker_cmd.extend(["--network", args.docker_network])

        docker_cmd.extend([
            "-v",
            f"{workdir_path}:/work",
            "-w",
            "/work",
            args.image,
            "bash",
            "-lc",
            (
                "npm init -y >/dev/null 2>&1 && "
                f"npm install playwright@{args.playwright_version} >/dev/null 2>&1 && "
                "node run.mjs"
            ),
        ])

        print("Running Docker Playwright probe...")
        print("Command:", " ".join(docker_cmd[:-1] + ["<container-script>"]))
        print("")

        proc = subprocess.run(
            docker_cmd,
            cwd=ROOT,
            text=True,
            capture_output=True,
        )

        if proc.stdout:
            sys.stdout.write(proc.stdout)
        if proc.stderr:
            sys.stderr.write(proc.stderr)

        if proc.returncode != 0:
            return proc.returncode, []

        results = []
        for line in proc.stdout.splitlines():
            if line.startswith("FINAL_SUMMARY "):
                results = json.loads(line[len("FINAL_SUMMARY "):])
                break
        return 0, results


def print_final_report(results: list[dict]) -> int:
    if not results:
        print("No summary data was captured.", file=sys.stderr)
        return 2

    failures = []
    expected_id = None
    print("\nProbe Report")
    print("-" * 72)
    for idx, item in enumerate(results, start=1):
        assigned = item.get("assignedLast")
        restored = item.get("restoredLast")
        uncertain = item.get("uncertain", [])

        assigned_text = assigned["id"] if assigned else "-"
        restored_text = restored["id"] if restored else "-"
        uncertain_text = " | ".join(uncertain) if uncertain else "-"

        if expected_id is None:
            if restored and restored["id"] == 0 and assigned and assigned["id"] > 0:
                status = "BOOTSTRAP_OK"
                expected_id = assigned["id"]
            else:
                status = "FAIL"
                failures.append(idx)
        else:
            if restored and restored["id"] == expected_id and not assigned:
                status = "STABLE_OK"
            elif restored and restored["id"] == expected_id and assigned and assigned["id"] == expected_id:
                status = "STABLE_OK"
            else:
                status = "FAIL"
                failures.append(idx)

        print(
            f"Iteration {idx}: assigned={assigned_text} restored={restored_text} "
            f"uncertain={uncertain_text} status={status}"
        )

    print("-" * 72)
    print(f"Passed: {len(results) - len(failures)}/{len(results)}")
    if failures:
        print(f"Failed iterations: {', '.join(str(x) for x in failures)}")
        return 1

    print("Bootstrap and stable rereads look correct.")
    return 0


def main() -> int:
    args = parse_args()
    ensure_docker()

    code, results = run_probe(args)
    if code != 0:
        return code

    report_code = print_final_report(results)
    if report_code != 0 and not args.strict:
        return 0
    return report_code


if __name__ == "__main__":
    sys.exit(main())
