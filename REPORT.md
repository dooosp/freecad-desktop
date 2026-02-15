# FreeCAD Studio - 프로젝트 보고서

## 1. 프로젝트 개요

### 무엇을 만들었나?

**FreeCAD Studio**는 기계 부품의 3D 모델링부터 도면, 제조성 분석, 공차, 비용 견적, PDF 리포트까지 **원클릭으로 처리하는 데스크톱 앱**이다.

기존에 CLI(터미널 명령어)로만 사용 가능했던 `freecad-automation` 엔진(Python, ~22,000줄)을 **GUI로 감싸서** 누구나 파일을 드래그앤드롭하고 버튼 하나로 전체 분석을 실행할 수 있도록 만들었다.

### 핵심 가치

| 기존 (CLI) | FreeCAD Studio (GUI) |
|------------|---------------------|
| 터미널에서 명령어 입력 | 파일 드롭 + 버튼 클릭 |
| 결과를 파일로 확인 | 3D 뷰어, SVG 도면, 차트로 실시간 확인 |
| 각 분석을 개별 실행 | 5단계 파이프라인 원클릭 실행 |
| 텍스트 출력 | 실시간 진행바 + 단계별 상태 표시 |
| TOML config 직접 작성 필요 | STEP 파일 드롭 → config 자동 생성 |

---

## 2. 기술 스택

```
┌─────────────────────────────────────────────────────┐
│                   사용자 화면                          │
│  Tauri 2.0 (네이티브 창) 또는 웹 브라우저               │
├─────────────────────────────────────────────────────┤
│                 프론트엔드 (React 19)                  │
│  Three.js (3D 뷰어) + Chart.js (차트) + Vite 6       │
├─────────────────────────────────────────────────────┤
│              백엔드 (Express 5, Node.js)              │
│  7개 API 라우트 + SSE 스트리밍 + multer (파일 업로드)    │
├─────────────────────────────────────────────────────┤
│           freecad-automation (Python, ~22,000줄)      │
│  FreeCAD API → 3D 모델링 + 도면 + FEM + DFM + 비용    │
└─────────────────────────────────────────────────────┘
```

| 계층 | 기술 | 역할 |
|------|------|------|
| UI | React 19 + Vite 6 | 컴포넌트 기반 인터페이스 |
| 3D | Three.js 0.172 | STL 모델 렌더링 + 조작 |
| 차트 | Chart.js 4.4 | 비용 분석 차트 (도넛, 라인) |
| 네이티브 | Tauri 2.0 (Rust) | 데스크톱 앱 패키징 |
| 서버 | Express 5 | REST API + SSE 스트리밍 |
| 엔진 | Python (FreeCAD API) | 실제 3D 모델링/분석 |
| 설정 | TOML | 부품 정의 파일 |

---

## 3. 아키텍처

### 3.1 전체 구조

```
~/freecad-desktop/
├── src/                    # 프론트엔드 (React)
│   ├── App.jsx             # 메인 레이아웃
│   ├── components/         # 11개 UI 컴포넌트
│   ├── hooks/useBackend.js # API 통신 훅
│   └── styles/app.css      # 다크 테마 CSS (~930줄)
│
├── backend/                # 백엔드 (Express)
│   ├── server.js           # 진입점 (포트 18080)
│   ├── routes/             # 7개 API 라우트
│   └── lib/                # 유틸리티 (step-analyzer, cost-estimator, qa-runner)
│
├── src-tauri/              # 네이티브 앱 (Rust)
│   ├── src/main.rs         # 백엔드 프로세스 관리
│   └── tauri.conf.json     # 앱 설정
│
└── vite.config.js          # 빌드 설정 (프록시, 코드 분할)
```

### 3.2 데이터 흐름

```
사용자 → [파일 드롭] → FileDropZone
                          │
                    .toml이면 바로 설정
                    .step이면 ↓
                          │
                   POST /api/step/import
                          │
              Python: step_feature_detector.py
                          │
                   feature 감지 + TOML 생성
                          │
                   StepImportModal (편집 가능)
                          │
                   "Use Config" 클릭
                          │
                   configPath 설정 완료
                          │
              사용자 → [Analyze 클릭]
                          │
                   POST /api/analyze (SSE)
                          │
         ┌────────┬────────┬────────┬────────┐
         ↓        ↓        ↓        ↓        ↓
      Stage 1  Stage 2  Stage 3  Stage 4  Stage 5
      3D 모델   도면     DFM     공차     비용
         │        │        │        │        │
         └────────┴────────┴────────┴────────┘
                          │
                   실시간 진행바 업데이트
                          │
              결과 → 3D뷰어 + 도면 + 분석 패널
                          │
              사용자 → [Report 클릭]
                          │
                   POST /api/report
                          │
                   PDF 생성 → 미리보기
```

---

## 4. 주요 기능 상세

### 4.1 STEP 파일 임포트 (이번 세션에서 구현)

**문제**: 기존에는 TOML config 파일을 직접 작성해야만 분석이 가능했다.
**해결**: .step 파일을 드롭하면 자동으로 부품 특징을 감지하고 config를 생성한다.

#### 동작 흐름

1. **파일 드롭**: 사용자가 .step 파일을 드래그앤드롭
2. **Feature 감지**: Python `step_feature_detector.py`가 부품을 분석
   - 실린더 (구멍, 축)
   - 볼트 패턴 (PCD)
   - 필렛, 챔퍼
   - 바운딩 박스 (가로 × 세로 × 높이)
   - 부품 유형 (플랜지, 축, 브라켓, 블록)
3. **TOML 자동 생성**: 감지된 특징을 기반으로 설정 파일 생성
4. **편집 모달**: 사용자가 생성된 config를 확인/수정 가능
5. **분석 연결**: "Use Config" 클릭 → Analyze 버튼으로 파이프라인 실행

#### 안정화 처리

- **Fallback**: `step_feature_detector.py` 실패 시 → `inspect_model.py`로 기본 기하 정보 추출
- **데이터 정규화**: 실린더/볼트 수가 배열로 올 때와 숫자로 올 때 모두 처리
- **바운딩 박스**: `size[]`, `min[]/max[]`, `{x,y,z}` 3가지 포맷 대응
- **가드**: shapes/parts가 없는 템플릿 TOML로 Analyze 시 명확한 안내 메시지

#### 구현 파일

| 파일 | 역할 |
|------|------|
| `backend/routes/step-import.js` | 듀얼 모드 API (Tauri: JSON / Web: FormData) |
| `backend/lib/step-analyzer.js` | Python 호출 + 정규화 + fallback + TOML 생성 |
| `src/components/StepImportModal.jsx` | Feature 요약 + TOML 편집 모달 |
| `src/components/FileDropZone.jsx` | .step 확장자 감지 + rawFile 전달 |
| `src/App.jsx` | STEP/TOML 분기 + 모달 통합 |

---

### 4.2 5단계 분석 파이프라인

**Analyze** 버튼을 클릭하면 5단계가 순차 실행되며, **Server-Sent Events (SSE)**로 실시간 진행 상태를 전달한다.

#### Stage 1: 3D 모델 생성

- **Python**: `create_model.py`
- **하는 일**: TOML에 정의된 형상(원기둥, 박스, 구 등)을 조합하여 3D 모델 생성
  - 불리언 연산 (합집합, 차집합, 교집합)
  - 필렛, 챔퍼
  - 패턴 (원형, 선형 배열)
- **출력**: STEP 파일 + STL 파일
- **프론트엔드**: Three.js 3D 뷰어에 STL 렌더링

#### Stage 2: KS 규격 도면 생성

- **Python**: `generate_drawing.py` + `postprocess_svg.py` + `qa_scorer.py`
- **하는 일**: 3D 모델에서 2D 투영 → ISO 128 규격 SVG 도면
  - A3 도면 (420×297mm), 4개 뷰 (정면/평면/우측면/등각)
  - 자동 치수 기입 (기준선, 좌표, 체인)
  - GD&T (기하공차) 프레임
  - KS 표면 거칠기 기호
  - 나사 호칭 (M12×1.75)
  - BOM (부품 목록)
- **QA 점수**: 도면 품질을 0~100점으로 평가 (텍스트 겹침, 치수 중복 등)
- **프론트엔드**: SVG 뷰어 (줌/팬 지원) + QA 배지 표시

#### Stage 3: DFM (제조성 분석)

- **Python**: `dfm_checker.py`
- **하는 일**: 설계가 제조하기 쉬운지 6가지 항목 검사
  - DFM-01: 최소 벽 두께 (기계가공: 1.5mm, 주조: 3mm)
  - DFM-02: 구멍~가장자리 거리 (직경의 1배 이상)
  - DFM-03: 구멍 간 간격 (작은 직경의 1배 이상)
  - DFM-04: 내부 모서리 필렛 누락
  - DFM-05: 드릴 깊이 대 직경 비 (5:1 이하)
  - DFM-06: 언더컷 감지
- **공정 지원**: 기계가공, 주조, 판금, 3D 프린팅
- **프론트엔드**: 점수 게이지 (0~100) + 검사 항목 카드 (OK/경고/오류)

#### Stage 4: 공차 분석

- **Python**: `tolerance_analysis.py`
- **하는 일**: 조립 부품의 끼워맞춤 분석
  - KS B 0401 규격 (H7/g6, H8/f7 등)
  - 끼워맞춤 유형: 헐거운/중간/억지 끼워맞춤
  - 공차 누적 (최악조건, RSS 3σ)
  - 몬테카를로 시뮬레이션 (10,000회 샘플링)
- **프론트엔드**: 끼워맞춤 테이블 + 누적 공차 바 + 히스토그램 차트

#### Stage 5: 비용 견적

- **Python**: `cost_estimator.py`
- **하는 일**: 제조 원가를 항목별로 산출 (원화 기준)
  - 재료비: 바운딩 박스 × 밀도 × 단가 (KRW/kg)
  - 가공비: 복잡도 × 공정 단가 (KRW/min)
  - 셋업비: 공정 수 × 15,000원/공정
  - 검사비: 공차 쌍 수 × 8,000원/쌍
  - DFM 불량률 보정
  - 배치 할인: 10개(5%), 50개(15%), 100개(25%), 500개(35%)
- **프론트엔드**: 총 비용 + 비용 구성 도넛차트 + 배치 단가 곡선 + 공정 비교표

---

### 4.3 실시간 진행 표시 (SSE)

기존 REST API는 "요청 → 5분 대기 → 응답"이었다. SSE(Server-Sent Events)를 적용하여 각 단계의 시작/완료/에러를 실시간으로 프론트엔드에 전달한다.

```
서버 → [event: stage] { stage: "create", status: "start" }
서버 → [event: stage] { stage: "create", status: "done" }
서버 → [event: stage] { stage: "drawing", status: "start" }
     ...
서버 → [event: complete] { model, drawingSvg, dfm, tolerance, cost }
```

- **프론트엔드**: `fetch` + `ReadableStream`으로 SSE 파싱
- **ProgressBar**: 5단계 체크마크 (완료: ✓, 실패: ✗, 진행중: 펄스 애니메이션)
- **취소**: `AbortController`로 분석 중단 가능

---

### 4.4 빌드 최적화 (이번 세션에서 구현)

**문제**: 단일 JS 번들이 931KB로 초기 로딩이 느림.
**원인**: Three.js(~600KB) + Chart.js(~200KB)가 무조건 포함.
**해결**: 두 가지 전략 적용.

#### Vendor 분리 (manualChunks)

```javascript
// vite.config.js
rollupOptions: {
  output: {
    manualChunks: {
      three: ['three'],       // 475KB (3D 뷰어 탭 클릭 시 로드)
      chartjs: ['chart.js'],  // 207KB (공차/비용 탭 클릭 시 로드)
      react: ['react', 'react-dom'],  // 12KB
    }
  }
}
```

#### Lazy Loading (React.lazy)

```jsx
// 무거운 컴포넌트는 필요할 때만 로드
const ModelViewer = lazy(() => import('./components/ModelViewer.jsx'));
const TolerancePanel = lazy(() => import('./components/TolerancePanel.jsx'));
const CostPanel = lazy(() => import('./components/CostPanel.jsx'));
```

#### 결과

| 항목 | Before | After |
|------|--------|-------|
| 초기 로드 | 931KB | **202KB** |
| 3D 뷰어 | 포함 | 탭 클릭 시 로드 (475KB) |
| 차트 | 포함 | 탭 클릭 시 로드 (207KB) |
| 빌드 경고 | 500KB 초과 | 없음 |
| 감소율 | - | **78%** |

---

### 4.5 Tauri 네이티브 앱

웹 앱을 **Tauri 2.0**(Rust)으로 감싸서 독립 데스크톱 앱으로도 실행 가능하다.

#### 동작 방식

1. Tauri가 네이티브 창(WebKit)을 열고
2. `main.rs`가 Node.js 백엔드를 자식 프로세스로 실행
3. 프론트엔드는 `localhost:18080` API를 호출
4. 창 닫을 때 백엔드 프로세스도 자동 종료

#### 두 가지 실행 모드

| 모드 | 명령어 | 용도 |
|------|--------|------|
| 웹 | `npm run start` | 개발, 브라우저에서 접근 |
| 네이티브 | `npm run tauri dev` | 독립 데스크톱 창 |

#### WSLg 테스트 결과

- Tauri 창이 WSLg(Windows Subsystem for Linux GUI)에서 정상 표시됨
- WebKit 렌더러 + X11 소켓 연결 확인
- EGL 경고(GPU 미지원)는 있으나 소프트웨어 렌더링으로 동작에 문제 없음

---

## 5. API 명세

### 백엔드 엔드포인트 (Express, 포트 18080)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/analyze` | 5단계 전체 분석 (SSE 스트리밍) |
| POST | `/api/drawing` | 도면만 생성 |
| POST | `/api/dfm` | DFM 분석만 실행 |
| POST | `/api/tolerance` | 공차 분석만 실행 |
| POST | `/api/cost` | 비용 견적만 실행 |
| POST | `/api/report` | PDF 리포트 생성 |
| POST | `/api/step/import` | STEP 파일 임포트 + config 생성 |
| POST | `/api/step/save-config` | 편집된 TOML 저장 |
| POST | `/api/inspect` | STEP 파일 메타데이터 추출 |
| POST | `/api/create` | 3D 모델만 생성 |
| GET | `/api/examples` | 예제 config 목록 |
| GET | `/api/health` | 서버 상태 확인 |

---

## 6. freecad-automation 엔진 요약

FreeCAD Studio의 **실제 분석 엔진**은 별도 프로젝트인 `freecad-automation`이다.

### 규모

| 항목 | 수치 |
|------|------|
| 코드 | ~22,000줄 (Python 17k + JS 5k) |
| Python 스크립트 | 44개 (메인 23 + 헬퍼 21) |
| 개발 단계 | Phase 1~24 완료 |
| 예제 config | 19개 TOML |
| CLI 명령어 | 10개 |

### CLI 명령어

```bash
fcad create <config.toml>      # 3D 모델 생성
fcad design "shaft with..."    # AI로 TOML 자동 설계 (Gemini)
fcad draw <config.toml>        # KS 규격 도면 생성
fcad fem <config.toml>         # 구조 FEM 해석
fcad tolerance <config.toml>   # 공차 분석 + 몬테카를로
fcad dfm <config.toml>         # 제조성 분석
fcad report <config.toml>      # PDF 리포트
fcad inspect <model.step>      # STEP 파일 정보 추출
fcad validate <plan.toml>      # 도면 스키마 검증
fcad serve [port]              # 3D 뷰어 서버
```

### TOML Config 예시

```toml
name = "ks_flange"

# 형상 정의
[[shapes]]
id = "disc"
type = "cylinder"
radius = 70
height = 15

[[shapes]]
id = "bore"
type = "cylinder"
radius = 20
height = 20

# 불리언 연산
[[operations]]
op = "cut"
base = "disc"
tool = "bore"
result = "body"

# 도면 설정
[drawing]
views = ["front", "top", "right", "iso"]

[drawing.meta]
part_name = "Bolt Flange"
material = "AL6061-T6"

# 제조 정보
[manufacturing]
process = "machining"
material = "AL6061-T6"
batch_size = 100
```

---

## 7. UI 컴포넌트

### 전체 화면 구성

```
┌──────────────────────────────────────────────────┐
│  [FreeCAD Studio]            [Cancel] [Analyze] [Report] │
├──────────────────────────────────────────────────┤
│  ■■■■■■■■■■■■░░░░░░  3/5 stages  (실시간 진행바)   │
├─────────┬────────────────────────────────────────┤
│ Files   │  [3D] [Drawing] [PDF]                  │
│ ┌─────┐ │  ┌──────────────────────────────────┐  │
│ │Drop │ │  │                                  │  │
│ │Zone │ │  │     Three.js 3D 뷰어              │  │
│ └─────┘ │  │     (STL 렌더링, 회전/줌)          │  │
│         │  │                                  │  │
│ Examples│  └──────────────────────────────────┘  │
│ ks_flan │  [DFM (87)] [Tolerance] [Cost]         │
│ ks_shaf │  ┌──────────────────────────────────┐  │
│ ks_brac │  │  DFM Score: ████████░░ 87/100    │  │
│ ks_gear │  │  ✓ Wall Thickness    OK          │  │
│         │  │  ⚠ Drill Ratio      Warning      │  │
│ Settings│  │  ✓ Hole Spacing     OK          │  │
│ Process │  └──────────────────────────────────┘  │
│ Material│                                        │
│ Batch   │                                        │
└─────────┴────────────────────────────────────────┘
```

### 컴포넌트 목록

| 컴포넌트 | 로딩 | 역할 |
|----------|------|------|
| `App.jsx` | 즉시 | 메인 레이아웃 + 상태 관리 |
| `FileDropZone` | 즉시 | 파일 드래그앤드롭 |
| `SettingsPanel` | 즉시 | 공정/재료/배치 설정 |
| `ProgressBar` | 즉시 | 5단계 진행 표시 |
| `DfmPanel` | 즉시 | DFM 점수 + 검사 카드 |
| `StepImportModal` | 즉시 | STEP 임포트 모달 |
| `ModelViewer` | **Lazy** | Three.js 3D 뷰어 (475KB) |
| `DrawingViewer` | **Lazy** | SVG 도면 뷰어 (줌/팬) |
| `TolerancePanel` | **Lazy** | 공차 테이블 + 몬테카를로 차트 (207KB) |
| `CostPanel` | **Lazy** | 비용 도넛차트 + 배치 곡선 (207KB) |
| `ReportPreview` | **Lazy** | PDF 미리보기 (iframe) |

---

## 8. 이번 세션 구현 내역

### 커밋 1: `227cddb`
**feat: add STEP import flow and optimize build with vendor splitting**

- STEP 파일 드롭 → feature 자동 감지 → TOML config 생성 → 편집 모달
- 빌드 최적화: 931KB → 202KB (vendor 분리 + lazy load)

### 커밋 2: `6cd42b7`
**fix: stabilize step import flow and template analyze guidance**

- Python 스크립트 실패 시 fallback 처리 (graceful degradation)
- 데이터 정규화 (배열/숫자/객체 포맷 통일)
- shapes/parts 없는 템플릿 TOML에 안내 메시지 가드
- TOML `[import]` 섹션 추가 (source_step + template_only 플래그)

### 추가 검증: WSLg GUI 테스트

- Tauri 네이티브 창이 WSLg에서 정상 표시 확인
- WebKit 렌더러 + X11 소켓 연결 확인
- EGL software fallback (GPU 미지원이나 동작 정상)

---

## 9. 실행 방법

### 사전 요구사항

- Node.js 18+
- FreeCAD 1.0 (Windows에 설치, WSL에서 호출)
- Python 3.11+ (FreeCAD 번들 Python)

### 실행

```bash
# 1. 백엔드 + 프론트엔드 동시 시작
cd ~/freecad-desktop
npm run start

# 2. 브라우저에서 접속
# http://localhost:1420

# 3. 또는 Tauri 네이티브 앱으로 실행
npm run tauri dev
```

### 사용 흐름

1. 왼쪽 사이드바에서 **예제 config 선택** 또는 **.step 파일 드롭**
2. .step이면 → **모달에서 feature 확인** → "Use Config"
3. 오른쪽에서 **공정/재료/배치** 설정
4. **Analyze** 클릭 → 진행바로 5단계 실시간 확인
5. 결과 확인: **3D 뷰어 탭**, **Drawing 탭**, **DFM/Tolerance/Cost 탭**
6. **Report** 클릭 → PDF 생성 → **PDF 탭**에서 미리보기/다운로드

---

## 10. 프로젝트 요약 수치

| 항목 | 수치 |
|------|------|
| 프론트엔드 코드 | ~1,500줄 (11 컴포넌트 + 1 훅 + CSS) |
| 백엔드 코드 | ~600줄 (7 라우트 + 3 유틸) |
| 엔진 코드 | ~22,000줄 (44 Python 스크립트) |
| 분석 단계 | 5개 (모델, 도면, DFM, 공차, 비용) |
| API 엔드포인트 | 12개 |
| 초기 번들 | 202KB (최적화 후) |
| 지연 로드 청크 | ~700KB (필요 시 로드) |
| 예제 config | 4개 (KS 규격 부품) |
| 지원 공정 | 4개 (기계가공, 주조, 판금, 3D프린팅) |
| 지원 재료 | 8개 (SS304, AL6061, S45C 등) |

---

## 11. R4 안정화 (테스트/CI)

### 11.1 테스트 범위 확장

- 훅 단위 테스트 추가
  - `src/hooks/useProjectState.test.jsx`
  - `src/hooks/useProfileState.test.jsx`
  - `src/hooks/useModalState.test.jsx`
  - `src/hooks/useBackend.test.jsx`
- 핵심 라우트 핸들러 단위 테스트 추가
  - `backend/routes/profile.test.js`
  - `backend/routes/report.test.js`
  - `backend/routes/export-pack.test.js`
  - `backend/routes/cache.test.js`
  - `backend/routes/project.test.js`
  - `backend/routes/diagnostics.test.js`
  - `backend/routes/cost.test.js`
  - `backend/routes/dfm.test.js`
  - `backend/routes/drawing.test.js`
  - `backend/routes/tolerance.test.js`
  - `backend/routes/step-import.test.js`
  - `backend/routes/report-template.test.js`
  - `backend/routes/analyze.test.js`
  - `backend/routes/profile.route.test.js`
  - `backend/routes/report.route.test.js`
  - `backend/routes/router-contracts.test.js`
  - `backend/server.test.js`
  - `backend/routes/project.test.js` (예외/에러 분기 보강)
  - `backend/routes/report.test.js` (tolerance/pairs + pdfBase64 경로 보강)
- 백엔드 유틸 단위 테스트 확장
  - `backend/lib/analysis-cache.test.js`
  - `backend/lib/cost-estimator.test.js`
  - `backend/lib/csv-generator.test.js`
  - `backend/lib/profile-loader.test.js`
  - `backend/lib/step-analyzer.test.js`
  - `backend/lib/qa-runner.test.js`
  - `backend/lib/svg-postprocess.test.js`
  - `backend/lib/pack-builder.test.js` (buildPack 경로 포함)
- 컨텍스트 통합 회귀 테스트 추가
  - `src/components/appShell.integration.test.jsx`
- 앱 루트 조합 회귀 테스트 추가
  - `src/App.test.jsx`
  - App shell 조합, 진행바/에러바 표시 조건, Dismiss 동작 검증
- UI 컴포넌트 단위 테스트 확장
  - `src/components/FileDropZone.test.jsx`
  - `src/components/ProgressBar.test.jsx`
  - `src/components/DrawingViewer.test.jsx`
  - `src/components/ReportPreview.test.jsx`
  - `src/components/CostPanel.test.jsx`
  - `src/components/DfmPanel.test.jsx`
  - `src/components/TolerancePanel.test.jsx`
  - `src/components/SettingsPanel.test.jsx`
  - `src/components/ExportPackModal.test.jsx`
  - `src/components/ProfileCompareModal.test.jsx`
  - `src/components/ReportConfigModal.test.jsx`
  - `src/components/ShopProfileModal.test.jsx`
  - `src/components/TemplateEditorModal.test.jsx`
  - `src/components/ModelViewer.test.jsx`
  - `src/components/ShopProfilePanel.test.jsx`
  - `src/components/StepImportModal.test.jsx`
- 레이아웃 컴포넌트 단위 테스트 확장
  - `src/components/layout/AppSidebar.test.jsx`
  - `src/components/layout/AppViewerSection.test.jsx`
  - `src/components/layout/AppAnalysisSection.test.jsx`
  - `src/components/layout/AppEmptyState.test.jsx`
- 모달 조합 컴포넌트 테스트 확장
  - `src/components/modals/ProjectFlowModals.test.jsx`
  - `src/components/modals/AnalysisFlowModals.test.jsx`
- 커버리지 집계 예외 정리
  - `src/contracts/**` 제외 (JSDoc typedef 중심 계약 파일로 런타임 라인 미생성)

### 11.2 자동 스모크 검증

- 핵심 기능 스모크 스크립트
  - `scripts/smoke-core.mjs`
- 검증 대상
  - Analyze(+DXF) / Rerun / Profile / Profile Compare / Report / Template CRUD / Export / STEP
- CI 환경에서 `SMOKE_MOCK=1` 모드 지원
  - FreeCAD 런타임이 없는 환경에서도 API 플로우 회귀 검증 가능

### 11.3 CI 워크플로

- GitHub Actions
  - `.github/workflows/desktop-ci.yml`
  - `.github/workflows/report-smoke.yml` (Desktop CI 성공 후 스모크 요약/REPORT preview artifact 생성)
- 실행 순서
  1. `npm ci`
  2. `npm run verify`
  3. `npm run test:coverage` (coverage artifact 업로드)
  4. `smoke-core-summary` artifact 업로드 (mock smoke JSON 결과)

### 11.4 로컬 검증 명령

```bash
npm run verify
npm run test:coverage
npm run report:smoke
npm run report:smoke:mock
npm run ci:status   # gh 로그인/네트워크 가능 환경에서 CI 상태 확인
```

### 11.5 최근 스모크 요약 (자동 생성)

<!-- SMOKE_SUMMARY:START -->
_Updated: 2026-02-15T01:44:38.249Z_
- Result: `ok`
- Analyze stages: create, drawing, dfm, cost
- Analyze DXF output: yes
- Profile compare: `_default` vs `sample_precision` (90 / 95)
- Template CRUD: pass
- Export DXF in ZIP: yes
- STEP flow: pass

```json
{
  "ok": true,
  "summary": {
    "profile": {
      "count": 2,
      "hasDefault": true
    },
    "analyze": {
      "stages": [
        "create",
        "drawing",
        "dfm",
        "cost"
      ],
      "hasModel": true,
      "hasDrawing": true,
      "hasDxf": true,
      "hasDfm": true,
      "hasCost": true,
      "errors": 0
    },
    "profileCompare": {
      "success": true,
      "profileA": "_default",
      "profileB": "sample_precision",
      "scoreA": 90,
      "scoreB": 95
    },
    "templateCrud": {
      "success": true,
      "createdName": "smoke_template_1771119878068",
      "fetched": true,
      "listed": true,
      "deleted": true
    },
    "rerun": {
      "stage": "dfm",
      "success": true,
      "score": 95
    },
    "report": {
      "success": true,
      "hasPdfBase64": true
    },
    "exportPack": {
      "success": true,
      "filename": "mock-pack.zip",
      "zipBytes": 34,
      "hasDxfEntry": true
    },
    "step": {
      "success": true,
      "configPath": "configs/imports/mock-part.toml",
      "hasAnalysis": true
    }
  }
}
```
<!-- SMOKE_SUMMARY:END -->
