ALTER TABLE Item ADD COLUMN deletedAt TEXT;
--> statement-breakpoint
ALTER TABLE FoodItem ADD COLUMN deletedAt TEXT;
--> statement-breakpoint
ALTER TABLE DrugItem ADD COLUMN deletedAt TEXT;
--> statement-breakpoint
CREATE TRIGGER FoodDetail_live_profile BEFORE INSERT ON FoodDetail
WHEN EXISTS(SELECT 1 FROM FoodItem WHERE id=NEW.foodId AND deletedAt IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'food profile deleted');
END;
--> statement-breakpoint
CREATE TRIGGER DrugBatch_live_profile BEFORE INSERT ON DrugBatch
WHEN EXISTS(SELECT 1 FROM DrugItem WHERE id=NEW.drugId AND deletedAt IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'drug profile deleted');
END;
