# LecScape — 강의실 탈출

> 강의 영상과 실시간 강의 오디오를 AI로 분석해, 학습 내용을 1인칭 방탈출 게임으로 변환하는 프로젝트입니다.

LecScape는 강의를 단순히 요약하거나 퀴즈로 바꾸는 데서 끝나지 않습니다. 음성에서 핵심 개념·사례·오개념을 추출하고, 그 근거를 실제 전사 구간과 연결한 뒤, 플레이 가능한 방탈출 퍼즐 데이터로 구성합니다.

## 핵심 흐름

```text
강의 영상 또는 macOS 시스템 오디오
  → 한국어 STT 및 타임스탬프 생성
  → 핵심 개념·사례·오개념 분석
  → 근거 구간이 연결된 게임 JSON 생성
  → 1인칭 방탈출 플레이
  → 힌트·정답·해설을 통한 복습
```

## 주요 기능

### 녹화 영상 배치 STT

- MP4, MP3, M4A, WAV 등의 입력에서 음성을 추출합니다.
- FFmpeg를 이용해 STT에 적합한 오디오로 전처리합니다.
- OpenAI Audio Transcription API로 한국어 전사와 구간별 타임스탬프를 생성합니다.
- 입력 파일 해시를 기준으로 결과를 캐시해 같은 영상을 중복 처리하지 않습니다.
- JSON, SRT, 원본 API 응답과 실행 manifest를 함께 저장합니다.

### macOS 실시간 시스템 오디오 STT

- macOS ScreenCaptureKit 기반 Swift helper가 현재 재생 중인 시스템 오디오를 캡처합니다.
- 오디오를 24kHz, 모노, PCM16으로 변환해 Node 서버로 전달합니다.
- 서버가 `gpt-live-transcribe` Realtime 세션을 열고 실시간 전사 결과를 브라우저에 표시합니다.
- API 키는 서버에서만 사용하며 브라우저와 Swift helper에는 전달하지 않습니다.
- 현재 실시간 시스템 오디오 캡처는 macOS 13 이상 전용입니다. Windows에서는 배치 STT 경로를 사용해야 합니다.

### 강의 개념 분석과 게임 데이터 생성

- 전사문에서 핵심 개념, 실제 사례, 혼동하기 쉬운 지점을 구조화합니다.
- 모든 분석 항목을 원본 전사 청크와 연결해 근거를 추적할 수 있습니다.
- 개념 발견, 사례 적용, 종합 판단의 3단계 학습 흐름을 한 개의 방에 구성합니다.
- 생성 결과는 공통 JSON 스키마로 검증한 뒤 게임 런타임에 전달합니다.

### 방탈출 게임

- 장면 탐색, 아이템 수집과 배치, 숫자·기호 키패드, 다중 다이얼, 스위치 패널, 최종 금고 퍼즐을 지원합니다.
- 각 퍼즐은 관찰 힌트와 개념 힌트를 제공하고, 이후 정답·해설·영상 근거를 보여줍니다.
- 잘못된 선택에도 개념 중심 피드백을 제공하며, 퍼즐 보상과 다음 장면 해금 순서를 검증합니다.
- Kenney CC0 에셋과 Poly Haven 에셋을 사용합니다.

## 기술 구성

| 영역 | 기술 |
| --- | --- |
| 런타임 | Node.js 20+, JavaScript ES Modules |
| 웹 UI | HTML, CSS, Vanilla JavaScript |
| 실시간 통신 | WebSocket (`ws`) |
| 배치 음성 처리 | FFmpeg / `ffmpeg-static` |
| macOS 오디오 캡처 | Swift, ScreenCaptureKit, AVFoundation |
| AI | OpenAI Audio Transcription, Realtime Transcription, Responses API |
| 검증 | Node.js Test Runner, JSON Schema 기반 콘텐츠 검증 |

## 설치

```bash
git clone https://github.com/Codex-Hackathon-06/Codex-Hackathon-06.git
cd Codex-Hackathon-06
npm install
```

Node.js 20 이상이 필요합니다.

## 환경변수

프로젝트 루트에 `.env` 파일을 만들고 OpenAI API 키를 설정합니다.

```dotenv
AI_API_KEY=your_openai_api_key
```

기존 표준 환경변수인 `OPENAI_API_KEY`도 지원합니다. 두 값이 모두 있으면 `AI_API_KEY`를 우선 사용합니다. `.env`는 `.gitignore`에 포함되어 있으므로 저장소에 커밋하지 마세요.

## 실행 방법

아래 표의 순서대로 실행하면 됩니다. **API 키 없이도 1~2단계는 그대로 동작하며**, 실제 음성 전사와 개념 분석(3~4단계)에만 OpenAI 키가 필요합니다.

| 단계 | 명령 | API 키 | 결과 |
| --- | --- | :---: | --- |
| 1. 검증 | `npm test` | 불필요 | 86개 테스트 통과 |
| 2. 게임 확인 | `npm run start:game` | 불필요 | STT 화면 → 방탈출 게임 |
| 3. 실시간 STT | `npm start` | 필요 | 시스템 오디오 실시간 전사 |
| 4. 녹화본 STT | `npm run transcribe -- --input ./DEMO.mp4` | 필요 | 전사 JSON·SRT |

### 0. 설치

```bash
npm install
npm test
```

Node.js 20 이상이 필요합니다. `npm test`가 86개 모두 통과하면 설치가 정상입니다. API 키 없이 오디오 프레이밍, 캐시, SRT, 게임 스키마, 퍼즐 런타임까지 검증합니다.

### 1. 게임 프로토타입 실행 (API 키 불필요)

```bash
npm run start:game
```

`http://127.0.0.1:4173`에 접속하면 STT 화면이 먼저 열립니다. 이 서버는 정적 파일만 제공해서 실시간 전사 WebSocket(`/live`)이 없으므로 STT 화면은 `연결 끊김`으로 표시됩니다. 방탈출 게임은 `http://127.0.0.1:4173/apps/web/`에서 바로 확인할 수 있고, 샘플 강의(`코딩 에이전트와 벤치마크`)로 퍼즐 5개를 끝까지 풀 수 있습니다.

포트를 이미 다른 프로세스가 쓰고 있으면 `EADDRINUSE` 오류가 납니다. 다른 포트로 띄우려면 `PORT=4180 npm run start:game`처럼 지정하고, 이전에 띄워 둔 서버를 정리하려면 `lsof -nP -iTCP:4173 -sTCP:LISTEN -t | xargs kill`을 사용하세요.

### 2. 샘플 콘텐츠 검증 (API 키 불필요)

```bash
npm run validate:sample
```

게임에 실리는 방 데이터가 공통 JSON 스키마를 만족하는지 확인합니다.

### 3. macOS 실시간 STT (API 키 필요)

```bash
npm run live
```

스크립트가 Swift helper를 빌드하고 `http://127.0.0.1:4173`에서 실시간 STT 화면을 엽니다. 최초 실행 시 macOS의 화면 및 시스템 오디오 기록 권한을 허용해야 합니다. macOS 13 이상과 Xcode Command Line Tools(`xcode-select --install`)가 필요합니다.

이미 helper를 빌드했다면 서버만 다시 띄우면 됩니다.

```bash
npm run build:mac-audio
npm start
```

`npm start`로 띄운 서버는 `/`가 실시간 STT 화면, `/game`이 분석 결과를 넘겨받은 게임 화면입니다. 기록을 끝내면 개념 분석이 자동으로 돌고, `게임 시작` 버튼으로 방탈출 화면까지 이어집니다.

### 4. 녹화 영상 배치 STT (API 키 필요)

```bash
npm run transcribe -- --input ./DEMO.mp4
```

키가 없으면 `AI_API_KEY`를 설정하라는 안내를 출력하고 종료합니다. 키 없이 전처리만 확인하려면 `--prepare-only`를 사용하세요.

주요 옵션:

```text
--cache <directory>       캐시 경로 변경
--prompt <text>           강의 용어 힌트 제공
--prompt-file <path>      UTF-8 용어 힌트 파일 사용
--prepare-only            API 호출 없이 음성 전처리만 수행
--force                   기존 캐시를 무시하고 다시 생성
```

### 5. 전사 결과 분석 (API 키 필요)

```bash
npm run analyze -- --input ./data/transcripts/<hash>/transcript.chunks.json
```

`<hash>`는 4단계에서 만들어진 디렉터리 이름입니다. 분석 결과는 기본적으로 전사 파일과 같은 디렉터리에 `game-generator.input.json`으로 저장됩니다.

## 생성 결과

배치 STT 결과는 기본적으로 `data/transcripts/<source-sha256>/`에 저장됩니다.

```text
audio.mp3 또는 audio.m4a     전처리된 음성
manifest.json                입력 해시와 처리 메타데이터
transcript.raw.json          OpenAI 원본 전사 응답
transcript.chunks.json       공통 TranscriptChunk 배열
transcript.srt               자막 파일
game-generator.input.json    강의 분석 및 게임 생성기 입력
lecture.analysis.raw.json    강의 분석 원본 응답
```

실시간 STT 결과는 기본적으로 `outputs/live/<session-id>/`에 저장됩니다.

### 프로젝트 산출물과 개발 기록

실행 소스와 프로젝트 산출물은 용도에 따라 다음 위치에 정리합니다.

| 종류 | 위치 | 설명 |
| --- | --- | --- |
| STT 소스 배포본 | `outputs/source/lecscape-live-stt-source.zip` | STT·분석·실시간 UI 전달용 소스 아카이브 |
| 팀 발표 자료 | `docs/presentation/team06.pptx` | Team 06 프로젝트 발표 자료 |
| 개발 세션 로그 | `artifacts/logs/` | 민감정보를 마스킹한 개발 과정 기록 |
| npm 설정 | `package.json`, `package-lock.json` | npm 실행 스크립트와 고정 의존성 버전 |
| pnpm 설정 | `pnpm-workspace.yaml`, `pnpm-lock.yaml` | pnpm 워크스페이스와 고정 의존성 버전 |

`package.json`, `package-lock.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`은 패키지 관리자가 프로젝트 루트에서 찾는 실행 필수 파일이므로 다른 폴더로 이동하지 않습니다.

## 저장소 구조

```text
.
├─ artifacts/logs/           민감정보를 제거한 개발 세션 로그
├─ apps/web/                 방탈출 게임 웹 UI와 에셋 카탈로그
├─ content/                  샘플 강의, 생성 프롬프트, 3D/2D 에셋
├─ docs/                     STT·게임 연동 문서와 발표 자료
├─ game-team-handoff/        게임 팀 전달 계약과 통합 예제
├─ live-ui/                  실시간 STT 및 분석 결과 UI
├─ native/                   macOS 시스템 오디오 Swift helper
├─ packages/
│  ├─ content-schema/        게임 생성 JSON 스키마와 검증기
│  ├─ game-engine/           퍼즐 상태와 상호작용 런타임
│  └─ video-analyzer/        영상 분석 패키지 영역
├─ outputs/                  실행 결과, 가이드, 소스 배포본
├─ scripts/                  로컬 서버, 검증, macOS 빌드 스크립트
├─ src/                      STT·Realtime·AI 분석 파이프라인
├─ test/                     STT 및 분석 테스트
├─ tests/                    콘텐츠 스키마와 게임 엔진 테스트
├─ package.json              npm 프로젝트 설정과 실행 명령
├─ package-lock.json         npm 의존성 잠금 파일
├─ pnpm-workspace.yaml       pnpm 워크스페이스 설정
└─ pnpm-lock.yaml            pnpm 의존성 잠금 파일
```

## 테스트

```bash
npm test
npm run validate:sample
```

API 키 없이도 오디오 프레이밍, 전사 요청 형식, 캐시, SRT, 실시간 청크 조립, 게임 데이터 스키마와 퍼즐 런타임을 테스트할 수 있습니다. 실제 OpenAI 호출에는 유효한 API 키와 사용 가능한 크레딧이 필요합니다.

## 팀원 역할 분배

| 멤버 | 담당 영역 | 주요 역할 |
| --- | --- | --- |
| [이재용](https://github.com/jaeyong20) | Insight | 기획, 유튜브 영상 기반 STT 연동, 텍스트 추출, 데모 및 발표 자료 제작 |
| [한수영](https://github.com/poolhan) | Insight | 기획, 유튜브 영상 기반 STT 연동, 텍스트 추출, 데모 제작 |
| [장재원](https://github.com/windmoondreamer) | Build | 기획, 문제 생성, 방탈출 게임 로직 구현, 데모 제작 |
| [조혜림](https://github.com/johyerim23) | Build | 기획, 방탈출 게임 로직 구현, 코드 통합 및 검증 |

모든 팀원은 공통 JSON 계약과 통합 테스트를 기준으로 각 영역을 연결합니다.

## 현재 제약사항

- 실시간 시스템 오디오 캡처는 macOS 13 이상에서만 동작합니다.
- Windows와 Linux에서는 녹화 파일 기반 배치 STT를 사용해야 합니다.
- OpenAI API 호출에는 별도 API 키와 크레딧이 필요합니다.
- 실제 시스템 오디오 권한과 API 연결은 대상 macOS 기기에서 최종 검증해야 합니다.

## 관련 문서

- [STT 상세 문서](docs/LIVE_STT_SOURCE_README.md)
- [macOS 실시간 STT 실행 가이드](outputs/LIVE_STT_GUIDE.md)
- [게임 통합 가이드](outputs/GAME_INTEGRATION_GUIDE.md)
- [서드파티 에셋 출처](docs/THIRD_PARTY_ASSETS.md)
- [팀 발표 자료](docs/presentation/team06.pptx)
- [STT 소스 배포본](outputs/source/lecscape-live-stt-source.zip)

## 라이선스

이 프로젝트는 교육 및 해커톤 데모 목적으로 제작되었습니다. 외부 에셋의 라이선스는 각 에셋 파일과 [서드파티 에셋 문서](docs/THIRD_PARTY_ASSETS.md)를 따릅니다.
