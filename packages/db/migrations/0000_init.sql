CREATE TYPE "public"."ai_mode" AS ENUM('off', 'local', 'byok', 'plan');--> statement-breakpoint
CREATE TYPE "public"."ai_tier" AS ENUM('none', 'haiku', 'sonnet', 'opus', 'local', 'byok');--> statement-breakpoint
CREATE TYPE "public"."case_stage" AS ENUM('received', 'gathering', 'drafting', 'approval', 'filed', 'order', 'appeal', 'closed');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('upload', 'email', 'whatsapp', 'portal', 'desktop', 'import');--> statement-breakpoint
CREATE TYPE "public"."deadline_source" AS ENUM('notice', 'order', 'statutory', 'manual');--> statement-breakpoint
CREATE TYPE "public"."document_role" AS ENUM('notice', 'reply', 'acknowledgement', 'order', 'appeal', 'attachment', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('received', 'stored', 'reading', 'translating', 'extracting', 'ai_assist', 'linking', 'reconciling', 'ready', 'needs_review', 'failed', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."filing_frequency" AS ENUM('monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."finding_kind" AS ENUM('obligation', 'deadline', 'hearing', 'amount', 'reference', 'office', 'section', 'summary');--> statement-breakpoint
CREATE TYPE "public"."origin" AS ENUM('rule', 'ai', 'rule+ai', 'human');--> statement-breakpoint
CREATE TYPE "public"."registration_kind" AS ENUM('gst', 'tds', 'income_tax', 'roc', 'other');--> statement-breakpoint
CREATE TYPE "public"."verification" AS ENUM('exact', 'strong', 'approximate', 'unlocated');--> statement-breakpoint
CREATE TYPE "public"."work_status" AS ENUM('open', 'done', 'dismissed');--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"document_id" text,
	"feature" text NOT NULL,
	"tier" "ai_tier" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"outcome" text NOT NULL,
	"escalation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"org_id" text PRIMARY KEY NOT NULL,
	"mode" "ai_mode" DEFAULT 'off' NOT NULL,
	"provider" text,
	"base_url" text,
	"encrypted_key" text,
	"key_last4" text,
	"routing" jsonb,
	"monthly_budget_minor" bigint,
	"opus_cap_percent" integer DEFAULT 5 NOT NULL,
	"redact_pii" boolean DEFAULT false NOT NULL,
	"excluded_client_ids" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"request_id" text,
	"detail" jsonb,
	"prev_hash" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"client_id" text,
	"title" text NOT NULL,
	"notice_type" text,
	"authority" text,
	"reference" text,
	"stage" "case_stage" DEFAULT 'received' NOT NULL,
	"owner_user_id" text,
	"approved_by_user_id" text,
	"filing_ref" text,
	"filed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"pan" text,
	"cin" text,
	"tan" text,
	"gstins" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"partner_user_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"case_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"mentions" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"role" text
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"client_id" text,
	"case_id" text,
	"finding_id" text,
	"source" "deadline_source" NOT NULL,
	"title" text NOT NULL,
	"due_on" date NOT NULL,
	"window_end_on" date,
	"rule" jsonb NOT NULL,
	"basis" text NOT NULL,
	"statutory_key" text,
	"status" "work_status" DEFAULT 'open' NOT NULL,
	"owner_user_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demands" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"case_id" text NOT NULL,
	"client_id" text,
	"finding_id" text,
	"tax_type" text NOT NULL,
	"principal_minor" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"interest_rule" text,
	"inputs" jsonb,
	"interest_minor" bigint,
	"penalty_min_minor" bigint,
	"penalty_max_minor" bigint,
	"as_of" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"document_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage" "document_status" NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"case_id" text,
	"client_id" text,
	"role" "document_role" DEFAULT 'notice' NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"page_count" integer DEFAULT 0 NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"doc_type" text,
	"title" text,
	"reference" text,
	"issuing_office" text,
	"issued_on" date,
	"received_on" date,
	"channel" "channel" DEFAULT 'upload' NOT NULL,
	"status" "document_status" DEFAULT 'received' NOT NULL,
	"status_detail" text,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"finding_id" text NOT NULL,
	"document_id" text NOT NULL,
	"page" integer NOT NULL,
	"rects" jsonb NOT NULL,
	"score" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding_edits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"finding_id" text NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"field" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"document_id" text NOT NULL,
	"case_id" text,
	"kind" "finding_kind" NOT NULL,
	"ord" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"text_en" text,
	"quote" text NOT NULL,
	"quote_lang" text DEFAULT 'en' NOT NULL,
	"origin" "origin" NOT NULL,
	"verification" "verification" NOT NULL,
	"confidence" real NOT NULL,
	"due_rule" jsonb,
	"amount_minor" bigint,
	"desk" text,
	"severity" text,
	"status" "work_status" DEFAULT 'open' NOT NULL,
	"owner_user_id" text,
	"confirmed_by" text,
	"ai_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"org_id" text NOT NULL,
	"day" date NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "holidays_org_id_day_pk" PRIMARY KEY("org_id","day")
);
--> statement-breakpoint
CREATE TABLE "licence" (
	"id" text PRIMARY KEY DEFAULT 'current' NOT NULL,
	"payload" text NOT NULL,
	"signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"org_id" text PRIMARY KEY NOT NULL,
	"country" text DEFAULT 'IN' NOT NULL,
	"locale" text DEFAULT 'en-IN' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"fiscal_year_start_month" integer DEFAULT 4 NOT NULL,
	"region" text DEFAULT 'in' NOT NULL,
	"working_days" jsonb DEFAULT '[1,2,3,4,5,6]'::jsonb NOT NULL,
	"report_logo_key" text,
	"escalation_days" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"org_id" text NOT NULL,
	"document_id" text NOT NULL,
	"page" integer NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"image_key" text,
	"text" text DEFAULT '' NOT NULL,
	"words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"engine" text,
	"confidence" real,
	CONSTRAINT "pages_org_id_document_id_page_pk" PRIMARY KEY("org_id","document_id","page")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"client_id" text NOT NULL,
	"kind" "registration_kind" NOT NULL,
	"identifier" text NOT NULL,
	"state" text,
	"frequency" "filing_frequency",
	"scheme" text,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"may_approve_replies" boolean DEFAULT false,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_token" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_runs_org_created" ON "ai_runs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_org_at" ON "audit" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "cases_org_stage" ON "cases" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX "cases_org_client" ON "cases" USING btree ("org_id","client_id");--> statement-breakpoint
CREATE INDEX "clients_org_name" ON "clients" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "clients_org_pan" ON "clients" USING btree ("org_id","pan");--> statement-breakpoint
CREATE INDEX "comments_org_case" ON "comments" USING btree ("org_id","case_id");--> statement-breakpoint
CREATE INDEX "contacts_org_client" ON "contacts" USING btree ("org_id","client_id");--> statement-breakpoint
CREATE INDEX "contacts_org_whatsapp" ON "contacts" USING btree ("org_id","whatsapp");--> statement-breakpoint
CREATE INDEX "deadlines_org_due" ON "deadlines" USING btree ("org_id","status","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "deadlines_org_client_statkey" ON "deadlines" USING btree ("org_id","client_id","statutory_key");--> statement-breakpoint
CREATE INDEX "demands_org_case" ON "demands" USING btree ("org_id","case_id");--> statement-breakpoint
CREATE INDEX "demands_org_client" ON "demands" USING btree ("org_id","client_id");--> statement-breakpoint
CREATE INDEX "document_events_org_doc" ON "document_events" USING btree ("org_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_org_sha" ON "documents" USING btree ("org_id","sha256");--> statement-breakpoint
CREATE INDEX "documents_org_case" ON "documents" USING btree ("org_id","case_id");--> statement-breakpoint
CREATE INDEX "documents_org_status" ON "documents" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "evidence_org_finding" ON "evidence" USING btree ("org_id","finding_id");--> statement-breakpoint
CREATE INDEX "finding_edits_org_finding" ON "finding_edits" USING btree ("org_id","finding_id");--> statement-breakpoint
CREATE INDEX "findings_org_doc" ON "findings" USING btree ("org_id","document_id");--> statement-breakpoint
CREATE INDEX "findings_org_case" ON "findings" USING btree ("org_id","case_id");--> statement-breakpoint
CREATE INDEX "notifications_org_user" ON "notifications" USING btree ("org_id","user_id","read_at");--> statement-breakpoint
CREATE INDEX "registrations_org_client" ON "registrations" USING btree ("org_id","client_id");--> statement-breakpoint
CREATE INDEX "account_user_id" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organization_id" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organization_id" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_user_id" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credential_id" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "session_user_id" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "two_factor_user_id" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_token_identifier" ON "verification_token" USING btree ("identifier");