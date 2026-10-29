#!/usr/bin/env python3
"""Build the GitHub Pages mirror of README.md.

The page is deliberately just a rendered README: no app server, no database,
no model calls. Run from CI or locally with `python3 demo/build.py`.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "demo"
README = ROOT / "README.md"
ASSETS = ROOT / "assets" / "readme"
GOUTE = "https://github.com/FightKK7/fengxiang"

if not README.is_file():
    raise SystemExit("README.md not found")
if not ASSETS.is_dir():
    raise SystemExit("assets/readme not found")

body = markdown.markdown(
    README.read_text(encoding="utf-8"),
    extensions=["extra", "sane_lists"],
    output_format="html5",
)


def rewrite_href(match: re.Match[str]) -> str:
    href = match.group(1)
    if href.startswith(("http://", "https://", "#", "mailto:", "data:")):
        return match.group(0)
    path, sep, fragment = href.partition("#")
    target = ROOT / path
    if not target.exists():
        return match.group(0)
    kind = "tree" if target.is_dir() else "blob"
    suffix = f"#{fragment}" if sep else ""
    return f'href="{GOUTE}/{kind}/main/{href}{suffix}"'


body = re.sub(r'href="([^"]+)"', rewrite_href, body)

html = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>风向 · README</title>
  <meta name="description" content="风向 README 的静态镜像。">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23ffffff'/%3E%3Crect x='8' y='8' width='48' height='48' fill='%23111110'/%3E%3Cpath d='M22 20h20v5H36v19h-5V25H22z' fill='%23ffffff'/%3E%3C/svg%3E">
  <link rel="stylesheet" href="readme.css">
</head>
<body>
  <header class="readme-top">
    <a class="readme-brand" href="./">风向 <span>README</span></a>
    <a class="readme-source" href="{GOUTE}#readme">在 GitHub 打开 README ↗</a>
  </header>

  <main class="readme-wrap">
    <article class="markdown-body">
{body}
    </article>
  </main>

  <footer class="readme-foot">
    <p>这是 README 的静态镜像，不是实时服务。最新内容以 <a href="{GOUTE}#readme">GitHub README</a> 为准。</p>
  </footer>
</body>
</html>
"""

DEMO.mkdir(exist_ok=True)
(DEMO / "index.html").write_text(html, encoding="utf-8")

target_assets = DEMO / "assets" / "readme"
if target_assets.exists():
    shutil.rmtree(target_assets)
target_assets.parent.mkdir(parents=True, exist_ok=True)
shutil.copytree(ASSETS, target_assets)

print(f"built {DEMO / 'index.html'} from README.md ({len(body)} bytes)")
