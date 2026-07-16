CREATE TABLE "favorites" (
	"profile_id" uuid NOT NULL,
	"passage_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_profile_id_passage_id_pk" PRIMARY KEY("profile_id","passage_id")
);
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorites_profile_id_created_at_idx" ON "favorites" USING btree ("profile_id","created_at" DESC NULLS LAST);