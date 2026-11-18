CREATE TABLE "equity_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"label" text,
	"grant_date" date NOT NULL,
	"options" numeric(15, 2) NOT NULL,
	"strike_price" numeric(15, 6) NOT NULL,
	"vesting_type" text DEFAULT 'time' NOT NULL,
	"vest_start" date,
	"cliff_months" integer DEFAULT 0 NOT NULL,
	"vest_months" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equity_plan_members" (
	"plan_id" uuid NOT NULL,
	"group_name" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	CONSTRAINT "equity_plan_members_plan_id_group_name_pk" PRIMARY KEY("plan_id","group_name")
);
--> statement-breakpoint
CREATE TABLE "equity_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_sub" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equity_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"price_date" date NOT NULL,
	"price" numeric(15, 6) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "equity_grants" ADD CONSTRAINT "equity_grants_plan_id_equity_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."equity_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_plan_members" ADD CONSTRAINT "equity_plan_members_plan_id_equity_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."equity_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_prices" ADD CONSTRAINT "equity_prices_plan_id_equity_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."equity_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equity_grants_plan_idx" ON "equity_grants" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "equity_plan_members_group_idx" ON "equity_plan_members" USING btree ("group_name");--> statement-breakpoint
CREATE INDEX "equity_plans_owner_idx" ON "equity_plans" USING btree ("owner_sub");--> statement-breakpoint
CREATE INDEX "equity_prices_plan_idx" ON "equity_prices" USING btree ("plan_id","price_date");