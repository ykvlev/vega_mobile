"""Check local links in the maintained stage navigation, without network access."""
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
files = [root / "README.md", *sorted((root / "docs/etapy").glob("*.md"))]
checked = 0
for source in files:
    for target in re.findall(r"\]\(([^)]+)\)", source.read_text()):
        if "://" in target or target.startswith("#"):
            continue
        destination = (source.parent / target.split("#", 1)[0]).resolve()
        if not destination.is_relative_to(root) or not destination.is_file():
            raise SystemExit(f"Неверная ссылка: {source.relative_to(root)} → {target}")
        checked += 1
print(f"Навигация: проверены {len(files)} файлов и {checked} локальных ссылок")
