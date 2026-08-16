# LecScape macOS 실시간 STT 실행 가이드

## 완료된 구성

- ScreenCaptureKit 기반 시스템 오디오 전용 Swift helper
- 24kHz·모노·PCM16 변환과 100ms 단위 전송
- `intent=transcription` 전용 WebSocket 세션 + `gpt-live-transcribe` 한국어 스트리밍 전사
- turn detection 없이 Node가 5초마다 commit하여 final 자막 청크 생성
- partial/final 실시간 자막 UI (`http://127.0.0.1:4173`)
- `TranscriptChunk` 호환 JSON, SRT, 세션 메타데이터 저장
- 기존 영상 배치 STT 및 단일 방 게임 분석 경로 유지

## 1. 터미널 준비

```bash
cd "/Users/hansuyeong/Documents/Codex/2026-08-16/lecscape-ai-1-e2e-1-3"
```

처음 한 번만 의존성을 설치합니다. `pnpm`이 없다면 저장소에 이미 설치된 `node_modules`를 그대로 사용해도 됩니다.

```bash
pnpm install
```

## 2. API 키 입력

API 키의 “이름”이 아니라 OpenAI API Keys 화면에서 발급한 `sk-...` 형식의 비밀값을 넣습니다. 아래 첫 줄을 실행한 뒤 `OpenAI API Key:`가 보일 때 키를 붙여넣고 Enter를 누르세요. 보안 입력이라 키 문자가 화면에 표시되지 않습니다.

```bash
read -s "OPENAI_API_KEY?OpenAI API Key: "; echo
export OPENAI_API_KEY
[[ -n "$OPENAI_API_KEY" ]] && echo "API 키가 이 터미널에 설정되었습니다."
```

키 자체를 터미널 명령처럼 별도로 실행하면 `command not found`가 발생합니다. 이전 대화나 화면 공유에 노출된 키는 폐기하고 새 키를 사용하세요.

## 3. 서버 실행

```bash
bash scripts/live-macos.sh
```

정상 출력:

```text
LecScape Live STT: http://127.0.0.1:4173
```

브라우저에서 위 주소를 열고 다음 순서로 진행합니다.

1. `Start Listening` 클릭
2. 상태가 `Listening`이 될 때까지 대기
3. 강의 클립을 00:00부터 재생
4. 완료 후 `종료하고 개념 생성` 클릭
5. `Finalizing → Analyzing → Grounding → Ready` 상태를 확인
6. 분석 카드 아래 `게임 시작`을 눌러 `/game`으로 이동

## 4. 최초 macOS 권한

권한 오류가 나오면 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 기록에서 현재 사용 중인 터미널을 허용합니다. 이후 서버를 완전히 종료하고 다시 실행하세요. 이 helper는 시스템 오디오만 처리하며 마이크와 화면 영상은 저장하지 않습니다.

## 5. 결과 확인 및 게임 분석 연결

세션 결과는 다음 위치에 생깁니다.

```text
outputs/live/<session-id>/transcript.chunks.json
outputs/live/<session-id>/transcript.srt
outputs/live/<session-id>/session.json
outputs/live/<session-id>/lecture.analysis.raw.json
outputs/live/<session-id>/game-generator.input.json
```

타임스탬프는 원본 동영상 시간이 아니라 `Listening` 시작을 0으로 한 상대시간입니다. 웹에서 종료하면 `transcript.chunks.json` 저장 직후 개념 분석이 자동 실행되고, 완료 화면에 강의 제목·요약·핵심 개념이 표시됩니다.

분석만 실패했을 때 전사본은 그대로 보존됩니다. 다음 명령으로 수동 재시도할 수 있습니다.

```bash
node src/analyze-cli.mjs \
  --input outputs/live/<session-id>/transcript.chunks.json \
  --output outputs/live/<session-id>/game-generator.input.json
```

실시간 경로에 문제가 있어도 기존 사전 전사본과 배치 STT는 수정되지 않았으므로 데모를 계속할 수 있습니다.

## 6. 종료

서버 터미널에서 `Control-C`를 누르고, 키를 제거합니다.

```bash
unset OPENAI_API_KEY
```

## 검증 상태

- Swift helper: macOS SDK로 빌드 성공
- Node 테스트: 39개 전체 통과
- 로컬 HTTP/UI/WebSocket 및 API 키 누락 오류 확인 완료
- 종료 → 전사 저장 → 개념 분석 성공/실패 자동 체인 검증 완료
- 분석 결과 새로고침 복구와 게임 화면 데이터 handoff 검증 완료
- 남은 수동 검증: 실제 권한 승인, 실제 시스템 오디오 캡처, 유효한 API 키로 한국어 자막 latency 확인
