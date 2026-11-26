ALTER TABLE "accounts" ADD COLUMN "holder" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;