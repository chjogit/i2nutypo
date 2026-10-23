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


def index(request):
    """The editor page. Everything after this runs in the browser."""
    return render(request, "studio/index.html", {"v": asset_version()})
