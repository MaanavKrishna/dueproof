CREATE TYPE "public"."demand_head" AS ENUM('tax', 'interest', 'penalty', 'fee');--> statement-breakpoint
CREATE TYPE "public"."demand_status" AS ENUM('open', 'paid', 'stayed', 'dropped');--> statement-breakpoint
ALTER TYPE "public"."document_status" ADD VALUE 'needs_password' BEFORE 'failed';--> statement-breakpoint
ALTER TABLE "demands" ADD COLUMN "head" "demand_head" DEFAULT 'tax' NOT NULL;--> statement-breakpoint
ALTER TABLE "demands" ADD COLUMN "status" "demand_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;