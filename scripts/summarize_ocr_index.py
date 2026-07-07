import json
from pathlib import Path

index = json.loads(Path("Supporting Docs/_ocr_cache/index.json").read_text(encoding="utf-8"))
rows = [r for r in index if "file" in r]
print("Indexed files:", len(rows))
print("Errors:", sum(1 for r in rows if r.get("error")))
print("Empty (<100 chars):", sum(1 for r in rows if r.get("chars", 0) < 100))
print()
print("Construction-related files:")
keys = ("construction", "water", "sewer", "phase 1", "redline", "geotech", "tis", "traffic", "irrigation", "spec")
for r in rows:
    f = r["file"].lower()
    if any(k in f for k in keys):
        print(f"  {r.get('chars', 0):6d}  {r.get('method', '?'):16s}  {Path(r['file']).name}")
