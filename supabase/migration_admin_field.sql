-- allowed_users 테이블에 관리자 플래그 추가
ALTER TABLE allowed_users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- ADMIN_EMAIL 환경변수의 사용자를 관리자로 설정 (실행 시 수동으로 이메일 입력)
-- UPDATE allowed_users SET is_admin = true WHERE email = 'YOUR_ADMIN_EMAIL';
