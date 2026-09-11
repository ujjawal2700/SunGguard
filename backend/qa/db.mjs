/**
 * QA database inspector — test tooling only.
 *
 * Attaches to the disposable in-memory instance published by
 * `mongo-server.mjs` and refuses to connect to anything else, so a stray
 * invocation can never read or write the shared Atlas cluster.
 *
 * Usage:
 *   node qa/db.mjs collections
 *   node qa/db.mjs count <collection>
 *   node qa/db.mjs find <collection> [jsonFilter] [jsonProjection]
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MongoClient } from "mongodb";

const qaDir = dirname(fileURLToPath(import.meta.url));

export function testUri() {
  let uri;
  try {
    uri = readFileSync(join(qaDir, ".test-uri"), "utf8").trim();
  } catch {
    console.error("No qa/.test-uri — is the QA test environment running?");
    process.exit(1);
  }
  const lower = uri.toLowerCase();
  if (
    lower.includes("mongodb.net") ||
    lower.includes("mongodb+srv") ||
    !/^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(lower)
  ) {
    console.error(`ABORT: refusing to connect to a non-disposable database: ${uri}`);
    process.exit(1);
  }
  return uri;
}

export async function withDb(fn) {
  const client = new MongoClient(testUri());
  await client.connect();
  try {
    return await fn(client.db());
  } finally {
    await client.close();
  }
}

// Only act as a CLI when run directly — other QA scripts import `testUri`
// and `withDb` from here and must not have their own argv interpreted.
const isCli = /[\\/]db\.mjs$/.test(process.argv[1] || "");
const [cmd, arg1, arg2, arg3] = isCli ? process.argv.slice(2) : [];

if (cmd) {
  await withDb(async (db) => {
    if (cmd === "collections") {
      const cols = await db.listCollections().toArray();
      const rows = [];
      for (const c of cols.sort((a, b) => a.name.localeCompare(b.name))) {
        rows.push(`${String(await db.collection(c.name).countDocuments()).padStart(6)}  ${c.name}`);
      }
      console.log(rows.join("\n") || "(no collections)");
    } else if (cmd === "count") {
      console.log(await db.collection(arg1).countDocuments(arg2 ? JSON.parse(arg2) : {}));
    } else if (cmd === "find") {
      const docs = await db
        .collection(arg1)
        .find(arg2 ? JSON.parse(arg2) : {}, arg3 ? { projection: JSON.parse(arg3) } : {})
        .limit(50)
        .toArray();
      console.log(JSON.stringify(docs, null, 2));
    } else {
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
    }
  });
}
