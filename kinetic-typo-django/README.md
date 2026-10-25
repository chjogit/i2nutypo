# Kinetic Typo Studio (Django)

음원과 가사로 키네틱 타이포그라피 영상을 만드는 웹 앱입니다. Django가 페이지 한 장을 내주고, 편집기는 전부 브라우저에서 돕니다. 음원과 이미지는 서버로 올라가지 않습니다.

## 폴더 구조

| 경로                                | 내용                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `config/`                           | Django 설정(`settings.py`), URL, WSGI 진입점(`wsgi.py`, Vercel이 사용), Jinja2 환경(`jinja2.py`) |
| `studio/`                           | 페이지 뷰(`views.py`), URL                                              |
| `templates/`                        | Jinja2 템플릿: `base.html`+`header.html`(편집기 페이지 공통 틀), `studio.html`, 첫 화면 `intro.html`(틀 없이 단독) |
| `static/css/studio.css`             | 편집기 스타일 (빌드 결과)                                               |
| `static/js/studio.js`               | 편집기 (빌드 결과)                                                      |
| `static/js/whisper-worker.js`       | 음성 인식 워커 (빌드 결과)                                              |
| `static/js/separation-worker.js`    | 보컬 분리 워커 (빌드 결과)                                              |
| `static/fonts/`                     | 글꼴 31종 woff2와 라이선스 (`frontend/scripts/vendor-fonts.mjs`로 만듦)  |
| `static/licenses/`                  | 오픈소스 고지 원문·목록 (빌드할 때 자동 생성)                           |
| `docs/`                             | 설명서 원고(`guide.md` 사용법, `about.md` 프로젝트 소개)와 `build.py`   |
| `LICENSE`                           | 이 앱의 라이선스 (All rights reserved, 제3자 부분은 각자의 라이선스)    |
| `static/js/ffmpeg-worker.js`        | ProRes(MOV) 내보내기 워커 (빌드 결과). FFmpeg 본체(약 32MB)는 처음 쓸 때 jsDelivr(실패하면 unpkg)에서 받음 |
| `frontend/`                         | 편집기 원본 소스(TypeScript/React)와 빌드 스크립트                      |
| `requirements.txt`, `vercel.json`   | Python 의존성, Vercel 배포 설정                                         |

`static/`의 파일은 `frontend/`에서 빌드해 만들고, 그대로 커밋합니다. Vercel은 Node 빌드 없이 이 파일을 바로 내보냅니다.

## 첫 페이지와 단계 (입문 · 기본 · 숙련)

`/`는 단계를 고르는 첫 페이지(`templates/intro.html`, 공통 틀 없이 단독)이고, 편집기는 단계마다 주소가 다릅니다. 편집기 페이지는 모두 `base.html`과 `header.html`(← 처음으로, 단계 이름·안내, 단계 버튼)을 같은 틀로 쓰고, 같은 편집기(`studio.html`)를 열되 `<div id="root" data-mode="...">`로 단계를 알려 주고, 편집기는 `frontend/src/lib/mode/mode.ts`에서 이 값을 읽어 기능을 켜고 끕니다. 모든 편집기 화면 왼쪽 위 **← 처음으로**와 오른쪽 위 단계 버튼으로 언제든 옮겨 갈 수 있습니다.

| 주소         | 단계 | 쓸 수 있는 기능                                                                                     |
| ------------ | ---- | --------------------------------------------------------------------------------------------------- |
| `/beginner/` | 입문 | 큰 카드 순서대로: 1 테마(앨범 자켓·디지털 UI·플랫 대형 타이포 중 1개), 2 음원, 3 가사·자동 싱크, 4 자막 다듬기(색·크기·줄바꿈·글씨체, 타임라인), 5 영상 저장 |
| `/basic/`    | 기본 | 테마 20종 최대 3개, 요소, 상세·마무리(그레이딩·필터), 배경·앨범 커버, 영상 + 자막 파일 저장       |
| `/pro/`      | 숙련 | 모든 기능(기본 + 캐릭터 등장·퇴장, 소품 레이어, 타임라인 캐릭터·소품 줄)                           |

단계마다 작업이 브라우저에 따로 저장됩니다(숙련은 예전 저장을 그대로 씀). 첫 페이지도 `static/css/studio.css`를 함께 쓰므로, 템플릿에 Tailwind 클래스를 바꾸면 `npm run build`로 CSS를 다시 만듭니다.

## Docs 페이지

첫 화면 오른쪽 위 **Docs** 버튼이 `/docs/`(`templates/docs.html`)를 엽니다. 사용법 설명서와 프로젝트 소개 두 부분이고, 왼쪽 목차는 `studio/views.py`의 `doc_headings()`가 만듭니다. 내용은 `docs/guide.md`, `docs/about.md`를 고친 뒤 `pip install markdown && python docs/build.py`로 `templates/docs/_guide.html`, `_about.html`을 다시 만듭니다(서버에는 markdown 패키지가 필요 없음). 제3자에게 공개하는 문서라 참고한 작업물이나 개인 정보는 넣지 않습니다.

## 로컬 실행

```sh
# 1) 편집기 빌드 (frontend/ 소스를 고쳤을 때만)
cd frontend
npm ci            # npm 11 이상 권장
npm run build     # static/js, static/css 갱신
npm test          # 단위 테스트
npm run lint
npm run typecheck
cd ..

# 2) Django 실행
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
DJANGO_DEBUG=1 python manage.py runserver   # http://127.0.0.1:8000
```

편집기를 고치면서 보려면 다른 터미널에서 `cd frontend && npm run watch`를 켜 두세요.

## Vercel 배포

1. 이 폴더를 GitHub 저장소로 올립니다(`frontend/node_modules`는 `.gitignore`로 빠집니다).
2. Vercel에서 **Add New → Project**로 저장소를 가져옵니다. Framework Preset은 **Other**, 나머지 빌드 설정은 비워 둡니다(`vercel.json`이 정합니다).
3. **Environment Variables**에 `DJANGO_SECRET_KEY`를 넣습니다. 값은 `python -c "import secrets; print(secrets.token_urlsafe(50))"`로 만듭니다.
4. 자기 도메인을 붙이면 `DJANGO_ALLOWED_HOSTS`에 쉼표로 적습니다(`*.vercel.app`은 이미 허용).

`vercel.json`은 `/static/*`을 정적 파일로 직접 내보내고, 나머지 요청은 `config/wsgi.py`의 Django로 보냅니다. 정적 파일은 매번 변경 여부를 확인하도록(`must-revalidate`) 해서 새로 배포하면 바로 반영됩니다.

## 내보내기

가운데 열 아래 "내보내기" 칸에서 저장합니다. 모두 브라우저 안에서 처리되고 서버로 올라가지 않습니다.

- 완성 영상: 미리보기와 같은 렌더러로 곡 전체를 프레임마다 그려 WebCodecs(mediabunny)로 인코딩합니다. 720p/1080p, 30/60fps. Chrome·Edge에서는 MP4(H.264+AAC), 인코더가 없는 브라우저에서는 VP9/Opus나 WebM으로 대신 저장합니다.
- 자막 파일: SRT, VTT, ASS(글꼴·색·크기 포함), LRC. 원문·발음·뜻 중 담을 줄을 고릅니다.
- 코드: `frontend/src/lib/export/`, `frontend/src/components/editor/export-panel.tsx`

## 겹치는 가사 (코러스·화음)

- 앞 줄과 동시에 부르는 줄은 맨 앞에 `&`를 붙입니다. 원문·발음·뜻 세 줄로 쓸 때는 세 줄 모두(또는 첫 줄에만) 붙이면 한 묶음이 됩니다. 한 줄로 쓰면 `& 君がいた | 키미가 이타 | 네가 있었어`.
- 시간을 따로 안 적으면 앞 줄과 같이 시작해서 같이 끝납니다. `[00:12.00~00:16.00] & …`처럼 적으면 늦게 들어오거나 다음 줄까지 이어질 수 있습니다.
- 화면: 가사 테마가 같은 모양으로 그린 뒤 작게(0.6배) 줄여 메인 가사 아래(자리가 없으면 위)에 강조색을 살짝 섞어 놓습니다. 하단 자막에는 같은 행에 `메인 / 겹치는 줄` 식으로 발음·뜻이 붙습니다.
- 자동 싱크는 `&` 줄을 찾지 않고 메인 줄만 맞춘 뒤, `&` 줄은 앞 줄과의 간격을 유지한 채 따라 움직입니다.
- 타임라인에 `&` 줄이 있으면 아래에 보조 레인이 생깁니다. 줄을 고른 뒤 "겹치는 줄(&)" 체크로 바꿀 수 있습니다.
- 코드: `frontend/src/lib/lyrics/triplet.ts`, `parse.ts`, `frontend/src/lib/render/looks/overlap-layer.ts`

## 미리보기 편집

- 작은 미리보기 창: 아래로 스크롤해 미리보기가 화면에서 벗어나면 오른쪽 위에 작은 창이 뜹니다. 제목줄을 끌어 옮기고, 재생/일시정지, 크기(작게·보통·크게), ↑(원래 미리보기로 이동), ✕(닫기)를 씁니다. 미리보기 아래 "작은 창" 체크로 끌 수 있습니다.
- 가사 텍스트 박스: 모서리는 글자 크기, 좌우 막대는 가로 폭(글자 크기는 그대로 두고 줄바꿈 위치만 바뀜), 위아래 막대는 줄 간격입니다. 막대를 두 번 클릭하면 원래대로 돌아갑니다. 키보드는 `[` `]` 가로 폭, `{` `}` 줄 간격. 타임라인의 "이 줄 스타일"에서도 같은 값을 숫자로 고칠 수 있고, 가사 텍스트에는 `;width=0.80;height=1.20`처럼 저장됩니다.
- 코드: `frontend/src/components/editor/mini-preview.tsx`, `text-box-overlay.tsx`, `frontend/src/lib/render/looks/frame.ts`(`fitWidth`, `boxHeight`)
- 세부 타이밍: 타임라인에서 줄을 고르면 "세부 타이밍" 줄이 열립니다. 단어 단위나 글자 단위로 나오는 순간을 표시로 끌어 정하고(미리보기가 그 순간으로 따라감, ←→ 키로 0.05초씩), "탭으로 찍기"로 줄을 재생하며 탭 버튼(또는 스페이스)을 눌러 차례로 찍습니다. 가사 텍스트에는 줄 길이에 대한 비율로 `;t=0,0.12,0.3`처럼 저장되어 줄을 옮기거나 늘려도 모양이 유지되고, 가사를 고쳐 개수가 달라지면 고르게 나오도록 돌아갑니다. 코드: `frontend/src/lib/lyrics/timing.ts`, `parse.ts`(`placeTiming`), `components/editor/line-timing.tsx`
- 배경 영상 필터: 배경 영상을 넣으면 그 아래 "영상 필터" 칸이 생깁니다. 원본·어둡게·흐리게·선명하게·빛바랜·차갑게·모노톤 프리셋과 밝기·대비·채도·색조·흐림·색(파랑·노랑·흑백) 조절이 배경 영상에만 걸리고, 가사·장식·일러스트·자막 색은 그대로입니다. 미리보기와 내보내기에 같게 들어갑니다. 코드: `frontend/src/lib/render/bg-filter.ts`, `components/editor/bg-video-filter.tsx`
- 가사 방향: 상세 탭 "가사 위치 (전체)"와 입문 4단계에서 테마대로·가로·세로를 고르고, 타임라인 "이 줄 스타일"의 방향으로 줄마다 따로 정합니다(가사 텍스트에 `;orient=1`(가로)·`;orient=2`(세로)). 테마와 다른 방향이면 그 테마 색으로 기본 가로 블록·세로 열 배치를 씁니다. 코드: `frontend/src/lib/render/looks/orientation.ts`
- 진동 모두 끄기: 상세 탭 "효과" 칸과 입문 4단계의 스위치. 흔들림을 0으로 내려도 남는 떨림(비트에 맞춘 튐·확대, 강조 줄(!)의 화면 튐, 손그림 테두리 떨림, 일러스트 흔들림, 카메라 흔들림 조정 구간, 필름 화면 흔들림)을 한 번에 멈춥니다. 코드: `render-frame.ts`(`stilled`)
- 전환·조정 여러 개 고르기: 타임라인 전환·조정 줄에서 Ctrl(⌘)/Shift 클릭으로 구간을 더 고르고, 고른 구간 하나를 끌면 함께 움직이며 Delete로 함께 지웁니다. 오른쪽 설정 칸에서 바꾸는 종류·색·세기·들고 나기는 고른 같은 종류 구간 모두에 들어갑니다.
- 일러스트 마스킹: 일러스트 구간을 고르면 "마스킹" 칸에서 원·사각 영역, 가릴 곳(영역 밖/안), 위치·크기·부드러움, 가린 부분의 색(투명~불투명, 그림 모양/영역 전체)을 정합니다. 코드: `frontend/src/lib/render/looks/prop-mask.ts`, `components/editor/prop-mask-fold.tsx`
- 효과음 기능은 없앴습니다(2026-10-24).
- 글자 자동 대비: 색 맞추기·테두리·끄기와 세기(0~100%, 50%가 3:1 기준)를 테마마다 따로 정합니다. 테마마다 기본값이 있고(빛나는 글자 테마는 테두리, 단색 포스터형은 끄기, 나머지는 색 맞추기), 타임라인 테마 구간이 바뀌면 그 테마의 설정이 쓰입니다. 코드: `frontend/src/lib/render/looks/theme-contrast.ts`, `auto-contrast.ts`

## 테마 요소 옮기기와 캐릭터 연출

- 테마 목록은 접히는 칸입니다. 머리줄을 누르면 접히고, 접혀 있을 때는 고른 테마 이름만 보입니다. 펼치면 사이드바 폭에 맞춰 1~3열로 늘어납니다.
- ⌖ 단추가 있는 요소(앨범 자켓의 레코드·정사각 커버·곡 제목, 광채 링, 이클립스 링, 포인트 색 띠·원, 먹 붓질, 낙관, 달빛, 폴라로이드 액자, 대형 단어 배경, 측면 캡션)는 가로·세로(화면의 ±60%), 회전(±180°), 크기(30~300%)를 바꿀 수 있습니다. 미리보기에서는 ⌖를 끌어 옮기고 옆의 ⤡를 끌거나 ⌖ 위에서 휠을 돌려 크기를 바꿉니다. 슬라이더를 두 번 누르거나 "원래 자리로"로 되돌립니다.
- 캐릭터 "흔들림": 0%면 멈춤, 50%가 테마 기본, 그 위로는 기울기·튀기가 커지고 좌우로 흔들립니다.
- 캐릭터 퇴장 · 재등장: "+ 지금 사라지기"로 재생 위치에서 사라지는 구간을 만들고, 사라짐/재등장 시간(⏱ 지금 = 재생 위치), 효과(흐려지기, 위에서부터 지우기, 옆으로 지우기, 동그랗게 오므리기), 전환 길이를 정합니다. "재등장 위치 옮기기"를 누르면 미니 화면에서 돌아올 자리를 끌어 정합니다. 사라진 구간은 타임라인 맨 아래에 주황 선으로 보입니다.
- 가사 금지 칸: 캐릭터가 절반 이상 사라지면 꺼지고, 재등장이 시작되는 순간부터 새 자리가 덮는 칸이 금지 칸이 됩니다(직접 지정한 칸보다 우선). 다음 퇴장 전까지 그 자리에 머뭅니다.
- 코드: `frontend/src/lib/render/looks/cues.ts`, `frame.ts`(`withMoved`, `drawCharacterLayer`), `presets.ts`(`mv`), `components/editor/illustration-panel.tsx`, `style-sidebar.tsx`

## 일러스트 (캐릭터 · 소품)

- 오른쪽 "배경 · 배치" 칸은 미니 화면, 가사 금지 칸, 배경, 앨범 커버를 맡고, 그 아래 "일러스트" 칸이 캐릭터와 소품을 맡습니다.
- 캐릭터는 소재 목록 첫 줄에 있습니다. "캐릭터"를 누르면 PNG 올리기, 크기, 반전, 비트 튀기, 흔들림, 고정, 빨간 칸 피하기, 퇴장·재등장 목록이 열립니다. 표의 "추가/빼기"는 캐릭터 표시를 켜고 끕니다.
- 타임라인의 캐릭터 줄: 파란 부분이 보이는 구간, 점선이 사라진 구간입니다. 점선을 끌면 퇴장·재등장이 함께 움직이고, 양 끝을 끌면 각각 움직입니다. 파란 부분을 두 번 누르면 그 시간에 2초짜리 퇴장이 생깁니다. 점선을 누르면 그 퇴장이 선택되어 미니 화면에서 재등장 위치를 끌 수 있습니다.
- 퇴장 효과에 "효과 없음 (바로)"가 있습니다. 이때는 그 순간 바로 사라지고 나타나며, 금지 칸도 그 순간 바뀝니다.
- "+ 올리기"로 그림(PNG 권장)이나 영상을 여러 개 올립니다. 영상은 구간이 시작될 때 처음부터 재생되고, 구간보다 짧으면 반복됩니다(소리 없음). 올린 그림마다 아래 타임라인에 초록색 일러스트 줄이 하나씩 생기고, 재생 위치에서 4초 구간 하나로 시작합니다.
- "소재 목록"은 접히는 칸이고, 표에서 줄마다 "추가/빼기"(타임라인에 넣기·빼기, 빼도 목록에는 남음)와 "제거"(프로젝트에서 지움)를 고릅니다.
- 타임라인: 구간을 끌어 옮기고 양 끝을 끌어 길이를 바꿉니다. 빈 줄을 두 번 누르면 그 시간에 구간이 추가됩니다. 같은 줄의 구간끼리는 겹치지 않습니다.
- 구간을 누르면 오른쪽에서 시작/끝, 가로·세로, 크기, 회전, 투명도, 페이드, 가사 앞에 놓기, 좌우 반전을 바꿉니다. 목록 아래쪽 소재일수록 위에 그려집니다.
- 미리보기에서 바로 조정: 일러스트 칸이나 타임라인에서 캐릭터 또는 소품 구간을 고르면 미리보기에 테두리 상자가 뜹니다. 상자를 끌면 옮겨지고, 모서리를 끌면 크기가, 위쪽 점(소품만)을 끌면 회전이 바뀝니다(Shift로 15°씩). 캐릭터 상자는 지금 보이는 자리(재등장 후라면 그 재등장 위치)를, 퇴장을 고른 상태면 그 재등장 위치를 옮깁니다.
- 조정 칸은 모두 접을 수 있습니다(제목 줄의 ▾).
- 소재 그림은 배경·캐릭터 그림처럼 이 페이지를 연 동안만 유지됩니다(새로고침하면 다시 올려야 함).
- 코드: `frontend/src/components/editor/props-panel.tsx`, `prop-lanes.tsx`, `frontend/src/lib/props/clips.ts`, `frontend/src/lib/render/looks/props.ts`

## 자동 싱크 정확도

싱크는 4단계로 돕니다. 모두 브라우저 안에서만 처리하고 음원은 밖으로 보내지 않습니다.

1. 보컬 분리(켜고 끄기 가능): `@audio/neural-separate`(MIT)로 두 모델 중 하나를 씁니다. "가볍게"는 SCNet(13MB, 가중치 MIT), "정밀하게"는 Mel-Band RoFormer(464MB, 가중치 MIT, GPU 전용)입니다. 둘 다 Hugging Face `audiojs/*`에서 고정 리비전으로 받아 SHA-256을 확인한 뒤 Cache Storage("audio-neural")에 둡니다. 전용 워커(`separation-worker.js`)에서 onnxruntime-web 1.30으로 돌리고(WASM 파일은 jsDelivr), WebGPU가 있으면 GPU, 없으면 CPU입니다. 분리 실패 시 원곡으로 인식합니다. 결과 화면에서 분리된 보컬을 들어 볼 수 있습니다. 예전 Kim Vocal 2는 가중치에 라이선스 표기가 없어 2026-10-24에 뺐습니다.
2. 인식: 분리된 보컬은 노래하는 구간만 골라 숨 쉬는 지점에서 창을 나눠 Whisper에 넣습니다(긴 간주·무음은 건너뜀). 가사를 미리 알기 때문에, 가사에 있는 토큰과 가사 흐름을 잇는 다음 토큰에 작은 가중치를 줍니다(애매할 때만 가사 쪽으로 기울고, 확실히 들린 말은 그대로).
3. 발음 비교: 한국어는 소리 나는 대로 바꿔 비교합니다(있어=이써, 없는=엄는, 같이=가치, 좋다=조타 등). 일본어는 발음 줄(한글)에서 한자 읽기를 배워, 가사의 한자와 인식된 가나를 같은 소리로 봅니다.
4. 정렬: 가사 전체를 인식 결과에 한 번에 맞춥니다(기존과 같음). 결과 화면 맨 위에 "평균 일치율"이 나옵니다.

- 코드: `frontend/src/lib/separation/`(모델 목록, 워커 실행, 리샘플), `frontend/src/workers/separation.worker.ts`, `frontend/src/lib/sync/lyric-bias.ts`, `kanji-readings.ts`, `pronunciation.ts`, `windows.ts`(planVoicedWindows)
- 측정 테스트: `frontend/src/lib/sync/__tests__/sync-benchmark.test.ts`

## 참고

- 데이터베이스는 쓰지 않습니다(`DATABASES = {}`). 작업 내용은 브라우저 저장소에 남습니다.
- Whisper 모델과 보컬 분리 모델 파일은 처음 한 번 Hugging Face에서 받아 브라우저에 캐시합니다. 인식·분리용 WASM 파일은 jsDelivr에서 받습니다.

## 라이선스와 글꼴

- 이 앱 자체 코드는 `LICENSE`(Copyright © 2026 i2nu, All rights reserved)를 따릅니다.
- `/licenses/` 페이지(`templates/licenses.html`, 첫 화면 아래 링크)에 묶인 라이브러리·글꼴·실행 중에 받는 파일(모델, FFmpeg, Mixkit)과 라이선스가 나옵니다. 원문은 `static/licenses/THIRD_PARTY_NOTICES.txt`이고, `npm run build`가 실제로 번들에 들어간 패키지(esbuild metafile)와 `static/fonts/`를 보고 다시 씁니다. 페이지의 "실행 중에 받는 파일" 표는 `studio/views.py`의 `RUNTIME_DOWNLOADS`를 손으로 고칩니다.
- 글꼴은 Google Fonts에 요청하지 않고 `static/fonts/`에서 내보냅니다(보는 사람의 IP가 제3자에게 가지 않음). 목록은 `frontend/fonts.json`, 바꿨을 때만 `cd frontend && node scripts/vendor-fonts.mjs`로 다시 만듭니다. 모두 SIL OFL이고 Kosugi Maru·Permanent Marker만 Apache-2.0입니다.
- FFmpeg(GPL-2.0-or-later)은 앱에 넣지 않고 ProRes로 내보낼 때만 브라우저가 CDN에서 받습니다.
- 음원·소재를 올리는 칸과 내보내기 칸에 "권리가 있는 소재만" 안내가 있습니다(`components/ui/rights-note.tsx`).
- `onnxruntime-node`는 `frontend/stubs/`의 빈 패키지로 대체했습니다(브라우저 전용 앱이라 쓰지 않음).
- 린트는 `eslint-config-next` 대신 `typescript-eslint` + `eslint-plugin-react-hooks`, CSS는 Tailwind CLI 대신 `@tailwindcss/postcss`를 씁니다. 둘 다 취약한 `braces` 패키지를 끌어오던 의존성을 없애기 위해서이며, `npm audit` 결과는 0건입니다.
