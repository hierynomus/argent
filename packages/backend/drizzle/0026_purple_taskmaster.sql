ALTER TABLE "loan_parts" ADD COLUMN "reset_recalculation" text DEFAULT 'contract' NOT NULL;--> statement-breakpoint
ALTER TABLE "loan_parts" ADD COLUMN "closed_on" date;--> statement-breakpoint
ALTER TABLE "loan_parts" ADD COLUMN "continues_part_id" uuid;--> statement-breakpoint
ALTER TABLE "mortgage_parts" ADD COLUMN "reset_recalculation" text DEFAULT 'contract' NOT NULL;--> statement-breakpoint
ALTER TABLE "mortgage_parts" ADD COLUMN "closed_on" date;--> statement-breakpoint
ALTER TABLE "mortgage_parts" ADD COLUMN "continues_part_id" uuid;