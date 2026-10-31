import re
import json
import os
from pypdf import PdfReader

def clean_txt(t):
    if not t:
        return ""
    t = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', t)
    lines = [l.strip() for l in t.split('\n') if l.strip()]
    return ' '.join(lines)

def extract_gabarito(full_text):
    gabarito = {}
    matches = re.findall(r'(?:Código da Questão|Posição do Item|Item|Cod\s*-\s*)?\s*(\d{1,3})\s+([A-D])\b', full_text, re.I)
    for q, a in matches:
        qn = int(q)
        if 1 <= qn <= 120 and qn not in gabarito:
            gabarito[qn] = a.upper()
    return gabarito

def parse_pdf(pdf_path, edition, year):
    reader = PdfReader(pdf_path)
    full_text = "\n".join([p.extract_text() or '' for p in reader.pages])
    gabarito = extract_gabarito(full_text)
    
    # Normalizar quebras de linha para regex
    text = full_text
    
    # Encontrar blocos de questões
    # Padrão: (QUESTÃO \d+|CÓDIGO DA QUESTÃO [–-] \d+|Posição: \d+ Código do Item: \d+)
    q_pattern = re.compile(
        r'(?:QUEST[ÃA]O\s+(\d+)|C[ÓO]DIGO DA QUEST[ÃA]O\s*[\u2013-]\s*(\d+)|Posi[çc][ãa]o:\s*(\d+)\s+C[óo]digo do Item:\s*(\d+))',
        re.IGNORECASE
    )
    
    matches = list(q_pattern.finditer(text))
    questions = []
    
    for i in range(len(matches)):
        m = matches[i]
        start = m.end()
        end = matches[i+1].start() if i+1 < len(matches) else len(text)
        
        # Identificar número da questão
        q_num = None
        if m.group(1):
            q_num = int(m.group(1))
        elif m.group(2):
            q_num = int(m.group(2))
        elif m.group(4):
            q_num = int(m.group(4))
        elif m.group(3):
            q_num = int(m.group(3))
            
        block = text[start:end]
        
        # Ignorar se o bloco for da seção final de gabarito
        if "GABARITO" in block.upper() and ("ALTERNATIVA" in block.upper() or "CORRETA" in block.upper()):
            continue
            
        # Procurar alternativas A -, B -, C -, D - ou A) B) C) D) ou A. B. C. D.
        # Exemplo: A - ... B - ...
        opt_pattern = re.compile(r'(?:^|\n|\s+)([A-D])\s*[\-\)\.]\s+(.*?)(?=(?:(?:^|\n|\s+)[A-D]\s*[\-\)\.]\s+)|\Z)', re.DOTALL)
        opt_matches = list(opt_pattern.finditer(block))
        
        if len(opt_matches) >= 3:
            statement = block[:opt_matches[0].start()]
            # Limpar metadados do enunciado
            statement = re.sub(r'Cod\s*-\s*\d+', '', statement, flags=re.I)
            statement = re.sub(r'Tipo de Item:.*?\n', '', statement, flags=re.I)
            statement = re.sub(r'C[óo]digo externo.*?\n', '', statement, flags=re.I)
            statement = clean_txt(statement)
            
            if len(statement) < 15:
                continue
                
            options = []
            for om in opt_matches:
                let = om.group(1).upper()
                otext = clean_txt(om.group(2))
                # Limpar possíveis restos de rodapés
                otext = re.sub(r'^\s*[\-\.\)]\s*', '', otext)
                otext = re.sub(r'\d+/\d+.*$', '', otext)
                if otext:
                    options.append({"letter": let, "text": otext})
                    
            if len(options) >= 3:
                ans = gabarito.get(q_num, "")
                questions.append({
                    "id": f"{edition.lower().replace(' ', '_')}_{q_num}",
                    "edition": edition,
                    "year": year,
                    "number": q_num,
                    "statement": statement,
                    "options": options,
                    "answer": ans
                })
                
    print(f"[{edition}] Total de questões extraídas com sucesso: {len(questions)}")
    return questions

all_qs = []
for p, ed, yr in [
    ("data/prova37_teorica.pdf", "TEMFC 37", 2026),
    ("data/prova36_teorica.pdf", "TEMFC 36", 2025),
    ("data/prova35_teorica.pdf", "TEMFC 35", 2024),
    ("data/prova34_teorica.pdf", "TEMFC 34", 2024),
    ("data/prova30_teorica.pdf", "TEMFC 30", 2022)
]:
    if os.path.exists(p):
        qs = parse_pdf(p, ed, yr)
        all_qs.extend(qs)

print(f"\n---> BANCO FINAL CONSOLIDADO: {len(all_qs)} QUESTÕES <---")

with open("data/questions_parsed.json", "w", encoding="utf-8") as f:
    json.dump(all_qs, f, ensure_ascii=False, indent=2)

