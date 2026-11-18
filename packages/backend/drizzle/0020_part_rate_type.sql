ALTER TABLE "loan_parts" ADD COLUMN "rate_type" text DEFAULT 'nominal' NOT NULL;--> statement-breakpoint
ALTER TABLE "mortgage_parts" ADD COLUMN "rate_type" text DEFAULT 'nominal' NOT NULL;