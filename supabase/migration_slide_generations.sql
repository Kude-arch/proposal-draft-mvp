-- 1. slide_generations 테이블 생성
CREATE TABLE slide_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  gen_number int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, gen_number)
);

-- 2. proposal_slides에 generation_id 컬럼 추가 (nullable로 시작)
ALTER TABLE proposal_slides
  ADD COLUMN generation_id uuid REFERENCES slide_generations(id) ON DELETE CASCADE;

-- 3. 기존 슬라이드들을 위한 generation 1 레코드 삽입
INSERT INTO slide_generations (proposal_id, gen_number)
SELECT DISTINCT proposal_id, 1
FROM proposal_slides
WHERE proposal_id IS NOT NULL;

-- 4. 기존 슬라이드의 generation_id를 방금 만든 레코드로 업데이트
UPDATE proposal_slides ps
SET generation_id = sg.id
FROM slide_generations sg
WHERE ps.proposal_id = sg.proposal_id
  AND sg.gen_number = 1
  AND ps.generation_id IS NULL;

-- 5. generation_id NOT NULL 제약 추가 (기존 데이터 마이그레이션 후)
ALTER TABLE proposal_slides ALTER COLUMN generation_id SET NOT NULL;
