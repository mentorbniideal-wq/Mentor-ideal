-- MY121 is a personal member workspace. A verified LINE-to-member link is the
-- access boundary; pilot membership controls notification rollout only.
INSERT INTO public.settings(key, value)
VALUES ('ONE_TO_ONE_ENFORCE_PILOT_ACCESS', 'false')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
