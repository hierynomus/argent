CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_sub" text,
	"currency" text NOT NULL DEFAULT 'EUR',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"principal" numeric(15,2) NOT NULL,
	"annual_interest_rate" numeric(8,6) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_extra_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_id" uuid NOT NULL,
	"payment_date" date NOT NULL,
	"amount" numeric(15,2) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_parts" ADD CONSTRAINT "loan_parts_loan_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "loan_extra_payments" ADD CONSTRAINT "loan_extra_payments_part_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."loan_parts"("id") ON DELETE cascade ON UPDATE no action;
