# 슬라이드 안(案) 히스토리 설계

## 목표
한 제안서에서 슬라이드를 여러 번 생성(1안, 2안, 3안...)할 수 있고, 각 안을 독립적으로 편집·내보내기 가능하며, 최대 10안으로 제한한다.

## 제약
- 안 최대 10개. 10개 존재 시 generate API가 400 반환 (auto-delete 없음, 사용자가 수동 삭제)
- 안 번호: 정수 gen_number (1, 2, 3...) — UI에서 "N안"으로 표시
- 선택한 안을 편집·내보내기 가능 (최신 안만 편집 가능한 제한 없음)
- export는 현재 열람 중인 안 기준

## DB 변경

### 신규 테이블: slide_generations
```sql
CREATE TABLE slide_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  gen_number int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, gen_number)
);
```

### proposal_slides 컬럼 추가
```sql
ALTER TABLE proposal_slides ADD COLUMN generation_id uuid
  REFERENCES slide_generations(id) ON DELETE CASCADE;
```

## API 변경

| 메서드 | 경로 | 역할 |
|--------|------|------|
| GET | `/api/proposals/[id]/generations` | 안 목록 반환 (gen_number ASC) |
| DELETE | `/api/proposals/[id]/generations/[genId]` | 안 삭제 (slides/cells cascade) |
| POST | `/api/generate` | 10개 체크 후 신규 generation 생성, 응답에 generation_id 포함 |
| GET | `/api/proposals/[id]/slides?gen=<id>` | 특정 안의 슬라이드 반환 (gen 없으면 최신) |
| POST | `/api/export` | body에 generation_id 추가, 해당 안 슬라이드만 PPTX화 |

## URL 구조
- `/proposals/[id]/edit?gen=<uuid>` — 선택된 안 편집
- `/proposals/[id]/export?gen=<uuid>` — 선택된 안 내보내기

## 편집 페이지 UI
- 헤더에 안 탭: "1안", "2안", "3안"... (각 탭에 삭제 버튼)
- 탭 클릭 시 URL의 gen 파라미터 변경 → 해당 안 슬라이드 로드
- 재생성 버튼: 10개 체크 → 통과 시 generate 페이지로 이동
- PPTX 내보내기 버튼: 현재 gen 파라미터 포함해서 export 페이지로 이동

## 내보내기 페이지 UI
- URL의 gen 파라미터 읽어서 해당 안 슬라이드 수 표시
- export API 호출 시 generation_id 전달
- 어떤 안을 내보내는지 표시 (예: "3안 내보내기")
