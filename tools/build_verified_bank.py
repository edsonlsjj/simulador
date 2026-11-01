import os
import re
import json
import hashlib
import pymupdf

ASSETS_DIR = os.path.join("assets", "questions")


def clean_inline(text):
    if not text:
        return ""
    text = text.replace("\uf0b7", "•").replace("\u00a0", " ")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    # Remove Educat leaked answer markers
    text = re.sub(r"\bResposta\s+correta\b", "", text, flags=re.I)
    text = re.sub(r"N[ãa]o\s+h[áa]\s+expectativa\s+de\s*resposta\.?", "", text, flags=re.I)
    # Collapse spaces within lines while preserving intentional newlines if needed
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\.\.(?!\.)", ".", text)
    return text.strip()


def clean_paragraph(text):
    lines = [clean_inline(line) for line in text.splitlines()]
    lines = [ln for ln in lines if ln]
    if not lines:
        return ""
    # Preserve line breaks before list items (I -, II -, 1., a), •, - speaker dialogues)
    out = [lines[0]]
    for ln in lines[1:]:
        if re.match(r"^(?:[IVX]{1,4}\s*[\-\.\)]|\d{1,2}\s*[\-\.\)]|[•\-–]|[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){0,2}\s*[–\-:])", ln):
            out.append("\n" + ln)
        else:
            out.append(" " + ln)
    joined = "".join(out)
    # Fix hyphenated word splits across lines if any
    joined = re.sub(r"\s+([,.;:?!])", r"\1", joined)
    return joined.strip()


HEADER_FOOTER_PATTERNS = [
    re.compile(r"^EXAME\s+(?:DE\s+SUFICI[ÊE]NCIA\s+)?PARA\s+OBTEN[ÇC][ÃA]O\s+DO\s*(?:T[ÍI]TULO)?", re.I),
    re.compile(r"^T[ÍI]TULO\s+DE\s+ESPECIALISTA\s+EM\s+MEDICINA", re.I),
    re.compile(r"^(?:DE\s+)?ESPECIALISTA\s+EM\s+MEDICINA\s+DE\s+FAM[ÍI]LIA", re.I),
    re.compile(r"^(?:MEDICINA\s+DE\s+FAM[ÍI]LIA\s+E\s+COMUNIDADE|FAM[ÍI]LIA\s+E\s+COMUNIDADE|E\s+COMUNIDADE)\s*[\-–]?\s*(?:PROVA|TEMFC|TE[ÓO]RICO|\d{4})", re.I),
    re.compile(r"^TE[ÓO]RICO[\-–]PR[ÁA]TICA\s*[\-–]?\s*\d{4}$", re.I),
    re.compile(r"^https?://exams-sbmfc", re.I),
    re.compile(r"^\d{2}/\d{2}/\d{4},?\s+\d{2}:\d{2}\s*(?:Exams)?$", re.I),
    re.compile(r"^Exams$", re.I),
    re.compile(r"^C[óo]digo\s+externo\s+do\s+Item\s*:?\s*\d*$", re.I),
    re.compile(r"^\d{1,3}/\d{1,3}$"),
    re.compile(r"^Tipo\s+de\s+Item\s*:", re.I),
    re.compile(r"^Multipla\s+escolha\s*[\-–]?\s*Resposta\s+[ÚU]nica$", re.I),
    re.compile(r"^escolha\s*[\-–]?\s*Resposta\s+[ÚU]nica$", re.I),
    re.compile(r"^Visualizar\s+v[íi]deo$", re.I),
]


def is_header_or_footer_block(block_text, x0, y0, y1, page_height):
    stripped = block_text.strip()
    if not stripped:
        return True
    lines = [ln.strip() for ln in stripped.splitlines() if ln.strip()]
    if not lines:
        return True

    # Pure page number at top, bottom, or far-right margin
    if len(lines) == 1 and re.match(r"^\d{1,3}(?:/\d{1,3})?$", lines[0]):
        if y0 < 98 or y0 > page_height - 108 or x0 > 460:
            return True

    # Check if ALL lines in this block match header/footer patterns
    all_hf = True
    for ln in lines:
        if not any(pat.search(ln) for pat in HEADER_FOOTER_PATTERNS):
            all_hf = False
            break
    if all_hf:
        return True
    return False


def strip_header_lines_from_block(block_text, x0, y0, page_height):
    lines = block_text.splitlines()
    has_questao = bool(re.search(r"QUEST[ÃA]O", block_text, re.I))
    kept = []
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        if re.match(r"^\d{1,3}/\d{1,3}$", s):
            continue
        if not has_questao and (y0 < 98 or y0 > page_height - 108 or x0 > 460) and re.match(r"^\d{1,3}$", s):
            continue
        if any(pat.search(s) for pat in HEADER_FOOTER_PATTERNS):
            continue
        if re.match(r"^Resposta\s+correta$", s, re.I):
            continue
        kept.append(ln)
    return "\n".join(kept).strip()


def rect_overlap_ratio(r1, r2):
    # r1, r2 = (x0, y0, x1, y1)
    ix0 = max(r1[0], r2[0])
    iy0 = max(r1[1], r2[1])
    ix1 = min(r1[2], r2[2])
    iy1 = min(r1[3], r2[3])
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    area1 = max(1.0, (r1[2] - r1[0]) * (r1[3] - r1[1]))
    return inter / area1


def detect_recurring_xrefs(doc):
    counts = {}
    for page in doc:
        seen_on_page = set()
        for im in page.get_images(full=True):
            seen_on_page.add(im[0])
        for xref in seen_on_page:
            counts[xref] = counts.get(xref, 0) + 1
    return {xref for xref, cnt in counts.items() if cnt > 2}


def extract_page_elements(doc, page_idx, exam_slug, recurring_xrefs, allow_tables=True):
    """
    Returns ordered list of geometric elements on a page:
      - {"kind": "text", "y0": ..., "x0": ..., "bbox": ..., "text": ...}
      - {"kind": "table", "y0": ..., "x0": ..., "bbox": ..., "rows": [[...]]}
      - {"kind": "image", "y0": ..., "x0": ..., "bbox": ..., "bytes": ..., "ext": "png"}
    """
    page = doc[page_idx]
    ph = page.rect.height
    pw = page.rect.width

    elements = []
    exclusion_boxes = []

    # 1. Tables / Vector diagrams (only run find_tables if drawings > 12 to avoid slow ONNX on plain pages)
    draws = page.get_drawings()
    if allow_tables and len(draws) > 12:
        tabs = page.find_tables()
        if len(tabs.tables) > 0:
            for tab in tabs.tables:
                tb = tuple(tab.bbox)
                if tb[1] < 90 and tb[3] < 110:
                    continue
                rows_clean = []
                for row in tab.rows:
                    r_cells = []
                    for cell in row.cells:
                        if cell is None:
                            r_cells.append("")
                        else:
                            cell_txt = " ".join(page.get_text("text", clip=cell).split())
                            cell_txt = clean_inline(cell_txt)
                            r_cells.append(cell_txt)
                    if any(r_cells):
                        rows_clean.append(r_cells)
                if rows_clean:
                    elements.append({
                        "kind": "table",
                        "page": page_idx,
                        "y0": tb[1],
                        "x0": tb[0],
                        "bbox": tb,
                        "rows": rows_clean,
                    })
                    exclusion_boxes.append(tb)
        elif len(draws) >= 80:
            # Complex borderless/shaded vector table or diagram (e.g., TEMFC 30 p.18 PPS table, TEMFC 29 p.61 SOAP)
            # Exclude thin tall page-divider lines (e.g. x=128.1 height=611pt in TEMFC 29/30)
            body_rects = [
                tuple(d["rect"]) for d in draws
                if d.get("rect")
                and d["rect"].y0 >= 98
                and d["rect"].y1 <= ph - 60
                and not (d["rect"].width < 4 and d["rect"].height > 220)
                and (d["rect"].width > 14 or d["rect"].height > 10)
            ]
            if body_rects:
                body_rects.sort(key=lambda r: r[1])
                clusters = []
                cur = list(body_rects[0])
                for r in body_rects[1:]:
                    if r[1] <= cur[3] + 18:
                        cur[0] = min(cur[0], r[0])
                        cur[1] = min(cur[1], r[1])
                        cur[2] = max(cur[2], r[2])
                        cur[3] = max(cur[3], r[3])
                    else:
                        clusters.append(tuple(cur))
                        cur = list(r)
                clusters.append(tuple(cur))

                for cb in clusters:
                    if (cb[2] - cb[0]) > 140 and (cb[3] - cb[1]) > 32:
                        # Check if this cluster (or up to 36pt right above it) contains option markers A - / B - / C - / D -
                        probe_rect = pymupdf.Rect(0, max(0, cb[1] - 36), pw, min(ph, cb[3] + 6))
                        clip_txt = page.get_text("text", clip=probe_rect)
                        if re.search(r"(?:^|\n)\s*[A-D]\s*[\-\)\.]", clip_txt):
                            # Don't turn options into an image! Options will be parsed cleanly as text/columns.
                            continue
                        pad_rect = pymupdf.Rect(
                            max(0, cb[0] - 4),
                            max(0, cb[1] - 2),
                            min(pw, cb[2] + 4),
                            min(ph, cb[3] + 2),
                        )
                        pix = page.get_pixmap(clip=pad_rect, dpi=170)
                        elements.append({
                            "kind": "image",
                            "page": page_idx,
                            "y0": pad_rect.y0,
                            "x0": pad_rect.x0,
                            "bbox": tuple(pad_rect),
                            "bytes": pix.tobytes("png"),
                            "ext": "png",
                        })
                        exclusion_boxes.append(tuple(pad_rect))

    # 2. Embedded clinical images (exclude recurring header/footer logos and tiny decorative lines)
    for im in page.get_images(full=True):
        xref = im[0]
        w, h = im[2], im[3]
        if xref in recurring_xrefs:
            continue
        if w < 60 or h < 35:
            continue
        rects = page.get_image_rects(xref)
        for r in rects:
            if r.y0 < 95 and r.y1 < 135:
                continue
            if r.width < 50 or r.height < 25:
                continue
            # Render the page region via get_pixmap so color spaces/masks/rotations always render accurately!
            clip_r = pymupdf.Rect(
                max(0, r.x0 - 2),
                max(0, r.y0 - 2),
                min(pw, r.x1 + 2),
                min(ph, r.y1 + 2),
            )
            if any(rect_overlap_ratio(tuple(clip_r), eb) > 0.5 for eb in exclusion_boxes):
                continue
            pix = page.get_pixmap(clip=clip_r, dpi=170)
            elements.append({
                "kind": "image",
                "page": page_idx,
                "y0": clip_r.y0,
                "x0": clip_r.x0,
                "bbox": tuple(clip_r),
                "bytes": pix.tobytes("png"),
                "ext": "png",
            })
            exclusion_boxes.append(tuple(clip_r))

    # 3. Text blocks (skipping headers/footers and anything inside table/image exclusion boxes)
    raw_blocks = page.get_text("blocks")
    text_els = []
    for b in raw_blocks:
        if b[6] != 0:  # 0 = text block
            continue
        bx0, by0, bx1, by1, btxt = b[0], b[1], b[2], b[3], b[4]
        if is_header_or_footer_block(btxt, bx0, by0, by1, ph):
            continue
        if any(rect_overlap_ratio((bx0, by0, bx1, by1), eb) > 0.45 for eb in exclusion_boxes):
            continue
        cleaned_btxt = strip_header_lines_from_block(btxt, bx0, by0, ph)
        if not cleaned_btxt:
            continue
        text_els.append({
            "kind": "text",
            "page": page_idx,
            "y0": by0,
            "x0": bx0,
            "bbox": (bx0, by0, bx1, by1),
            "text": cleaned_btxt,
        })

    # Pre-merge split left-margin "QUESTÃO" + "<number>" blocks (e.g. TEMFC 35 Prática Q1)
    consumed = set()
    for i, te in enumerate(text_els):
        if i in consumed:
            continue
        up = re.sub(r"\s+", " ", te["text"].strip().upper())
        if te["x0"] < 115 and up in ("QUESTÃO", "QUESTAO", "QUESTÃO ANULADA", "QUESTAO ANULADA"):
            for j, other in enumerate(text_els):
                if j == i or j in consumed:
                    continue
                if other["x0"] < 120 and -4 <= (other["y0"] - te["y0"]) <= 48:
                    oup = re.sub(r"\s+", " ", other["text"].strip().upper())
                    if re.match(r"^(?:ANULADA\s*)?\d{1,3}$", oup):
                        te["text"] = te["text"].strip() + " " + other["text"].strip()
                        consumed.add(j)
                        break

    # Align standalone option badges ("A.") and left-margin "QUESTÃO N" boxes with their right-hand text neighbor
    for i, te in enumerate(text_els):
        if i in consumed:
            continue
        t_strip = te["text"].strip()
        if re.match(r"^[A-D]\s*[\.\-\)]$", t_strip):
            for j, other in enumerate(text_els):
                if j == i or j in consumed:
                    continue
                if other["x0"] > te["x0"] + 6 and -12 <= (other["y0"] - te["y0"]) <= 12:
                    te["y0"] = min(te["y0"], other["y0"]) - 0.5
        elif te["x0"] < 115 and re.search(r"^QUEST[ÃA]O\b", t_strip, re.I):
            for j, other in enumerate(text_els):
                if j == i or j in consumed:
                    continue
                if other["x0"] >= 118 and -16 <= (other["y0"] - te["y0"]) <= 12:
                    te["y0"] = min(te["y0"], other["y0"]) - 0.5

    for i, te in enumerate(text_els):
        if i not in consumed:
            elements.append(te)

    # Sort in reading order: page, then vertical y0 (with 5pt tolerance for side-by-side QUESTÃO label + text), then x0
    elements.sort(key=lambda el: (el["page"], round(el["y0"] / 5.0), el["x0"]))
    return elements


# ==================== GABARITO EXTRACTORS ====================

def get_gabarito_temfc37_teorica():
    doc = pymupdf.open("data/prova37_teorica.pdf")
    gab = {}
    for pno in range(60, len(doc)):
        txt = doc[pno].get_text("text")
        idx = txt.upper().find("ALTERNATIVA CORRETA")
        if idx != -1:
            txt = txt[idx:]
        else:
            # Strip page header + page number
            lines = [ln.strip() for ln in txt.splitlines() if ln.strip()]
            lines = [ln for ln in lines if not any(p.search(ln) for p in HEADER_FOOTER_PATTERNS)]
            txt = "\n".join(lines)
        for m in re.finditer(r"\b(\d{2,3})\s+([A-D])\b", txt):
            qn = int(m.group(1))
            if 31 <= qn <= 110:
                gab[qn] = m.group(2).upper()
    # Post-resource Comunicado Definitivo TEMFC 37
    overrides = {
        49: "ANULADA",
        55: "B",
        58: "C",
        75: "D",
        77: "ANULADA",
        102: "B",
    }
    gab.update(overrides)
    return gab


def get_gabarito_temfc37_pratica():
    doc = pymupdf.open("data/prova37_pratica.pdf")
    txt = doc[-1].get_text("text")
    idx = txt.upper().find("ALTERNATIVA CORRETA")
    if idx != -1:
        txt = txt[idx:]
    gab = {}
    for m in re.finditer(r"\b(1[12]\d)\s+([A-D])\b", txt):
        gab[int(m.group(1))] = m.group(2).upper()
    return gab


def get_gabarito_temfc36_teorica():
    doc = pymupdf.open("data/prova36_teorica.pdf")
    gab = {}
    for pno in range(78, len(doc)):
        txt = doc[pno].get_text("text")
        if "Alternativa" not in txt and "Expectativa" not in txt:
            continue
        for m in re.finditer(r"\b(\d{1,2})\s+(\d{2,3})\s+([A-D])\b", txt):
            cod = int(m.group(2))
            if 31 <= cod <= 110:
                gab[cod] = m.group(3).upper()
    # Post-resource Gabarito Definitivo TEMFC 36 (por Código da Questão)
    overrides = {
        37: "B",
        49: "ANULADA",
        61: "ANULADA",
        76: "ANULADA",
        87: "D",
        92: "ANULADA",
        95: "ANULADA",
        96: "ANULADA",
        98: "ANULADA",
        100: "ANULADA",
    }
    gab.update(overrides)
    return gab


def get_gabarito_last_page_pairs(pdf_path, max_q=80):
    doc = pymupdf.open(pdf_path)
    txt = doc[-1].get_text("text")
    idx = txt.upper().find("GABARITO")
    if idx != -1:
        txt = txt[idx:]
    gab = {}
    for m in re.finditer(r"\b(\d{1,2})\s+(anulada|[A-D])\b", txt, re.I):
        qn = int(m.group(1))
        val = m.group(2).upper()
        if 1 <= qn <= max_q:
            gab[qn] = "ANULADA" if val == "ANULADA" else val
    return gab


def get_gabarito_temfc29_final():
    doc = pymupdf.open("data/gabarito29_final.pdf")
    txt = doc[0].get_text("text")
    idx = txt.upper().find("QUESTÃO")
    if idx != -1:
        txt = txt[idx:]
    gab = {}
    for m in re.finditer(r"\b(\d{1,2})\s+(ANULADA|C\s*e\s*D|[A-D])\b", txt, re.I):
        qn = int(m.group(1))
        raw = m.group(2).upper().replace(" ", "")
        if 1 <= qn <= 80:
            if raw == "CED":
                gab[qn] = "C/D"
            else:
                gab[qn] = raw
    return gab


# ==================== QUESTION & CASE SEGMENTATION ====================

CASE_HEADER_LINE_RE = re.compile(
    r"^(?:Apresenta[çc][ãa]o\s+do\s+caso\s*\d*\s*[\-–]?\s*v[íi]deo\s*\d+|V[ÍI]DEO\s+\d+)\s*$",
    re.I,
)

QUESTION_HEADER_PATTERNS = {
    "code_dash": re.compile(r"C[ÓO]DIGO\s+D[AO]\s+(?:QUEST[ÃA]O|ITEM)\s*[\u2013\-]\s*(\d+)", re.I),
    "educat": re.compile(r"Posi[çc][ãa]o:\s*(\d+)\s+C[óo]digo\s+do\s+Item:\s*(\d+)(?:\s+C[óo]digo\s+externo\s+do\s+Item:\s*\d+)?", re.I),
    "questao_cod": re.compile(r"QUEST[ÃA]O\s+(?:ANULADA\s+)?(\d+)(?:\s+Cod\s*[\-–]\s*(\d+))?", re.I),
}


def is_gabarito_section_start(text):
    u = text.upper()
    if "GABARITO DA PROVA" in u or "GABARITO OFICIAL" in u or "GABARITO PROVA" in u:
        return True
    if "POSIÇÃO DO" in u and "ALTERNATIVA" in u and "CORRETA" in u:
        return True
    if "CÓDIGO DA QUESTÃO" in u and "ALTERNATIVA CORRETA" in u:
        return True
    return False


def save_image_asset(img_bytes, question_id, idx):
    os.makedirs(ASSETS_DIR, exist_ok=True)
    fname = f"{question_id}_fig{idx}.png"
    fpath = os.path.join(ASSETS_DIR, fname)
    with open(fpath, "wb") as f:
        f.write(img_bytes)
    return f"assets/questions/{fname}"


# Tabular option headers known in TEMFC 30 (for cross-page or merged option tables)
KNOWN_TABULAR_OPTION_HEADERS = [
    (["Classificação de risco", "Plano de cuidados"], re.compile(r"^(Baixo|M[ée]dio|Alto|Muito\s+alto)\s+(.*)$", re.I | re.S)),
    (["Classificação de enurese", "Exame a ser solicitado"], re.compile(r"^(Prim[áa]ria|Secund[áa]ria|Monossintom[áa]tica|N[ãa]o\s+monossintom[áa]tica)\s+(.*)$", re.I | re.S)),
    (["Diagnóstico", "Conduta médica"], re.compile(r"^(otite\s+(?:externa|m[ée]dia\s+aguda))\s+(.*)$", re.I | re.S)),
    (["Diagnóstico presuntivo", "Conduta"], re.compile(r"^(Tor[çc][ãa]o\s+testicular|Orquiepididimite)\s+(.*)$", re.I | re.S)),
    (["(1) Acidente ocorrido", "(2) Animal", "(3) Ação do veneno", "(4) Conduta"], re.compile(r"^(laqu[ée]tico|elap[íi]dico|botr[óo]pico|crot[áa]lico)\s+(cobra\s+(?:surucucu|coral\s+verdadeira|jararaca|cascavel))\s+(a[çc][ãa]o\s+(?:coagulante|neurot[óo]xica|miot[óo]xica|hemorr[áa]gica))\s+(.*)$", re.I | re.S)),
]


def strip_empty_table_columns(rows):
    if not rows:
        return rows
    num_cols = max(len(r) for r in rows)
    keep_cols = [
        c for c in range(num_cols)
        if any((c < len(r) and r[c].strip()) for r in rows)
    ]
    return [[(r[c] if c < len(r) else "") for c in keep_cols] for r in rows]


def build_blocks_and_options(q_elements, question_id, edition, q_num):
    """
    Given ordered elements belonging to a single question, separates statement blocks and options A..D.
    Supports:
      - Standard text options (A), A -, A.)
      - 4-table options (where A, B, C, D are followed by 2-row tables, or merged into multi-option tables!)
      - Cross-page tabular options
    """
    # Step 1: Identify option marker positions across text & table elements
    flat_items = []
    for el in q_elements:
        if el["kind"] == "image":
            flat_items.append(el)
            continue

        if el["kind"] == "table":
            # Check if PyMuPDF merged multiple option sub-tables with ['B -', '', ...] separator rows (e.g. TEMFC 30 Q35)
            rows = el["rows"]
            has_opt_sep = any(
                re.match(r"^([A-D])\s*[\-\)\.]\s*$", (r[0] or "").strip())
                and all(not (c or "").strip() for c in r[1:])
                for r in rows
            )
            if has_opt_sep:
                cur_rows = []
                for r in rows:
                    m_sep = re.match(r"^([A-D])\s*[\-\)\.]\s*$", (r[0] or "").strip())
                    if m_sep and all(not (c or "").strip() for c in r[1:]):
                        if cur_rows:
                            flat_items.append({**el, "rows": strip_empty_table_columns(cur_rows)})
                            cur_rows = []
                        flat_items.append({
                            "kind": "opt_marker",
                            "letter": m_sep.group(1).upper(),
                            "rest": "",
                            "x0": el["x0"],
                            "y0": el["y0"],
                        })
                    else:
                        cur_rows.append(r)
                if cur_rows:
                    flat_items.append({**el, "rows": strip_empty_table_columns(cur_rows)})
            else:
                flat_items.append({**el, "rows": strip_empty_table_columns(rows)})
            continue

        txt = el["text"]
        # Split text block at lines that begin with an option marker: A), A -, A.
        # IMPORTANT: Only match at start of a line (not inside "(>38º C" or "vitamina B. Com")!
        lines = txt.splitlines()
        buf = []
        for ln in lines:
            s = ln.strip()
            m_opt = re.match(r"^([A-D])\s*[\)\-\.]\s*(.*)$", s)
            if m_opt:
                if buf:
                    flat_items.append({"kind": "text", "text": "\n".join(buf), "x0": el["x0"], "y0": el["y0"]})
                    buf = []
                flat_items.append({
                    "kind": "opt_marker",
                    "letter": m_opt.group(1).upper(),
                    "rest": m_opt.group(2).strip(),
                    "x0": el["x0"],
                    "y0": el["y0"],
                })
            else:
                buf.append(ln)
        if buf:
            flat_items.append({"kind": "text", "text": "\n".join(buf), "x0": el["x0"], "y0": el["y0"]})

    # Find the sequence of A, B, C, D option markers (must appear in exact order A -> B -> C -> D!)
    # If there are false-positive single letters in the statement, pick the LAST valid A->B->C->D sequence!
    marker_indices = [(idx, it["letter"]) for idx, it in enumerate(flat_items) if it["kind"] == "opt_marker"]

    chosen_abcd = None
    # Search for A, B, C, D subsequence (preferring the last A..D at the bottom of the question)
    a_positions = [idx for idx, let in marker_indices if let == "A"]
    for a_idx in reversed(a_positions):
        seq = {"A": a_idx}
        cur_pos = a_idx
        for target_let in ["B", "C", "D"]:
            nxt = next((idx for idx, let in marker_indices if idx > cur_pos and let == target_let), None)
            if nxt is None:
                break
            seq[target_let] = nxt
            cur_pos = nxt
        if len(seq) == 4:
            chosen_abcd = seq
            break

    if not chosen_abcd:
        return None

    stmt_items = flat_items[:chosen_abcd["A"]]
    opt_ranges = [
        ("A", chosen_abcd["A"], chosen_abcd["B"]),
        ("B", chosen_abcd["B"], chosen_abcd["C"]),
        ("C", chosen_abcd["C"], chosen_abcd["D"]),
        ("D", chosen_abcd["D"], len(flat_items)),
    ]

    # Build statementBlocks
    statement_blocks = []
    img_counter = 0
    images_list = []

    for it in stmt_items:
        if it["kind"] in ("text", "opt_marker"):
            raw = it["text"] if it["kind"] == "text" else f"{it['letter']}) {it['rest']}"
            cleaned = clean_paragraph(raw)
            if not cleaned:
                continue
            # Remove stray VIDEO X tag repeated inside question header
            cleaned = re.sub(r"^V[ÍI]DEO\s+\d+\s*", "", cleaned, flags=re.I).strip()
            if not cleaned:
                continue
            statement_blocks.append({"type": "paragraph", "text": cleaned})
        elif it["kind"] == "table":
            rows = it["rows"]
            if len(rows) >= 2:
                statement_blocks.append({
                    "type": "table",
                    "headers": rows[0],
                    "rows": rows[1:],
                })
            elif len(rows) == 1:
                statement_blocks.append({"type": "paragraph", "text": " | ".join(rows[0])})
        elif it["kind"] == "image":
            img_counter += 1
            rel_path = save_image_asset(it["bytes"], question_id, img_counter)
            images_list.append(rel_path)
            statement_blocks.append({
                "type": "image",
                "src": rel_path,
                "alt": f"Figura clínica da questão {q_num} ({edition})",
            })

    # Merge tiny consecutive text fragments if a sentence was split across two blocks/pages
    merged_blocks = []
    for blk in statement_blocks:
        if (
            blk["type"] == "paragraph"
            and merged_blocks
            and merged_blocks[-1]["type"] == "paragraph"
            and not re.search(r"[.!?:]$", merged_blocks[-1]["text"])
            and blk["text"][0:1].islower()
        ):
            merged_blocks[-1]["text"] = merged_blocks[-1]["text"] + " " + blk["text"]
        else:
            merged_blocks.append(blk)
    statement_blocks = merged_blocks

    # Plain-text representation of statement for fallback & search
    plain_parts = []
    for blk in statement_blocks:
        if blk["type"] == "paragraph":
            plain_parts.append(blk["text"])
        elif blk["type"] == "table":
            hdr = " | ".join(blk["headers"])
            plain_parts.append(hdr)
    statement_plain = "\n\n".join(plain_parts).strip()

    # Build options A, B, C, D
    options = []
    option_columns = None

    for letter, start_i, end_i in opt_ranges:
        sub = flat_items[start_i:end_i]
        first_rest = sub[0].get("rest", "") if sub and sub[0]["kind"] == "opt_marker" else ""

        # Check if this option contains a clean PyMuPDF 2-row table!
        opt_tables = [x for x in sub[1:] if x["kind"] == "table" and len(x["rows"]) >= 2]
        if opt_tables and not first_rest:
            t_rows = opt_tables[0]["rows"]
            cols = list(t_rows[0])
            vals = list(t_rows[1])
            # Repair cell where PyMuPDF merged column header + value into row 0 and left row 1 empty (e.g. TEMFC 30 Q73 D)
            if option_columns and len(cols) == len(option_columns) and len(vals) == len(option_columns):
                for k_col, expected_hdr in enumerate(option_columns):
                    if not vals[k_col].strip() and cols[k_col].lower().startswith(expected_hdr.lower()):
                        rem_cell = cols[k_col][len(expected_hdr):].strip()
                        if rem_cell:
                            cols[k_col] = expected_hdr
                            vals[k_col] = rem_cell
            if (
                len(cols) == len(vals)
                and all(c.strip() and v.strip() for c, v in zip(cols, vals))
                and (option_columns is None or len(cols) == len(option_columns))
            ):
                if option_columns is None:
                    option_columns = cols
                formatted = " | ".join(f"{c}: {v}" for c, v in zip(cols, vals))
                options.append({
                    "letter": letter,
                    "text": formatted,
                    "cells": vals,
                })
                continue

        # Otherwise gather text parts
        parts = []
        if first_rest:
            parts.append(first_rest)
        for x in sub[1:]:
            if x["kind"] == "text":
                parts.append(x["text"])
            elif x["kind"] == "table":
                for r in x["rows"]:
                    parts.append(" ".join(r))
            elif x["kind"] == "opt_marker":
                parts.append(f"{x['letter']}) {x['rest']}")

        opt_txt = clean_paragraph("\n".join(parts))
        # Collapse internal newlines in options to clean single space
        opt_txt = re.sub(r"\s+", " ", opt_txt).strip()

        # Check known cross-page or merged tabular option headers (e.g. TEMFC 30 Q17, Q22, Q35, Q42, Q73)
        matched_tabular = False
        for hdr_cols, val_re in KNOWN_TABULAR_OPTION_HEADERS:
            hdr_prefix = " ".join(hdr_cols)
            if opt_txt.lower().startswith(hdr_prefix.lower()):
                remainder = opt_txt[len(hdr_prefix):].strip()
                m_val = val_re.match(remainder)
                if m_val:
                    cells = [m_val.group(idx_g).strip() for idx_g in range(1, len(hdr_cols) + 1)]
                    if option_columns is None:
                        option_columns = hdr_cols
                    formatted = " | ".join(f"{c}: {v}" for c, v in zip(hdr_cols, cells))
                    options.append({
                        "letter": letter,
                        "text": formatted,
                        "cells": cells,
                    })
                    matched_tabular = True
                    break
        if not matched_tabular:
            options.append({
                "letter": letter,
                "text": opt_txt,
            })

    # Normalize: if optionColumns is set, ensure all 4 options have `cells`
    if option_columns is not None and not all("cells" in o for o in options):
        option_columns = None
        for o in options:
            o.pop("cells", None)

    return {
        "statement": statement_plain,
        "statementBlocks": statement_blocks,
        "images": images_list,
        "optionColumns": option_columns,
        "options": options,
    }


def parse_exam_document(
    pdf_path,
    edition,
    year,
    mode,
    gabarito_by_num,
    code_overrides=None,
    default_category="teorica",
    video_q_max=0,
    start_page_1idx=1,
    youtube_search_url=None,
):
    doc = pymupdf.open(pdf_path)
    recurring_xrefs = detect_recurring_xrefs(doc)
    exam_slug = edition.lower().replace(" ", "_")

    # Collect all page elements until Gabarito section starts
    all_elements = []
    for p_idx in range(start_page_1idx - 1, len(doc)):
        p_txt = doc[p_idx].get_text("text")
        # Check if entire page is instructions cover or gabarito page
        top_txt = doc[p_idx].get_text("text", clip=(0, 0, doc[p_idx].rect.width, 240))
        if p_idx > 0 and is_gabarito_section_start(top_txt):
            break
        if p_idx == 0 and ("INSTRUÇÕES" in p_txt.upper() or "VOCÊ RECEBEU" in p_txt.upper() or len(p_txt.strip()) < 220):
            continue
        if p_idx == 1 and mode in ("code_dash", "educat") and ("INSTRUÇÕES" in p_txt.upper() or "NAVEGAÇÃO PELAS QUESTÕES" in p_txt.upper() or "ENCERRAMENTO DA PROVA" in p_txt.upper()):
            continue

        page_els = extract_page_elements(doc, p_idx, exam_slug, recurring_xrefs)
        stopped = False
        for el in page_els:
            if el["kind"] == "text" and is_gabarito_section_start(el["text"]):
                stopped = True
                break
            all_elements.append(el)
        if stopped:
            break

    # Segment `all_elements` into Case Context blocks and Question blocks!
    q_re = QUESTION_HEADER_PATTERNS[mode]

    segments = []  # {"seg_type": "case"|"question", ...}
    cur_seg = None
    current_case_norm = None
    last_q_num = 0

    for el in all_elements:
        if el["kind"] == "text":
            txt = el["text"].strip()

            # 0) Standalone "Cod - 123 [ANULADA]" block in left margin (TEMFC 34 & 35)
            m_standalone_cod = re.match(r"^Cod\s*[\-–]\s*(\d+)(?:\s+ANULADA)?$", txt, re.I)
            if m_standalone_cod:
                if cur_seg is not None and cur_seg["seg_type"] == "question":
                    cur_seg["code"] = int(m_standalone_cod.group(1))
                continue

            # 0b) Missing "QUESTÃO" label in official PDF where only sequential number appears in left margin (e.g. TEMFC 29 Q11)
            if (
                mode == "questao_cod"
                and edition == "TEMFC 29"
                and el["x0"] < 88
                and 100 <= el["y0"] <= 650
                and re.match(r"^\d{1,2}$", txt)
                and int(txt) == last_q_num + 1
            ):
                q_num = int(txt)
                last_q_num = q_num
                cur_seg = {
                    "seg_type": "question",
                    "number": q_num,
                    "code": q_num,
                    "elements": [],
                }
                segments.append(cur_seg)
                continue

            # 1) Check if this block starts a Question
            m_q = q_re.search(txt)
            if m_q and txt.find(m_q.group(0)) < 35:
                if mode == "code_dash":
                    q_num = int(m_q.group(1))
                    q_code = q_num
                elif mode == "educat":
                    q_num = int(m_q.group(2))  # Use Código do Item (31..110) consistent with official gabarito!
                    q_code = q_num
                elif mode == "questao_cod":
                    q_num = int(m_q.group(1))
                    q_code = int(m_q.group(2)) if m_q.group(2) else q_num
                last_q_num = q_num

                remainder = txt[m_q.end():].strip()
                # Strip leading "Cod - 123" if on next line
                m_cod_line = re.match(r"^Cod\s*[\-–]\s*(\d+)\s*", remainder, re.I)
                if m_cod_line:
                    q_code = int(m_cod_line.group(1))
                    remainder = remainder[m_cod_line.end():].strip()

                cur_seg = {
                    "seg_type": "question",
                    "number": q_num,
                    "code": q_code,
                    "elements": [],
                }
                segments.append(cur_seg)
                if remainder:
                    cur_seg["elements"].append({**el, "text": remainder})
                continue

            # 2) Check if the first line of this block is a Case / Video header ("VÍDEO 1", "Apresentação do caso 1 - vídeo 1")
            lines_txt = [ln for ln in txt.splitlines() if ln.strip()]
            first_ln = lines_txt[0].strip() if lines_txt else ""
            m_case = CASE_HEADER_LINE_RE.match(first_ln)
            if m_case:
                title_raw = clean_inline(m_case.group(0))
                norm_key = re.sub(r"\s+", " ", title_raw.lower()).replace("í", "i")
                remainder = "\n".join(lines_txt[1:]).strip()
                if norm_key != current_case_norm:
                    current_case_norm = norm_key
                    cur_seg = {
                        "seg_type": "case",
                        "title": title_raw,
                        "elements": [],
                    }
                    segments.append(cur_seg)
                    if remainder:
                        cur_seg["elements"].append({**el, "text": remainder})
                    continue
                else:
                    # Repeated "VÍDEO 1" badge inside an already-active video's questions (TEMFC 29 & 34)
                    if remainder and cur_seg is not None:
                        cur_seg["elements"].append({**el, "text": remainder})
                    continue

        if cur_seg is not None:
            cur_seg["elements"].append(el)

    # Convert segments into final questions, attaching active case context to Teórico-Prática questions
    active_case_title = None
    active_case_blocks = []
    case_idx = 0
    questions_out = []

    for seg in segments:
        if seg["seg_type"] == "case":
            case_idx += 1
            active_case_title = seg["title"]
            active_case_blocks = []
            c_img_idx = 0
            case_slug = f"{exam_slug}_case{case_idx}"
            for cel in seg["elements"]:
                if cel["kind"] == "text":
                    cp = clean_paragraph(cel["text"])
                    cp = re.sub(r"^[_]{3,}\s*", "", cp).strip()
                    if cp:
                        active_case_blocks.append({"type": "paragraph", "text": cp})
                elif cel["kind"] == "table":
                    rows = cel["rows"]
                    if len(rows) >= 2:
                        active_case_blocks.append({"type": "table", "headers": rows[0], "rows": rows[1:]})
                elif cel["kind"] == "image":
                    c_img_idx += 1
                    rpath = save_image_asset(cel["bytes"], case_slug, c_img_idx)
                    active_case_blocks.append({
                        "type": "image",
                        "src": rpath,
                        "alt": f"Quadro complementar do {active_case_title} ({edition})",
                    })
            continue

        q_num = seg["number"]
        q_code = seg["code"]
        is_tp = (default_category == "teorico-pratica") or (video_q_max > 0 and q_num <= video_q_max)
        category = "teorico-pratica" if is_tp else "teorica"

        cat_tag = "tp" if is_tp and default_category == "teorico-pratica" and q_num <= 20 else ""
        qid = f"{exam_slug}_{cat_tag + '_' if cat_tag else ''}{q_num}"

        parsed = build_blocks_and_options(seg["elements"], qid, edition, q_num)
        if not parsed:
            print(f"  [WARN] Não foi possível extrair 4 alternativas em {qid}")
            continue

        if is_tp and not parsed["statementBlocks"] and active_case_blocks:
            default_prompt = "Com base no caso clínico apresentado, assinale a alternativa correta:"
            parsed["statement"] = default_prompt
            parsed["statementBlocks"] = [{"type": "paragraph", "text": default_prompt}]

        ans = gabarito_by_num.get(q_num, "")
        if code_overrides and q_code in code_overrides:
            ans = code_overrides[q_code]

        q_obj = {
            "id": qid,
            "edition": edition,
            "year": year,
            "number": q_num,
            "code": q_code,
            "category": category,
            "statement": parsed["statement"],
            "statementBlocks": parsed["statementBlocks"],
            "options": parsed["options"],
            "answer": ans,
        }
        if parsed["images"]:
            q_obj["images"] = parsed["images"]
        if parsed["optionColumns"]:
            q_obj["optionColumns"] = parsed["optionColumns"]

        if is_tp and active_case_blocks:
            q_obj["caseTitle"] = f"{active_case_title} • Contexto e Transcrição"
            q_obj["caseBlocks"] = active_case_blocks
            if youtube_search_url:
                q_obj["videoUrl"] = youtube_search_url

        questions_out.append(q_obj)

    print(
        f"[{edition} - {os.path.basename(pdf_path)}] Extraídas: {len(questions_out)} questões "
        f"(Teórica: {sum(1 for x in questions_out if x['category']=='teorica')}, "
        f"Teórico-Prática: {sum(1 for x in questions_out if x['category']=='teorico-pratica')}, "
        f"Anuladas: {sum(1 for x in questions_out if x['answer']=='ANULADA')})"
    )
    return questions_out


def main():
    # Clean previous generated question images
    if os.path.exists(ASSETS_DIR):
        for fn in os.listdir(ASSETS_DIR):
            if fn.endswith(".png"):
                os.remove(os.path.join(ASSETS_DIR, fn))

    all_questions = []

    # 1. TEMFC 37 (2026) - Teórica + Teórico-Prática
    gab37_t = get_gabarito_temfc37_teorica()
    all_questions.extend(parse_exam_document(
        "data/prova37_teorica.pdf",
        "TEMFC 37",
        2026,
        mode="code_dash",
        gabarito_by_num=gab37_t,
        default_category="teorica",
    ))

    gab37_p = get_gabarito_temfc37_pratica()
    all_questions.extend(parse_exam_document(
        "data/prova37_pratica.pdf",
        "TEMFC 37",
        2026,
        mode="code_dash",
        gabarito_by_num=gab37_p,
        default_category="teorico-pratica",
    ))

    # 2. TEMFC 36 (2025) - Teórica (Prática excluída pois não tem transcrição nem vídeo público)
    gab36_t = get_gabarito_temfc36_teorica()
    all_questions.extend(parse_exam_document(
        "data/prova36_teorica.pdf",
        "TEMFC 36",
        2025,
        mode="educat",
        gabarito_by_num=gab36_t,
        default_category="teorica",
    ))

    # 3. TEMFC 35 (2024) - Teórica + Teórico-Prática
    gab35_t = get_gabarito_last_page_pairs("data/prova35_teorica.pdf", max_q=80)
    all_questions.extend(parse_exam_document(
        "data/prova35_teorica.pdf",
        "TEMFC 35",
        2024,
        mode="questao_cod",
        gabarito_by_num=gab35_t,
        code_overrides={142: "ANULADA", 178: "ANULADA"},
        default_category="teorica",
    ))

    gab35_p = get_gabarito_last_page_pairs("data/prova35_pratica.pdf", max_q=10)
    all_questions.extend(parse_exam_document(
        "data/prova35_pratica.pdf",
        "TEMFC 35",
        2024,
        mode="questao_cod",
        gabarito_by_num=gab35_p,
        default_category="teorico-pratica",
        start_page_1idx=1,
    ))

    # 4. TEMFC 34 (2024) - Teórica + Teórico-Prática
    gab34_t = get_gabarito_last_page_pairs("data/prova34_teorica.pdf", max_q=80)
    all_questions.extend(parse_exam_document(
        "data/prova34_teorica.pdf",
        "TEMFC 34",
        2024,
        mode="questao_cod",
        gabarito_by_num=gab34_t,
        code_overrides={26: "ANULADA", 27: "ANULADA", 42: "ANULADA", 94: "ANULADA"},
        default_category="teorica",
    ))

    gab34_p = get_gabarito_last_page_pairs("data/prova34_pratica.pdf", max_q=10)
    all_questions.extend(parse_exam_document(
        "data/prova34_pratica.pdf",
        "TEMFC 34",
        2024,
        mode="questao_cod",
        gabarito_by_num=gab34_p,
        default_category="teorico-pratica",
        start_page_1idx=1,
    ))

    # 5. TEMFC 30 (2022) - Q1..30 Teórico-Prática + Q31..80 Teórica
    gab30 = get_gabarito_last_page_pairs("data/prova30_teorica.pdf", max_q=80)
    all_questions.extend(parse_exam_document(
        "data/prova30_teorica.pdf",
        "TEMFC 30",
        2022,
        mode="questao_cod",
        gabarito_by_num=gab30,
        default_category="teorica",
        video_q_max=30,
        start_page_1idx=1,
        youtube_search_url="https://www.youtube.com/@SBMFCoficial/search?query=TEMFC%2030",
    ))

    # 6. TEMFC 29 (2021) - Q1..30 Teórico-Prática + Q31..80 Teórica
    gab29 = get_gabarito_temfc29_final()
    all_questions.extend(parse_exam_document(
        "data/prova29_teorica.pdf",
        "TEMFC 29",
        2021,
        mode="questao_cod",
        gabarito_by_num=gab29,
        default_category="teorica",
        video_q_max=30,
        start_page_1idx=1,
        youtube_search_url="https://www.youtube.com/@SBMFCoficial/search?query=TEMFC%2029",
    ))

    print(f"\n=== TOTAL GERAL CONSOLIDADO: {len(all_questions)} QUESTÕES ===")

    with open("data/questions_parsed.json", "w", encoding="utf-8") as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    js_payload = "const QUESTION_BANK = " + json.dumps(all_questions, ensure_ascii=False, indent=2) + ";\n"
    with open("js/question-bank.js", "w", encoding="utf-8") as f:
        f.write(js_payload)

    print("Arquivos data/questions_parsed.json e js/question-bank.js atualizados com sucesso!")


if __name__ == "__main__":
    main()
