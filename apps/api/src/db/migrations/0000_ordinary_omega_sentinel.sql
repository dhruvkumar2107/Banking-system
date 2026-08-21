CREATE TYPE "public"."actor_type" AS ENUM('customer', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('superadmin', 'admin', 'agent');--> statement-breakpoint
CREATE TYPE "public"."doc_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ledger_type" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."notif_category" AS ENUM('system', 'transaction', 'broadcast');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'registration');--> statement-breakpoint
CREATE TYPE "public"."pigmy_status" AS ENUM('active', 'inactive', 'closed');--> statement-breakpoint
CREATE TYPE "public"."subject_type" AS ENUM('customer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."txn_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'admin' NOT NULL,
	"assigned_villages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_bank_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"ifsc" text NOT NULL,
	"account_holder_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"file_url" text NOT NULL,
	"verified_status" "doc_status" DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"village_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mobile" text NOT NULL,
	"address" text,
	"photo_url" text,
	"kyc_status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pigmy_account_id" uuid NOT NULL,
	"transaction_id" uuid,
	"type" "ledger_type" NOT NULL,
	"amount" bigint NOT NULL,
	"previous_balance" bigint NOT NULL,
	"new_balance" bigint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nominees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relation" text,
	"mobile" text,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" "notif_category" DEFAULT 'system' NOT NULL,
	"read_at" timestamp with time zone,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mobile" text NOT NULL,
	"code_hash" text NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pigmy_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"daily_amount" bigint NOT NULL,
	"current_balance" bigint DEFAULT 0 NOT NULL,
	"total_deposited" bigint DEFAULT 0 NOT NULL,
	"status" "pigmy_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pigmy_accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pigmy_account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"gateway" text DEFAULT 'razorpay' NOT NULL,
	"gateway_order_id" text,
	"gateway_payment_id" text,
	"gateway_signature" text,
	"idempotency_key" text,
	"status" "txn_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "villages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "villages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_bank_details" ADD CONSTRAINT "customer_bank_details_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_village_id_villages_id_fk" FOREIGN KEY ("village_id") REFERENCES "public"."villages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_pigmy_account_id_pigmy_accounts_id_fk" FOREIGN KEY ("pigmy_account_id") REFERENCES "public"."pigmy_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "nominees" ADD CONSTRAINT "nominees_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pigmy_accounts" ADD CONSTRAINT "pigmy_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pigmy_account_id_pigmy_accounts_id_fk" FOREIGN KEY ("pigmy_account_id") REFERENCES "public"."pigmy_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_details_customer_idx" ON "customer_bank_details" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_customer_idx" ON "customer_documents" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_mobile_uq" ON "customers" USING btree ("mobile");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_village_idx" ON "customers" USING btree ("village_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_pigmy_idx" ON "ledger_entries" USING btree ("pigmy_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_created_idx" ON "ledger_entries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_txn_uq" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nominees_customer_idx" ON "nominees" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notif_customer_idx" ON "notifications" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "otp_mobile_idx" ON "otp_codes" USING btree ("mobile","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pigmy_customer_idx" ON "pigmy_accounts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_subject_idx" ON "refresh_tokens" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "txn_pigmy_idx" ON "transactions" USING btree ("pigmy_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "txn_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "txn_created_idx" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "txn_order_uq" ON "transactions" USING btree ("gateway_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "txn_payment_uq" ON "transactions" USING btree ("gateway_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "txn_idempotency_uq" ON "transactions" USING btree ("idempotency_key");