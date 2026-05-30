import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const backupDir = process.argv[2] || "temp/backup-data";
const database = process.env.MYSQL_DB || "demomockserver-dev";

for (const key of ["MYSQL_HOST", "MYSQL_PORT", "MYSQL_USER"]) {
  if (!process.env[key]) {
    console.error(`Missing ${key}`);
    process.exit(2);
  }
}
if (!process.env.MYSQL_PASS && !process.env.MYSQL_PASSWORD) {
  console.error("Missing MYSQL_PASS or MYSQL_PASSWORD");
  process.exit(2);
}

class McpMysql {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.proc = spawn("npx", ["-y", "@benborla29/mcp-server-mysql"], {
      env: {
        ...process.env,
        MYSQL_PASS: process.env.MYSQL_PASS || process.env.MYSQL_PASSWORD,
        ALLOW_INSERT_OPERATION: "true",
        ALLOW_UPDATE_OPERATION: "true",
        ALLOW_DELETE_OPERATION: "true",
        ALLOW_DDL_OPERATION: "true",
        MYSQL_DISABLE_READ_ONLY_TRANSACTIONS: "true"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.proc.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.proc.stderr.on("data", (chunk) => process.stderr.write(chunk));
    this.proc.on("exit", (code) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`MCP server exited with code ${code}`));
      }
      this.pending.clear();
    });
  }

  onStdout(chunk) {
    this.buffer += chunk.toString("utf8");
    for (;;) {
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd < 0) break;
      const line = this.buffer.slice(0, lineEnd).trim();
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: resolvePending, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolvePending(message.result);
      }
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolvePending, reject) => {
      this.pending.set(id, { resolve: resolvePending, reject });
      this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  notify(method, params = {}) {
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async init() {
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "numfeel-regression-reset", version: "0.1" }
    });
    this.notify("notifications/initialized");
  }

  async query(sql) {
    return this.send("tools/call", {
      name: "mysql_query",
      arguments: { sql }
    });
  }

  close() {
    this.proc.kill();
  }
}

function splitSql(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  let escape = false;
  for (const ch of sql) {
    current += ch;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement.slice(0, -1).trim());
      current = "";
    }
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements.filter(Boolean);
}

function readBackupStatements() {
  const files = readdirSync(backupDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const tableNames = [];
  const statements = [];
  for (const file of files) {
    let sql = readFileSync(join(backupDir, file), "utf8")
      .replaceAll("`demomockserver-prod`", `\`${database}\``);
    const match = sql.match(/create\s+table\s+`?([A-Za-z0-9_]+)`?/i);
    if (match) tableNames.push(match[1]);
    statements.push(...splitSql(sql));
  }
  return { tableNames: [...new Set(tableNames)], statements };
}

const { tableNames, statements } = readBackupStatements();
const client = new McpMysql();
try {
  await client.init();
  console.log(`resetting ${database}; tables=${tableNames.length}; statements=${statements.length}`);
  await client.query("SET FOREIGN_KEY_CHECKS=0");
  for (const table of tableNames) {
    await client.query(`DROP TABLE IF EXISTS \`${database}\`.\`${table}\``);
  }
  await client.query("SET FOREIGN_KEY_CHECKS=1");

  let done = 0;
  for (const statement of statements) {
    await client.query(statement);
    done++;
    if (done % 250 === 0) console.log(`executed ${done}/${statements.length}`);
  }
  const markerFile = "temp/regression/db-reset.json";
  mkdirSync(dirname(resolve(markerFile)), { recursive: true });
  writeFileSync(markerFile, JSON.stringify({ database, tableNames, statements: statements.length, resetAt: new Date().toISOString() }, null, 2));
  console.log(`database reset complete; wrote ${markerFile}`);
} finally {
  client.close();
}
