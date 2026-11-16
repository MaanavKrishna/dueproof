CREATE TABLE "saved_views" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"screen" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "saved_views_org_screen" ON "saved_views" USING btree ("org_id","screen");--> statement-breakpoint
CREATE INDEX "findings_text_fts" ON "findings" USING gin (to_tsvector('simple', "text" || ' ' || "quote"));--> statement-breakpoint
CREATE INDEX "pages_text_fts" ON "pages" USING gin (to_tsvector('simple', "text"));