CREATE TABLE MedicationPlan (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  drugId TEXT NOT NULL REFERENCES DrugItem(id),
  batchId TEXT REFERENCES DrugBatch(itemId),
  dose REAL,
  unit TEXT,
  frequency INTEGER,
  timesJson TEXT NOT NULL DEFAULT '[]',
  mealTiming TEXT,
  startOn TEXT NOT NULL,
  endOn TEXT,
  timeZone TEXT NOT NULL,
  source TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX MedicationPlan_user_status ON MedicationPlan(userId,status);
--> statement-breakpoint
CREATE TABLE MedicationLog (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  drugId TEXT NOT NULL REFERENCES DrugItem(id),
  batchId TEXT REFERENCES DrugBatch(itemId),
  planId TEXT REFERENCES MedicationPlan(id),
  scheduledAtLocal TEXT,
  occurredAtLocal TEXT,
  timeZone TEXT NOT NULL,
  amount REAL,
  unit TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  stockApplied REAL NOT NULL DEFAULT 0,
  requestKey TEXT NOT NULL,
  revision TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(userId,requestKey),
  UNIQUE(planId,scheduledAtLocal)
);
--> statement-breakpoint
CREATE INDEX MedicationLog_user_date ON MedicationLog(userId,occurredAtLocal);
