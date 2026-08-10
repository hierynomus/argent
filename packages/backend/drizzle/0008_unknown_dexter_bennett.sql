CREATE TABLE "user_profiles" (
	"sub" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"theme" text DEFAULT 'system' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
