-- 누구나 수정 가능한 위험 정책 제거
DROP POLICY IF EXISTS "anon_delete" ON proposal_items;
DROP POLICY IF EXISTS "anon_insert" ON proposal_items;
DROP POLICY IF EXISTS "anon_update" ON proposal_items;

-- 인증된 사용자만 수정 가능 (실제 앱은 service_role 키 사용)
CREATE POLICY "proposal_items_insert" ON proposal_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "proposal_items_update" ON proposal_items
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "proposal_items_delete" ON proposal_items
  FOR DELETE USING (auth.role() = 'authenticated');
