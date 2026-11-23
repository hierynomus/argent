ALTER TABLE "accounts" ADD COLUMN "source" text DEFAULT 'import' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_manual" boolean DEFAULT false NOT NULL;