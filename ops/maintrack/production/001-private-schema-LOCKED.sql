-- MainTrack private Production schema — PREPARED ONLY / NOT APPLIED.
-- DO NOT apply on Staging or QA. Requires owner's reviewed separate Production project reference.
-- Private, empty, restricted; no employees, credentials, sessions or mail settings seeded.
BEGIN;
CREATE SCHEMA mt_prod;
REVOKE ALL ON SCHEMA mt_prod FROM PUBLIC,anon,authenticated;
CREATE TYPE mt_prod.mt_role AS ENUM ('owner','engineer','technician');
CREATE TYPE mt_prod.mt_leave_status AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE SEQUENCE mt_prod.mt_wo_number_seq AS bigint START WITH 1;
SET LOCAL search_path=mt_prod,public,extensions;
CREATE TABLE mt_prod."mt_audit" (
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "actor_id" uuid,
    "action" text NOT NULL,
    "entity" text NOT NULL,
    "entity_id" text NOT NULL,
    "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mt_prod."mt_categories" (
    "name" text NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL
);
CREATE TABLE mt_prod."mt_components" (
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "section_id" bigint NOT NULL,
    "name" text NOT NULL,
    "active" boolean DEFAULT true NOT NULL
);
CREATE TABLE mt_prod."mt_leave_balance_adjustments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "delta_days" numeric(7,1) NOT NULL,
    "balance_before" numeric(7,1),
    "balance_after" numeric(7,1),
    "reason" text NOT NULL,
    "approved_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mt_prod."mt_leave_balances" (
    "user_id" uuid NOT NULL,
    "days" numeric(8,2) NOT NULL
);
CREATE TABLE mt_prod."mt_leave_ledger" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "request_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "delta" numeric(8,2) NOT NULL,
    "balance_after" numeric(8,2) NOT NULL,
    "approved_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mt_prod."mt_leave_requests" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "public_id" text NOT NULL,
    "requester_id" uuid NOT NULL,
    "client_request_id" uuid NOT NULL,
    "request_digest" text NOT NULL,
    "type" text NOT NULL,
    "start_date" date NOT NULL,
    "end_date" date NOT NULL,
    "days" numeric(7,1) NOT NULL,
    "reason" text DEFAULT ''::text NOT NULL,
    "status" mt_prod.mt_leave_status DEFAULT 'PENDING'::mt_prod.mt_leave_status NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" uuid,
    "decision_reason" text DEFAULT ''::text NOT NULL,
    "balance_before" numeric(8,2),
    "balance_after" numeric(8,2),
    "duration_kind" text DEFAULT 'FULL_DAY'::text NOT NULL
);
CREATE TABLE mt_prod."mt_login_attempts" (
    "employee_code" text NOT NULL,
    "fail_count" integer DEFAULT 0 NOT NULL,
    "blocked_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mt_prod."mt_login_rate_guard" (
    "key_hash" text NOT NULL,
    "window_start" timestamp with time zone DEFAULT now() NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mt_prod."mt_machines" (
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "section_id" bigint NOT NULL,
    "name" text NOT NULL,
    "active" boolean DEFAULT true NOT NULL
);
CREATE TABLE mt_prod."mt_mail_config" (
    "singleton" boolean DEFAULT true NOT NULL,
    "recipient_email" text NOT NULL,
    "sender_email" text,
    "provider" text DEFAULT 'resend'::text NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mt_prod."mt_migrations" (
    "version" text NOT NULL,
    "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mt_prod."mt_notifications" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "recipient_id" uuid NOT NULL,
    "source_id" text NOT NULL,
    "type" text NOT NULL,
    "title" text NOT NULL,
    "description" text DEFAULT ''::text NOT NULL,
    "target" text DEFAULT 'report'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "read_at" timestamp with time zone
);
CREATE TABLE mt_prod."mt_outbox" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "event_key" text NOT NULL,
    "event_type" text NOT NULL,
    "payload" jsonb NOT NULL,
    "state" text DEFAULT 'PENDING'::text NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "next_run_at" timestamp with time zone DEFAULT now() NOT NULL,
    "claimed_at" timestamp with time zone,
    "last_error" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "done_at" timestamp with time zone,
    "provider_message_id" text,
    "last_http_status" integer
);
CREATE TABLE mt_prod."mt_overtime_requests" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "public_id" text NOT NULL,
    "requester_id" uuid NOT NULL,
    "client_request_id" uuid NOT NULL,
    "request_digest" text NOT NULL,
    "work_date" date NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "minutes" integer NOT NULL,
    "compensation_kind" text NOT NULL,
    "reason" text DEFAULT ''::text NOT NULL,
    "status" mt_prod.mt_leave_status DEFAULT 'PENDING'::mt_prod.mt_leave_status NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" uuid,
    "decision_reason" text DEFAULT ''::text NOT NULL,
    "work_kind" text DEFAULT 'UNSPECIFIED'::text NOT NULL
);
CREATE TABLE mt_prod."mt_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "wo_number" bigint DEFAULT nextval('mt_prod.mt_wo_number_seq'::regclass) NOT NULL,
    "client_request_id" uuid,
    "request_digest" text,
    "creator_id" uuid,
    "section_id" bigint,
    "machine_id" bigint,
    "component_id" bigint,
    "description" text NOT NULL,
    "solution" text DEFAULT ''::text NOT NULL,
    "spare_parts" text DEFAULT ''::text NOT NULL,
    "incident_date" date NOT NULL,
    "report_time" time without time zone NOT NULL,
    "work_start_time" time without time zone NOT NULL,
    "work_end_time" time without time zone NOT NULL,
    "status" text NOT NULL,
    "category" text NOT NULL,
    "legacy_wo" text,
    "legacy_sheet_row" integer,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "assigned_technician" text DEFAULT ''::text NOT NULL,
    "facility" text DEFAULT ''::text NOT NULL,
    "legacy_client_ref" text DEFAULT ''::text NOT NULL,
    "is_test" boolean DEFAULT false NOT NULL,
    "workflow_state" text DEFAULT 'RECORDED'::text NOT NULL,
    "revision" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" uuid,
    "delete_reason" text
);
CREATE TABLE mt_prod."mt_sections" (
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "name" text NOT NULL,
    "active" boolean DEFAULT true NOT NULL
);
CREATE TABLE mt_prod."mt_sessions" (
    "token_hash" text NOT NULL,
    "user_id" uuid NOT NULL,
    "token_version" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL
);
CREATE TABLE mt_prod."mt_statuses" (
    "name" text NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL
);
CREATE TABLE mt_prod."mt_substitute_time_adjustments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "delta_minutes" integer NOT NULL,
    "reason" text NOT NULL,
    "approved_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mt_prod."mt_substitute_time_ledger" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "delta_minutes" integer NOT NULL,
    "overtime_id" uuid,
    "leave_id" uuid,
    "approved_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mt_prod."mt_technicians" (
    "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    "name" text NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mt_prod."mt_users" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "employee_code" text NOT NULL,
    "name" text NOT NULL,
    "role" mt_prod.mt_role DEFAULT 'technician'::mt_prod.mt_role NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "password_hash" text NOT NULL,
    "token_version" integer DEFAULT 0 NOT NULL,
    "must_change" boolean DEFAULT true NOT NULL,
    "department" text DEFAULT ''::text NOT NULL,
    "job_title" text DEFAULT ''::text NOT NULL,
    "preferred_name" text DEFAULT ''::text NOT NULL,
    "phone" text DEFAULT ''::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE mt_prod."mt_audit" ADD CONSTRAINT "mt_audit_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_categories" ADD CONSTRAINT "mt_categories_pkey" PRIMARY KEY (name);
ALTER TABLE mt_prod."mt_components" ADD CONSTRAINT "mt_components_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_leave_balance_adjustments" ADD CONSTRAINT "mt_leave_balance_adjustments_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_leave_balances" ADD CONSTRAINT "mt_leave_balances_pkey" PRIMARY KEY (user_id);
ALTER TABLE mt_prod."mt_leave_ledger" ADD CONSTRAINT "mt_leave_ledger_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_leave_requests" ADD CONSTRAINT "mt_leave_requests_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_login_attempts" ADD CONSTRAINT "mt_login_attempts_pkey" PRIMARY KEY (employee_code);
ALTER TABLE mt_prod."mt_login_rate_guard" ADD CONSTRAINT "mt_login_rate_guard_pkey" PRIMARY KEY (key_hash);
ALTER TABLE mt_prod."mt_machines" ADD CONSTRAINT "mt_machines_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_mail_config" ADD CONSTRAINT "mt_mail_config_pkey" PRIMARY KEY (singleton);
ALTER TABLE mt_prod."mt_migrations" ADD CONSTRAINT "mt_migrations_pkey" PRIMARY KEY (version);
ALTER TABLE mt_prod."mt_notifications" ADD CONSTRAINT "mt_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_outbox" ADD CONSTRAINT "mt_outbox_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_overtime_requests" ADD CONSTRAINT "mt_overtime_requests_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_sections" ADD CONSTRAINT "mt_sections_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_sessions" ADD CONSTRAINT "mt_sessions_pkey" PRIMARY KEY (token_hash);
ALTER TABLE mt_prod."mt_statuses" ADD CONSTRAINT "mt_statuses_pkey" PRIMARY KEY (name);
ALTER TABLE mt_prod."mt_substitute_time_adjustments" ADD CONSTRAINT "mt_substitute_time_adjustments_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_substitute_time_ledger" ADD CONSTRAINT "mt_substitute_time_ledger_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_technicians" ADD CONSTRAINT "mt_technicians_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_users" ADD CONSTRAINT "mt_users_pkey" PRIMARY KEY (id);
ALTER TABLE mt_prod."mt_categories" ADD CONSTRAINT "mt_categories_id_unique" UNIQUE (id);
ALTER TABLE mt_prod."mt_components" ADD CONSTRAINT "mt_components_id_section_id_key" UNIQUE (id, section_id);
ALTER TABLE mt_prod."mt_components" ADD CONSTRAINT "mt_components_section_id_name_key" UNIQUE (section_id, name);
ALTER TABLE mt_prod."mt_leave_ledger" ADD CONSTRAINT "mt_leave_ledger_request_id_key" UNIQUE (request_id);
ALTER TABLE mt_prod."mt_leave_requests" ADD CONSTRAINT "mt_leave_requests_client_request_id_key" UNIQUE (client_request_id);
ALTER TABLE mt_prod."mt_leave_requests" ADD CONSTRAINT "mt_leave_requests_public_id_key" UNIQUE (public_id);
ALTER TABLE mt_prod."mt_machines" ADD CONSTRAINT "mt_machines_id_section_id_key" UNIQUE (id, section_id);
ALTER TABLE mt_prod."mt_machines" ADD CONSTRAINT "mt_machines_section_id_name_key" UNIQUE (section_id, name);
ALTER TABLE mt_prod."mt_notifications" ADD CONSTRAINT "mt_notifications_recipient_id_type_source_id_key" UNIQUE (recipient_id, type, source_id);
ALTER TABLE mt_prod."mt_outbox" ADD CONSTRAINT "mt_outbox_event_key_key" UNIQUE (event_key);
ALTER TABLE mt_prod."mt_overtime_requests" ADD CONSTRAINT "mt_overtime_requests_client_request_id_key" UNIQUE (client_request_id);
ALTER TABLE mt_prod."mt_overtime_requests" ADD CONSTRAINT "mt_overtime_requests_public_id_key" UNIQUE (public_id);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_client_request_id_key" UNIQUE (client_request_id);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_legacy_sheet_row_key" UNIQUE (legacy_sheet_row);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_legacy_wo_key" UNIQUE (legacy_wo);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_wo_number_key" UNIQUE (wo_number);
ALTER TABLE mt_prod."mt_sections" ADD CONSTRAINT "mt_sections_name_key" UNIQUE (name);
ALTER TABLE mt_prod."mt_statuses" ADD CONSTRAINT "mt_statuses_id_unique" UNIQUE (id);
ALTER TABLE mt_prod."mt_technicians" ADD CONSTRAINT "mt_technicians_name_key" UNIQUE (name);
ALTER TABLE mt_prod."mt_users" ADD CONSTRAINT "mt_users_employee_code_key" UNIQUE (employee_code);
ALTER TABLE mt_prod."mt_leave_balance_adjustments" ADD CONSTRAINT "mt_leave_balance_adjustments_balance_after_check" CHECK (balance_after IS NULL OR balance_after >= 0::numeric);
ALTER TABLE mt_prod."mt_leave_balance_adjustments" ADD CONSTRAINT "mt_leave_balance_adjustments_delta_days_check" CHECK (delta_days <> 0::numeric);
ALTER TABLE mt_prod."mt_leave_balance_adjustments" ADD CONSTRAINT "mt_leave_balance_adjustments_reason_check" CHECK (length(btrim(reason)) >= 3 AND length(btrim(reason)) <= 250);
ALTER TABLE mt_prod."mt_leave_balances" ADD CONSTRAINT "mt_leave_balances_days_check" CHECK (days >= 0::numeric);
ALTER TABLE mt_prod."mt_leave_ledger" ADD CONSTRAINT "mt_leave_ledger_balance_after_check" CHECK (balance_after >= 0::numeric);
ALTER TABLE mt_prod."mt_leave_ledger" ADD CONSTRAINT "mt_leave_ledger_delta_check" CHECK (delta < 0::numeric);
ALTER TABLE mt_prod."mt_leave_requests" ADD CONSTRAINT "mt_leave_duration_kind_chk" CHECK (duration_kind = ANY (ARRAY['FULL_DAY'::text, 'HALF_DAY'::text]));
ALTER TABLE mt_prod."mt_leave_requests" ADD CONSTRAINT "mt_leave_requests_calendar_days_check" CHECK (duration_kind = 'FULL_DAY'::text AND days = (end_date - start_date + 1)::numeric OR duration_kind = 'HALF_DAY'::text AND start_date = end_date AND days = 0.5);
ALTER TABLE mt_prod."mt_leave_requests" ADD CONSTRAINT "mt_leave_requests_check" CHECK (end_date >= start_date);
ALTER TABLE mt_prod."mt_leave_requests" ADD CONSTRAINT "mt_leave_requests_days_check" CHECK (days >= 0.5 AND days <= 60::numeric);
ALTER TABLE mt_prod."mt_leave_requests" ADD CONSTRAINT "mt_leave_requests_type_check" CHECK ((type = ANY (ARRAY['annual'::text, 'casual'::text, 'sick'::text, 'other'::text, 'compensatory'::text])) AND (duration_kind <> 'HALF_DAY'::text OR (type = ANY (ARRAY['annual'::text, 'compensatory'::text]))) AND (type <> 'compensatory'::text OR start_date = end_date AND (days = ANY (ARRAY[0.5, 1::numeric]))));
ALTER TABLE mt_prod."mt_login_rate_guard" ADD CONSTRAINT "mt_login_rate_guard_attempts_positive" CHECK (attempts >= 0);
ALTER TABLE mt_prod."mt_mail_config" ADD CONSTRAINT "cannot_enable_without_sender" CHECK (NOT enabled OR sender_email IS NOT NULL);
ALTER TABLE mt_prod."mt_mail_config" ADD CONSTRAINT "mt_mail_config_provider_check" CHECK (provider = 'resend'::text);
ALTER TABLE mt_prod."mt_mail_config" ADD CONSTRAINT "mt_mail_config_recipient_email_check" CHECK (recipient_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'::text);
ALTER TABLE mt_prod."mt_mail_config" ADD CONSTRAINT "mt_mail_config_sender_email_check" CHECK (sender_email IS NULL OR sender_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'::text);
ALTER TABLE mt_prod."mt_mail_config" ADD CONSTRAINT "mt_mail_config_singleton_check" CHECK (singleton);
ALTER TABLE mt_prod."mt_notifications" ADD CONSTRAINT "mt_notifications_type_check" CHECK (type = ANY (ARRAY['report'::text, 'leaveDecision'::text, 'leaveBalance'::text, 'overtimeDecision'::text]));
ALTER TABLE mt_prod."mt_outbox" ADD CONSTRAINT "mt_outbox_last_http_status_check" CHECK (last_http_status IS NULL OR last_http_status >= 100 AND last_http_status <= 599);
ALTER TABLE mt_prod."mt_outbox" ADD CONSTRAINT "mt_outbox_state_check" CHECK (state = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'DONE'::text, 'FAILED'::text]));
ALTER TABLE mt_prod."mt_overtime_requests" ADD CONSTRAINT "mt_overtime_requests_compensation_kind_check" CHECK (compensation_kind = ANY (ARRAY['FINANCIAL'::text, 'SUBSTITUTE'::text]));
ALTER TABLE mt_prod."mt_overtime_requests" ADD CONSTRAINT "mt_overtime_requests_minutes_check" CHECK (minutes >= 1 AND minutes <= 1440);
ALTER TABLE mt_prod."mt_overtime_requests" ADD CONSTRAINT "mt_overtime_work_kind_check" CHECK (work_kind = ANY (ARRAY['AFTER_SHIFT'::text, 'INDEPENDENT_DAY'::text, 'UNSPECIFIED'::text]));
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_description_check" CHECK (length(description) >= 1 AND length(description) <= 2000);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_revision_positive_check" CHECK (revision >= 1);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_workflow_state_check" CHECK (workflow_state = ANY (ARRAY['RECORDED'::text, 'OPEN'::text, 'CLOSED'::text]));
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "new_reports_require_idempotency" CHECK (legacy_sheet_row IS NOT NULL OR client_request_id IS NOT NULL AND request_digest IS NOT NULL);
ALTER TABLE mt_prod."mt_sessions" ADD CONSTRAINT "mt_sessions_token_hash_check" CHECK (length(token_hash) = 64);
ALTER TABLE mt_prod."mt_substitute_time_adjustments" ADD CONSTRAINT "mt_substitute_time_adjustments_delta_minutes_check" CHECK (delta_minutes <> 0);
ALTER TABLE mt_prod."mt_substitute_time_adjustments" ADD CONSTRAINT "mt_substitute_time_adjustments_reason_check" CHECK (length(btrim(reason)) >= 3 AND length(btrim(reason)) <= 250);
ALTER TABLE mt_prod."mt_substitute_time_ledger" ADD CONSTRAINT "mt_substitute_ledger_one_source" CHECK (overtime_id IS NOT NULL AND leave_id IS NULL AND delta_minutes > 0 OR overtime_id IS NULL AND leave_id IS NOT NULL AND delta_minutes < 0);
ALTER TABLE mt_prod."mt_substitute_time_ledger" ADD CONSTRAINT "mt_substitute_time_ledger_delta_minutes_check" CHECK (delta_minutes <> 0);
ALTER TABLE mt_prod."mt_users" ADD CONSTRAINT "employee_code_format" CHECK (employee_code ~ '^[A-Za-z0-9_-]{1,32}$'::text);
ALTER TABLE mt_prod."mt_users" ADD CONSTRAINT "mt_users_token_version_check" CHECK (token_version >= 0);
ALTER TABLE mt_prod."mt_audit" ADD CONSTRAINT "mt_audit_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_components" ADD CONSTRAINT "mt_components_section_id_fkey" FOREIGN KEY (section_id) REFERENCES mt_sections(id);
ALTER TABLE mt_prod."mt_leave_balance_adjustments" ADD CONSTRAINT "mt_leave_balance_adjustments_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_leave_balance_adjustments" ADD CONSTRAINT "mt_leave_balance_adjustments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_leave_balances" ADD CONSTRAINT "mt_leave_balances_user_id_fkey" FOREIGN KEY (user_id) REFERENCES mt_users(id) ON DELETE RESTRICT;
ALTER TABLE mt_prod."mt_leave_ledger" ADD CONSTRAINT "mt_leave_ledger_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_leave_ledger" ADD CONSTRAINT "mt_leave_ledger_request_id_fkey" FOREIGN KEY (request_id) REFERENCES mt_leave_requests(id);
ALTER TABLE mt_prod."mt_leave_ledger" ADD CONSTRAINT "mt_leave_ledger_user_id_fkey" FOREIGN KEY (user_id) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_leave_requests" ADD CONSTRAINT "mt_leave_requests_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_leave_requests" ADD CONSTRAINT "mt_leave_requests_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_machines" ADD CONSTRAINT "mt_machines_section_id_fkey" FOREIGN KEY (section_id) REFERENCES mt_sections(id);
ALTER TABLE mt_prod."mt_notifications" ADD CONSTRAINT "mt_notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_overtime_requests" ADD CONSTRAINT "mt_overtime_requests_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_overtime_requests" ADD CONSTRAINT "mt_overtime_requests_requester_id_fkey" FOREIGN KEY (requester_id) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_category_fkey" FOREIGN KEY (category) REFERENCES mt_categories(name);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_component_id_section_id_fkey" FOREIGN KEY (component_id, section_id) REFERENCES mt_components(id, section_id);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_creator_id_fkey" FOREIGN KEY (creator_id) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_deleted_by_fkey" FOREIGN KEY (deleted_by) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_machine_id_section_id_fkey" FOREIGN KEY (machine_id, section_id) REFERENCES mt_machines(id, section_id);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_section_id_fkey" FOREIGN KEY (section_id) REFERENCES mt_sections(id);
ALTER TABLE mt_prod."mt_reports" ADD CONSTRAINT "mt_reports_status_fkey" FOREIGN KEY (status) REFERENCES mt_statuses(name);
ALTER TABLE mt_prod."mt_sessions" ADD CONSTRAINT "mt_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES mt_users(id) ON DELETE CASCADE;
ALTER TABLE mt_prod."mt_substitute_time_adjustments" ADD CONSTRAINT "mt_substitute_time_adjustments_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_substitute_time_adjustments" ADD CONSTRAINT "mt_substitute_time_adjustments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_substitute_time_ledger" ADD CONSTRAINT "mt_substitute_time_ledger_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES mt_users(id);
ALTER TABLE mt_prod."mt_substitute_time_ledger" ADD CONSTRAINT "mt_substitute_time_ledger_leave_id_fkey" FOREIGN KEY (leave_id) REFERENCES mt_leave_requests(id);
ALTER TABLE mt_prod."mt_substitute_time_ledger" ADD CONSTRAINT "mt_substitute_time_ledger_overtime_id_fkey" FOREIGN KEY (overtime_id) REFERENCES mt_overtime_requests(id);
ALTER TABLE mt_prod."mt_substitute_time_ledger" ADD CONSTRAINT "mt_substitute_time_ledger_user_id_fkey" FOREIGN KEY (user_id) REFERENCES mt_users(id);
CREATE INDEX mt_audit_actor_idx ON mt_prod.mt_audit USING btree (actor_id);
CREATE INDEX mt_audit_report_history_idx ON mt_prod.mt_audit USING btree (entity, entity_id, created_at DESC) WHERE (entity = 'report'::text);
CREATE INDEX mt_leave_adj_approved_by_idx ON mt_prod.mt_leave_balance_adjustments USING btree (approved_by);
CREATE INDEX mt_leave_adj_user_created_idx ON mt_prod.mt_leave_balance_adjustments USING btree (user_id, created_at DESC);
CREATE INDEX mt_leave_ledger_approved_by_idx ON mt_prod.mt_leave_ledger USING btree (approved_by);
CREATE INDEX mt_leave_ledger_user_idx ON mt_prod.mt_leave_ledger USING btree (user_id);
CREATE INDEX mt_leave_request_owner_idx ON mt_prod.mt_leave_requests USING btree (status, created_at DESC);
CREATE INDEX mt_leave_request_user_idx ON mt_prod.mt_leave_requests USING btree (requester_id, created_at DESC);
CREATE INDEX mt_leave_requests_decider_idx ON mt_prod.mt_leave_requests USING btree (decided_by);
CREATE INDEX mt_login_rate_guard_updated_at_idx ON mt_prod.mt_login_rate_guard USING btree (updated_at);
CREATE INDEX mt_notifications_unread_idx ON mt_prod.mt_notifications USING btree (recipient_id, read_at, created_at DESC);
CREATE INDEX mt_notifications_user_idx ON mt_prod.mt_notifications USING btree (recipient_id, created_at DESC);
CREATE INDEX mt_outbox_email_dispatch_idx ON mt_prod.mt_outbox USING btree (state, next_run_at, created_at) WHERE (event_type = 'report.created.email'::text);
CREATE INDEX mt_outbox_queue_idx ON mt_prod.mt_outbox USING btree (state, next_run_at);
CREATE INDEX mt_outbox_stuck_lease_idx ON mt_prod.mt_outbox USING btree (claimed_at) WHERE (state = 'PROCESSING'::text);
CREATE INDEX mt_overtime_decided_by_idx ON mt_prod.mt_overtime_requests USING btree (decided_by) WHERE (decided_by IS NOT NULL);
CREATE INDEX mt_overtime_status_created_idx ON mt_prod.mt_overtime_requests USING btree (status, created_at DESC);
CREATE INDEX mt_overtime_user_created_idx ON mt_prod.mt_overtime_requests USING btree (requester_id, created_at DESC);
CREATE INDEX mt_reports_category_idx ON mt_prod.mt_reports USING btree (category);
CREATE INDEX mt_reports_component_section_idx ON mt_prod.mt_reports USING btree (component_id, section_id);
CREATE INDEX mt_reports_creator_idx ON mt_prod.mt_reports USING btree (creator_id);
CREATE INDEX mt_reports_deleted_by_idx ON mt_prod.mt_reports USING btree (deleted_by);
CREATE INDEX mt_reports_machine_date_idx ON mt_prod.mt_reports USING btree (machine_id, incident_date DESC);
CREATE INDEX mt_reports_machine_section_idx ON mt_prod.mt_reports USING btree (machine_id, section_id);
CREATE INDEX mt_reports_month_idx ON mt_prod.mt_reports USING btree (incident_date DESC);
CREATE INDEX mt_reports_section_date_idx ON mt_prod.mt_reports USING btree (section_id, incident_date DESC);
CREATE INDEX mt_reports_status_idx ON mt_prod.mt_reports USING btree (status);
CREATE INDEX mt_reports_visible_wo_idx ON mt_prod.mt_reports USING btree (wo_number DESC) WHERE (deleted_at IS NULL);
CREATE INDEX mt_sessions_expiry_idx ON mt_prod.mt_sessions USING btree (expires_at);
CREATE INDEX mt_sessions_user_idx ON mt_prod.mt_sessions USING btree (user_id, expires_at);
CREATE INDEX mt_sub_adj_approved_by_idx ON mt_prod.mt_substitute_time_adjustments USING btree (approved_by);
CREATE INDEX mt_sub_adj_user_created_idx ON mt_prod.mt_substitute_time_adjustments USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX mt_sub_time_leave_uq ON mt_prod.mt_substitute_time_ledger USING btree (leave_id) WHERE (leave_id IS NOT NULL);
CREATE UNIQUE INDEX mt_sub_time_overtime_uq ON mt_prod.mt_substitute_time_ledger USING btree (overtime_id) WHERE (overtime_id IS NOT NULL);
CREATE INDEX mt_sub_time_user_idx ON mt_prod.mt_substitute_time_ledger USING btree (user_id, created_at DESC);
CREATE INDEX mt_substitute_approved_by_idx ON mt_prod.mt_substitute_time_ledger USING btree (approved_by);
ALTER TABLE mt_prod."mt_audit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_audit" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_categories" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_categories" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_components" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_components" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_leave_balance_adjustments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_leave_balance_adjustments" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_leave_balances" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_leave_balances" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_leave_ledger" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_leave_ledger" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_leave_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_leave_requests" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_login_attempts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_login_attempts" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_login_rate_guard" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_login_rate_guard" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_machines" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_machines" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_mail_config" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_mail_config" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_migrations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_migrations" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_notifications" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_outbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_outbox" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_overtime_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_overtime_requests" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_reports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_reports" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_sections" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_sections" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_sessions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_sessions" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_statuses" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_statuses" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_substitute_time_adjustments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_substitute_time_adjustments" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_substitute_time_ledger" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_substitute_time_ledger" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_technicians" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_technicians" FROM PUBLIC,anon,authenticated;
ALTER TABLE mt_prod."mt_users" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE mt_prod."mt_users" FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA mt_prod FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION mt_prod.mt_fill_report_technician_from_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mt_prod'
AS $function$
DECLARE employee_name text;
BEGIN
  IF NEW.creator_id IS NOT NULL
     AND NULLIF(btrim(COALESCE(NEW.assigned_technician,'')), '') IS NULL THEN
    SELECT NULLIF(btrim(u.name),'')
      INTO employee_name
      FROM mt_prod.mt_users AS u
     WHERE u.id = NEW.creator_id;
    IF employee_name IS NOT NULL THEN
      NEW.assigned_technician := employee_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;
REVOKE ALL ON FUNCTION mt_prod.mt_fill_report_technician_from_creator() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION mt_prod.mt_notification_keep_latest_five()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mt_prod', 'pg_temp'
AS $function$
BEGIN
  -- Serialize pruning per recipient, not globally.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.recipient_id::text,20261014));
  DELETE FROM mt_prod.mt_notifications n
  WHERE n.recipient_id=NEW.recipient_id
    AND n.id IN (
      SELECT older.id
      FROM mt_prod.mt_notifications older
      WHERE older.recipient_id=NEW.recipient_id
      ORDER BY older.created_at DESC,older.id DESC
      OFFSET 5
    );
  RETURN NEW;
END
$function$
;
REVOKE ALL ON FUNCTION mt_prod.mt_notification_keep_latest_five() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION mt_prod.mt_queue_report_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'mt_prod'
AS $function$
BEGIN
 IF NEW.legacy_sheet_row IS NULL AND NEW.client_request_id IS NOT NULL THEN
   INSERT INTO mt_prod.mt_outbox(event_key,event_type,payload,state)
   VALUES('report.email.' || NEW.id::text,
          'report.created.email',
          jsonb_build_object('report_id',NEW.id,'wo_number',NEW.wo_number),
          'PENDING')
   ON CONFLICT (event_key) DO NOTHING;
 END IF;
 RETURN NEW;
END
$function$
;
REVOKE ALL ON FUNCTION mt_prod.mt_queue_report_email() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mt_notifications_cap_five AFTER INSERT ON mt_prod.mt_notifications FOR EACH ROW EXECUTE FUNCTION mt_prod.mt_notification_keep_latest_five();
CREATE TRIGGER mt_reports_auto_assigned_technician BEFORE INSERT OR UPDATE OF creator_id, assigned_technician ON mt_prod.mt_reports FOR EACH ROW EXECUTE FUNCTION mt_prod.mt_fill_report_technician_from_creator();
CREATE TRIGGER mt_reports_email_outbox AFTER INSERT ON mt_prod.mt_reports FOR EACH ROW EXECUTE FUNCTION mt_prod.mt_queue_report_email();
CREATE VIEW mt_prod.mt_reports_sheet_view WITH (security_invoker = true) AS  SELECT COALESCE(NULLIF(r.legacy_wo, ''::text), ('WO-'::text ||
        CASE
            WHEN r.wo_number < 10 THEN '0'::text
            ELSE ''::text
        END) || r.wo_number::text) AS "WO ID",
    r.facility AS "Facility",
    COALESCE(sec.name, ''::text) AS "Section",
    COALESCE(m.name, ''::text) AS "Machine",
    r.description AS "Failure Description",
    r.incident_date AS "Date",
    r.report_time AS "WO Start Time",
    r.work_start_time AS "Repair Start Time",
    r.work_end_time AS "Repair End Time",
    r.assigned_technician AS "Assigned Technician",
    r.spare_parts AS "Spare Parts",
    r.status AS "Status",
    r.category AS "Failure Category",
    COALESCE(comp.name, ''::text) AS "Component",
    r.solution AS "Solution Steps",
    r.legacy_client_ref AS "Client Ref",
    COALESCE(owner.employee_code, ''::text) AS "Created By Employee Code",
    r.created_at AS "Stored At",
        CASE
            WHEN r.legacy_wo IS NOT NULL THEN 'Google Sheets import'::text
            ELSE 'MainTrack Pilot'::text
        END AS "Source",
    r.is_test AS "Is Test",
    r.wo_number AS "Internal WO Number",
    r.legacy_sheet_row AS "Original Sheet Row"
   FROM mt_reports r
     LEFT JOIN mt_sections sec ON sec.id = r.section_id
     LEFT JOIN mt_machines m ON m.id = r.machine_id
     LEFT JOIN mt_components comp ON comp.id = r.component_id
     LEFT JOIN mt_users owner ON owner.id = r.creator_id
  ORDER BY r.wo_number DESC;;
REVOKE ALL ON mt_prod.mt_reports_sheet_view FROM PUBLIC,anon,authenticated;
-- Revoke implicit future schema object privileges from browser SDK roles.
ALTER DEFAULT PRIVILEGES IN SCHEMA mt_prod REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mt_prod REVOKE ALL ON SEQUENCES FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mt_prod REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
COMMIT;
