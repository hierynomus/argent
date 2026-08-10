ALTER TABLE "account_members" DROP CONSTRAINT "account_members_account_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "account_members" RENAME COLUMN "user_id" TO "group_name";--> statement-breakpoint
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_account_id_group_name_pk" PRIMARY KEY("account_id","group_name");
