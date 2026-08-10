CREATE TABLE "crypto_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"coin_name" text NOT NULL,
	"quantity" numeric(30, 18) NOT NULL,
	"purchased_at" date NOT NULL,
	"price_per_unit" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metal_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"metal" text NOT NULL,
	"form" text NOT NULL,
	"item_name" text,
	"weight_grams" numeric(10, 4) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"purchased_at" date NOT NULL,
	"price_per_unit" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_members" (
	"portfolio_id" uuid NOT NULL,
	"group_name" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	CONSTRAINT "portfolio_members_portfolio_id_group_name_pk" PRIMARY KEY("portfolio_id","group_name")
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"owner_sub" text,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crypto_lots" ADD CONSTRAINT "crypto_lots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metal_lots" ADD CONSTRAINT "metal_lots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_members" ADD CONSTRAINT "portfolio_members_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;