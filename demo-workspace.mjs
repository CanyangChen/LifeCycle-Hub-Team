const demoSqlTokens = /'(?:''|[^'])*'|--[^\r\n]*|\/\*[\s\S]*?\*\/|"(?:[^"]|"")*"|\x60[^\x60]*\x60|\[[^\]]*\]|\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const demoSchemaObjects = new Set(demoMigrations.flatMap((migration) => migration.flatMap((sql) =>
  [...sql.matchAll(/\bCREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|TRIGGER)\s+(?:IF NOT EXISTS\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)/gi)]
    .map((match) => match[1].replaceAll('"', '').toLowerCase()))));

function demoWorkspaceSql(sql, prefix) {
  let scoped = false;
  const query = sql.replace(demoSqlTokens, (token) => {
    if (token.startsWith("'") || token.startsWith("--") || token.startsWith("/*")) return token;
    const identifier = token.replace(/^["\x60\[]|["\x60\]]$/g, "").toLowerCase();
    if (/^(demoaccount|demosession|demoauthattempt|sqlite_|d1_|w_[0-9a-f]{32}_)/.test(identifier)) {
      throw new Error("Protected table in workspace query");
    }
    if (!demoSchemaObjects.has(identifier)) return token;
    scoped = true;
    return '"' + prefix + identifier + '"';
  });
  if (!scoped) throw new Error("Workspace query requires a known schema object");
  return query;
}

async function demoWorkspace(db, accountId) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(accountId)) throw new Error("Invalid workspace ID");
  const prefix = "w_" + accountId.replaceAll("-", "") + "_";
  const lookup = () => db.prepare("SELECT workspaceVersion FROM DemoAccount WHERE id=?").bind(accountId).first();
  const account = await lookup();
  if (!account) throw new Error("Unknown demo account");
  for (let version = account.workspaceVersion; version < demoMigrations.length; version++) {
    const next = version + 1;
    try {
      await db.batch([
        ...demoMigrations[version].map((sql) => db.prepare(demoWorkspaceSql(sql, prefix))),
        db.prepare("UPDATE DemoAccount SET workspaceVersion=? WHERE id=? AND workspaceVersion=?").bind(next, accountId, version),
      ]);
    } catch (error) {
      // A concurrent request can finish this migration before this batch runs.
      if ((await lookup())?.workspaceVersion < next) throw error;
    }
  }
  return {
    prepare: (sql) => db.prepare(demoWorkspaceSql(sql, prefix)),
    batch: (statements) => db.batch(statements),
  };
}
