CREATE INDEX "account_members_group_idx" ON "account_members" USING btree ("group_name");--> statement-breakpoint
CREATE INDEX "accounts_owner_idx" ON "accounts" USING btree ("owner_sub");--> statement-breakpoint
CREATE INDEX "crypto_trades_portfolio_idx" ON "crypto_trades" USING btree ("portfolio_id","trade_date");--> statement-breakpoint
CREATE INDEX "loan_extra_payments_part_idx" ON "loan_extra_payments" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "loan_members_group_idx" ON "loan_members" USING btree ("group_name");--> statement-breakpoint
CREATE INDEX "loan_parts_loan_idx" ON "loan_parts" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loans_owner_idx" ON "loans" USING btree ("owner_sub");--> statement-breakpoint
CREATE INDEX "metal_lots_portfolio_idx" ON "metal_lots" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "metal_sales_lot_idx" ON "metal_sales" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "metal_sales_portfolio_idx" ON "metal_sales" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "mortgage_extra_payments_part_idx" ON "mortgage_extra_payments" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "mortgage_members_group_idx" ON "mortgage_members" USING btree ("group_name");--> statement-breakpoint
CREATE INDEX "mortgage_parts_mortgage_idx" ON "mortgage_parts" USING btree ("mortgage_id");--> statement-breakpoint
CREATE INDEX "mortgages_owner_idx" ON "mortgages" USING btree ("owner_sub");--> statement-breakpoint
CREATE INDEX "portfolio_members_group_idx" ON "portfolio_members" USING btree ("group_name");--> statement-breakpoint
CREATE INDEX "portfolios_owner_type_idx" ON "portfolios" USING btree ("owner_sub","type");--> statement-breakpoint
CREATE INDEX "stock_dividends_portfolio_idx" ON "stock_dividends" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "stock_trades_portfolio_idx" ON "stock_trades" USING btree ("portfolio_id","trade_date");--> statement-breakpoint
CREATE INDEX "tx_account_booking_idx" ON "transactions" USING btree ("account_id","booking_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tx_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "tx_subscription_idx" ON "transactions" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "tx_transfer_peer_idx" ON "transactions" USING btree ("transfer_peer_id");--> statement-breakpoint
CREATE INDEX "tx_counterparty_iban_idx" ON "transactions" USING btree ("counterparty_iban");--> statement-breakpoint
CREATE INDEX "tx_reference_idx" ON "transactions" USING btree ("reference");