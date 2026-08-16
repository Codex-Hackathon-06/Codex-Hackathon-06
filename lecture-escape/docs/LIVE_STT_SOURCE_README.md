# LecScape STT

한국어 강의를 공통 `TranscriptChunk`로 변환하는 LecScape STT 모듈입니다. 녹화 영상용 배치 STT와 macOS 시스템 오디오용 실시간 STT를 함께 제공하며, 기존 게임 생성기는 두 결과를 같은 형식으로 소비합니다.

## 요구 사항

- Node.js 20 이상
- 프로젝트 의존성 설치: `pnpm install` 또는 `npm install`
- `OPENAI_API_KEY` 환경 변수

프로젝트에 포함된 `ffmpeg-static` 또는 시스템 FFmpeg로 16kHz·모노·64kbps MP3를 만듭니다. 둘 다 찾지 못한 macOS에서는 기본 제공되는 `afconvert`로 AAC 오디오 트랙만 복사하는 마지막 폴백을 사용합니다. 실제 API 키는 `.env`나 저장소에 커밋하지 마세요.

## macOS 실시간 시스템 오디오 STT

ScreenCaptureKit Swift helper가 현재 Mac에서 재생되는 시스템 오디오만 받아 24kHz·모노·PCM16으로 변환합니다. Node 서버는 `intent=transcription`으로 전사 전용 WebSocket 세션을 열고 `gpt-live-transcribe`를 사용합니다. 이 전사 모델에는 turn detection을 설정하지 않고 Node가 5초마다 버퍼를 commit해 final 청크를 만듭니다. 브라우저와 helper에는 API 키가 전달되지 않습니다.

처음 한 번 의존성을 설치합니다.

```bash
pnpm install
```

zsh 터미널에서 키를 안전하게 입력하고 서버를 실행합니다. `OpenAI API Key:`가 보인 다음 키를 붙여넣고 Enter를 누르세요. 입력 중 문자가 화면에 안 보이는 것이 정상입니다.

```bash
cd "/Users/hansuyeong/Documents/Codex/2026-08-16/lecscape-ai-1-e2e-1-3"

read -s "OPENAI_API_KEY?OpenAI API Key: "; echo
export OPENAI_API_KEY

bash scripts/live-macos.sh
```

브라우저에서 `http://127.0.0.1:4173`을 연 뒤 `Start Listening`을 누르고, 상태가 `Listening`이 되면 강의 영상을 00:00부터 재생합니다. 강의가 끝나면 `종료하고 개념 생성`을 누릅니다. 서버가 마지막 STT를 확정하고 전사본을 저장한 다음, 핵심 개념·사례·혼동 포인트와 단일 방 게임 입력을 자동 생성합니다. 분석 완료 후 나타나는 `게임 시작` 버튼을 누르면 전체 `GameGeneratorInput`이 `/game` 화면으로 전달됩니다.

최초 실행에서 권한 창이 뜨면 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 기록에서 터미널을 허용하고 서버를 다시 실행해야 할 수 있습니다. helper는 마이크 입력이나 화면 프레임을 처리하지 않습니다.

실시간 출력은 `outputs/live/<session-id>/`에 저장됩니다.

- `transcript.chunks.json`: final `TranscriptChunk[]`
- `transcript.srt`: 검수용 자막
- `session.json`: 모델, 24kHz 샘플레이트, Listening 기준 시각, 청크 수
- `lecture.analysis.raw.json`: 개념 분석 API 원본 응답
- `game-generator.input.json`: 핵심 개념·사례·단일 방 구성이 포함된 게임 입력

전문용어 힌트가 필요하면 다음처럼 실행할 수 있습니다.

```bash
bash scripts/live-macos.sh \
  --prompt "강의에서 사용하는 기술 용어" \
  --keywords "LecScape,MCP,STT"
```

정상적인 웹 종료 흐름에서는 분석기가 자동 실행됩니다. 분석만 실패했거나 저장된 전사본을 다시 처리할 때는 다음 명령으로 수동 재시도할 수 있습니다.

```bash
node src/analyze-cli.mjs \
  --input outputs/live/<session-id>/transcript.chunks.json \
  --output outputs/live/<session-id>/game-generator.input.json
```

작업이 끝나면 현재 터미널에서만 키를 지웁니다.

```bash
unset OPENAI_API_KEY
```

### 게임 UI 통합

현재 기본 게임 화면은 데이터 전달을 검증하는 통합 준비 화면입니다. 게임 담당자는 `live-ui/game-runtime.js`의 아래 함수 구현만 교체하면 됩니다.

```js
export async function mountGame(root, gameInput, context) {
  // root에 게임 UI 렌더링
  // 완료 시 context.onComplete(result) 호출
}
```

`gameInput`은 저장된 `game-generator.input.json`과 동일한 전체 객체입니다. STT 화면과 게임 화면 사이의 전달은 `sessionStorage`를 사용하며, 새로고침 시 서버가 마지막 `analysis_complete` 이벤트를 다시 보내므로 게임 시작 버튼도 복구됩니다. 자세한 계약은 `outputs/GAME_INTEGRATION_GUIDE.md`를 참고하세요.

## 첨부 데모 영상 준비

API 호출 없이 해시와 전처리 음성만 먼저 만들 수 있습니다.

```bash
node src/cli.mjs \
  --input "/Users/hansuyeong/Downloads/YTDown.com_YouTube_Media_fpEwY-3b-Vw_001_1080p.mp4" \
  --prepare-only
```

API 키가 설정된 터미널에서 전체 전사를 실행합니다.

```bash
export OPENAI_API_KEY="..."
node src/cli.mjs \
  --input "/Users/hansuyeong/Downloads/YTDown.com_YouTube_Media_fpEwY-3b-Vw_001_1080p.mp4"
```

전문용어가 있으면 한국어 문맥 힌트를 전달합니다.

```bash
node src/cli.mjs --input lecture.mp4 \
  --prompt "강의에서 사용하는 용어: LecScape, MCP, STT"
```

## 결과와 캐시

기본 결과 경로는 `data/transcripts/<영상 SHA-256>/`입니다.

- `transcript.raw.json`: OpenAI 원본 `verbose_json`
- `transcript.chunks.json`: 게임 생성기용 `TranscriptChunk[]`
- `transcript.srt`: 육안 검수용 자막
- `manifest.json`: 영상 해시, 모델, 언어, 생성 시각
- `audio.mp3` 또는 `audio.m4a`: 전처리 음성

같은 영상을 다시 입력하면 완성된 캐시를 즉시 반환합니다. `--force`를 사용한 재생성 중 API 오류가 발생해도 기존 완성 캐시는 보존하여 반환합니다. 별도 시스템에서 받은 `verbose_json`은 다음처럼 정규화할 수 있습니다.

```bash
node src/cli.mjs --input lecture.mp4 --raw-response saved-response.json
```

UI는 `runBatchStt({ onProgress })`의 다음 진행 상태를 그대로 사용할 수 있습니다.

```text
영상 확인 → 음성 추출 → 자막 분석 → 자막 정리 → 개념 추출 준비 → 완료
```

배치 결과를 실시간 청크 소비자에 연결할 때는 `streamBatchTranscript()`를 사용합니다. 심사 시에는 첨부 클립이 사전 분석 캐시를 사용하며, 캐시가 없는 영상은 같은 파이프라인에서 실제 STT를 실행한다고 설명합니다.

## 테스트

```bash
npm test
```

API 키 없이도 청크 정규화, SRT, 해시, 캐시 계약, PCM 프레이밍, 실시간 자막 조립, 상태 전이와 오류 처리를 테스트합니다. 실제 시스템 오디오·API 연결은 macOS 권한과 유효한 키로 수동 검증합니다.

## 게임 생성기용 강의 분석

`transcript.chunks.json`에서 핵심 개념, 강의 속 사례, 혼동하기 쉬운 개념과 단일 방 구성을 추출합니다. 하나의 방 안에 개념 발견 → 사례 적용 → 종합 판단의 3단계 잠금을 배치합니다. 모델에는 청크 ID만 선택하게 하고, 결과의 타임스탬프와 근거 문장은 원본 청크에서 다시 연결합니다.

```bash
read -s "OPENAI_API_KEY?새 API 키를 붙여넣고 Enter: "; export OPENAI_API_KEY; echo

node src/analyze-cli.mjs \
  --input outputs/lecscape-transcript/transcript.chunks.json \
  --output outputs/lecscape-transcript/game-generator.input.json

unset OPENAI_API_KEY
```

기본 모델은 구조화 출력을 지원하고 품질과 비용의 균형을 맞춘 `gpt-5.6-terra`, reasoning effort는 `low`입니다. 계정에서 사용할 수 있는 다른 모델로 바꾸려면 `--model` 또는 `OPENAI_CONCEPT_MODEL` 환경변수를 사용합니다.

생성 결과에는 다음 데이터가 포함됩니다.

- 강의 제목·요약·학습 목표
- 중요도·난이도·선행 관계가 포함된 핵심 개념
- 개념을 적용하는 강의 속 사례
- 오개념, 정확한 구분, 진단 질문이 포함된 혼동 포인트
- 모든 항목의 `chunkId`, `startMs`, `endMs`, 실제 근거 문장
- 단일 방 안의 개념 발견, 사례 적용, 종합 판단 및 개념 재등장 설계

같은 청크와 모델로 다시 실행하면 기존 `game-generator.input.json`을 즉시 재사용합니다.
