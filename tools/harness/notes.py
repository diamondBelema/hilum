"""Build markdown notes from extracted blocks: frontmatter, anchors, splitting, indexes."""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from pathlib import Path
from datetime import date

TOKEN_RATIO = 4  # chars per token estimate


def estimate_tokens(text: str) -> int:
    return len(text) // TOKEN_RATIO


def slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s_]+", "-", text).strip("-")


def make_anchor(idx: int) -> str:
    return f"s{idx}"


@dataclass
class NoteSection:
    heading: str
    level: int
    anchor: str
    body: str = ""


@dataclass
class Note:
    path: str
    title: str
    course: str
    topics: list[str]
    source: str
    pages: str
    ocr: bool = False
    summary: str = ""
    sections: list[NoteSection] = field(default_factory=list)

    def to_markdown(self) -> str:
        fm_parts = [f"---", f"course: {self.course}", f"title: {self.title}"]
        if self.topics:
            fm_parts.append(f"topics: [{', '.join(self.topics)}]")
        fm_parts.append(f"source: {self.source}")
        if self.pages:
            fm_parts.append(f'pages: "{self.pages}"')
        fm_parts.append(f"ocr: {'true' if self.ocr else 'false'}")
        if self.summary:
            fm_parts.append(f"summary: {self.summary}")
        fm_parts.append("---")
        fm_parts.append("")
        fm_parts.append(f"# {self.title}")
        fm_parts.append("")

        for sec in self.sections:
            fm_parts.append(f"{'#' * max(sec.level, 2)} {sec.heading} {{#{sec.anchor}}}")
            fm_parts.append("")
            if sec.body:
                fm_parts.append(sec.body)
                fm_parts.append("")

        return "\n".join(fm_parts).strip() + "\n"


def split_sections(blocks, lecture_name: str, max_tokens: int = 1500) -> list[NoteSection]:
    """Split extracted blocks into sections at heading boundaries, max ~max_tokens each."""
    sections: list[NoteSection] = []
    current_heading = "Introduction"
    current_level = 2
    current_parts: list[str] = []
    current_tokens = 0
    s_counter = 0

    def flush():
        nonlocal current_parts, current_tokens, s_counter
        if not current_parts and not sections:
            return
        s_counter += 1
        sections.append(NoteSection(
            heading=current_heading,
            level=current_level,
            anchor=make_anchor(s_counter),
            body="\n\n".join(current_parts).strip(),
        ))
        current_parts = []
        current_tokens = 0

    for block in blocks:
        if block.kind == "heading":
            heading_tokens = estimate_tokens(block.text)
            if current_tokens + heading_tokens > max_tokens and current_parts:
                flush()
            current_heading = block.text
            current_level = block.level or 2
        elif block.kind == "paragraph":
            tokens = estimate_tokens(block.text)
            if current_tokens + tokens > max_tokens and current_parts:
                flush()
                current_heading = f"{current_heading} (cont.)"
            current_parts.append(block.text)
            current_tokens += tokens
        elif block.kind == "table":
            md = table_to_md(block.rows)
            tokens = estimate_tokens(md)
            if current_tokens + tokens > max_tokens and current_parts:
                flush()
            current_parts.append(md)
            current_tokens += tokens
        elif block.kind == "list":
            tokens = estimate_tokens(block.text)
            current_parts.append(block.text)
            current_tokens += tokens
        elif block.kind == "image":
            img_ref = block.image_ref if hasattr(block, "image_ref") else ""
            if img_ref:
                alt = getattr(block, "image_id", "figure")
                md = f"![{alt}]({img_ref})"
                if getattr(block, "needs_description", False):
                    md += " <!-- needs-description -->"
                current_parts.append(md)

    if current_parts:
        flush()

    return sections


def table_to_md(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    header = rows[0]
    body = rows[1:] if len(rows) > 1 else []
    lines = ["| " + " | ".join(header) + " |"]
    lines.append("|" + "---|" * len(header))
    for row in body:
        padded = list(row) + [""] * (len(header) - len(row))
        lines.append("| " + " | ".join(padded[:len(header)]) + " |")
    return "\n".join(lines)


def write_note(vault: Path, note: Note) -> Path:
    dest = vault / "courses" / note.course / note.path
    dest.parent.mkdir(parents=True, exist_ok=True)
    content = note.to_markdown()
    if dest.exists() and dest.read_text() == content:
        return dest  # idempotent: no write if identical
    dest.write_text(content)
    return dest


def generate_course_index(vault: Path, course: str, notes: list[Note]) -> str:
    lines = [f"# {course} — Index", ""]
    lines.append("| Path | Summary | Tags | Tokens |")
    lines.append("|------|---------|------|--------|")
    for note in sorted(notes, key=lambda n: n.path):
        body = note.to_markdown()
        tokens = estimate_tokens(body)
        summary = note.summary or (note.sections[0].body[:100] + "..." if note.sections else "")
        tags = ", ".join(note.topics)
        lines.append(f"| [{note.path}]({note.path}) | {summary} | {tags} | {tokens} |")
    lines.append("")
    return "\n".join(lines)


def generate_root_index(vault: Path, course_summaries: dict[str, str]) -> str:
    lines = ["# Vault Index", ""]
    for code in sorted(course_summaries):
        lines.append(f"- **{code}** — {course_summaries[code]}")
    lines.append("")
    return "\n".join(lines)


def make_summary(section_bodies: list[str], max_len: int = 160) -> str:
    """Extractive summary: first sentence of first paragraph."""
    for body in section_bodies:
        first_para = body.split("\n\n")[0]
        first_para = re.sub(r"^#+\s.*", "", first_para, flags=re.M).strip()
        first_para = re.sub(r"!\[.*?\]\(.*?\)", "", first_para).strip()
        if not first_para:
            continue
        match = re.search(r"[.!?]\s", first_para)
        if match:
            summary = first_para[:match.end()].strip()
        else:
            summary = first_para[:max_len].strip()
        if len(summary) > max_len:
            summary = summary[:max_len].rsplit(" ", 1)[0] + "..."
        if summary:
            return summary
    return section_bodies[0][:max_len] if section_bodies else ""
