import os
import re
import json
import urllib.request

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

FILES_TO_DOWNLOAD = [
    # TEMFC 37 (2026)
    ("data/prova37_teorica.pdf", "https://sbmfc.org.br/wp-content/uploads/2026/04/Prova-TEMFC-37-Teorica-Final.pdf"),
    ("data/prova37_pratica.pdf", "https://sbmfc.org.br/wp-content/uploads/2026/04/Prova-TEMFC-37-Teorico-Pratica-Final.pdf"),
    ("data/gabarito37_definitivo.pdf", "https://sbmfc.org.br/wp-content/uploads/2026/05/Comunicado-Gabarito-Definitivo.pdf"),

    # TEMFC 36 (2025)
    ("data/prova36_teorica.pdf", "https://www.sbmfc.org.br/wp-content/uploads/2025/07/Exame-de-Suficiencia-para-Obtencao-do-Titulo-de-Especialista-em-Medicina-de-Familia-e-Comunidade-%E2%80%93-TEMFC-36-TEORICA-2025-1.pdf"),
    ("data/prova36_pratica.pdf", "https://www.sbmfc.org.br/wp-content/uploads/2025/07/Exame-de-Suficiencia-para-Obtencao-do-Titulo-de-Especialista-em-Medicina-de-Familia-e-Comunidade-%E2%80%93-TEMFC-36-TEORICO-PRATICA-2025.pdf"),
    ("data/gabarito36_definitivo.pdf", "https://www.sbmfc.org.br/wp-content/uploads/2025/09/Prova-Objetiva-teorica-e-teorico-pratica-%E2%80%93-Anulacao-de-Questoes-e-Alteracao-de-Gabaritos-Apos-Recursos.pdf"),

    # TEMFC 35 (2024)
    ("data/prova35_teorica.pdf", "https://www.sbmfc.org.br/wp-content/uploads/2024/12/Prova-Teorica-TEMFC-35-1.pdf"),
    ("data/prova35_pratica.pdf", "https://www.sbmfc.org.br/wp-content/uploads/2024/12/Prova-Teorico-Pratica-TEMFC-35-3.pdf"),
    ("data/gabarito35_errata.pdf", "https://www.sbmfc.org.br/wp-content/uploads/2024/12/Errata-TEMFC-35-Gabarito-e-Recursos-das-Provas-Objetivas.pdf"),
    ("data/gabarito35_recursos.pdf", "https://www.sbmfc.org.br/wp-content/uploads/2025/01/Resultado-Prova-Objetiva-apos-analise-dos-Recursos-15-01.pdf"),

    # TEMFC 34 (2024)
    ("data/prova34_teorica.pdf", "https://sbmfc.org.br/wp-content/uploads/2024/04/Gabarito-do-Exame-de-Suficiencia-para-Obtencao-do-Titulo-de-Especialista-em-Medicina-de-Familia-e-Comunidade-PROVA-TEORICA-1.pdf"),
    ("data/prova34_pratica.pdf", "https://sbmfc.org.br/wp-content/uploads/2024/04/Gabarito-do-Exame-de-Suficiencia-para-Obtencao-do-Titulo-de-Especialista-em-Medicina-de-Familia-e-Comunidade-PROVA-TEORICO-PRATICA.pdf"),
    ("data/gabarito34_recursos.pdf", "https://www.sbmfc.org.br/wp-content/uploads/2024/05/Resultado-Prova-Objetiva-apos-analise-dos-Recursos-20-05-2.pdf"),

    # TEMFC 30 (2022)
    ("data/prova30_teorica.pdf", "https://www.sbmfc.org.br/wp-content/uploads/2022/04/PROVA-SBMFC-TEMFC-30.pdf"),

    # TEMFC 29 (2021)
    ("data/prova29_teorica.pdf", "https://www.sbmfc.org.br/wp-content/uploads/2022/02/PROVA-SBMFC-2021.pdf"),
    ("data/gabarito29_final.pdf", "https://www.sbmfc.org.br/wp-content/uploads/2021/10/Gabarito-Final-Prova-Objetiva-TEMFC-29.pdf"),
]

PAGES_FOR_YOUTUBE = [
    ("concursos_anteriores", "https://sbmfc.org.br/concursos-anteriores-provas-e-gabaritos/"),
    ("temfc_37", "https://sbmfc.org.br/temfc-37/"),
    ("temfc_36", "https://sbmfc.org.br/temfc-36/"),
    ("temfc_35", "https://sbmfc.org.br/temfc-35/"),
    ("temfc_34", "https://sbmfc.org.br/temfc-34/"),
    ("temfc_30", "https://sbmfc.org.br/temfc-30/"),
    ("temfc_29", "https://sbmfc.org.br/29-temfc/"),
]

def main():
    os.makedirs("data", exist_ok=True)
    for path, url in FILES_TO_DOWNLOAD:
        if os.path.exists(path) and os.path.getsize(path) > 5000:
            print(f"[OK] Já existe: {path} ({os.path.getsize(path)} bytes)")
            continue
        print(f"[BAIXANDO] {path} <- {url}")
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=40) as resp:
                content = resp.read()
                with open(path, "wb") as f:
                    f.write(content)
                print(f"  -> Salvo ({len(content)} bytes)")
        except Exception as e:
            print(f"  -> ERRO em {path}: {e}")

    yt_links = {}
    for label, page_url in PAGES_FOR_YOUTUBE:
        try:
            req = urllib.request.Request(page_url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                # Extrair links do YouTube com o texto âncora ao redor
                matches = re.findall(r'<a[^>]+href=["\'](https?://(?:www\.)?(?:youtube\.com|youtu\.be)/[^"\']+)["\'][^>]*>(.*?)</a>', html, re.I | re.S)
                cleaned = []
                for href, anchor in matches:
                    anchor_txt = re.sub(r'<[^>]+>', '', anchor).strip()
                    if 'SBMFCoficial' not in href and '/channel/' not in href and '/user/' not in href:
                        cleaned.append({"url": href, "text": anchor_txt})
                    elif anchor_txt:
                        cleaned.append({"url": href, "text": anchor_txt})
                yt_links[label] = cleaned
                print(f"[YOUTUBE] {label}: {len(cleaned)} links encontrados")
        except Exception as e:
            print(f"[YOUTUBE ERRO] {label}: {e}")

    with open("data/youtube_links.json", "w", encoding="utf-8") as f:
        json.dump(yt_links, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()

