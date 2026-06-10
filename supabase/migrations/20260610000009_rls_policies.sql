-- ============================================================
-- Migration 009: Row Level Security (RLS) Policies
--
-- Strategy: API calls go through Edge Functions using service_role key.
-- service_role bypasses RLS by default — no policies needed for it.
-- anon key is used only for 3 public endpoints:
--   getMemberDirectory, getSimulateData, getMemberPublicDetail
-- All other tables: deny anon access entirely (safe default).
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE members                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE r2y_stats               ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_scores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE core_issues             ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninety_day_reviews      ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_matching_results     ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_bot_state          ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_issues             ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_absence_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE biz_profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_goals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_notif_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_schedule     ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_sends        ENABLE ROW LEVEL SECURITY;
ALTER TABLE one_to_one_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE renewals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc_messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mc_assignments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE power_teams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_team_synergy      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sprint_board            ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_revenue_goals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE new_member_checklist    ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_usage               ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_map                ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_notifs             ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Public read policies (anon key)
-- Only for the 3 endpoints that require no PIN:
--   getMemberDirectory, getSimulateData, getMemberPublicDetail
-- ============================================================

-- Active (non-archived) members: name, nickname, mentor_team only
CREATE POLICY "anon_read_active_members"
  ON members FOR SELECT
  TO anon
  USING (is_archived = false);

CREATE POLICY "anon_read_mentor_teams"
  ON mentor_teams FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_read_monthly_scores"
  ON monthly_scores FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon_read_r2y_stats"
  ON r2y_stats FOR SELECT
  TO anon
  USING (true);

-- Public directory also needs renewal info (days_to_expiry hidden client-side for non-MC)
CREATE POLICY "anon_read_renewals"
  ON renewals FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- roles table: block ALL anon access (never expose PIN hashes)
-- ============================================================
-- No SELECT policy for anon on roles → denied by default with RLS enabled.
-- fn_verify_pin() is SECURITY DEFINER and handles auth safely.

-- ============================================================
-- NOTE: service_role key (used by all Edge Functions) bypasses RLS.
-- No additional policies are required for server-side API calls.
-- If in future you want per-role DB isolation, use SET LOCAL role
-- in a transaction and add policies checking current_setting('app.role').
-- ============================================================
