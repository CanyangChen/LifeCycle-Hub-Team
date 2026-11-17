ALTER TABLE MedicationLog ADD COLUMN ingredientsSnapshot TEXT;
--> statement-breakpoint
CREATE TABLE MedicationSafetyRule (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  drugId TEXT NOT NULL REFERENCES DrugItem(id),
  sourceType TEXT NOT NULL,
  sourceRef TEXT NOT NULL,
  sourceUrl TEXT,
  appliesTo TEXT NOT NULL,
  effectiveOn TEXT NOT NULL,
  timeZone TEXT NOT NULL,
  unit TEXT,
  maxSingle REAL,
  maxDaily REAL,
  maxCount INTEGER,
  minIntervalMinutes INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  confirmedAt TEXT NOT NULL,
  revision TEXT NOT NULL,
  UNIQUE(userId,drugId)
);
