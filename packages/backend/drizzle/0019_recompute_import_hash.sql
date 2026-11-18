-- import_hash now also covers the account IBAN and the debit/credit direction (see computeImportHash in
-- services/camt053.ts). Every stored hash is recomputed from the columns it was derived from.
-- Input order: iban|direction|amount|currency|booking_date|counterparty_iban|reference|description
UPDATE "transactions" AS t
SET "import_hash" = encode(
  sha256(convert_to(
    concat_ws('|', a."iban", t."credit_debit_indicator", t."amount"::text, t."currency", t."booking_date"::text,
              coalesce(t."counterparty_iban", ''), coalesce(t."reference", ''), coalesce(t."description", '')),
    'UTF8')),
  'hex')
FROM "accounts" AS a
WHERE a."id" = t."account_id";
