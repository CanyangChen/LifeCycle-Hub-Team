ALTER TABLE FoodDetail ADD COLUMN portionParentId TEXT REFERENCES Item(id);
--> statement-breakpoint
ALTER TABLE FoodDetail ADD COLUMN portionCheckAnchor TEXT;
--> statement-breakpoint
CREATE INDEX FoodDetail_portionParent ON FoodDetail(portionParentId);
--> statement-breakpoint
CREATE TABLE FoodStockMovement (
  id TEXT PRIMARY KEY NOT NULL,
  itemId TEXT NOT NULL REFERENCES Item(id) ON DELETE CASCADE,
  foodId TEXT REFERENCES FoodItem(id),
  kind TEXT NOT NULL CHECK(kind IN ('consume','discard')),
  amount REAL,
  unit TEXT,
  occurredOn TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX FoodStockMovement_byDate ON FoodStockMovement(occurredOn,kind);
