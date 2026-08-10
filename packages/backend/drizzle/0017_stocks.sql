ALTER TABLE "portfolios" ADD COLUMN "broker" text;
--> statement-breakpoint
CREATE TABLE "stock_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"trade_date" date NOT NULL,
	"from_symbol" text NOT NULL,
	"from_amount" numeric(20,6) NOT NULL,
	"to_symbol" text NOT NULL,
	"to_amount" numeric(20,6) NOT NULL,
	"base_currency_amount" numeric(15,2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_assets" (
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"asset_form" text,
	CONSTRAINT "stock_assets_pk" PRIMARY KEY("portfolio_id","symbol")
);
--> statement-breakpoint
CREATE TABLE "stock_dividends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"payment_date" date NOT NULL,
	"amount" numeric(15,2) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_trades" ADD CONSTRAINT "stock_trades_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_assets" ADD CONSTRAINT "stock_assets_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_dividends" ADD CONSTRAINT "stock_dividends_portfolio_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;
