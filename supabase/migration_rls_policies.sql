-- RLS 활성화
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE slide_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;

-- proposals: 소유자 또는 멤버만 접근
CREATE POLICY "proposals_select" ON proposals
  FOR SELECT USING (
    auth.email() = user_email
    OR EXISTS (
      SELECT 1 FROM proposal_members
      WHERE proposal_members.proposal_id = proposals.id
        AND proposal_members.user_email = auth.email()
    )
    OR user_email IS NULL  -- 레거시 데이터: 인증된 사용자 모두 접근 (API에서 추가 제한)
  );

CREATE POLICY "proposals_insert" ON proposals
  FOR INSERT WITH CHECK (auth.email() = user_email);

CREATE POLICY "proposals_update" ON proposals
  FOR UPDATE USING (auth.email() = user_email);

CREATE POLICY "proposals_delete" ON proposals
  FOR DELETE USING (auth.email() = user_email);

-- proposal_members: 해당 제안서 소유자만 관리
CREATE POLICY "proposal_members_select" ON proposal_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_members.proposal_id
        AND proposals.user_email = auth.email()
    )
    OR user_email = auth.email()
  );

CREATE POLICY "proposal_members_insert" ON proposal_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_members.proposal_id
        AND proposals.user_email = auth.email()
    )
  );

CREATE POLICY "proposal_members_delete" ON proposal_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_members.proposal_id
        AND proposals.user_email = auth.email()
    )
  );

-- proposal_slides: 제안서 접근 가능한 사용자만
CREATE POLICY "proposal_slides_select" ON proposal_slides
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_slides.proposal_id
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

-- slide_cells: proposal_slides를 통해 간접 접근 제어
CREATE POLICY "slide_cells_select" ON slide_cells
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM proposal_slides
      JOIN proposals ON proposals.id = proposal_slides.proposal_id
      WHERE proposal_slides.id = slide_cells.slide_id
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

-- proposal_sections: 제안서 접근 가능한 사용자만
CREATE POLICY "proposal_sections_select" ON proposal_sections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_sections.proposal_id
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

-- allowed_users: service role만 읽기 (일반 사용자 접근 차단)
CREATE POLICY "allowed_users_no_access" ON allowed_users
  FOR ALL USING (false);

-- 참고: 위 RLS 정책은 현재 서비스 키(service_role)를 사용하는 API 라우트에는 적용되지 않음.
-- anon key를 통한 직접 DB 접근 및 향후 JWT 기반 Supabase auth 전환 시 적용됨.
