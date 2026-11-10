"""Export the Django pages as a static site (for Cloudflare Workers static assets).

Usage: python scripts/build_static.py [--out DIR]   (default: dist/ inside the project)

Importing this module has no side effects; Django is set up inside main().
"""
import argparse
import os
import secrets
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# URL path -> output file
PAGES = {
    "/": "index.html",
    "/beginner/": "beginner/index.html",
    "/basic/": "basic/index.html",
    "/pro/": "pro/index.html",
    "/licenses/": "licenses/index.html",
    "/docs/": "docs/index.html",
}

NOT_FOUND_HTML = """<!doctype html>
<html lang="ko" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>페이지를 찾을 수 없습니다.</title>
<link rel="icon" href="/static/favicon.ico">
<link rel="stylesheet" href="/static/fonts/pretendard/pretendard.css">
<link rel="stylesheet" href="/static/fonts/black-han-sans/black-han-sans.css">
<link rel="stylesheet" href="/static/css/studio.css?v=__V__">
</head>
<body class="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
<main class="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-6 px-4 md:px-10">
<p class="font-display text-3xl">페이지를 찾을 수 없습니다.</p>
<p><a href="/" class="text-zinc-300 underline underline-offset-4 hover:text-zinc-50">처음으로</a></p>
</main>
</body>
</html>
"""

# Cache rules from vercel.json and security headers from config/settings.py.
# "! Cache-Control" detaches the value set by /static/* so the two do not merge.
HEADERS = """/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=2592000

/static/*
  Cache-Control: public, max-age=0, must-revalidate

/static/fonts/*
  ! Cache-Control
  Cache-Control: public, max-age=604800
"""


def setup_django():
    os.environ.pop("VERCEL_GIT_COMMIT_SHA", None)  # asset version must be the content hash
    os.environ["DJANGO_SECRET_KEY"] = secrets.token_hex(32)
    os.environ["DJANGO_ALLOWED_HOSTS"] = "testserver"
    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"
    sys.path.insert(0, str(ROOT))
    import django

    django.setup()


def check_out_dir(out):
    """Refuse an output directory whose removal would destroy the source tree."""
    if out == ROOT or out in ROOT.parents:
        return f"refusing --out {out}: it is the project root or one of its parents"
    static = ROOT / "static"
    if out == static or static in out.parents:
        return f"refusing --out {out}: it is the source static/ directory or inside it"
    return None


def build(out):
    from django.test import Client
    from studio.views import asset_version

    error = check_out_dir(out)
    if error:
        print(error, file=sys.stderr)
        return 1
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    client = Client()
    for url, rel in PAGES.items():
        response = client.get(url, secure=True)
        if response.status_code != 200:
            print(f"FAIL {url} -> {response.status_code}", file=sys.stderr)
            return 1
        target = out / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(response.content)
        print(url)

    shutil.copytree(ROOT / "static", out / "static")
    (out / "404.html").write_text(NOT_FOUND_HTML.replace("__V__", asset_version()), encoding="utf-8")
    (out / "_headers").write_text(HEADERS, encoding="utf-8")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--out",
        default=str(ROOT / "dist"),
        help="output directory (default: dist/ inside the project, whatever the current directory)",
    )
    args = parser.parse_args(argv)
    setup_django()
    return build(Path(args.out).resolve())


if __name__ == "__main__":
    sys.exit(main())
