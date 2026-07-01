-- slide_generations RLS 활성화 + 정책
ALTER TABLE slide_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slide_generations_select" ON slide_generations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = slide_generations.proposal_id
        AND (
          proposals.user_email = auth.email()
          OR proposals.user_email IS NULL
          OR EXISTS (
            SELECT 1 FROM proposal_members
            WHERE proposal_members.proposal_id = proposals.id
              AND proposal_members.user_email = auth.email()
          )
        )
    )
  );

CREATE POLICY "slide_generations_insert" ON slide_generations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = slide_generations.proposal_id
        AND proposals.user_email = auth.email()
    )
  );

CREATE POLICY "slide_generations_delete" ON slide_generations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = slide_generations.proposal_id
        AND proposals.user_email = auth.email()
    )
  );

-- access_requests: 서비스 키만 접근 (일반 사용자 차단)
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_requests_no_direct_access" ON access_requests
  FOR ALL USING (false);

-- site_documents: 서비스 키만 접근
ALTER TABLE site_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_documents_no_direct_access" ON site_documents
  FOR ALL USING (false);
