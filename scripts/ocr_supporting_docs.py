#!/usr/bin/env python3
"""OCR Supporting Docs and search cached text."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from ocr_tools import (  # noqa: E402
    DOCS_ROOT,
    CACHE_ROOT,
    choose_max_pages,
    extract_document_text,
    iter_supporting_docs,
    search_cached_docs,
    should_skip_file,
)


def cmd_one(path: Path, force: bool, max_pages: int | None) -> int:
    doc = extract_document_text(path, force_ocr=force, max_pages=max_pages)
    print(json.dumps({
        "file": str(path.relative_to(ROOT)).replace("\\", "/"),
        "method": doc.method,
        "cached": doc.cached,
        "cache_file": str(doc.cache_file.relative_to(ROOT)).replace("\\", "/") if doc.cache_file else None,
        "chars": len(doc.text),
        "preview": doc.text[:500],
    }, indent=2))
    return 0


def cmd_folder(folder: Path, force: bool, max_pages: int | None, batch_cap: int) -> int:
    target = folder if folder.is_absolute() else ROOT / folder
    if not target.exists():
        print(json.dumps({"error": f"Folder not found: {target}"}, indent=2))
        return 1

    files = [
        path
        for path in sorted(target.rglob("*"))
        if path.is_file() and not should_skip_file(path) and path.suffix.lower() in {".pdf", ".docx", ".xlsx", ".ods", ".pptx", ".heic", ".jpg", ".jpeg", ".png", ".tif", ".tiff"}
    ]
    results = []
    for index, path in enumerate(files, start=1):
        per_file_pages = choose_max_pages(path, max_pages, batch_cap=batch_cap)
        print(f"[{index}/{len(files)}] {path.relative_to(ROOT)}", flush=True)
        try:
            doc = extract_document_text(path, force_ocr=force, max_pages=per_file_pages)
            results.append({
                "file": str(path.relative_to(ROOT)).replace("\\", "/"),
                "method": doc.method,
                "chars": len(doc.text),
                "cached": doc.cached,
                "max_pages": per_file_pages,
            })
        except Exception as exc:  # noqa: BLE001
            results.append({
                "file": str(path.relative_to(ROOT)).replace("\\", "/"),
                "error": str(exc),
            })

    summary_path = CACHE_ROOT / f"{target.name.lower().replace(' ', '-')}-index.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nWrote {summary_path.relative_to(ROOT)}")
    return 0


def cmd_all(force: bool, max_pages: int | None, batch_cap: int) -> int:
    files = iter_supporting_docs()
    results = [{"note": "Skipped files matching: market study"}]
    for index, path in enumerate(files, start=1):
        per_file_pages = choose_max_pages(path, max_pages, batch_cap=batch_cap)
        print(f"[{index}/{len(files)}] {path.relative_to(ROOT)}", flush=True)
        try:
            doc = extract_document_text(path, force_ocr=force, max_pages=per_file_pages)
            results.append({
                "file": str(path.relative_to(ROOT)).replace("\\", "/"),
                "method": doc.method,
                "chars": len(doc.text),
                "cached": doc.cached,
                "max_pages": per_file_pages,
            })
        except Exception as exc:  # noqa: BLE001
            results.append({
                "file": str(path.relative_to(ROOT)).replace("\\", "/"),
                "error": str(exc),
            })
    summary_path = CACHE_ROOT / "index.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nWrote {summary_path.relative_to(ROOT)}")
    return 0


def cmd_search(query: str, limit: int) -> int:
    hits = search_cached_docs(query, limit=limit)
    print(json.dumps(hits, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="OCR and search Supporting Docs")
    parser.add_argument("--file", type=Path, help="OCR a single file under Supporting Docs")
    parser.add_argument("--folder", type=Path, help="OCR all supported files under a Supporting Docs subfolder")
    parser.add_argument("--all", action="store_true", help="OCR/index all supported files")
    parser.add_argument("--search", type=str, help="Search cached/native text for a query")
    parser.add_argument("--force", action="store_true", help="Force OCR even if native text exists")
    parser.add_argument("--max-pages", type=int, default=None, help="Limit PDF pages processed")
    parser.add_argument("--batch-cap", type=int, default=50, help="Default OCR page cap for large scanned PDFs")
    parser.add_argument("--limit", type=int, default=20, help="Search result limit")
    args = parser.parse_args()

    if args.search:
        return cmd_search(args.search, args.limit)
    if args.file:
        path = args.file if args.file.is_absolute() else ROOT / args.file
        return cmd_one(path, args.force, args.max_pages)
    if args.folder:
        return cmd_folder(args.folder, args.force, args.max_pages, args.batch_cap)
    if args.all:
        return cmd_all(args.force, args.max_pages, args.batch_cap)

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
