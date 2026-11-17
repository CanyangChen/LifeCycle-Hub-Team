CREATE TABLE "Item" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
--> statement-breakpoint
CREATE INDEX "Item_category_archivedAt_idx" ON "Item"("category", "archivedAt");
--> statement-breakpoint
CREATE TABLE "FoodDetail" (
  "itemId" TEXT NOT NULL PRIMARY KEY,
  "batch" TEXT,
  "expiresOn" TEXT,
  "openedOn" TEXT,
  "storage" TEXT,
  "quantity" TEXT,
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint
CREATE TABLE "MedicineDetail" (
  "itemId" TEXT NOT NULL PRIMARY KEY,
  "purpose" TEXT,
  "ingredient" TEXT,
  "strength" TEXT,
  "batch" TEXT,
  "expiresOn" TEXT,
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint
CREATE TABLE "ClothingDetail" (
  "itemId" TEXT NOT NULL PRIMARY KEY,
  "material" TEXT,
  "purchasedOn" TEXT,
  "frequency" TEXT,
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint
CREATE TABLE "DeviceDetail" (
  "itemId" TEXT NOT NULL PRIMARY KEY,
  "brand" TEXT,
  "model" TEXT,
  "purchasedOn" TEXT,
  "warrantyUntil" TEXT,
  "configuration" TEXT,
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint
CREATE TABLE "SubscriptionDetail" (
  "itemId" TEXT NOT NULL PRIMARY KEY,
  "billingInterval" TEXT,
  "nextChargeOn" TEXT,
  "endsOn" TEXT,
  "cancelBy" TEXT,
  "cancelStatus" TEXT,
  "feeCents" INTEGER,
  "autoRenew" BOOLEAN,
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint
CREATE TABLE "LifecycleEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint
CREATE TABLE "ReminderRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "date" TEXT,
  "leadDays" INTEGER NOT NULL DEFAULT 0,
  "intervalDays" INTEGER,
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ruleId" TEXT NOT NULL,
  "dueOn" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "postponedUntil" TEXT,
  FOREIGN KEY ("ruleId") REFERENCES "ReminderRule"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
--> statement-breakpoint
CREATE TABLE "IntakeCandidate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "fields" JSONB NOT NULL,
  "confirmedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
