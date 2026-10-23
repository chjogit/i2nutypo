# Kinetic Typo Studio (Django)

음원과 가사로 키네틱 타이포그라피 영상을 만드는 웹 앱입니다. Django가 페이지 한 장을 내주고, 편집기는 전부 브라우저에서 돕니다. 음원과 이미지는 서버로 올라가지 않습니다.

## 폴더 구조

| 경로                                | 내용                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `config/`                           | Django 설정(`settings.py`), URL, WSGI 진입점(`wsgi.py`, Vercel이 사용)  |
| `studio/`                           | 페이지 뷰(`views.py`), URL, 페이지 템플릿 `templates/studio/index.html` |
| `static/css/studio.css`             | 편집기 스타일 (빌드 결과)                                               |
| `static/js/studio.js`               | 편집기 (빌드 결과)                                                      |
| `static/js/whisper-worker.js`       | 음성 인식 워커 (빌드 결과)                                              |
| `frontend/`                         | 편집기 원본 소스(TypeScript/React)와 빌드 스크립트                      |
| `requirements.txt`, `vercel.json`   | Python 의존성, Vercel 배포 설정                                         |

`static/`의 파일은 `frontend/`에서 빌드해 만들고, 그대로 커밋합니다. Vercel은 Node 빌드 없이 이 파일을 바로 내보냅니다.

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

## 참고

- 데이터베이스는 쓰지 않습니다(`DATABASES = {}`). 작업 내용은 브라우저 저장소에 남습니다.
- Whisper 모델 파일은 처음 한 번 Hugging Face에서 받아 브라우저에 캐시합니다. 인식용 WASM 파일은 jsDelivr에서 받습니다.
- `onnxruntime-node`는 `frontend/stubs/`의 빈 패키지로 대체했습니다(브라우저 전용 앱이라 쓰지 않음).
- 린트는 `eslint-config-next` 대신 `typescript-eslint` + `eslint-plugin-react-hooks`, CSS는 Tailwind CLI 대신 `@tailwindcss/postcss`를 씁니다. 둘 다 취약한 `braces` 패키지를 끌어오던 의존성을 없애기 위해서이며, `npm audit` 결과는 0건입니다.
