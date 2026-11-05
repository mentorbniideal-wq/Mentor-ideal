-- Server-only atomic correction with an audit event in the same transaction.
CREATE OR REPLACE FUNCTION public.correct_one_to_one_member_alias(
  p_chapter_id uuid, p_alias_id uuid, p_expected_member_id uuid,
  p_member_id uuid, p_actor text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_member uuid;
BEGIN
  SELECT member_id INTO old_member FROM one_to_one_member_name_aliases
   WHERE id=p_alias_id AND chapter_id=p_chapter_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบชื่อใน Chapter นี้';
  END IF;
  IF old_member = p_member_id THEN RETURN; END IF;
  IF old_member IS DISTINCT FROM p_expected_member_id THEN
    RAISE EXCEPTION 'ข้อมูลชื่อเปลี่ยนแล้ว กรุณาโหลดใหม่';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM members WHERE id=p_member_id AND chapter_id=p_chapter_id AND is_archived=false) THEN
    RAISE EXCEPTION 'ไม่พบสมาชิก Active ใน Chapter นี้';
  END IF;
  UPDATE one_to_one_member_name_aliases SET member_id=p_member_id, last_confirmed_at=now(),
    last_confirmed_by=p_actor, confirmation_count=1, updated_at=now()
    WHERE id=p_alias_id AND chapter_id=p_chapter_id;
  INSERT INTO chapter_audit_events(chapter_id,event_type,actor_role,actor_ref,subject_type,subject_ref,metadata)
    VALUES(p_chapter_id,'one_to_one_alias_corrected','admin',p_actor,'one_to_one_alias',p_alias_id::text,
      jsonb_build_object('previous_member_id',old_member,'member_id',p_member_id));
END $$;
REVOKE ALL ON FUNCTION public.correct_one_to_one_member_alias(uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_one_to_one_member_alias(uuid,uuid,uuid,uuid,text) TO service_role;
