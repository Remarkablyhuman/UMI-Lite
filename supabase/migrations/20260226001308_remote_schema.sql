


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$                                                                                                                                                                      
  begin                                                                                                                                                                                      
    insert into public.profiles (id, email, role)
    values (new.id, new.email, 'guest');
    return new;
  end;
  $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"("uid" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."deliverables" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "script_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "baidu_share_url" "text" NOT NULL,
    "baidu_extract_code" "text",
    "file_label" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "deliverables_type_check" CHECK (("type" = ANY (ARRAY['raw'::"text", 'final'::"text"])))
);


ALTER TABLE "public"."deliverables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'guest'::"text", 'editor'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."references" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "run_ref_id" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "status" "text" NOT NULL,
    "parsed_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "references_status_check" CHECK (("status" = ANY (ARRAY['SUBMITTED'::"text", 'PARSED'::"text", 'APPROVED'::"text", 'REJECTED'::"text"])))
);


ALTER TABLE "public"."references" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scripts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "reference_id" "uuid" NOT NULL,
    "guest_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "script_text" "text",
    "prompt_trace" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scripts_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'IN_REVIEW'::"text", 'APPROVED'::"text", 'SENT_TO_GUEST'::"text", 'DONE'::"text"])))
);


ALTER TABLE "public"."scripts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "assignee_id" "uuid",
    "assignee_role" "text",
    "reference_id" "uuid",
    "script_id" "uuid",
    "deliverable_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tasks_assignee_role_check" CHECK (("assignee_role" = ANY (ARRAY['admin'::"text", 'guest'::"text", 'editor'::"text"]))),
    CONSTRAINT "tasks_deliverable_type_check" CHECK (("deliverable_type" = ANY (ARRAY['raw'::"text", 'final'::"text"]))),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'DONE'::"text", 'BLOCKED'::"text"]))),
    CONSTRAINT "tasks_type_check" CHECK (("type" = ANY (ARRAY['REVIEW_REFERENCE'::"text", 'REVIEW_SCRIPT'::"text", 'RECORD_VIDEO'::"text", 'EDIT_VIDEO'::"text", 'REVIEW_FINAL_CUT'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


ALTER TABLE ONLY "public"."deliverables"
    ADD CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."references"
    ADD CONSTRAINT "references_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scripts"
    ADD CONSTRAINT "scripts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



CREATE INDEX "deliverables_script_type_idx" ON "public"."deliverables" USING "btree" ("script_id", "type", "created_at" DESC);



CREATE UNIQUE INDEX "profiles_email_key" ON "public"."profiles" USING "btree" ("email");



CREATE UNIQUE INDEX "references_run_ref_id_uq" ON "public"."references" USING "btree" ("run_ref_id");



CREATE INDEX "scripts_guest_idx" ON "public"."scripts" USING "btree" ("guest_id");



CREATE INDEX "scripts_ref_idx" ON "public"."scripts" USING "btree" ("reference_id");



CREATE INDEX "tasks_open_idx" ON "public"."tasks" USING "btree" ("status", "type", "assignee_role", "assignee_id", "created_at");



ALTER TABLE ONLY "public"."deliverables"
    ADD CONSTRAINT "deliverables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."deliverables"
    ADD CONSTRAINT "deliverables_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."references"
    ADD CONSTRAINT "references_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."scripts"
    ADD CONSTRAINT "scripts_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."scripts"
    ADD CONSTRAINT "scripts_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE CASCADE;



ALTER TABLE "public"."deliverables" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deliverables_admin_all" ON "public"."deliverables" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "deliverables_editor_read_assigned" ON "public"."deliverables" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."tasks" "t"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("p"."role" = 'editor'::"text") AND ("t"."script_id" = "deliverables"."script_id") AND ("t"."type" = 'EDIT_VIDEO'::"text") AND ("t"."assignee_id" = "auth"."uid"())))));



CREATE POLICY "deliverables_guest_read" ON "public"."deliverables" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."scripts" "s"
  WHERE (("s"."id" = "deliverables"."script_id") AND ("s"."guest_id" = "auth"."uid"())))));



CREATE POLICY "deliverables_insert_by_creator" ON "public"."deliverables" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_read_all" ON "public"."profiles" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_read_self" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."references" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "references_admin_all" ON "public"."references" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "references_insert_any_auth" ON "public"."references" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "references_read_own" ON "public"."references" FOR SELECT USING (("created_by" = "auth"."uid"()));



ALTER TABLE "public"."scripts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scripts_admin_all" ON "public"."scripts" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "scripts_guest_read_own" ON "public"."scripts" FOR SELECT USING (("guest_id" = "auth"."uid"()));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_admin_insert" ON "public"."tasks" FOR INSERT WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "tasks_admin_read_all" ON "public"."tasks" FOR SELECT USING ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "tasks_admin_update" ON "public"."tasks" FOR UPDATE USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "tasks_assignee_read" ON "public"."tasks" FOR SELECT USING (("assignee_id" = "auth"."uid"()));



CREATE POLICY "tasks_assignee_update" ON "public"."tasks" FOR UPDATE USING (("assignee_id" = "auth"."uid"())) WITH CHECK (("assignee_id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."deliverables" TO "anon";
GRANT ALL ON TABLE "public"."deliverables" TO "authenticated";
GRANT ALL ON TABLE "public"."deliverables" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."references" TO "anon";
GRANT ALL ON TABLE "public"."references" TO "authenticated";
GRANT ALL ON TABLE "public"."references" TO "service_role";



GRANT ALL ON TABLE "public"."scripts" TO "anon";
GRANT ALL ON TABLE "public"."scripts" TO "authenticated";
GRANT ALL ON TABLE "public"."scripts" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


