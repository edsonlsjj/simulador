import os
import re
import sys
import json

FORBIDDEN_PATTERNS = [
    ("Header leak (EXAME DE SUFICIÊNCIA/OBTENÇÃO)", re.compile(r"EXAME\s+(?:DE\s+SUFICI[ÊE]NCIA|PARA\s+OBTEN[ÇC][ÃA]O)", re.I)),
    ("Leaked 'Resposta correta'", re.compile(r"\bResposta\s+correta\b", re.I)),
    ("Leaked 'Não há expectativa'", re.compile(r"N[ãa]o\s+h[áa]\s+expectativa", re.I)),
    ("Leaked 'GABARITO DA PROVA/OFICIAL'", re.compile(r"GABARITO\s+(?:DA\s+PROVA|OFICIAL|PROVA)", re.I)),
    ("Leaked Educat URL", re.compile(r"educat\.net\.br", re.I)),
    ("Leaked Educat metadata", re.compile(r"(?:C[óo]digo\s+externo\s+do\s+Item|Tipo\s+de\s+Item\s*:)", re.I)),
    ("Leaked 'Visualizar vídeo'", re.compile(r"Visualizar\s+v[íi]deo", re.I)),
]

UNPARSED_TABLE_OPTION_PREFIXES = [
    "classificação de risco plano de cuidados",
    "classificação de enurese exame a ser solicitado",
    "hipótese diagnóstica exame complementar",
    "diagnóstico conduta médica",
    "diagnóstico presuntivo conduta",
    "resultado conduta adequada",
    "(1) acidente ocorrido (2) animal",
]

VALID_ANSWERS = {"A", "B", "C", "D", "C/D", "ANULADA"}


def collect_all_text(q):
    chunks = [q.get("statement", "")]
    for blk in q.get("statementBlocks", []):
        if blk.get("type") == "paragraph":
            chunks.append(blk.get("text", ""))
        elif blk.get("type") == "table":
            chunks.extend(blk.get("headers", []))
            for r in blk.get("rows", []):
                chunks.extend(r)
    for blk in q.get("caseBlocks", []):
        if blk.get("type") == "paragraph":
            chunks.append(blk.get("text", ""))
        elif blk.get("type") == "table":
            chunks.extend(blk.get("headers", []))
            for r in blk.get("rows", []):
                chunks.extend(r)
    for opt in q.get("options", []):
        chunks.append(opt.get("text", ""))
        chunks.extend(opt.get("cells", []))
    return "\n".join(chunks)


def main():
    if not os.path.exists("js/question-bank.js"):
        print("ERRO: js/question-bank.js não encontrado.")
        sys.exit(1)

    with open("js/question-bank.js", "r", encoding="utf-8") as f:
        raw = f.read()

    prefix = "const QUESTION_BANK = "
    if not raw.startswith(prefix):
        print("ERRO: js/question-bank.js com cabeçalho inválido.")
        sys.exit(1)

    bank = json.loads(raw[len(prefix):].rstrip(";\r\n "))
    print(f"Auditando {len(bank)} questões em js/question-bank.js...\n")

    errors = []
    warnings = []
    seen_ids = set()

    for q in bank:
        qid = q.get("id", "<sem-id>")
        if qid in seen_ids:
            errors.append(f"[{qid}] ID duplicado!")
        seen_ids.add(qid)

        # 1. Options check
        opts = q.get("options", [])
        letters = [o.get("letter") for o in opts]
        if letters != ["A", "B", "C", "D"]:
            errors.append(f"[{qid}] Alternativas inválidas: {letters}")
        for o in opts:
            otxt = (o.get("text") or "").strip()
            if not otxt:
                errors.append(f"[{qid}] Alternativa {o.get('letter')} vazia!")
            if len(otxt) > 1050:
                errors.append(f"[{qid}] Alternativa {o.get('letter')} excessivamente longa ({len(otxt)} chars): provável fusão indevida!")
            low = otxt.lower()
            for bad_pref in UNPARSED_TABLE_OPTION_PREFIXES:
                if low.startswith(bad_pref):
                    errors.append(f"[{qid}] Alternativa {o.get('letter')} com cabeçalho de tabela achatado: '{otxt[:70]}...'")

        # 2. Answer check
        ans = q.get("answer", "")
        if ans not in VALID_ANSWERS:
            errors.append(f"[{qid}] Gabarito inválido ou ausente: '{ans}'")

        # 3. Statement check
        stmt = (q.get("statement") or "").strip()
        has_stmt_media = any(b.get("type") in ("table", "image") for b in q.get("statementBlocks", []))
        if len(stmt) < 15 and not has_stmt_media:
            errors.append(f"[{qid}] Enunciado muito curto ({len(stmt)} chars): '{stmt}'")

        # 4. Forbidden leaked strings
        all_txt = collect_all_text(q)
        for label, pat in FORBIDDEN_PATTERNS:
            m = pat.search(all_txt)
            if m:
                errors.append(f"[{qid}] {label}: trecho '{m.group(0)}'")

        # 5. Teórico-Prática context check
        if q.get("category") == "teorico-pratica":
            cblocks = q.get("caseBlocks", [])
            if not cblocks:
                errors.append(f"[{qid}] Questão teórico-prática sem caseBlocks (sem contexto/transcrição)!")

        # 6. Image file existence & explicit image reference check
        all_blocks = list(q.get("statementBlocks", [])) + list(q.get("caseBlocks", []))
        img_blocks = [b for b in all_blocks if b.get("type") == "image"]
        for ib in img_blocks:
            src = ib.get("src", "")
            if not os.path.exists(src) or os.path.getsize(src) < 500:
                errors.append(f"[{qid}] Imagem ausente ou corrompida: '{src}'")

        if re.search(r"conforme\s+imagens?\s+(?:abaixo|a\s+seguir)", stmt, re.I) and not img_blocks:
            errors.append(f"[{qid}] Enunciado cita 'conforme imagem abaixo/a seguir', mas nenhuma imagem foi extraída!")

    # Summary by edition and category
    by_ed = {}
    for q in bank:
        ed = q["edition"]
        by_ed.setdefault(ed, {"total": 0, "teorica": 0, "tp": 0, "anulada": 0, "tables": 0, "images": 0})
        by_ed[ed]["total"] += 1
        if q["category"] == "teorica":
            by_ed[ed]["teorica"] += 1
        else:
            by_ed[ed]["tp"] += 1
        if q["answer"] == "ANULADA":
            by_ed[ed]["anulada"] += 1
        if q.get("optionColumns") or any(b["type"] == "table" for b in q.get("statementBlocks", [])):
            by_ed[ed]["tables"] += 1
        if q.get("images"):
            by_ed[ed]["images"] += 1

    print("=== RESUMO POR EDIÇÃO ===")
    for ed, st in sorted(by_ed.items(), reverse=True):
        print(
            f"  • {ed}: {st['total']} questões "
            f"(Teórica={st['teorica']}, Teórico-Prática={st['tp']}, "
            f"Anuladas={st['anulada']}, Com Tabela={st['tables']}, Com Imagem={st['images']})"
        )

    if warnings:
        print(f"\nAvisos ({len(warnings)}):")
        for w in warnings[:20]:
            print("  WARN:", w)

    if errors:
        print(f"\nFALHA NA AUDITORIA ({len(errors)} erros encontrados):")
        for err in errors[:40]:
            print("  ERRO:", err)
        sys.exit(1)

    print("\n✅ AUDITORIA 100% APROVADA: 0 erros encontrados em todas as questões!")


if __name__ == "__main__":
    main()

