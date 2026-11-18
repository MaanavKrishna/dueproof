ALTER TABLE "documents" ADD COLUMN "received_on_assumed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "deadlines_org_finding" ON "deadlines" USING btree ("org_id","finding_id");--> statement-breakpoint
CREATE UNIQUE INDEX "findings_org_doc_ord" ON "findings" USING btree ("org_id","document_id","ord");