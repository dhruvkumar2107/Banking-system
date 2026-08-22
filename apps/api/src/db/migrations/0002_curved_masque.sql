CREATE TYPE "public"."kyc_stage" AS ENUM('not_started', 'submitted', 'verified', 'rejected', 'bypassed');--> statement-breakpoint
CREATE TYPE "public"."loan_instalment_status" AS ENUM('due', 'paid', 'overdue', 'waived');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled', 'disbursed', 'closed', 'defaulted');--> statement-breakpoint
CREATE TYPE "public"."repayment_method" AS ENUM('cash', 'bank_transfer', 'from_savings');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loan_instalments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"instalment_no" integer NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"amount_due" bigint NOT NULL,
	"amount_paid" bigint DEFAULT 0 NOT NULL,
	"status" "loan_instalment_status" DEFAULT 'due' NOT NULL,
	"method" "repayment_method",
	"reference" text,
	"ledger_entry_id" uuid,
	"paid_at" timestamp with time zone,
	"recorded_by_id" uuid,
	"waived_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loan_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"min_amount_paise" bigint DEFAULT 100000 NOT NULL,
	"max_amount_paise" bigint DEFAULT 5000000 NOT NULL,
	"interest_rate_bps" integer DEFAULT 1200 NOT NULL,
	"min_tenure_months" integer DEFAULT 3 NOT NULL,
	"max_tenure_months" integer DEFAULT 24 NOT NULL,
	"max_loan_to_balance_bps" integer DEFAULT 20000 NOT NULL,
	"processing_fee_bps" integer DEFAULT 100 NOT NULL,
	"min_savings_paise" bigint DEFAULT 50000 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"pigmy_account_id" uuid NOT NULL,
	"loan_number" text NOT NULL,
	"principal" bigint NOT NULL,
	"purpose" text,
	"status" "loan_status" DEFAULT 'pending' NOT NULL,
	"interest_rate_bps" integer DEFAULT 1200 NOT NULL,
	"tenure_months" integer NOT NULL,
	"total_interest" bigint DEFAULT 0 NOT NULL,
	"processing_fee" bigint DEFAULT 0 NOT NULL,
	"total_payable" bigint DEFAULT 0 NOT NULL,
	"emi_amount" bigint DEFAULT 0 NOT NULL,
	"outstanding_paise" bigint DEFAULT 0 NOT NULL,
	"disbursement_method" "payout_method" DEFAULT 'bank_transfer' NOT NULL,
	"bank_account_masked" text,
	"bank_ifsc" text,
	"reference" text,
	"note" text,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_id" uuid,
	"disbursed_at" timestamp with time zone,
	"first_due_date" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loans_loan_number_unique" UNIQUE("loan_number")
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "kyc_stage" "kyc_stage" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "aadhaar_last4" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "aadhaar_hash" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "photo_is_live" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "photo_captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "kyc_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "kyc_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "kyc_verified_by_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "kyc_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "kyc_bypassed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "kyc_bypass_reason" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "kyc_bypassed_by_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loan_instalments" ADD CONSTRAINT "loan_instalments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loan_instalments" ADD CONSTRAINT "loan_instalments_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loan_instalments" ADD CONSTRAINT "loan_instalments_recorded_by_id_admins_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loan_settings" ADD CONSTRAINT "loan_settings_updated_by_id_admins_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loans" ADD CONSTRAINT "loans_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loans" ADD CONSTRAINT "loans_pigmy_account_id_pigmy_accounts_id_fk" FOREIGN KEY ("pigmy_account_id") REFERENCES "public"."pigmy_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "loans" ADD CONSTRAINT "loans_decided_by_id_admins_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loan_instalments_loan_idx" ON "loan_instalments" USING btree ("loan_id","instalment_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loan_instalments_due_idx" ON "loan_instalments" USING btree ("due_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "loan_instalments_no_uq" ON "loan_instalments" USING btree ("loan_id","instalment_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loans_customer_idx" ON "loans" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loans_acct_idx" ON "loans" USING btree ("pigmy_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loans_status_idx" ON "loans" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loans_requested_idx" ON "loans" USING btree ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_kyc_verified_by_id_admins_id_fk" FOREIGN KEY ("kyc_verified_by_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_kyc_bypassed_by_id_admins_id_fk" FOREIGN KEY ("kyc_bypassed_by_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_aadhaar_hash_uq" ON "customers" USING btree ("aadhaar_hash");