-- The trades of open jobs a worker chose to see. Empty means their own trades, which is what existing workers keep.
ALTER TABLE "WorkerProfile" ADD COLUMN "feedCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
