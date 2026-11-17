ALTER TABLE FoodDetail ADD COLUMN purchasedAtLocal TEXT;
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN purchaseTimeZone TEXT;
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN sourceJson TEXT;
--> statement-breakpoint
CREATE TABLE FoodIntakeDraft (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  candidates TEXT NOT NULL,
  source TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX FoodIntakeDraft_expiry ON FoodIntakeDraft(expiresAt);
--> statement-breakpoint
CREATE TABLE FoodIntakeConfirmation (
  draftId TEXT NOT NULL,
  candidateIndex INTEGER NOT NULL,
  confirmedAt TEXT NOT NULL,
  PRIMARY KEY (draftId,candidateIndex)
);
