# TODO

프로젝트 전반의 우선 작업과 체크리스트를 정리합니다. 필요에 따라 자유롭게 갱신해 주세요.

## 앞으로 할일
- [x] 모달 popup시 백그라운드 blur효과 (lead page) → GEMINI
- [x] 모달 폼 변경 (신부 이메일 대신에 신랑 휴대폰) → GEMINI
- [x] 회원가입 시 org_id 메타데이터/`public.users` 동기화 로직 정리하고 로그인 화면에서 org 선택 제거
- [x] Realtime 안되는 문제 해결(리얼타임 구독에서 filter: org_id=eq.${orgId}로 조건을 걸고 있는데, Postgres 기본 설정(REPLICA IDENTITY DEFAULT)에서는 DELETE 이벤트에 PK 컬럼(여기선 id)만 전달, 그래서 org_id가 포함되지 않아 필터를 통과하지 못하고, 다른 탭에서는 삭제 이벤트를 받지 못한 거)
- [x] 로그인/회원가입 폼 다크 테마 UI 개선
- [x] 로그인 후, 왼쪽 하단에 계정이메일 나타나도록 / 클릭시, 로그아웃 버튼 추가
- [x] devIndicators 안보이도록 next.config.ts 수정
- [x] 로그인 창에서 "Leads 보기" 없애기 / 왼쪽 하단 계정 버튼 마우스 손모양 변경
- [x] leads 페이지에 "010-" 포커스 아웃 되었을 때, "010" 번호 남는 bug fix
- [x] 11자리 모두 입력되게끔. 그 외에는 에러 처리 (단, "010-"에서 그냥 나올때는 에러 나오지 않도록 처리)
- [x] 고객 리스트에 상세 모달 추가 및 테이블 액션 정리
- [x] 고객/리드/일정 모달 백그라운드 블러 효과 일관화
- [x] `src/lib/api.ts` 제네릭/타입 정의로 `any` 제거
- [x] `src/app/api/customers/route.ts` 타입 선언 보강
- [x] `src/app/api/appointments/route.ts` 타입 선언 보강
- [x] `src/app/api/leads/route.ts` 타입 선언 보강
- [x] 고객·리드·일정 페이지 컴포넌트(`page.tsx`)의 남은 `any` 제거 후 ESLint 통과
- [x] leads PATCH 기본값 주입 버그 수정(visited/consent 토글 시 다른 필드가 덮여쓰이는 문제)
- [ ] leads와 customers의 통합문제 해결 → 신청디비랑 계약고객의 상관관계에 대해서 figure out. 그리고 난 후, 통합할것인지 명확하게 task direction 확립
- [ ] 플레너 권한에 따른 접근 제한, 어드민은 full access 가능
- [ ] 회원가입 이메일 디자인 수정 (영어 → 한글) 그리고 Supabase Auth 말고 회사브랜드로 바꿀 수 있는지 나중에 확인
- [ ] 시스템 다크모드 연동(`prefers-color-scheme`) 지원 검토 및 Shell 테마 토글 개선
- [ ] nextjs 16 출시되면, update! 당연히 refactoring

-- Supabase Auth ↔ public.users 링크 작업 메모 --
- [x] 요구사항: public.users.id = auth.users.id, FK on delete cascade, 가입/업데이트 트리거, 초기 백필
- [x] Drizzle 마이그레이션 추가(0003): FK + 트리거 생성, 기본 org 주입(9b4944e1-5f14-424b-b7ab-c89e3f3c17c6), raw_user_meta_data 사용
- [x] DB에 링크/트리거 적용 완료 (pnpm db:apply:link)
- [x] 초기 백필 실행 완료 (pnpm db:apply:backfill)
- [x] 검증 완료 (pnpm db:check:counts, pnpm db:check:latest)
- [x] 운영 스크립트/러너 추가: scripts/sql/*, scripts/run-sql.mjs, scripts/query-sql.mjs
- [x] Auth 대시보드에서 유저 삭제 시 public.users도 함께 삭제되는지 확인
- [x] public.users만 삭제해도 auth.users는 유지됨을 확인 → 삭제는 Auth 레코드 기준으로 진행하기로 정리

다음 액션(선택/운영 절차):
- [x] 가입 폼 도입 여부 결정 및 구현(기본 폼 추가 완료)
- [ ] org_id 정책 재점검(환경별 Default org 필요 여부) 및 문서화
- [ ] 스테이징/프로덕션에도 동일 적용(0003 → backfill → check)
- [ ] 백업/롤백 절차 간단 메모 추가
- [ ] scripts 유지/정리 최종 결정(현재는 유지)

## 2025-09-23 DB 정책/마이그레이션 작업 메모
- [x] RLS 정책에서 `auth.jwt()` 호출을 `select auth.jwt()`로 감싼 마이그레이션 정비(0004) 및 메타 데이터 정렬
- [x] Supabase 경고 대응: `apts_write_org` 정책을 insert/update/delete 전용 정책으로 분리(0005)
- [x] `users.org_id`에 인덱스 추가(0006)로 FK 검사와 org별 조회 성능 개선
- [x] Drizzle 저널/스냅샷을 0000~0006까지 정리하고 Supabase `drizzle.__drizzle_migrations` 동기화
- [ ] Supabase Auth 보안 옵션: Leaked password protection, Enhanced MFA 설정 검토 후 정책 확정 → 유료로 업그레이드 필요
- [ ] Supabase 권장사항 모니터링 및 추가 튜닝 항목 정리(예: 다른 FK 인덱스 여부)
