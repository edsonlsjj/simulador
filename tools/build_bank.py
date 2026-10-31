import os
import io
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
        "pdf_url": "https://sbmfc.org.br/wp-content/uploads/2026/04/Prova-TEMFC-37-Teorica-Final.pdf",
        "gabarito_url": "https://sbmfc.org.br/wp-content/uploads/2026/05/Comunicado-Gabarito-Definitivo.pdf",
        "overrides": {49: "ANULADA", 55: "B", 58: "C"}
    },
    {
        "edition": "TEMFC 37",
        "year": 2026,
        "type": "Teórico-Prática",
        "pdf_url": "https://sbmfc.org.br/wp-content/uploads/2026/04/Prova-TEMFC-37-Teorico-Pratica-Final.pdf",
        "gabarito_url": "https://sbmfc.org.br/wp-content/uploads/2026/05/Comunicado-Gabarito-Definitivo.pdf",
        "overrides": {}
    },
    {
        "edition": "TEMFC 36",
        "year": 2025,
        "type": "Teórica",
        "pdf_url": "https://www.sbmfc.org.br/wp-content/uploads/2025/07/Exame-de-Suficiencia-para-Obtencao-do-Titulo-de-Especialista-em-Medicina-de-Familia-e-Comunidade-%E2%80%93-TEMFC-36-TEORICA-2025-1.pdf",
        "gabarito_url": "https://www.sbmfc.org.br/wp-content/uploads/2025/09/Prova-Objetiva-teorica-e-teorico-pratica-%E2%80%93-Anulacao-de-Questoes-e-Alteracao-de-Gabaritos-Apos-Recursos.pdf",
        "overrides": {}
    },
    {
        "edition": "TEMFC 35",
        "year": 2024,
        "type": "Teórica",
        "pdf_url": "https://www.sbmfc.org.br/wp-content/uploads/2024/12/Prova-Teorica-TEMFC-35-1.pdf",
        "gabarito_url": "https://www.sbmfc.org.br/wp-content/uploads/2024/12/Errata-TEMFC-35-Gabarito-e-Recursos-das-Provas-Objetivas.pdf",
        "overrides": {}
    },
    {
        "edition": "TEMFC 34",
        "year": 2024,
        "type": "Teórica",
        "pdf_url": "https://sbmfc.org.br/wp-content/uploads/2024/04/Gabarito-do-Exame-de-Suficiencia-para-Obtencao-do-Titulo-de-Especialista-em-Medicina-de-Familia-e-Comunidade-PROVA-TEORICA-1.pdf",
        "overrides": {}
    },
    {
        "edition": "TEMFC 30",
        "year": 2022,
        "type": "Teórica",
        "pdf_url": "https://www.sbmfc.org.br/wp-content/uploads/2022/04/PROVA-SBMFC-TEMFC-30.pdf",
        "overrides": {}
    },
    {
        "edition": "TEMFC 29",
        "year": 2021,
        "type": "Teórica",
        "pdf_url": "https://www.sbmfc.org.br/wp-content/uploads/2022/02/PROVA-SBMFC-2021.pdf",
        "overrides": {}
    },
    {
        "edition": "TEMFC 26",
        "year": 2019,
        "type": "Geral",
        "pdf_url": "https://www.sbmfc.org.br/wp-content/uploads/2019/11/SBMFC_26_FINAL-Caderno-de-Provas.pdf",
        "overrides": {}
    }
]

def download_bytes(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()

def parse_pdf_text(pdf_bytes):
    reader = PdfReader(io.BytesIO(pdf_bytes))
    full_text = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            full_text.append(t)
    return "\n".join(full_text)

print("Extractor pronto.")

