import hashlib
import os
from functools import lru_cache

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
