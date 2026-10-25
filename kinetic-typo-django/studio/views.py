import hashlib
import json
import os
import re
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.shortcuts import render


@lru_cache(maxsize=1)
def asset_version():
    """Changes with every deploy, so browsers fetch the new studio.js/css instead of a cached copy."""
    sha = os.environ.get("VERCEL_GIT_COMMIT_SHA", "")
    if sha:
        return sha[:12]
    try:
        data = (settings.BASE_DIR / "static" / "js" / "studio.js").read_bytes()
    except OSError:
        return "dev"
    return hashlib.sha256(data).hexdigest()[:12]


# Mirrors frontend/src/lib/mode/mode.ts; the first page lists what each step opens,
# and the header shows the hint of the open step.
MODES = [
    {
        "id": "beginner",
        "label": "입문",
        "tagline": "처음 만들어 본다면",
        "hint": "순서대로 따라 하면 영상이 완성됩니다.",
        "steps": ["테마 하나 고르기 (3종)", "음원 파일 넣기", "가사 넣고 자동 싱크", "자막 색·크기·줄바꿈 다듬기", "영상 저장"],
    },
    {
        "id": "basic",
        "label": "기본",
        "tagline": "분위기를 직접 꾸미고 싶다면",
        "hint": "테마·요소와 모든 조정 기능, 영상·자막 저장을 쓸 수 있습니다.",
        "steps": ["테마 20종, 최대 3개 섞기", "테마 요소 켜고 끄기·강도·위치", "글리치·흔들림, 컬러그레이딩·필터", "배경 이미지·앨범 커버", "영상 + 자막 파일(SRT·VTT·ASS·LRC) 저장"],
    },
    {
        "id": "pro",
        "label": "숙련",
        "tagline": "모든 연출을 쓰고 싶다면",
        "hint": "모든 기능을 쓸 수 있습니다.",
        "steps": ["기본 단계의 모든 기능", "캐릭터 등장·퇴장 연출", "소품(외부 소재) 레이어", "타임라인 캐릭터·소품 줄"],
    },
]
MODES_BY_ID = {m["id"]: m for m in MODES}


def landing(request):
    """First page: pick 입문, 기본 or 숙련. intro.html has no base or header."""
    return render(request, "intro.html", {"v": asset_version(), "modes": MODES})


def studio(request, mode):
    """The editor page for one mode, in base.html + header.html. Everything after this runs in the browser."""
    m = MODES_BY_ID[mode]
    return render(
        request,
        "studio.html",
        {"v": asset_version(), "modes": MODES, "mode": mode, "mode_label": m["label"], "mode_hint": m["hint"]},
    )


# Files the app downloads only when a feature is used. Listed by hand: they are not in the
# bundle, so build.mjs cannot see them.
RUNTIME_DOWNLOADS = [
    {
        "name": "Whisper base · small · large-v3-turbo (ONNX)",
        "use": "자동 싱크 음성 인식",
        "license": "MIT (OpenAI Whisper)",
        "source": "https://huggingface.co/onnx-community/whisper-small",
        "from": "Hugging Face (onnx-community)",
    },
    {
        "name": "SCNet (int8)",
        "use": "보컬 분리, 가볍게",
        "license": "MIT (가중치: starrytong/SCNet)",
        "source": "https://huggingface.co/audiojs/scnet",
        "from": "Hugging Face (audiojs), 고정 리비전 + SHA-256 확인",
    },
    {
        "name": "Mel-Band RoFormer (fp16)",
        "use": "보컬 분리, 정밀하게",
        "license": "MIT (가중치: KimberleyJSN/melbandroformer)",
        "source": "https://huggingface.co/audiojs/mel-roformer",
        "from": "Hugging Face (audiojs), 고정 리비전 + SHA-256 확인",
    },
    {
        "name": "onnxruntime-web WebAssembly 1.22 · 1.30",
        "use": "모델 실행",
        "license": "MIT",
        "source": "https://github.com/microsoft/onnxruntime",
        "from": "jsDelivr",
    },
    {
        "name": "FFmpeg (@ffmpeg/core 0.12.10)",
        "use": "MOV ProRes 내보내기",
        "license": "GPL-2.0-or-later",
        "source": "https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10",
        "from": "jsDelivr (실패하면 unpkg)",
    },
    {
        "name": "Mixkit 무료 배경 영상",
        "use": "배경 영상 고르기",
        "license": "Mixkit Stock Video Free License",
        "source": "https://mixkit.co/license/#videoFree",
        "from": "assets.mixkit.co",
    },
    {
        "name": "whisper.cpp ggml 모델 (데스크톱 앱만)",
        "use": "이 컴퓨터 GPU로 음성 인식",
        "license": "MIT",
        "source": "https://huggingface.co/ggerganov/whisper.cpp",
        "from": "Hugging Face (ggerganov)",
    },
]


def _static_json(*parts):
    """A JSON list written into static/ by the frontend build, or [] when it is not there."""
    try:
        return json.loads((settings.BASE_DIR / "static" / Path(*parts)).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def licenses(request):
    """Open-source notices: bundled packages, fonts, files fetched at run time, and the app's own licence."""
    return render(
        request,
        "licenses.html",
        {
            "v": asset_version(),
            "modes": MODES,
            "packages": _static_json("licenses", "packages.json"),
            "fonts": _static_json("fonts", "fonts.json"),
            "downloads": RUNTIME_DOWNLOADS,
        },
    )


DOC_SECTIONS = [
    {"id": "guide", "title": "사용법 설명서"},
    {"id": "about", "title": "프로젝트 소개"},
]


@lru_cache(maxsize=None)
def doc_headings(name):
    """The "##" headings of a rendered doc (templates/docs/_<name>.html) as (id, text), for the page's contents."""
    try:
        html = (settings.BASE_DIR / "templates" / "docs" / f"_{name}.html").read_text(encoding="utf-8")
    except OSError:
        return []
    return re.findall(r'<h2 id="([^"]+)">(.*?)</h2>', html)


def docs(request):
    """User guide and project overview, rendered from docs/*.md by docs/build.py."""
    sections = [{**s, "headings": doc_headings(s["id"])} for s in DOC_SECTIONS]
    return render(request, "docs.html", {"v": asset_version(), "modes": MODES, "sections": sections})
