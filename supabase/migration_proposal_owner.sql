-- proposals 테이블에 소유자 이메일 컬럼 추가
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS user_email TEXT;

-- 기존 데이터는 소유자 미상 상태로 유지 (NULL 허용)
-- 신규 생성 시 반드시 user_email을 함께 저장해야 함
