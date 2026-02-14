# Phase 25.5: Profile Comparison + DXF Export + Template Editor

## 개요
3개 기능 구현 (임팩트 순서로 진행)

---

## Feature 1: DXF Export (난이도: 낮음 — Python 이미 구현됨)

### 변경 파일
1. `backend/routes/analyze.js` — drawing 단계에 `dxf: true` 주입
2. `backend/lib/pack-builder.js` — DXF 파일 포함 옵션
3. `src/components/ExportPackModal.jsx` — DXF 체크박스 추가
4. `src/App.jsx` — settings에 dxfExport 옵션 추가
5. `src/components/SettingsPanel.jsx` — DXF 토글 UI

### 구현
- analyze.js: `options.dxfExport` → `drawConfig.drawing.dxf = true`
- pack-builder: `include.dxf` → `getExportPathByFormat(results.drawing, 'dxf')`
- ExportPackModal: 체크박스 1개 추가
- SettingsPanel: "DXF 내보내기" 토글

---

## Feature 2: Profile Comparison Dashboard (난이도: 중간)

### 변경 파일
1. `backend/routes/profile.js` — `POST /api/profiles/compare` 엔드포인트
2. `src/components/ProfileCompareModal.jsx` — 신규 (비교 UI)
3. `src/components/ShopProfilePanel.jsx` — "Compare" 버튼 추가
4. `src/hooks/useBackend.js` — `compareProfiles()` 함수
5. `src/App.jsx` — compareModal 상태

### API 설계
```
POST /api/profiles/compare
Body: { configPath, profileA, profileB, options: { process, material, batch } }
Response: { profileA: { name, dfm, cost }, profileB: { name, dfm, cost } }
```
- 서버에서 순차 2회 분석 (model/drawing 스킵, dfm+cost만)

### UI 설계
- 모달: 프로파일 A/B 드롭다운 + "Compare" 버튼
- 결과: 나란히 테이블 (DFM점수, 비용항목별, 총비용, 차이%)
- 하단: 비용 비교 바 차트 (Chart.js)

---

## Feature 3: Template Editor UI (난이도: 중간)

### 변경 파일
1. `src/components/TemplateEditorModal.jsx` — 신규 (5탭 편집기)
2. `src/components/ReportConfigModal.jsx` — Edit/New 버튼 추가
3. `src/App.jsx` — templateEditor 상태
4. `src/styles/app.css` — 에디터 스타일

### 탭 구성
1. **General**: name, label, description, language (ko/en)
2. **Sections**: 7개 섹션 토글 + 순서(order) 입력
3. **Title & Signature**: show_logo, fields, signature roles, show_date
4. **Standards**: KS 표준 태그 입력, assumptions, disclaimer 텍스트
5. **Style**: page_format, orientation, header_color, accent_color, font

### 플로우
- ReportConfigModal에서 Edit ✎ / New + 버튼 → TemplateEditorModal 열림
- 저장 → `backend.saveReportTemplate()` (POST or PUT) → 목록 새로고침

---

## 구현 순서
1. DXF Export (가장 빠름, 30분)
2. Profile Comparison (새 API + 새 컴포넌트, 1시간)
3. Template Editor (새 컴포넌트 + 5탭, 1시간)
4. Vite 빌드 확인
5. E2E 테스트
6. 커밋 + 푸시
