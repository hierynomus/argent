ALTER TABLE "accounts"
  ADD COLUMN "type" text NOT NULL DEFAULT 'checking',
  ADD COLUMN "opening_balance" numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "opening_balance_date" date;
