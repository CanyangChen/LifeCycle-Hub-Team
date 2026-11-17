import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDemoDatabase(file) {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  const transaction = (work) => {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  };
  const journal = JSON.parse(readFileSync(new URL("./drizzle/meta/_journal.json", import.meta.url), "utf8"));
  transaction(() => {
    sqlite.exec("CREATE TABLE IF NOT EXISTS StandaloneMigration (tag TEXT PRIMARY KEY)");
    const applied = new Set(sqlite.prepare("SELECT tag FROM StandaloneMigration").all().map(({tag}) => tag));
    for (const {tag} of journal.entries) {
      if (applied.has(tag)) continue;
      sqlite.exec(readFileSync(new URL("./drizzle/" + tag + ".sql", import.meta.url), "utf8"));
      sqlite.prepare("INSERT INTO StandaloneMigration(tag) VALUES (?)").run(tag);
    }
  });

  function prepare(sql, values = []) {
    return {
      bind: (...params) => prepare(sql, params),
      first: async () => sqlite.prepare(sql).get(...values),
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      run() {
        const statement = sqlite.prepare(sql);
        return statement.columns().length ? {results:statement.all(...values)}
          : {meta:statement.run(...values)};
      },
    };
  }
  return {
    DB: {prepare, batch: async (queries) => transaction(() => queries.map((query) => query.run()))},
    close: () => sqlite.close(),
  };
}
