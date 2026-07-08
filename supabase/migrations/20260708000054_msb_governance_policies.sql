-- Clarify service-role access for MSB governance tables.
-- These tables are used only through Edge Functions with service-role access.

DROP POLICY IF EXISTS "service_role_all_msb_category_aliases" ON public.msb_category_aliases;
CREATE POLICY "service_role_all_msb_category_aliases"
  ON public.msb_category_aliases
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_msb_goal_reviews" ON public.msb_goal_reviews;
CREATE POLICY "service_role_all_msb_goal_reviews"
  ON public.msb_goal_reviews
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
