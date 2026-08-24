-- Reusable pre-meeting profile for MY121. Existing members/biz_profiles remain canonical
-- for identity and basic business information.
CREATE TABLE public.member_one_to_one_profiles (
  member_id UUID PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  business_summary TEXT CHECK (char_length(business_summary) <= 2000),
  target_clients TEXT CHECK (char_length(target_clients) <= 1500),
  problems_solved TEXT CHECK (char_length(problems_solved) <= 1500),
  primary_services TEXT CHECK (char_length(primary_services) <= 1500),
  differentiators TEXT CHECK (char_length(differentiators) <= 1500),
  service_area TEXT CHECK (char_length(service_area) <= 500),
  looking_for TEXT CHECK (char_length(looking_for) <= 1500),
  ideal_client TEXT CHECK (char_length(ideal_client) <= 1500),
  referral_trigger TEXT CHECK (char_length(referral_trigger) <= 1500),
  good_referral TEXT CHECK (char_length(good_referral) <= 1500),
  not_a_fit TEXT CHECK (char_length(not_a_fit) <= 1500),
  before_intro_question TEXT CHECK (char_length(before_intro_question) <= 1000),
  promise_boundaries TEXT CHECK (char_length(promise_boundaries) <= 1000),
  credibility_story TEXT CHECK (char_length(credibility_story) <= 2500),
  introduction_script TEXT CHECK (char_length(introduction_script) <= 1500),
  gains_goals TEXT CHECK (char_length(gains_goals) <= 1500),
  gains_accomplishments TEXT CHECK (char_length(gains_accomplishments) <= 1500),
  gains_interests TEXT CHECK (char_length(gains_interests) <= 1500),
  gains_networks TEXT CHECK (char_length(gains_networks) <= 1500),
  gains_skills TEXT CHECK (char_length(gains_skills) <= 1500),
  share_business BOOLEAN NOT NULL DEFAULT true,
  share_referral_focus BOOLEAN NOT NULL DEFAULT true,
  share_goals BOOLEAN NOT NULL DEFAULT true,
  share_accomplishments BOOLEAN NOT NULL DEFAULT true,
  share_interests BOOLEAN NOT NULL DEFAULT true,
  share_networks BOOLEAN NOT NULL DEFAULT false,
  share_skills BOOLEAN NOT NULL DEFAULT true,
  profile_version INTEGER NOT NULL DEFAULT 1 CHECK (profile_version > 0),
  published_at TIMESTAMPTZ,
  actor_member_id UUID NOT NULL REFERENCES public.members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.one_to_one_premeeting_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id UUID NOT NULL REFERENCES public.matching_pairs(id) ON DELETE CASCADE,
  asked_by_member_id UUID NOT NULL REFERENCES public.members(id),
  for_member_id UUID NOT NULL REFERENCES public.members(id),
  question_text TEXT NOT NULL CHECK (char_length(question_text) BETWEEN 1 AND 1000),
  answer_text TEXT CHECK (char_length(answer_text) <= 1500),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','archived')),
  client_action_id TEXT UNIQUE,
  answered_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (asked_by_member_id <> for_member_id)
);

CREATE TABLE public.one_to_one_profile_snapshots (
  pair_id UUID NOT NULL REFERENCES public.matching_pairs(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  profile_version INTEGER NOT NULL,
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pair_id, member_id)
);

CREATE INDEX idx_121_premeeting_questions_pair_created
  ON public.one_to_one_premeeting_questions(pair_id, created_at);
CREATE INDEX idx_121_profile_updated
  ON public.member_one_to_one_profiles(updated_at DESC);

ALTER TABLE public.member_one_to_one_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_to_one_premeeting_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.one_to_one_profile_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_one_to_one_profiles, public.one_to_one_premeeting_questions,
  public.one_to_one_profile_snapshots FROM anon, authenticated;

COMMENT ON TABLE public.member_one_to_one_profiles IS
  'Member-owned GAINS and Referral Focus extension; identity and basic business fields remain in members/biz_profiles.';
COMMENT ON TABLE public.one_to_one_premeeting_questions IS
  'Pair-scoped questions prepared before a 1-2-1; no automatic LINE push is generated.';
COMMENT ON TABLE public.one_to_one_profile_snapshots IS
  'Pair history snapshot containing only profile fields the owner allowed a partner to see.';
