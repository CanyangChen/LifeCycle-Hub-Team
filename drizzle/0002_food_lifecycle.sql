CREATE TABLE FoodCategory (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  parentId TEXT REFERENCES FoodCategory(id),
  UNIQUE(parentId, name)
);
--> statement-breakpoint
CREATE TABLE FoodItem (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  categoryId TEXT REFERENCES FoodCategory(id),
  specification TEXT,
  storageAdvice TEXT,
  imageUrl TEXT,
  notes TEXT
);
--> statement-breakpoint
CREATE TABLE StorageLocation (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind TEXT,
  temperature TEXT,
  notes TEXT,
  builtIn INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE FoodInspection (
  id TEXT PRIMARY KEY NOT NULL,
  itemId TEXT NOT NULL REFERENCES Item(id) ON DELETE CASCADE,
  checkedOn TEXT NOT NULL,
  notes TEXT
);
--> statement-breakpoint
CREATE INDEX FoodInspection_itemDate ON FoodInspection(itemId, checkedOn DESC);
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN foodId TEXT REFERENCES FoodItem(id);
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN locationId TEXT REFERENCES StorageLocation(id);
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN purchasedOn TEXT;
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN producedOn TEXT;
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN purchasedAmount REAL;
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN purchasedUnit TEXT;
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN remainingAmount REAL;
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN amountNote TEXT;
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN packaging TEXT NOT NULL DEFAULT 'sealed';
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN disposition TEXT NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN frozenOn TEXT;
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN expiryLead INTEGER;
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN checkDays INTEGER;
--> statement-breakpoint
CREATE INDEX FoodDetail_location ON FoodDetail(locationId);
--> statement-breakpoint
CREATE INDEX FoodDetail_food ON FoodDetail(foodId);
