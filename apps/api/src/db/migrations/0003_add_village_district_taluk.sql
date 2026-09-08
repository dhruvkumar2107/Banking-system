ALTER TABLE "villages" ADD COLUMN "district" text NOT NULL DEFAULT 'Unknown';--> statement-breakpoint
ALTER TABLE "villages" ADD COLUMN "taluk" text NOT NULL DEFAULT 'Unknown';