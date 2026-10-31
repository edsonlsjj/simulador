import os
import re
import json
import urllib.request
from pypdf import PdfReader

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

SOURCES = [
    {
        "edition": "TEMFC 37",
        "year": 2026,
        "type": "Teórica",
        "url": "https://sbmfc.org.br/wp-content/uploads/2026/04/Prova-TEMFC-37-Teorica-Final.pdf",
        "file": "data/prova37_teorica.pdf"
    },
    {
        "edition": "TEMFC 37",
        "year": 2026,
        "type": "Teórico-Prática",
        "url": "https://sbmfc.org.br/wp-content/uploads/2026/04/Prova-TEMFC-37-Teorico-Pratica-Final.pdf",
        "file": "data/prova37_pratica.pdf"
    },
    {
        "edition": "TEMFC 36",
        "year": 2025,
        "type": "Teórica",
        "url": "https://www.sbmfc.org.br/wp-content/uploads/2025/07/Exame-de-Suficiencia-para-Obtencao-do-Titulo-de-Especialista-em-Medicina-de-Familia-e-Comunidade-%E2%80%93-TEMFC-36-TEORICA-2025-1.pdf",
        "file": "data/prova36_teorica.pdf"
    },
    {
        "edition": "TEMFC 35",
        "year": 2024,
        "type": "Teórica",
        "url": "https://www.sbmfc.org.br/wp-content/uploads/2024/12/Prova-Teorica-TEMFC-35-1.pdf",
        "file": "data/prova35_teorica.pdf"
    },
    {
        "edition": "TEMFC 34",
        "year": 2024,
        "type": "Teórica",
        "url": "https://sbmfc.org.br/wp-content/uploads/2024/04/Gabarito-do-Exame-de-Suficiencia-para-Obtencao-do-Titulo-de-Especialista-em-Medicina-de-Familia-e-Comunidade-PROVA-TEORICA-1.pdf",
        "file": "data/prova34_teorica.pdf"
    },
    {
        "edition": "TEMFC 30",
        "year": 2022,
        "type": "Teórica",
        "url": "https://www.sbmfc.org.br/wp-content/uploads/2022/04/PROVA-SBMFC-TEMFC-30.pdf",
        "file": "data/prova30_teorica.pdf"
    },
    {
        "edition": "TEMFC 29",
        "year": 2021,
        "type": "Teórica",
        "url": "https://www.sbmfc.org.br/wp-content/uploads/2022/02/PROVA-SBMFC-2021.pdf",
        "file": "data/prova29_teorica.pdf"
    },
    {
        "edition": "TEMFC 26",
        "year": 2019,
        "type": "Geral",
        "url": "https://www.sbmfc.org.br/wp-content/uploads/2019/11/SBMFC_26_FINAL-Caderno-de-Provas.pdf",
        "file": "data/prova26_geral.pdf"
    }
]

os.makedirs("data", exist_ok=True)

for src in SOURCES:
    filepath = src["file"]
    if not os.path.exists(filepath) or os.path.getsize(filepath) < 10000:
        print(f"Baixando {src['edition']} {src['type']}...")
        try:
            req = urllib.request.Request(src["url"], headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                with open(filepath, "wb") as f:
                    f.write(data)
                print(f"  -> Salvo: {len(data)} bytes")
        except Exception as e:
            print(f"  -> Erro ao baixar {src['edition']}: {e}")
    else:
        print(f"Já existe {filepath} ({os.path.getsize(filepath)} bytes)")

