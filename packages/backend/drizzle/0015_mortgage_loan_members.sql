CREATE TABLE "mortgage_members" (
  "mortgage_id" uuid NOT NULL,
  "group_name" text NOT NULL,
  "role" text NOT NULL DEFAULT 'viewer',
  CONSTRAINT "mortgage_members_pk" PRIMARY KEY("mortgage_id","group_name")
);
--> statement-breakpoint
CREATE TABLE "loan_members" (
  "loan_id" uuid NOT NULL,
  "group_name" text NOT NULL,
  "role" text NOT NULL DEFAULT 'viewer',
  CONSTRAINT "loan_members_pk" PRIMARY KEY("loan_id","group_name")
);
--> statement-breakpoint
ALTER TABLE "mortgage_members" ADD CONSTRAINT "mortgage_members_mortgage_id_fk"
  FOREIGN KEY ("mortgage_id") REFERENCES "public"."mortgages"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "loan_members" ADD CONSTRAINT "loan_members_loan_id_fk"
  FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade;
