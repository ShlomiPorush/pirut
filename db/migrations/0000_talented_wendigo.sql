CREATE TABLE "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"last_digits" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "cards_issuer_last_digits_unique" UNIQUE("issuer","last_digits")
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"charge_date" date NOT NULL,
	"source_hash" text NOT NULL,
	"parser" text NOT NULL,
	"parser_version" text NOT NULL,
	"stated_total_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imports_source_hash_unique" UNIQUE("source_hash")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"card_id" integer NOT NULL,
	"reference" text NOT NULL,
	"purchase_date" date NOT NULL,
	"charge_date" date NOT NULL,
	"merchant" text NOT NULL,
	"kind" text NOT NULL,
	"original_minor" bigint NOT NULL,
	"original_currency" text NOT NULL,
	"billed_minor" bigint NOT NULL,
	"billed_currency" text NOT NULL,
	"installment_number" integer,
	"installment_total" integer,
	"installment_is_final" boolean DEFAULT false NOT NULL,
	"discount_minor" bigint,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "transactions_card_id_reference_unique" UNIQUE("card_id","reference")
);
--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_charge_date_idx" ON "transactions" USING btree ("charge_date");--> statement-breakpoint
CREATE INDEX "transactions_import_id_idx" ON "transactions" USING btree ("import_id");