# Phase 25.5: Profile Comparison + DXF Export + Template Editor

## 상태: 완료 (2026-02-19 검증)

- Vite 빌드: 성공 (2.77s, 68 modules)
- 테스트: 57 파일, 220 테스트 전체 통과

---

## Feature 1: DXF Export — 완료

- `backend/routes/handlers/analyze-handler.js:124` — `options.dxfExport` → `drawConfig.drawing.dxf = true`
- `backend/lib/pack-builder.js:96-104` — DXF 파일 포함
- `src/components/ExportPackModal.jsx:6` — DXF 체크박스
- `src/components/SettingsPanel.jsx:135-144` — DXF Export 토글

## Feature 2: Profile Comparison Dashboard — 완료

- `backend/routes/handlers/profile-compare.js` — 비교 핸들러 (DFM+Cost 병렬 실행)
- `backend/routes/profile.js:14` — `POST /api/profiles/compare`
- `src/components/ProfileCompareModal.jsx` — 비교표 + 비용 바차트
- `src/components/ShopProfilePanel.jsx:38` — Compare (⇔) 버튼
- `src/hooks/useProfileState.js` — compareModal 상태
- `src/hooks/useBackend.js:268` — `compareProfiles()` API

## Feature 3: Template Editor UI — 완료

- `src/components/TemplateEditorModal.jsx` — 5탭 편집기 (General/Sections/Title&Sign/Standards/Style)
- `src/components/ReportConfigModal.jsx:91-96` — Edit ✎ / New + 버튼
- `src/hooks/useModalState.js:28-97` — 템플릿 에디터 상태 + CRUD
- `src/components/modals/ProjectFlowModals.jsx:41-48` — 모달 렌더링
