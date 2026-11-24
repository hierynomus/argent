CREATE TABLE "pension_plan_members" (
	"plan_id" uuid NOT NULL,
	"group_name" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	CONSTRAINT "pension_plan_members_plan_id_group_name_pk" PRIMARY KEY("plan_id","group_name")
);
--> statement-breakpoint
CREATE TABLE "pension_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"closed_on" date,
	"owner_sub" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"retirement_date" date,
	"count_in_net_worth" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pension_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"statement_date" date NOT NULL,
	"capital" numeric(15, 2),
	"accrued_income" numeric(15, 2),
	"projected_low" numeric(15, 2),
	"projected_expected" numeric(15, 2),
	"projected_high" numeric(15, 2),
	"partner_income" numeric(15, 2),
	"in_todays_money" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pension_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_plan_id" uuid NOT NULL,
	"to_plan_id" uuid NOT NULL,
	"transfer_date" date NOT NULL,
	"kind" text NOT NULL,
	"capital" numeric(15, 2),
	"income_given_up" numeric(15, 2),
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pension_plan_members" ADD CONSTRAINT "pension_plan_members_plan_id_pension_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."pension_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pension_statements" ADD CONSTRAINT "pension_statements_plan_id_pension_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."pension_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pension_plan_members_group_idx" ON "pension_plan_members" USING btree ("group_name");--> statement-breakpoint
CREATE INDEX "pension_plans_owner_idx" ON "pension_plans" USING btree ("owner_sub");--> statement-breakpoint
CREATE INDEX "pension_statements_plan_idx" ON "pension_statements" USING btree ("plan_id","statement_date");--> statement-breakpoint
CREATE INDEX "pension_transfers_from_idx" ON "pension_transfers" USING btree ("from_plan_id");--> statement-breakpoint
CREATE INDEX "pension_transfers_to_idx" ON "pension_transfers" USING btree ("to_plan_id");