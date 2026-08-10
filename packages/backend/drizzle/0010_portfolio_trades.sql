DROP TABLE "crypto_lots";--> statement-breakpoint
DROP TABLE "metal_lots";--> statement-breakpoint
CREATE TABLE "portfolio_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"trade_date" date NOT NULL,
	"from_symbol" text NOT NULL,
	"from_amount" numeric(30, 8) NOT NULL,
	"to_symbol" text NOT NULL,
	"to_amount" numeric(30, 8) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_assets" (
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"asset_form" text,
	CONSTRAINT "portfolio_assets_portfolio_id_symbol_pk" PRIMARY KEY("portfolio_id","symbol")
);
--> statement-breakpoint
ALTER TABLE "portfolio_trades" ADD CONSTRAINT "portfolio_trades_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_assets" ADD CONSTRAINT "portfolio_assets_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;
