CREATE TABLE "loan_part_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"annual_interest_rate" numeric(8, 6) NOT NULL,
	"rate_type" text DEFAULT 'nominal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mortgage_part_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"effective_date" date NOT NULL,
	"annual_interest_rate" numeric(8, 6) NOT NULL,
	"rate_type" text DEFAULT 'nominal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_part_rates" ADD CONSTRAINT "loan_part_rates_part_id_loan_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."loan_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_part_rates" ADD CONSTRAINT "mortgage_part_rates_part_id_mortgage_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."mortgage_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loan_part_rates_part_date_idx" ON "loan_part_rates" USING btree ("part_id","effective_date");--> statement-breakpoint
CREATE UNIQUE INDEX "mortgage_part_rates_part_date_idx" ON "mortgage_part_rates" USING btree ("part_id","effective_date");