CREATE TABLE "document_passwords" (
	"org_id" text NOT NULL,
	"document_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_passwords_org_id_document_id_pk" PRIMARY KEY("org_id","document_id")
);
