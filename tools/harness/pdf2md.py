"""Extract structured content from PDF files: text, tables, images, headings."""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from pathlib import Path
import pymupdf


@dataclass
class Block:
    kind: str  # "heading", "paragraph", "table", "image", "list"
    level: int = 0
    text: str = ""
    rows: list[list[str]] = field(default_factory=list)
    image_data: bytes | None = None
    image_ext: str = "png"
    page: int = 0
    needs_ocr: bool = False
    needs_description: bool = False


def extract_pdf(path: Path) -> tuple[list[Block], dict]:
    """Return (blocks, meta). Meta includes page_count, ocr_pages, etc."""
    doc = pymupdf.open(str(path))
    blocks: list[Block] = []
    meta = {"page_count": len(doc), "ocr_pages": [], "figures": 0, "skipped_pages": []}

    for page_idx, page in enumerate(doc):
        text = page.get_text("text").strip()
        has_text = len(text) > 80

        images = page.get_images(full=True)

        if not has_text and images:
            meta["ocr_pages"].append(page_idx + 1)
            blocks.extend(_ocr_page(page, page_idx, images, doc))
            continue

        if not has_text and not images:
            meta["skipped_pages"].append(page_idx + 1)
            continue

        blocks.extend(_parse_page_text(page, page_idx))

        for img_info in images:
            xref = img_info[0]
            try:
                img_bytes = doc.extract_image(xref)["image"]
                ext = doc.extract_image(xref).get("ext", "png")
                blocks.append(Block(
                    kind="image",
                    image_data=img_bytes,
                    image_ext=ext,
                    page=page_idx + 1,
                    needs_description=True,
                ))
                meta["figures"] += 1
            except Exception:
                pass

    doc.close()
    return blocks, meta


def _parse_page_text(page, page_idx: int) -> list[Block]:
    blocks: list[Block] = []
    blocks_data = page.get_text("dict", flags=pymupdf.TEXT_PRESERVE_WHITESPACE)
    paragraphs: list[str] = []
    current_heading = 0
    heading_re = re.compile(r"^(?:chapter|section|slide|\d+\.\d+|\d+\))\s", re.I)
    font_sizes = []

    for block in blocks_data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            line_text = "".join(s["text"] for s in line.get("spans", [])).strip()
            if not line_text:
                continue
            max_size = max((s["size"] for s in line.get("spans", [])), default=12)
            font_sizes.append(max_size)

            is_heading = False
            if max_size >= 16:
                is_heading = True
            elif heading_re.match(line_text) and len(line_text) < 120:
                is_heading = True
            bold_spans = [s for s in line.get("spans", []) if "Bold" in s.get("font", "")]
            if bold_spans and len(line_text) < 100 and line_text.endswith((".", ":", "")) is False:
                if len(line_text.split()) <= 12:
                    is_heading = True

            if is_heading:
                if paragraphs:
                    blocks.append(Block(kind="paragraph", text="\n".join(paragraphs), page=page_idx + 1))
                    paragraphs = []
                level = 2 if max_size >= 18 else 3 if max_size >= 15 else 4
                blocks.append(Block(kind="heading", level=min(level, 4), text=line_text, page=page_idx + 1))
            else:
                paragraphs.append(line_text)

    if paragraphs:
        blocks.append(Block(kind="paragraph", text="\n".join(paragraphs), page=page_idx + 1))

    return blocks


def _ocr_page(page, page_idx: int, images: list, doc) -> list[Block]:
    blocks: list[Block] = []
    text = ""
    try:
        text = page.get_text("text").strip()
    except Exception:
        pass

    if text:
        blocks.append(Block(kind="paragraph", text=f"[OCR page {page_idx + 1}]\n{text}", page=page_idx + 1, needs_ocr=True))
    else:
        blocks.append(Block(kind="paragraph", text=f"[OCR page {page_idx + 1} — no text layer]", page=page_idx + 1, needs_ocr=True))

    for img_info in images:
        xref = img_info[0]
        try:
            extracted = doc.extract_image(xref)
            blocks.append(Block(
                kind="image",
                image_data=extracted["image"],
                image_ext=extracted.get("ext", "png"),
                page=page_idx + 1,
                needs_description=True,
            ))
        except Exception:
            pass

    return blocks
