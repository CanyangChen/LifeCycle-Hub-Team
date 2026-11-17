CREATE TABLE DrugCategory (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT,
  parentId TEXT REFERENCES DrugCategory(id),
  name TEXT NOT NULL,
  UNIQUE(userId,parentId,name)
);
--> statement-breakpoint
CREATE TABLE DrugItem (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  ownerId TEXT NOT NULL,
  ownerType TEXT NOT NULL DEFAULT 'personal',
  householdId TEXT,
  name TEXT NOT NULL,
  tradeName TEXT,
  manufacturer TEXT,
  categoryId TEXT REFERENCES DrugCategory(id),
  drugType TEXT NOT NULL DEFAULT 'unconfirmed',
  form TEXT,
  specification TEXT,
  route TEXT,
  imageUrl TEXT,
  leaflet TEXT,
  notes TEXT
);
--> statement-breakpoint
CREATE INDEX DrugItem_user ON DrugItem(userId,name);
--> statement-breakpoint
CREATE TABLE ActiveIngredient (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  normalizedName TEXT NOT NULL,
  UNIQUE(userId,normalizedName)
);
--> statement-breakpoint
CREATE TABLE DrugIngredient (
  drugId TEXT NOT NULL REFERENCES DrugItem(id) ON DELETE CASCADE,
  ingredientId TEXT NOT NULL REFERENCES ActiveIngredient(id),
  originalName TEXT NOT NULL,
  amount TEXT,
  unit TEXT,
  perUnit TEXT,
  source TEXT,
  PRIMARY KEY(drugId,ingredientId,originalName)
);
--> statement-breakpoint
CREATE TABLE DrugStorageLocation (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  builtIn INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0,
  UNIQUE(userId,name)
);
--> statement-breakpoint
CREATE TABLE DrugBatch (
  itemId TEXT PRIMARY KEY NOT NULL REFERENCES Item(id) ON DELETE CASCADE,
  drugId TEXT NOT NULL REFERENCES DrugItem(id),
  userId TEXT NOT NULL,
  locationId TEXT NOT NULL REFERENCES DrugStorageLocation(id),
  purchasedAtLocal TEXT,
  purchaseTimeZone TEXT,
  producedOn TEXT,
  lot TEXT,
  expiresOn TEXT,
  purchasedAmount REAL,
  remainingAmount REAL,
  unit TEXT,
  packageSpec TEXT,
  openedOn TEXT,
  openUseUntil TEXT,
  storage TEXT,
  status TEXT NOT NULL DEFAULT 'sealed',
  expiryLead INTEGER,
  lowStock REAL,
  source TEXT
);
--> statement-breakpoint
CREATE INDEX DrugBatch_user ON DrugBatch(userId,drugId);
--> statement-breakpoint
CREATE TABLE DrugLegacyOwner (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  userId TEXT NOT NULL
);
