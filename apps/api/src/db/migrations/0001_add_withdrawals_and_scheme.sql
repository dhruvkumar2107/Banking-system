CREATE TYPE "public"."payout_method" AS ENUM('bank_transfer', 'cash');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_kind" AS ENUM('partial', 'closure', 'maturity');--> statement-breakpoint
CREATE TYPE "public"."withdrawal_status" AS ENUM('pending', 'approved', 'paid', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheme_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_days" integer DEFAULT 365 NOT NULL,
	"interest_rate_bps" integer DEFAULT 400 NOT NULL,
	"early_withdrawal_allowed" boolean DEFAULT true NOT NULL,
	"early_penalty_bps" integer DEFAULT 100 NOT NULL,
	"min_balance_paise" bigint DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "withdrawal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"pigmy_account_id" uuid NOT NULL,
	"kind" "withdrawal_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"penalty" bigint DEFAULT 0 NOT NULL,
	"interest" bigint DEFAULT 0 NOT NULL,
	"status" "withdrawal_status" DEFAULT 'pending' NOT NULL,
	"payout_method" "payout_method" DEFAULT 'bank_transfer' NOT NULL,
	"bank_account_masked" text,
	"bank_ifsc" text,
	"reference" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"decided_by_id" uuid
);
--> statement-breakpoint
ALTER TABLE "pigmy_accounts" ADD COLUMN "term_days" integer DEFAULT 365 NOT NULL;--> statement-breakpoint
ALTER TABLE "pigmy_accounts" ADD COLUMN "interest_rate_bps" integer DEFAULT 400 NOT NULL;--> statement-breakpoint
ALTER TABLE "pigmy_accounts" ADD COLUMN "maturity_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pigmy_accounts" ADD COLUMN "interest_credited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pigmy_accounts" ADD COLUMN "matured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pigmy_accounts" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheme_settings" ADD CONSTRAINT "scheme_settings_updated_by_id_admins_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_pigmy_account_id_pigmy_accounts_id_fk" FOREIGN KEY ("pigmy_account_id") REFERENCES "public"."pigmy_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_decided_by_id_admins_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawal_acct_idx" ON "withdrawal_requests" USING btree ("pigmy_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawal_status_idx" ON "withdrawal_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawal_requested_idx" ON "withdrawal_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pigmy_maturity_idx" ON "pigmy_accounts" USING btree ("maturity_date");