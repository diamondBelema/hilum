from pathlib import Path

from tools.harness.notes import estimate_tokens, split_sections
from tools.harness.pdf2md import Block

from convert import convert


def test_split_sections_keeps_stable_anchor_and_limit():
    blocks = [
        Block(kind="heading", level=2, text="Alpha"),
        Block(kind="paragraph", text="A short paragraph."),
        Block(kind="heading", level=2, text="Beta"),
        Block(kind="paragraph", text="Another short paragraph."),
    ]
    sections = split_sections(blocks, "lecture", max_tokens=3)
    assert [section.anchor for section in sections][:2] == ["s1", "s2"]
    assert all(estimate_tokens(section.body) <= 4 for section in sections)


def test_pptx_conversion_is_idempotent(tmp_path: Path):
    pytest = __import__("pytest")
    pptx = pytest.importorskip("pptx")
    source = tmp_path / "lecture.pptx"
    presentation = pptx.Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[5])
    slide.shapes.title.text = "Stable title"
    presentation.save(source)

    vault = tmp_path / "vault"
    first = convert(source, vault, "bch-203")
    note = vault / "courses/bch-203/notes/lecture-1.md"
    before = note.read_bytes()
    second = convert(source, vault, "bch-203")
    assert first["notes"] == second["notes"] == 1
    assert note.read_bytes() == before
    assert "{#s1}" in note.read_text()
