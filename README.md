# Simulado Inteligente TEMFC (SBMFC)

Simulador de provas para obtenção do **Título de Especialista em Medicina de Família e Comunidade (TEMFC)** promovido pela **SBMFC**.

## 📌 Funcionalidades
- **Banco Oficial Verificado (510 Questões Reais):** Extraídas diretamente dos cadernos oficiais da SBMFC (**TEMFC 37, 36, 35, 34, 30 e 29**), cruzadas com os **gabaritos definitivos pós-recurso** e comunicados oficiais de errata/anulação.
- **Filtro de Modalidade:** Escolha entre **Somente Prova Teórica** (420 questões objetivas independentes, padrão), **Teórica + Teórico-Prática** (510 questões) ou **Somente Teórico-Prática** (90 questões com apresentação completa do caso clínico, transcrição do diálogo e link para o acervo da SBMFC).
- **Tabelas Clínicas, Figuras e ECGs Nativos:** Renderização estruturada de tabelas HTML (escalas clínicas, pré-natal, alternativas multi-colunas) e figuras médicas em alta resolução (ECG, curvas de crescimento OMS, genogramas, SOAP) com **zoom ampliado (lightbox)**.
- **Questões Sortidas:** A cada simulado iniciado, o sistema seleciona perguntas aleatórias de edições variadas usando embaralhamento uniforme (Fisher-Yates).
- **Configuração de Prova:** Escolha entre 20, 40, 60 ou 80 questões, com cronômetro opcional (3 min/questão).
- **Correção Oficial:** Linha de corte em **70%** para determinar status de **APROVADO(A)** ou **NÃO APROVADO(A)**, contabilizando automaticamente questões anuladas pós-recurso e dupla alternativa oficial.
- **Histórico no navegador:** Ao finalizar, o resultado fica salvo no `localStorage` (média, melhor nota, desempenho por edição e lista dos últimos simulados).
- **Tema claro e escuro:** Segue `prefers-color-scheme` e pode ser alternado no cabeçalho.

## 🚀 Como Executar
Não requer instalação de dependências ou servidores para uso: basta abrir o arquivo `index.html` em qualquer navegador web.

## 🛠️ Atualização e Auditoria do Banco de Questões
Para reprocessar os cadernos oficiais da SBMFC e validar 100% da integridade das questões (requer Python 3.10+ e `pymupdf`):

```bash
python tools/download_official_sources.py
python tools/build_verified_bank.py
python tools/validate_bank.py
```
