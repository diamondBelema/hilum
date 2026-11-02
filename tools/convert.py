#!/usr/bin/env python3
"""Convert PPTX and PDF sources into cited, deterministic markdown notes."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from tools.harness.notes import Note, NoteSection, estimate_tokens, make_summary, split_sections, write_note
    from tools.harness.pdf2md import Block, extract_pdf
    from tools.harness.pptx2md import extract_pptx
except ModuleNotFoundError:
    from harness.notes import Note, NoteSection, estimate_tokens, make_summary, split_sections, write_note
    from harness.pdf2md import Block, extract_pdf
    from harness.pptx2md import extract_pptx

MAX_TOKENS = 1800


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value or "lecture"


def emit(event: str, **payload: object) -> None:
    print(json.dumps({"event": event, **payload}, sort_keys=True), flush=True)


def markdown_blocks_from_pptx(source: Path, assets: Path) -> tuple[list[Block], dict]:
    slides, meta = extract_pptx(source)
    blocks: list[Block] = []
    lecture = slugify(source.stem)
    for slide in slides:
        heading = Block(kind="heading", level=2, text=f"Slide {slide.index}: {slide.title or 'Untitled'}", page=slide.index)
        heading.anchor = f"s{slide.index}"
        blocks.append(heading)
        if slide.text_lines:
            blocks.append(Block(kind="paragraph", text="\n".join(slide.text_lines), page=slide.index))
        if slide.table_rows:
            blocks.append(Block(kind="table", rows=slide.table_rows, page=slide.index))
        if slide.notes:
            blocks.append(Block(kind="paragraph", text=f"> Notes:\n> {slide.notes.replace(chr(10), chr(10) + '> ')}", page=slide.index))
        for figure_index, (data, ext) in enumerate(zip(slide.images, slide.image_exts), 1):
            name = f"{lecture}-p{slide.index}-f{figure_index}.{ext}"
            dest = assets / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists() or dest.read_bytes() != data:
                dest.write_bytes(data)
            block = Block(kind="image", page=slide.index, image_ext=ext, needs_description=not bool(slide.text_lines))
            block.image_ref = f"../assets/{name}"
            block.image_id = name.rsplit(".", 1)[0]
            blocks.append(block)
    return blocks, meta


def markdown_blocks_from_pdf(source: Path, assets: Path) -> tuple[list[Block], dict]:
    blocks, meta = extract_pdf(source)
    lecture = slugify(source.stem)
    figure_index = 0
    for block in blocks:
        if block.kind != "image" or block.image_data is None:
            continue
        figure_index += 1
        name = f"{lecture}-p{block.page}-f{figure_index}.{block.image_ext}"
        dest = assets / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists() or dest.read_bytes() != block.image_data:
            dest.write_bytes(block.image_data)
        block.image_ref = f"../assets/{name}"
        block.image_id = name.rsplit(".", 1)[0]
    return blocks, meta


def write_vision_queue(vault: Path, course: str, rows: list[dict]) -> None:
    if not rows:
        return
    path = vault / "courses" / course / "VISION_QUEUE.md"
    lines = [
        "# Vision queue",
        "",
        "| Note | Page | PNG | Flag | Status |",
        "|------|------|-----|------|--------|",
    ]
    for row in rows:
        lines.append(
            f"| `{row['note']}` | {row['page']} | `{row['png']}` | "
            f"{row['flag']} | pending |"
        )
    lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    content = "\n".join(lines)
    if not path.exists() or path.read_text() != content:
        path.write_text(content)


def flag_pdf_pages(source: Path, vault: Path, course: str, meta: dict, note_path: str) -> list[dict]:
    """Write stable full-page PNGs for pages needing vision review."""
    if not meta.get("ocr_pages"):
        return []
    import pymupdf

    page_dir = vault / "courses" / course / "assets" / "pages"
    page_dir.mkdir(parents=True, exist_ok=True)
    queue: list[dict] = []
    document = pymupdf.open(str(source))
    try:
        lecture = slugify(source.stem)
        for page_number in meta["ocr_pages"]:
            name = f"{lecture}-p{page_number}.png"
            destination = page_dir / name
            if not destination.exists():
                document[page_number - 1].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False).save(str(destination))
            queue.append({
                "note": note_path,
                "page": page_number,
                "png": f"assets/pages/{name}",
                "flag": "needs-transcription",
            })
    finally:
        document.close()
    return queue


def convert(source: Path, vault: Path, course: str, max_tokens: int = MAX_TOKENS) -> dict:
    if source.suffix.lower() == ".pptx":
        blocks, meta = markdown_blocks_from_pptx(source, vault / "courses" / course / "assets")
        source_type = "lecturer_slides"
    elif source.suffix.lower() == ".pdf":
        blocks, meta = markdown_blocks_from_pdf(source, vault / "courses" / course / "assets")
        source_type = "pdf"
    else:
        raise ValueError(f"unsupported source type: {source.suffix}")

    sections = split_sections(blocks, source.stem, max_tokens=max_tokens)
    if not sections:
        sections = [NoteSection("Introduction", 2, "s1", "No extractable text was found.")]

    notes: list[Note] = []
    queue_rows: list[dict] = []
    for index, section in enumerate(sections, 1):
        body = section.body
        if estimate_tokens(body) > max_tokens:
            raise ValueError(f"section exceeds token limit: {source} ({estimate_tokens(body)} > {max_tokens})")
        note = Note(
            path=f"notes/{slugify(source.stem)}-{index}.md",
            title=source.stem if len(sections) == 1 else f"{source.stem} — Part {index}",
            course=course,
            topics=[],
            source=str(source),
            pages=str(section.anchor),
            source_type=source_type,
            trust="medium" if source.suffix.lower() == ".pdf" else "high",
            ocr=any(getattr(block, "needs_ocr", False) for block in blocks),
            summary=make_summary([body]),
            sections=[section],
        )
        destination = write_note(vault, note)
        notes.append(note)
        emit("note", path=str(destination), tokens=estimate_tokens(note.to_markdown()))

    if source.suffix.lower() == ".pdf":
        queue_rows.extend(flag_pdf_pages(source, vault, course, meta, str((vault / "courses" / course / notes[0].path).relative_to(vault))))
    for block in blocks:
        if getattr(block, "needs_description", False) and getattr(block, "image_id", None):
            queue_rows.append({
                "note": str((vault / "courses" / course / notes[0].path).relative_to(vault)),
                "page": block.page,
                "png": f"assets/{block.image_id}.{block.image_ext}",
                "flag": "needs-description",
            })
    write_vision_queue(vault, course, queue_rows)
    result = {
        "source": str(source),
        "course": course,
        "notes": len(notes),
        "tokens": [estimate_tokens(n.to_markdown()) for n in notes],
        "meta": meta,
        "vision_queue": len(queue_rows),
    }
    emit("complete", **result)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--vault", type=Path, default=Path("vault"))
    parser.add_argument("--course", required=True)
    parser.add_argument("--max-tokens", type=int, default=MAX_TOKENS)
    args = parser.parse_args(argv)
    try:
        convert(args.source.resolve(), args.vault.resolve(), args.course, args.max_tokens)
    except Exception as exc:
        emit("error", message=str(exc), source=str(args.source))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
