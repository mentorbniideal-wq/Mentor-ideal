-- The Chapter uses NEC / Network Education Coordinator. Retire the duplicate
-- legacy label so it is not displayed or copied into a future LT term.
UPDATE public.passport_lt_assignments
SET is_active = false, updated_at = now()
WHERE lt_role = 'Education Coordinator' AND is_active = true;

