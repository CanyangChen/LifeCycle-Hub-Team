CREATE TABLE DemoAccount (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  passwordVersion INTEGER NOT NULL DEFAULT 1,
  invitationHash TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE DemoSession (
  tokenHash TEXT PRIMARY KEY,
  accountId TEXT NOT NULL REFERENCES DemoAccount(id) ON DELETE CASCADE,
  passwordVersion INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX DemoSession_account ON DemoSession(accountId);
--> statement-breakpoint
CREATE INDEX DemoSession_expiry ON DemoSession(expiresAt);
--> statement-breakpoint
CREATE TABLE DemoAuthAttempt (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  hits INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX DemoAuthAttempt_window ON DemoAuthAttempt(window);
