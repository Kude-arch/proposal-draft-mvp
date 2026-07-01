-- 함수 search_path 고정 (SQL injection 방어)
ALTER FUNCTION public.update_updated_at() SET search_path = '';
ALTER FUNCTION public.get_source_proposal_counts() SET search_path = '';
