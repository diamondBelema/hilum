#!/usr/bin/env python3
"""Stage 0 intake: inventory, classify, assign course, dedupe, stage into inbox/."""
import argparse, hashlib, json, os, re, shutil, sys, unicodedata
from pathlib import Path
from collections import defaultdict

VAULT = Path(__file__).resolve().parent.parent / "vault"
INBOX = VAULT / "inbox"
REPORT = VAULT / "INTAKE_REPORT.md"

EXCLUDE_EXTS = {".lnk", ".tmp", ".ds_store"}
SKIP_PREFIXES = ("~$", ".", "Thumbs.db")

COURSE_PATTERNS = [
    (r"ana[\s_-]?202", "ana-202"),
    (r"ana[\s_-]?221", "ana-221"),
    (r"ana[\s_-]?222", "ana-222"),
    (r"ana[\s_-]?223", "ana-223"),
    (r"ana[\s_-]?211", "ana-211"),
    (r"ana[\s_-]?212", "ana-212"),
    (r"ana[\s_-]?213", "ana-213"),
    (r"ana[\s_-]?222", "ana-222"),
    (r"ana[\s_-]?301", "ana-301"),
    (r"ana[\s_-]?303", "ana-303"),
    (r"ana[\s_-]?305", "ana-305"),
    (r"ana[\s_-]?307", "ana-307"),
    (r"bch[\s_-]?202", "bch-202"),
    (r"bch[\s_-]?203", "bch-203"),
    (r"bch[\s_-]?204", "bch-204"),
    (r"bch[\s_-]?205", "bch-205"),
    (r"bch[\s_-]?206", "bch-206"),
    (r"bch[\s_-]?208", "bch-208"),
    (r"bch[\s_-]?209", "bch-209"),
    (r"bch[\s_-]?210", "bch-210"),
    (r"bch[\s_-]?227", "bch-227"),
    (r"bch[\s_-]?234", "bch-234"),
    (r"bch[\s_-]?235", "bch-235"),
    (r"phs[\s_-]?202", "phs-202"),
    (r"phs[\s_-]?204", "phs-204"),
    (r"phs[\s_-]?205", "phs-205"),
    (r"phs[\s_-]?206", "phs-206"),
    (r"phs[\s_-]?213", "phs-213"),
    (r"phs[\s_-]?301", "phs-301"),
    (r"phs[\s_-]?303", "phs-303"),
    (r"mdh[\s_-]?202", "mdh-202"),
    (r"mdh[\s_-]?203", "mdh-203"),
    (r"mdh[\s_-]?204", "mdh-204"),
    (r"gst[\s_-]?223", "gst-223"),
    (r"csc[\s_-]?101", "csc-101"),
    (r"css[\s_-]?201", "css-201"),
    (r"css[\s_-]?202", "css-202"),
]

SUBJECT_KEYWORDS = [
    (r"anatomy|thorax|abdomen|pelvis|perineum|histology|embryology|embryo|gross|upper limb|lower limb|skull|cranial|brain|cerebellum|cerebrum|osteology|ligament|fascia|face|eye|ear|tongue|thyroid|hyoid|spinal|vertebra|pelvic|axilla|forearm|gluteal|knee|hip|arm\b|leg\b|stomach|intestine|peritoneum|mediastinum|pleura|lung|diaphragm|liver|gallbladder|pancreas|spleen|kidney|ureter|bladder|reproductive|prostate|uterus|ovary|testis|epithel|cartilage|connective|muscle|bone|joint|nerve|lymphoid|histolog", "anatomy"),
    (r"bch|biochem|amino|carbohydrate|carb|lipid|protein|enzyme|nucleotide|nucleic|vitamin|metabol|glycol|bioenerg|dna|rna|molecular", "biochemistry"),
    (r"physio|phs|respirat|cardio|cvs|renal|nephron|neurophysio|blood|circulat|acid.base|body fluid|temperature|endocrine|gastrointest|reproduc.*physio|pathophysiolo", "physiology"),
    (r"community|com med|sociolog|psycholog|epidemio|biostat|public health|medical educ|history of med|environment", "community-medicine"),
    (r"entrepreneur", "entrepreneurship"),
    (r"multidisciplinary|computer in medicine|clinical skill", "mdh"),
]

PAPER_RE = re.compile(r"past\s*paper|past\s*question|viva|exam\s*question|question\s*paper|examination", re.I)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def classify_ext(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in (".pptx", ".ppt"):
        return "pptx"
    if ext == ".pdf":
        return "pdf"
    if ext in (".jpg", ".jpeg", ".png", ".webp"):
        return "photo"
    if ext in (".doc", ".docx"):
        return "docx"
    if ext == ".mp4":
        return "video"
    return "other"


def sniff_pdf(path: Path) -> str:
    try:
        import pymupdf
        doc = pymupdf.open(str(path))
        total_chars = 0
        for page in doc:
            total_chars += len(page.get_text().strip())
        doc.close()
        pages = max(1, len(doc))
        return "pdf_text" if total_chars / pages > 100 else "pdf_scanned"
    except Exception:
        return "pdf_unknown"


def assign_course(filename: str, rel_path: str) -> str | None:
    text = filename + " " + rel_path
    for pat, code in COURSE_PATTERNS:
        if re.search(pat, text, re.I):
            return code
    return None


def assign_subject(filename: str, rel_path: str) -> str | None:
    text = filename + " " + rel_path
    for pat, subj in SUBJECT_KEYWORDS:
        if re.search(pat, text, re.I):
            return subj
    return None


def is_past_paper(filename: str) -> bool:
    return bool(PAPER_RE.search(filename))


def norm_name(name: str) -> str:
    name = unicodedata.normalize("NFKD", name).lower()
    name = re.sub(r"[\s_\-\.]+", " ", name).strip()
    name = re.sub(r"^\d+[\s\.]*", "", name)
    return name


def collect_files(roots: list[Path]) -> list[dict]:
    entries = []
    for root in roots:
        for p in sorted(root.rglob("*")):
            if not p.is_file():
                continue
            if p.name.startswith(SKIP_PREFIXES):
                continue
            if p.suffix.lower() in EXCLUDE_EXTS:
                continue
            rel = str(p.relative_to(root))
            entries.append({
                "path": str(p),
                "rel": rel,
                "name": p.name,
                "ext": p.suffix.lower(),
                "size": p.stat().st_size,
                "root": root.name,
            })
    return entries


def main():
    ap = argparse.ArgumentParser(description="Stage 0 intake")
    ap.add_argument("sources", nargs="+", help="Source directories to scan")
    ap.add_argument("--vault", default=str(VAULT))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--copy", action="store_true", help="Copy files into inbox (default: symlink)")
    args = ap.parse_args()

    vault = Path(args.vault)
    inbox = vault / "inbox"
    report_path = vault / "INTAKE_REPORT.md"

    roots = [Path(s).resolve() for s in args.sources]
    for r in roots:
        if not r.is_dir():
            print(f"ERROR: {r} is not a directory", file=sys.stderr)
            sys.exit(1)

    print(f"Scanning {len(roots)} roots ...")
    entries = collect_files(roots)
    print(f"Found {len(entries)} files")

    seen_hashes: dict[str, dict] = {}
    exact_dupes: list[dict] = []
    norm_names: dict[str, list[dict]] = defaultdict(list)
    report_rows: list[dict] = []

    for e in entries:
        digest = sha256(Path(e["path"]))
        e["sha256"] = digest

        if digest in seen_hashes:
            e["duplicate_of"] = seen_hashes[digest]["rel"]
            e["role"] = "duplicate"
            exact_dupes.append(e)
        else:
            seen_hashes[digest] = e
            e["duplicate_of"] = None
            e["role"] = "primary"

        ftype = classify_ext(Path(e["path"]))
        if ftype == "pdf":
            ftype = sniff_pdf(Path(e["path"]))
        e["kind"] = ftype

        e["course"] = assign_course(e["name"], e["rel"]) or assign_course(e["name"], "")
        e["subject"] = assign_subject(e["name"], e["rel"])
        e["is_past_paper"] = is_past_paper(e["name"])

        nn = norm_name(Path(e["name"]).stem)
        norm_names[nn].append(e)

        confidence = "high" if e["course"] else ("medium" if e["subject"] else "low")
        e["confidence"] = confidence
        report_rows.append(e)

    near_dupes = {k: v for k, v in norm_names.items() if len(v) > 1 and len({x["sha256"] for x in v}) > 1}

    unsorted = [r for r in report_rows if r["confidence"] == "low"]
    assigned = [r for r in report_rows if r["confidence"] != "low"]

    print(f"  exact duplicates: {len(exact_dupes)}")
    print(f"  near-duplicate groups: {len(near_dupes)}")
    print(f"  assigned: {len(assigned)}, unsorted: {len(unsorted)}")

    if not args.dry_run:
        for e in report_rows:
            if e["role"] == "duplicate":
                continue
            course = e["course"] or "_unsorted"
            dest_dir = inbox / course
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / e["name"]
            if dest.exists():
                continue
            if args.copy:
                shutil.copy2(e["path"], dest)
            else:
                try:
                    os.symlink(e["path"], dest)
                except FileExistsError:
                    pass

    write_report(report_path, report_rows, exact_dupes, near_dupes, unsorted, args.dry_run)
    print(f"Report: {report_path}")
    print("Done.")


def write_report(path, rows, exact_dupes, near_dupes, unsorted, dry_run):
    lines = ["# Intake Report", ""]
    lines.append(f"Generated: {'(dry run)' if dry_run else ''}")
    lines.append(f"Total files scanned: {len(rows)}")
    lines.append(f"Exact duplicates: {len(exact_dupes)}")
    lines.append(f"Near-duplicate groups: {len(near_dupes)}")
    lines.append(f"Unsorted (low confidence): {len(unsorted)}")
    lines.append("")

    by_course: dict[str, list] = defaultdict(list)
    for r in rows:
        if r["role"] == "duplicate":
            continue
        by_course[r["course"] or "_unsorted"].append(r)

    lines.append("## By course")
    lines.append("")
    lines.append("| Course | Count | Kinds |")
    lines.append("|--------|-------|-------|")
    for course in sorted(by_course):
        items = by_course[course]
        kinds = ", ".join(sorted({i["kind"] for i in items}))
        lines.append(f"| {course} | {len(items)} | {kinds} |")
    lines.append("")

    lines.append("## Exact duplicates (dropped)")
    lines.append("")
    for d in exact_dupes:
        lines.append(f"- `{d['rel']}` (dup of `{d['duplicate_of']}`)")
    lines.append("")

    lines.append("## Near-duplicates (same normalized name, different content)")
    lines.append("")
    for nn, group in sorted(near_dupes.items()):
        lines.append(f"- **{nn}**:")
        for g in group:
            lines.append(f"  - `{g['path']}`")
    lines.append("")

    if unsorted:
        lines.append("## Unsorted (need human review)")
        lines.append("")
        for u in unsorted:
            lines.append(f"- `{u['path']}` ({u['kind']})")
        lines.append("")

    lines.append("## Past-paper photos (vision queue)")
    lines.append("")
    for r in rows:
        if r["is_past_paper"] and r["kind"] == "photo":
            lines.append(f"- `{r['path']}` → course guess: {r['course'] or 'unknown'}")
    lines.append("")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines))


if __name__ == "__main__":
    main()
