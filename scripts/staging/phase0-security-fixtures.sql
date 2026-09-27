-- Phase 0 security-acceptance fixtures. STAGING ONLY.
-- Every row is deterministic, synthetic, and removable by
-- scripts/staging/cleanup-phase0-security-fixtures.sql.
BEGIN;

INSERT INTO public.chapter_profiles (id, chapter_key, display_name, short_name, is_active, msb_planning_year)
VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'test-chapter-a', 'TEST_ Chapter A', 'TEST_A', true, 2027),
  ('00000000-0000-4000-8000-0000000000b1', 'test-chapter-b', 'TEST_ Chapter B', 'TEST_B', true, 2027)
ON CONFLICT (chapter_key) DO UPDATE SET
  display_name = EXCLUDED.display_name, short_name = EXCLUDED.short_name,
  is_active = EXCLUDED.is_active, msb_planning_year = EXCLUDED.msb_planning_year;

INSERT INTO public.mentor_teams (name, leader_name, display_name)
VALUES
  ('TEST_MENTOR_TEAM_A', 'TEST_MENTOR_A', 'TEST_ Mentor Team A'),
  ('TEST_MENTOR_TEAM_B', 'TEST_CROSS_CHAPTER_USER_B', 'TEST_ Mentor Team B')
ON CONFLICT (name) DO UPDATE SET leader_name = EXCLUDED.leader_name, display_name = EXCLUDED.display_name;

INSERT INTO public.members (id, chapter_id, name, nickname, email, mentor_team, profession, company_name, is_new_member, membership_start_date)
VALUES
  ('00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-0000000000a1', 'TEST_GROWTH_COORDINATOR_A', 'TEST_GC_A', 'test.growth.coordinator.a@synthetic.invalid', 'TEST_MENTOR_TEAM_A', 'TEST_ Growth Coordinator', 'TEST_ Chapter A', false, CURRENT_DATE),
  ('00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-0000000000a1', 'TEST_GROWTH_MEMBER_A', 'TEST_GM_A', 'test.growth.member.a@synthetic.invalid', 'TEST_MENTOR_TEAM_A', 'TEST_ Growth Member', 'TEST_ Chapter A', false, CURRENT_DATE),
  ('00000000-0000-4000-8000-00000000a103', '00000000-0000-4000-8000-0000000000a1', 'TEST_MENTOR_A', 'TEST_MENTOR_A', 'test.mentor.a@synthetic.invalid', 'TEST_MENTOR_TEAM_A', 'TEST_ Mentor', 'TEST_ Chapter A', false, CURRENT_DATE),
  ('00000000-0000-4000-8000-00000000a104', '00000000-0000-4000-8000-0000000000a1', 'TEST_MEMBER_SHARED_A', 'TEST_SHARED_A', 'test.member.shared.a@synthetic.invalid', 'TEST_MENTOR_TEAM_A', 'TEST_ Hospitality Network', 'TEST_ Shared Business A', false, CURRENT_DATE),
  ('00000000-0000-4000-8000-00000000a105', '00000000-0000-4000-8000-0000000000a1', 'TEST_MEMBER_REVOKED_A', 'TEST_REVOKED_A', 'test.member.revoked.a@synthetic.invalid', 'TEST_MENTOR_TEAM_A', 'TEST_ Referral Source', 'TEST_ Restricted Business A', false, CURRENT_DATE),
  ('00000000-0000-4000-8000-00000000a106', '00000000-0000-4000-8000-0000000000a1', 'TEST_REVOKE_USER_A', 'TEST_REVOKE_A', 'test.revocation.a@synthetic.invalid', 'TEST_MENTOR_TEAM_A', 'TEST_ Revocation User', 'TEST_ Chapter A', false, CURRENT_DATE),
  ('00000000-0000-4000-8000-00000000b101', '00000000-0000-4000-8000-0000000000b1', 'TEST_CROSS_CHAPTER_USER_B', 'TEST_CROSS_B', 'test.cross.chapter.b@synthetic.invalid', 'TEST_MENTOR_TEAM_B', 'TEST_ Cross Chapter User', 'TEST_ Chapter B', false, CURRENT_DATE)
ON CONFLICT (name) DO UPDATE SET
  chapter_id = EXCLUDED.chapter_id, nickname = EXCLUDED.nickname, email = EXCLUDED.email,
  mentor_team = EXCLUDED.mentor_team, profession = EXCLUDED.profession, company_name = EXCLUDED.company_name,
  is_archived = false, updated_at = now();

INSERT INTO public.chapter_memberships (chapter_id, email, member_id, platform_role, access_status, is_default, source)
VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'test.growth.coordinator.a@synthetic.invalid', '00000000-0000-4000-8000-00000000a101', 'chapter_user', 'active', true, 'TEST_phase0'),
  ('00000000-0000-4000-8000-0000000000a1', 'test.growth.member.a@synthetic.invalid', '00000000-0000-4000-8000-00000000a102', 'chapter_user', 'active', true, 'TEST_phase0'),
  ('00000000-0000-4000-8000-0000000000a1', 'test.mentor.a@synthetic.invalid', '00000000-0000-4000-8000-00000000a103', 'chapter_user', 'active', true, 'TEST_phase0'),
  ('00000000-0000-4000-8000-0000000000a1', 'test.member.shared.a@synthetic.invalid', '00000000-0000-4000-8000-00000000a104', 'chapter_user', 'active', true, 'TEST_phase0'),
  ('00000000-0000-4000-8000-0000000000a1', 'test.member.revoked.a@synthetic.invalid', '00000000-0000-4000-8000-00000000a105', 'chapter_user', 'active', true, 'TEST_phase0'),
  ('00000000-0000-4000-8000-0000000000a1', 'test.revocation.a@synthetic.invalid', '00000000-0000-4000-8000-00000000a106', 'chapter_user', 'active', true, 'TEST_phase0'),
  ('00000000-0000-4000-8000-0000000000b1', 'test.cross.chapter.b@synthetic.invalid', '00000000-0000-4000-8000-00000000b101', 'chapter_user', 'active', true, 'TEST_phase0')
ON CONFLICT (chapter_id, email) DO UPDATE SET
  member_id = EXCLUDED.member_id, access_status = EXCLUDED.access_status,
  is_default = EXCLUDED.is_default, source = EXCLUDED.source, updated_at = now();

INSERT INTO public.role_assignments (email, role, display_name, team_name, is_mc, is_mentor, is_admin, capabilities, member_id, access_status, chapter_id)
VALUES
  ('test.growth.coordinator.a@synthetic.invalid', 'growth', 'TEST_GROWTH_COORDINATOR_A', NULL, false, false, false, ARRAY['growth.coordinate','growth.task.manage_assigned','signals.view','signals.manage'], '00000000-0000-4000-8000-00000000a101', 'active', '00000000-0000-4000-8000-0000000000a1'),
  ('test.growth.member.a@synthetic.invalid', 'growth', 'TEST_GROWTH_MEMBER_A', NULL, false, false, false, ARRAY['growth.task.manage_assigned','signals.view'], '00000000-0000-4000-8000-00000000a102', 'active', '00000000-0000-4000-8000-0000000000a1'),
  ('test.mentor.a@synthetic.invalid', 'mentor_support', 'TEST_MENTOR_A', 'TEST_MENTOR_TEAM_A', false, true, false, ARRAY['mentor.manage','signals.view','signals.manage'], '00000000-0000-4000-8000-00000000a103', 'active', '00000000-0000-4000-8000-0000000000a1'),
  ('test.cross.chapter.b@synthetic.invalid', 'growth', 'TEST_CROSS_CHAPTER_USER_B', NULL, false, false, false, ARRAY['growth.task.manage_assigned','signals.view'], '00000000-0000-4000-8000-00000000b101', 'active', '00000000-0000-4000-8000-0000000000b1'),
  ('test.revocation.a@synthetic.invalid', 'growth', 'TEST_REVOKE_USER_A', NULL, false, false, false, ARRAY['growth.task.manage_assigned'], '00000000-0000-4000-8000-00000000a106', 'active', '00000000-0000-4000-8000-0000000000a1')
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role, display_name = EXCLUDED.display_name, team_name = EXCLUDED.team_name,
  is_mc = EXCLUDED.is_mc, is_mentor = EXCLUDED.is_mentor, is_admin = EXCLUDED.is_admin,
  capabilities = EXCLUDED.capabilities, member_id = EXCLUDED.member_id,
  access_status = EXCLUDED.access_status, chapter_id = EXCLUDED.chapter_id,
  access_expires_at = NULL, read_only_after = NULL, updated_at = now();

INSERT INTO public.member_one_to_one_profiles (member_id, actor_member_id, business_summary, looking_for, ideal_client, share_business, share_referral_focus, share_directory)
VALUES
  ('00000000-0000-4000-8000-00000000a104', '00000000-0000-4000-8000-00000000a104', 'TEST_SHARED_BUSINESS_CONTEXT', 'TEST_SHARED_CATEGORY', 'TEST_SHARED_IDEAL_CLIENT', true, true, false),
  ('00000000-0000-4000-8000-00000000a105', '00000000-0000-4000-8000-00000000a105', 'TEST_RESTRICTED_BUSINESS_CONTEXT', 'TEST_REVOKED_CATEGORY', 'TEST_REVOKED_IDEAL_CLIENT', true, false, false)
ON CONFLICT (member_id) DO UPDATE SET
  business_summary = EXCLUDED.business_summary, looking_for = EXCLUDED.looking_for,
  ideal_client = EXCLUDED.ideal_client, share_business = EXCLUDED.share_business,
  share_referral_focus = EXCLUDED.share_referral_focus, updated_at = now();

INSERT INTO public.member_success_blueprints (member_id, blueprint_year, total_sales_target_year, expected_sales_from_bni_year, average_customer_value_year, conversion_rate_percent, looking_for_categories, looking_for_detail, power_team_categories, power_team_detail, personal_goal_category, status, source)
VALUES
  ('00000000-0000-4000-8000-00000000a104', 2027, 1000000, 300000, 50000, 20, ARRAY['TEST_SHARED_CATEGORY'], 'TEST_SHARED_CATEGORY', ARRAY['TEST_SHARED_POWER_TEAM'], 'TEST_SHARED_POWER_TEAM', 'business', 'submitted', 'TEST_phase0'),
  ('00000000-0000-4000-8000-00000000a105', 2027, 1000000, 300000, 50000, 20, ARRAY['TEST_ALLOWED_CATEGORY','TEST_REVOKED_CATEGORY'], 'TEST_REVOKED_CATEGORY', ARRAY['TEST_ALLOWED_POWER_TEAM','TEST_REVOKED_POWER_TEAM'], 'TEST_REVOKED_POWER_TEAM', 'business', 'submitted', 'TEST_phase0')
ON CONFLICT (member_id, blueprint_year) DO UPDATE SET
  looking_for_categories = EXCLUDED.looking_for_categories, looking_for_detail = EXCLUDED.looking_for_detail,
  power_team_categories = EXCLUDED.power_team_categories, power_team_detail = EXCLUDED.power_team_detail,
  status = EXCLUDED.status, source = EXCLUDED.source, updated_at = now();

INSERT INTO public.member_growth_category_consents (member_id, category_type, category, actor_member_id, revoked_at)
VALUES
  ('00000000-0000-4000-8000-00000000a105', 'looking_for', 'TEST_ALLOWED_CATEGORY', '00000000-0000-4000-8000-00000000a105', NULL),
  ('00000000-0000-4000-8000-00000000a105', 'power_team', 'TEST_ALLOWED_POWER_TEAM', '00000000-0000-4000-8000-00000000a105', NULL),
  ('00000000-0000-4000-8000-00000000a105', 'looking_for', 'TEST_REVOKED_CATEGORY', '00000000-0000-4000-8000-00000000a105', now()),
  ('00000000-0000-4000-8000-00000000a105', 'power_team', 'TEST_REVOKED_POWER_TEAM', '00000000-0000-4000-8000-00000000a105', now())
ON CONFLICT (member_id, category_type, category) DO UPDATE SET
  actor_member_id = EXCLUDED.actor_member_id, revoked_at = EXCLUDED.revoked_at,
  consented_at = now();

DELETE FROM public.mentor_logs WHERE member_id = '00000000-0000-4000-8000-00000000a105' AND notes LIKE 'TEST_PRIVATE_MENTOR_NOTE%';
INSERT INTO public.mentor_logs (mentor_team, member_id, session_date, notes, next_actions)
VALUES ('TEST_MENTOR_TEAM_A', '00000000-0000-4000-8000-00000000a105', CURRENT_DATE, 'TEST_PRIVATE_MENTOR_NOTE_DO_NOT_EXPOSE', 'TEST_PRIVATE_NEXT_ACTION_DO_NOT_EXPOSE');

DELETE FROM public.member_signals WHERE idempotency_key = 'TEST_phase0_safe_handoff_a105';
INSERT INTO public.member_signals (member_id, signal_type, subject_type, subject_id, title, detail, payload, target_roles, status, priority, idempotency_key, source_surface)
VALUES ('00000000-0000-4000-8000-00000000a105', 'member_help', 'support_handoff', 'TEST_connection', 'TEST_SAFE_HANDOFF_A', 'TEST_SAFE_HANDOFF_REASON', '{"safe_context":true,"source":"TEST_phase0"}'::jsonb, ARRAY['growth'], 'new', 'normal', 'TEST_phase0_safe_handoff_a105', 'TEST_phase0');

DELETE FROM public.growth_tasks WHERE idempotency_key IN ('TEST_phase0_owned_growth_member','TEST_phase0_owned_growth_coordinator','TEST_phase0_unowned_legacy');
INSERT INTO public.growth_tasks (chapter_id, created_by, assigned_to, member_id, member_name, task_text, task_type, priority, status, due_date, assigned_owner_email, assigned_owner_name, idempotency_key)
VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'TEST_phase0', 'growth', '00000000-0000-4000-8000-00000000a104', 'TEST_MEMBER_SHARED_A', 'TEST_TASK_OWNED_BY_GROWTH_MEMBER_A', 'TEST_follow_up', 'TEST', 'new', CURRENT_DATE + 7, 'test.growth.member.a@synthetic.invalid', 'TEST_GROWTH_MEMBER_A', 'TEST_phase0_owned_growth_member'),
  ('00000000-0000-4000-8000-0000000000a1', 'TEST_phase0', 'growth', '00000000-0000-4000-8000-00000000a105', 'TEST_MEMBER_REVOKED_A', 'TEST_TASK_OWNED_BY_COORDINATOR_A', 'TEST_follow_up', 'TEST', 'new', CURRENT_DATE + 7, 'test.growth.coordinator.a@synthetic.invalid', 'TEST_GROWTH_COORDINATOR_A', 'TEST_phase0_owned_growth_coordinator'),
  ('00000000-0000-4000-8000-0000000000a1', 'TEST_phase0', 'growth', '00000000-0000-4000-8000-00000000a104', 'TEST_MEMBER_SHARED_A', 'TEST_TASK_UNOWNED_LEGACY_A', 'TEST_legacy', 'TEST', 'new', CURRENT_DATE + 7, NULL, NULL, 'TEST_phase0_unowned_legacy');

COMMIT;
