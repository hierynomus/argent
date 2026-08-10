-- Drop old unified tables (data migration not needed; this is a dev refactor)
DROP TABLE IF EXISTS "portfolio_trades";--> statement-breakpoint
DROP TABLE IF EXISTS "portfolio_assets";--> statement-breakpoint

-- ─── Crypto ────────────────────────────────────────────────────────────────
CREATE TABLE "crypto_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"trade_date" date NOT NULL,
	"from_symbol" text NOT NULL,
	"from_amount" numeric(30, 8) NOT NULL,
	"to_symbol" text NOT NULL,
	"to_amount" numeric(30, 8) NOT NULL,
	"base_currency_amount" numeric(15, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crypto_assets" (
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"asset_form" text,
	PRIMARY KEY("portfolio_id","symbol")
);
--> statement-breakpoint

-- ─── Metals ────────────────────────────────────────────────────────────────
CREATE TABLE "metal_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"purchase_date" date NOT NULL,
	"metal" text NOT NULL,
	"item_name" text,
	"item_form" text,
	"weight_per_piece" numeric(10, 4) NOT NULL,
	"unit" text DEFAULT 'g' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"price_per_piece" numeric(15, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metal_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"sale_date" date NOT NULL,
	"quantity_sold" integer NOT NULL,
	"total_received" numeric(15, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Foreign keys
ALTER TABLE "crypto_trades" ADD CONSTRAINT "crypto_trades_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_assets" ADD CONSTRAINT "crypto_assets_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metal_lots" ADD CONSTRAINT "metal_lots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metal_sales" ADD CONSTRAINT "metal_sales_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metal_sales" ADD CONSTRAINT "metal_sales_lot_id_metal_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."metal_lots"("id") ON DELETE cascade ON UPDATE no action;
