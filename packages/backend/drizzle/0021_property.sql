CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'house' NOT NULL,
	"owner_sub" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"purchase_price" numeric(15, 2),
	"purchase_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_loans" (
	"property_id" uuid NOT NULL,
	"loan_id" uuid NOT NULL,
	CONSTRAINT "property_loans_property_id_loan_id_pk" PRIMARY KEY("property_id","loan_id")
);
--> statement-breakpoint
CREATE TABLE "property_members" (
	"property_id" uuid NOT NULL,
	"group_name" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	CONSTRAINT "property_members_property_id_group_name_pk" PRIMARY KEY("property_id","group_name")
);
--> statement-breakpoint
CREATE TABLE "property_mortgages" (
	"property_id" uuid NOT NULL,
	"mortgage_id" uuid NOT NULL,
	CONSTRAINT "property_mortgages_property_id_mortgage_id_pk" PRIMARY KEY("property_id","mortgage_id")
);
--> statement-breakpoint
CREATE TABLE "property_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"valuation_date" date NOT NULL,
	"value" numeric(15, 2) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "property_loans" ADD CONSTRAINT "property_loans_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_loans" ADD CONSTRAINT "property_loans_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_members" ADD CONSTRAINT "property_members_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_mortgages" ADD CONSTRAINT "property_mortgages_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_mortgages" ADD CONSTRAINT "property_mortgages_mortgage_id_mortgages_id_fk" FOREIGN KEY ("mortgage_id") REFERENCES "public"."mortgages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_valuations" ADD CONSTRAINT "property_valuations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "properties_owner_idx" ON "properties" USING btree ("owner_sub");--> statement-breakpoint
CREATE INDEX "property_loans_loan_idx" ON "property_loans" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "property_members_group_idx" ON "property_members" USING btree ("group_name");--> statement-breakpoint
CREATE INDEX "property_mortgages_mortgage_idx" ON "property_mortgages" USING btree ("mortgage_id");--> statement-breakpoint
CREATE INDEX "property_valuations_property_idx" ON "property_valuations" USING btree ("property_id","valuation_date");