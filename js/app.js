// Estado da aplicação
let currentQuiz = [];
let currentIndex = 0;
let userAnswers = {}; // { questionIndex: 'A' | 'B' ... }
let flaggedQuestions = new Set();
let timerInterval = null;
let secondsRemaining = 0;
let timerMode = 'none';
let categoryMode = 'teorica';
let desiredCount = 20;
let quizStartedAt = 0;
let lastRenderedCaseKey = null;
let casePanelOpenState = true;

const HISTORY_STORAGE_KEY = 'temfc-sim:v1';
const THEME_STORAGE_KEY = 'temfc-theme:v1';
const HISTORY_LIMIT = 50;

// Elementos do DOM
const setupScreen = document.getElementById('setupScreen');
const quizScreen = document.getElementById('quizScreen');
const resultScreen = document.getElementById('resultScreen');

const totalBankCount = document.getElementById('totalBankCount');
const filteredBankHint = document.getElementById('filteredBankHint');
const categoryModeGroup = document.getElementById('categoryModeGroup');
const questionCountGroup = document.getElementById('questionCountGroup');
const timerModeGroup = document.getElementById('timerModeGroup');
const startBtn = document.getElementById('startBtn');
const themeToggle = document.getElementById('themeToggle');

const timerContainer = document.getElementById('timerContainer');
const timerDisplay = document.getElementById('timerDisplay');

const questionBodyScroll = document.getElementById('questionBodyScroll');
const currentQProgress = document.getElementById('currentQProgress');
const currentQOrigin = document.getElementById('currentQOrigin');
const currentQContext = document.getElementById('currentQContext');
const currentQStatement = document.getElementById('currentQStatement');
const currentQOptionCols = document.getElementById('currentQOptionCols');
const currentQOptions = document.getElementById('currentQOptions');
const qNumbersGrid = document.getElementById('qNumbersGrid');

const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const flagBtn = document.getElementById('flagBtn');
const finishBtn = document.getElementById('finishBtn');

const resultBanner = document.getElementById('resultBanner');
const resultBadge = document.getElementById('resultBadge');
const resultSubtitle = document.getElementById('resultSubtitle');
const statScore = document.getElementById('statScore');
const statCorrect = document.getElementById('statCorrect');
const statWrong = document.getElementById('statWrong');
const statAnuladas = document.getElementById('statAnuladas');
const statTotal = document.getElementById('statTotal');
const resultEditionStats = document.getElementById('resultEditionStats');
const reviewList = document.getElementById('reviewList');
const restartBtn = document.getElementById('restartBtn');

const historyEmpty = document.getElementById('historyEmpty');
const historyContent = document.getElementById('historyContent');
const historyAverage = document.getElementById('historyAverage');
const historyBest = document.getElementById('historyBest');
const historyCount = document.getElementById('historyCount');
const historyEditionStats = document.getElementById('historyEditionStats');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

const imageLightbox = document.getElementById('imageLightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxCaption = document.getElementById('lightboxCaption');
const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  updateBankCountUI();
  applyTheme(getInitialTheme());
  setupEventListeners();
  renderHistory();
});

function getFilteredBank() {
  if (typeof QUESTION_BANK === 'undefined' || !Array.isArray(QUESTION_BANK)) {
    return [];
  }
  if (categoryMode === 'teorica') {
    return QUESTION_BANK.filter((q) => q.category !== 'teorico-pratica');
  }
  if (categoryMode === 'teorico-pratica') {
    return QUESTION_BANK.filter((q) => q.category === 'teorico-pratica');
  }
  return QUESTION_BANK;
}

function updateBankCountUI() {
  if (typeof QUESTION_BANK === 'undefined' || !Array.isArray(QUESTION_BANK)) return;
  totalBankCount.textContent = QUESTION_BANK.length;
  if (!filteredBankHint) return;

  const filtered = getFilteredBank();
  if (categoryMode === 'teorica') {
    filteredBankHint.textContent = `• ${filtered.length} da Prova Teórica selecionadas`;
  } else if (categoryMode === 'teorico-pratica') {
    filteredBankHint.textContent = `• ${filtered.length} da Teórico-Prática selecionadas`;
  } else {
    filteredBankHint.textContent = `• Todas as ${filtered.length} questões ativas`;
  }
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (err) {}
  return null;
}

function getInitialTheme() {
  return getSavedTheme() || getSystemTheme();
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  if (themeToggle) {
    themeToggle.setAttribute(
      'aria-label',
      next === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'
    );
  }
}

function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (err) {}
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  persistTheme(next);
}

function setupEventListeners() {
  if (categoryModeGroup) {
    categoryModeGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-btn');
      if (!btn) return;
      selectPill(categoryModeGroup, btn);
      categoryMode = btn.getAttribute('data-category') || 'teorica';
      updateBankCountUI();
    });
  }

  questionCountGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    selectPill(questionCountGroup, btn);
    desiredCount = parseInt(btn.getAttribute('data-count'), 10);
  });

  timerModeGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    selectPill(timerModeGroup, btn);
    timerMode = btn.getAttribute('data-timer');
  });

  startBtn.addEventListener('click', startQuiz);
  prevBtn.addEventListener('click', () => navigateQuestion(currentIndex - 1));
  nextBtn.addEventListener('click', () => navigateQuestion(currentIndex + 1));
  flagBtn.addEventListener('click', toggleFlagCurrent);
  finishBtn.addEventListener('click', confirmFinishQuiz);
  restartBtn.addEventListener('click', resetToSetup);
  clearHistoryBtn.addEventListener('click', confirmClearHistory);
  themeToggle.addEventListener('click', toggleTheme);

  if (lightboxCloseBtn && imageLightbox) {
    lightboxCloseBtn.addEventListener('click', () => imageLightbox.close());
    imageLightbox.addEventListener('click', (e) => {
      if (e.target === imageLightbox) {
        imageLightbox.close();
      }
    });
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (getSavedTheme()) return;
    applyTheme(event.matches ? 'dark' : 'light');
  });

  document.addEventListener('keydown', handleQuizKeyboard);
}

function openImageLightbox(src, altText) {
  if (!imageLightbox || !lightboxImg) return;
  lightboxImg.src = src;
  lightboxImg.alt = altText || 'Figura clínica';
  if (lightboxCaption) {
    lightboxCaption.textContent = altText || 'Figura clínica';
  }
  if (typeof imageLightbox.showModal === 'function') {
    imageLightbox.showModal();
  }
}

function selectPill(group, selectedBtn) {
  group.querySelectorAll('.pill-btn').forEach((btn) => {
    const isActive = btn === selectedBtn;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });
}

function handleQuizKeyboard(event) {
  if (quizScreen.classList.contains('hidden')) return;
  if (imageLightbox && imageLightbox.open) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const key = event.key;
  if (key === 'ArrowLeft') {
    event.preventDefault();
    navigateQuestion(currentIndex - 1);
    return;
  }
  if (key === 'ArrowRight') {
    event.preventDefault();
    navigateQuestion(currentIndex + 1);
    return;
  }

  const letter = key.toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(letter)) return;
  const q = currentQuiz[currentIndex];
  if (!q || !q.options.some((opt) => opt.letter === letter)) return;
  userAnswers[currentIndex] = letter;
  renderCurrentQuestion(false);
  updateGridStatus();
}

// Embaralhador de questões (Fisher-Yates)
function getRandomSample(array, size) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, size);
}

function startQuiz() {
  const pool = getFilteredBank();
  if (!pool || pool.length === 0) {
    alert('Nenhuma questão encontrada para a modalidade selecionada.');
    return;
  }

  // Sorteia questões de diferentes anos e provas
  const count = Math.min(desiredCount, pool.length);
  currentQuiz = getRandomSample(pool, count);
  currentIndex = 0;
  userAnswers = {};
  flaggedQuestions.clear();
  quizStartedAt = Date.now();
  lastRenderedCaseKey = null;
  casePanelOpenState = true;

  // Iniciar Cronômetro se solicitado
  if (timerMode === 'standard') {
    secondsRemaining = count * 180; // 3 minutos por questão
    timerContainer.classList.remove('hidden');
    startTimer();
  } else {
    timerContainer.classList.add('hidden');
  }

  // Alterna telas
  setupScreen.classList.add('hidden');
  resultScreen.classList.add('hidden');
  quizScreen.classList.remove('hidden');

  buildGrid();
  renderCurrentQuestion(true);
}

function startTimer() {
  clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    secondsRemaining--;
    updateTimerDisplay();
    if (secondsRemaining <= 0) {
      clearInterval(timerInterval);
      alert('Tempo limite de prova atingido! O simulado será finalizado agora.');
      finishQuiz();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const h = String(Math.floor(secondsRemaining / 3600)).padStart(2, '0');
  const m = String(Math.floor((secondsRemaining % 3600) / 60)).padStart(2, '0');
  const s = String(secondsRemaining % 60).padStart(2, '0');
  timerDisplay.textContent = `${h}:${m}:${s}`;
}

function buildGrid() {
  qNumbersGrid.innerHTML = '';
  currentQuiz.forEach((_, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'q-num-btn';
    btn.textContent = idx + 1;
    btn.setAttribute('aria-label', `Ir para a questão ${idx + 1}`);
    btn.addEventListener('click', () => navigateQuestion(idx));
    qNumbersGrid.appendChild(btn);
  });
  updateGridStatus();
}

function updateGridStatus() {
  const buttons = qNumbersGrid.querySelectorAll('.q-num-btn');
  buttons.forEach((btn, idx) => {
    btn.className = 'q-num-btn';
    if (idx === currentIndex) {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'true');
    } else {
      btn.removeAttribute('aria-current');
    }
    if (userAnswers[idx] !== undefined) {
      btn.classList.add('answered');
    }
    if (flaggedQuestions.has(idx)) {
      btn.classList.add('flagged');
    }
  });
}

function renderRichBlocks(container, blocks, fallbackText) {
  container.innerHTML = '';
  if (Array.isArray(blocks) && blocks.length > 0) {
    blocks.forEach((blk) => {
      if (!blk || typeof blk !== 'object') return;
      if (blk.type === 'paragraph' && blk.text) {
        const p = document.createElement('p');
        p.className = 'question-paragraph';
        p.textContent = blk.text;
        container.appendChild(p);
      } else if (blk.type === 'table' && Array.isArray(blk.headers)) {
        const wrap = document.createElement('div');
        wrap.className = 'question-table-wrap';

        const table = document.createElement('table');
        table.className = 'question-table';

        if (blk.headers.some((h) => h && String(h).trim() !== '')) {
          const thead = document.createElement('thead');
          const trHead = document.createElement('tr');
          blk.headers.forEach((hdr) => {
            const th = document.createElement('th');
            th.scope = 'col';
            th.textContent = hdr || '';
            trHead.appendChild(th);
          });
          thead.appendChild(trHead);
          table.appendChild(thead);
        }

        const tbody = document.createElement('tbody');
        (blk.rows || []).forEach((row) => {
          const tr = document.createElement('tr');
          row.forEach((cell) => {
            const td = document.createElement('td');
            td.textContent = cell || '';
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        container.appendChild(wrap);
      } else if (blk.type === 'image' && blk.src) {
        const fig = document.createElement('figure');
        fig.className = 'question-figure';

        const zoomBtn = document.createElement('button');
        zoomBtn.type = 'button';
        zoomBtn.className = 'figure-zoom-btn';
        const altLabel = blk.alt || 'Figura clínica da questão';
        zoomBtn.setAttribute('aria-label', `${altLabel} — clique para ampliar`);

        const img = document.createElement('img');
        img.src = blk.src;
        img.alt = altLabel;
        img.loading = 'lazy';

        zoomBtn.appendChild(img);
        zoomBtn.addEventListener('click', () => openImageLightbox(blk.src, altLabel));

        const cap = document.createElement('figcaption');
        cap.className = 'figure-caption';
        cap.textContent = 'Clique na figura para ampliar';

        fig.appendChild(zoomBtn);
        fig.appendChild(cap);
        container.appendChild(fig);
      }
    });
    return;
  }

  if (fallbackText) {
    const p = document.createElement('p');
    p.className = 'question-paragraph';
    p.textContent = fallbackText;
    container.appendChild(p);
  }
}

function buildCaseDetailsElement(q, isOpen, onToggle) {
  const details = document.createElement('details');
  details.className = 'case-details';
  if (isOpen) {
    details.open = true;
  }

  const summary = document.createElement('summary');
  summary.className = 'case-summary';

  const summaryLeft = document.createElement('span');
  summaryLeft.className = 'case-summary-title';

  const badge = document.createElement('span');
  badge.className = 'case-badge';
  badge.textContent = 'Teórico-Prática';

  const titleSpan = document.createElement('span');
  titleSpan.textContent = q.caseTitle || 'Apresentação do caso e transcrição do vídeo';

  summaryLeft.appendChild(badge);
  summaryLeft.appendChild(titleSpan);

  const toggleHint = document.createElement('span');
  toggleHint.className = 'case-toggle-hint';
  toggleHint.textContent = details.open ? 'Ocultar roteiro' : 'Ver roteiro completo';

  summary.appendChild(summaryLeft);
  summary.appendChild(toggleHint);

  const body = document.createElement('div');
  body.className = 'case-content';
  renderRichBlocks(body, q.caseBlocks, '');

  if (q.videoUrl) {
    const videoWrap = document.createElement('div');
    videoWrap.className = 'case-video-actions';
    const link = document.createElement('a');
    link.href = q.videoUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'case-video-link';
    link.textContent = 'Consultar acervo de vídeos no YouTube da SBMFC ↗';
    videoWrap.appendChild(link);
    body.appendChild(videoWrap);
  }

  details.addEventListener('toggle', () => {
    toggleHint.textContent = details.open ? 'Ocultar roteiro' : 'Ver roteiro completo';
    if (typeof onToggle === 'function') {
      onToggle(details.open);
    }
  });

  details.appendChild(summary);
  details.appendChild(body);
  return details;
}

function renderCurrentQuestion(resetScroll = false) {
  const q = currentQuiz[currentIndex];
  if (!q) return;

  const modalityLabel = q.category === 'teorico-pratica' ? 'Teórico-Prática' : 'Teórica';
  currentQProgress.textContent = `Questão ${currentIndex + 1} de ${currentQuiz.length}`;
  currentQOrigin.textContent = `${q.edition} (${q.year}) • ${modalityLabel} • Item #${q.number}`;

  // Contexto de caso/vídeo para questões Teórico-Práticas
  if (currentQContext) {
    if (Array.isArray(q.caseBlocks) && q.caseBlocks.length > 0) {
      const caseKey = `${q.edition}::${q.caseTitle || ''}`;
      if (caseKey !== lastRenderedCaseKey) {
        lastRenderedCaseKey = caseKey;
        casePanelOpenState = true;
      }
      currentQContext.innerHTML = '';
      currentQContext.classList.remove('hidden');
      const detailsEl = buildCaseDetailsElement(q, casePanelOpenState, (openNow) => {
        casePanelOpenState = openNow;
      });
      currentQContext.appendChild(detailsEl);
    } else {
      lastRenderedCaseKey = null;
      currentQContext.innerHTML = '';
      currentQContext.classList.add('hidden');
    }
  }

  // Enunciado rico (parágrafos, tabelas HTML e figuras clínicas)
  renderRichBlocks(currentQStatement, q.statementBlocks, q.statement);

  // Cabeçalho de colunas quando as alternativas são tabulares
  const hasTabularOptions =
    Array.isArray(q.optionColumns) &&
    q.optionColumns.length > 0 &&
    q.options.every((o) => Array.isArray(o.cells) && o.cells.length === q.optionColumns.length);

  if (currentQOptionCols) {
    if (hasTabularOptions) {
      currentQOptionCols.innerHTML = '';
      currentQOptionCols.classList.remove('hidden');
      currentQOptionCols.style.setProperty('--opt-cols', String(q.optionColumns.length));

      const spacer = document.createElement('span');
      spacer.className = 'option-col-spacer';
      spacer.textContent = 'Alt.';
      currentQOptionCols.appendChild(spacer);

      const gridHead = document.createElement('div');
      gridHead.className = 'option-cells-grid option-cells-header';
      gridHead.style.setProperty('--opt-cols', String(q.optionColumns.length));
      q.optionColumns.forEach((colName) => {
        const colSpan = document.createElement('span');
        colSpan.textContent = colName;
        gridHead.appendChild(colSpan);
      });
      currentQOptionCols.appendChild(gridHead);
    } else {
      currentQOptionCols.innerHTML = '';
      currentQOptionCols.classList.add('hidden');
    }
  }

  currentQOptions.innerHTML = '';
  q.options.forEach((opt) => {
    const optBtn = document.createElement('button');
    optBtn.type = 'button';
    optBtn.className = 'option-item';
    optBtn.setAttribute('role', 'option');
    const selected = userAnswers[currentIndex] === opt.letter;
    if (selected) {
      optBtn.classList.add('selected');
    }
    optBtn.setAttribute('aria-selected', selected ? 'true' : 'false');
    optBtn.setAttribute('aria-label', `Alternativa ${opt.letter}: ${opt.text}`);

    const letterSpan = document.createElement('span');
    letterSpan.className = 'option-letter';
    letterSpan.textContent = `${opt.letter})`;
    optBtn.appendChild(letterSpan);

    if (hasTabularOptions) {
      const cellsGrid = document.createElement('span');
      cellsGrid.className = 'option-cells-grid';
      cellsGrid.style.setProperty('--opt-cols', String(q.optionColumns.length));
      opt.cells.forEach((cellVal, cIdx) => {
        const cellSpan = document.createElement('span');
        cellSpan.className = 'option-cell';
        cellSpan.setAttribute('data-col-label', `${q.optionColumns[cIdx]}: `);
        cellSpan.textContent = cellVal;
        cellsGrid.appendChild(cellSpan);
      });
      optBtn.appendChild(cellsGrid);
    } else {
      const textSpan = document.createElement('span');
      textSpan.className = 'option-text';
      textSpan.textContent = opt.text;
      optBtn.appendChild(textSpan);
    }

    optBtn.addEventListener('click', () => {
      userAnswers[currentIndex] = opt.letter;
      renderCurrentQuestion(false);
      updateGridStatus();
    });

    currentQOptions.appendChild(optBtn);
  });

  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === currentQuiz.length - 1;

  const flagged = flaggedQuestions.has(currentIndex);
  flagBtn.textContent = flagged ? 'Desmarcar dúvida' : 'Marcar dúvida';
  flagBtn.setAttribute('aria-pressed', flagged ? 'true' : 'false');
  updateGridStatus();

  if (resetScroll && questionBodyScroll) {
    questionBodyScroll.scrollTop = 0;
  }
}

function navigateQuestion(newIndex) {
  if (newIndex >= 0 && newIndex < currentQuiz.length) {
    currentIndex = newIndex;
    renderCurrentQuestion(true);
  }
}

function toggleFlagCurrent() {
  if (flaggedQuestions.has(currentIndex)) {
    flaggedQuestions.delete(currentIndex);
  } else {
    flaggedQuestions.add(currentIndex);
  }
  renderCurrentQuestion(false);
}

function confirmFinishQuiz() {
  const answeredCount = Object.keys(userAnswers).length;
  const total = currentQuiz.length;
  let msg = `Você respondeu ${answeredCount} de ${total} questões.`;
  if (answeredCount < total) {
    msg += `\nAinda restam ${total - answeredCount} questões sem resposta. Deseja realmente finalizar?`;
  } else {
    msg += `\nDeseja entregar a prova e conferir seu resultado?`;
  }

  if (confirm(msg)) {
    finishQuiz();
  }
}

function isLetterAcceptedByGabarito(letter, correctAns) {
  if (!letter || !correctAns) return false;
  const accepted = correctAns.split('/').map((s) => s.trim().toUpperCase());
  return accepted.includes(letter.toUpperCase());
}

function finishQuiz() {
  clearInterval(timerInterval);
  quizScreen.classList.add('hidden');
  resultScreen.classList.remove('hidden');

  let correctCount = 0;
  let anuladaCount = 0;
  const total = currentQuiz.length;
  const editionMap = {};

  currentQuiz.forEach((q, idx) => {
    const userAns = userAnswers[idx];
    const correctAns = (q.answer || '').toUpperCase().trim();
    let scored = false;

    // Se a questão foi anulada pós-recurso, todos ganham o ponto
    if (correctAns === 'ANULADA' || correctAns === 'X') {
      correctCount++;
      scored = true;
      anuladaCount++;
    } else if (userAns && isLetterAcceptedByGabarito(userAns, correctAns)) {
      correctCount++;
      scored = true;
    }

    const editionName = q.edition || 'Edição desconhecida';
    if (!editionMap[editionName]) {
      editionMap[editionName] = { name: editionName, total: 0, correct: 0 };
    }
    editionMap[editionName].total++;
    if (scored) {
      editionMap[editionName].correct++;
    }
  });

  const percent = Math.round((correctCount / total) * 100);
  const isApproved = percent >= 70; // Corte oficial SBMFC: 70%
  const editions = Object.values(editionMap).sort(compareEditions);
  const acertosExibicao = correctCount - anuladaCount;
  const errosExibicao = total - correctCount;

  if (isApproved) {
    resultBanner.className = 'result-hero approved';
    resultBadge.textContent = 'Aprovado';
    resultSubtitle.textContent = `Parabéns! Você alcançou ${percent}%, superando a nota de corte oficial de 70% da SBMFC.`;
  } else {
    resultBanner.className = 'result-hero failed';
    resultBadge.textContent = 'Não aprovado';
    resultSubtitle.textContent = `Você obteve ${percent}%. A nota de corte oficial para obtenção do Título pela SBMFC é de 70%. Continue treinando!`;
  }

  statScore.textContent = `${percent}%`;
  statCorrect.textContent = acertosExibicao;
  statWrong.textContent = errosExibicao;
  statAnuladas.textContent = anuladaCount;
  statTotal.textContent = total;
  renderEditionStats(resultEditionStats, editions);

  persistAttempt({
    id: `${Date.now()}`,
    date: new Date().toISOString(),
    total,
    correct: correctCount,
    percent,
    approved: isApproved,
    elapsedSeconds: getElapsedSeconds(),
    editions
  });

  renderReviewList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderReviewList() {
  reviewList.innerHTML = '';
  currentQuiz.forEach((q, idx) => {
    const userAns = userAnswers[idx] || null;
    const correctAns = (q.answer || '').toUpperCase().trim();
    const isAnulada = correctAns === 'ANULADA' || correctAns === 'X';
    const isCorrect = isAnulada || (userAns && isLetterAcceptedByGabarito(userAns, correctAns));

    const card = document.createElement('article');
    card.className = `review-card ${isAnulada ? 'anulada' : (isCorrect ? 'correct' : 'wrong')}`;

    let statusText = isCorrect ? 'Acertou' : (userAns ? 'Errou' : 'Não respondida');
    let statusClass = isCorrect ? 'correct' : 'wrong';
    if (isAnulada) {
      statusText = 'Questão anulada pós-recurso (ponto atribuído)';
      statusClass = 'anulada';
    }

    const modalityLabel = q.category === 'teorico-pratica' ? 'Teórico-Prática' : 'Teórica';
    const meta = document.createElement('div');
    meta.className = 'review-meta';
    const origin = document.createElement('span');
    origin.textContent = `Questão ${idx + 1} • ${q.edition} (${q.year}) • ${modalityLabel} • Item #${q.number}`;
    const status = document.createElement('span');
    status.className = `review-status ${statusClass}`;
    status.textContent = statusText;
    meta.appendChild(origin);
    meta.appendChild(status);
    card.appendChild(meta);

    if (Array.isArray(q.caseBlocks) && q.caseBlocks.length > 0) {
      const reviewCaseWrap = document.createElement('div');
      reviewCaseWrap.className = 'case-context-panel review-case-panel';
      reviewCaseWrap.appendChild(buildCaseDetailsElement(q, false, null));
      card.appendChild(reviewCaseWrap);
    }

    const statementWrap = document.createElement('div');
    statementWrap.className = 'review-statement';
    renderRichBlocks(statementWrap, q.statementBlocks, q.statement);
    card.appendChild(statementWrap);

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'review-options';
    q.options.forEach((opt) => {
      const line = document.createElement('div');
      line.className = 'review-option';
      const isGabOpt = !isAnulada && isLetterAcceptedByGabarito(opt.letter, correctAns);
      let mark = '';
      if (isGabOpt && opt.letter === userAns) {
        mark = ' (Sua resposta • Gabarito oficial)';
        line.classList.add('gabarito');
      } else if (isGabOpt) {
        mark = ' (Gabarito oficial)';
        line.classList.add('gabarito');
      } else if (opt.letter === userAns && !isCorrect) {
        mark = ' (Sua resposta)';
        line.classList.add('sua-resposta');
      }
      line.textContent = `${opt.letter}) ${opt.text}${mark}`;
      optionsWrap.appendChild(line);
    });

    card.appendChild(optionsWrap);
    reviewList.appendChild(card);
  });
}

function resetToSetup() {
  resultScreen.classList.add('hidden');
  quizScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
  renderHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getElapsedSeconds() {
  if (!quizStartedAt) return 0;
  return Math.max(0, Math.round((Date.now() - quizStartedAt) / 1000));
}

function isValidAttempt(item) {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.date !== 'string' || Number.isNaN(Date.parse(item.date))) return false;
  if (!Number.isFinite(item.total) || item.total <= 0) return false;
  if (!Number.isFinite(item.correct) || item.correct < 0) return false;
  if (!Number.isFinite(item.percent)) return false;
  if (typeof item.approved !== 'boolean') return false;
  if (!Number.isFinite(item.elapsedSeconds) || item.elapsedSeconds < 0) return false;
  if (!Array.isArray(item.editions)) return false;
  return true;
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidAttempt);
  } catch (err) {
    return [];
  }
}

function saveHistory(attempts) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(attempts));
    return true;
  } catch (err) {
    return false;
  }
}

function persistAttempt(attempt) {
  if (!isValidAttempt(attempt)) return;
  const history = loadHistory();
  history.unshift(attempt);
  saveHistory(history.slice(0, HISTORY_LIMIT));
}

function confirmClearHistory() {
  const msg = 'Deseja apagar todo o histórico de simulados salvos neste navegador? Esta ação não pode ser desfeita.';
  if (!confirm(msg)) return;
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (err) {
    saveHistory([]);
  }
  renderHistory();
}

function compareEditions(a, b) {
  const numA = parseInt(String(a.name || '').replace(/\D/g, ''), 10) || 0;
  const numB = parseInt(String(b.name || '').replace(/\D/g, ''), 10) || 0;
  return numB - numA;
}

function formatElapsed(totalSeconds) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  const h = String(Math.floor(safe / 3600)).padStart(2, '0');
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const s = String(safe % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatAttemptDate(isoDate) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return 'Data indisponível';
  return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function aggregateEditions(history) {
  const map = {};
  history.forEach((attempt) => {
    (attempt.editions || []).forEach((ed) => {
      if (!ed || typeof ed !== 'object') return;
      const name = ed.name || 'Edição desconhecida';
      if (!map[name]) {
        map[name] = { name, total: 0, correct: 0 };
      }
      const total = Number(ed.total) || 0;
      const correct = Number(ed.correct) || 0;
      map[name].total += total;
      map[name].correct += correct;
    });
  });
  return Object.values(map).sort(compareEditions);
}

function renderEditionStats(container, editions) {
  container.innerHTML = '';
  if (!editions || editions.length === 0) {
    container.innerHTML = '<p class="history-empty">Ainda não há desempenho por edição para exibir.</p>';
    return;
  }

  editions.forEach((ed) => {
    const percent = ed.total > 0 ? Math.round((ed.correct / ed.total) * 100) : 0;
    const approved = percent >= 70;
    const row = document.createElement('div');
    row.className = 'edition-row';

    const head = document.createElement('div');
    head.className = 'edition-row-head';
    const name = document.createElement('span');
    name.className = 'edition-row-name';
    name.textContent = ed.name;
    const percentEl = document.createElement('span');
    percentEl.className = `edition-row-percent${approved ? ' approved' : ''}`;
    percentEl.textContent = `${percent}%`;
    head.appendChild(name);
    head.appendChild(percentEl);

    const bar = document.createElement('div');
    bar.className = 'edition-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(percent));
    bar.setAttribute('aria-label', `Aproveitamento em ${ed.name}: ${percent}%`);
    const fill = document.createElement('div');
    fill.className = `edition-bar-fill${approved ? ' approved' : ''}`;
    fill.style.width = `${Math.min(percent, 100)}%`;
    const cutoff = document.createElement('span');
    cutoff.className = 'edition-cutoff';
    cutoff.setAttribute('aria-hidden', 'true');
    bar.appendChild(fill);
    bar.appendChild(cutoff);

    const meta = document.createElement('p');
    meta.className = 'edition-row-meta';
    meta.textContent = `${ed.correct} de ${ed.total} questões`;

    row.appendChild(head);
    row.appendChild(bar);
    row.appendChild(meta);
    container.appendChild(row);
  });
}

function renderHistory() {
  const history = loadHistory();
  const hasHistory = history.length > 0;

  historyEmpty.classList.toggle('hidden', hasHistory);
  historyContent.classList.toggle('hidden', !hasHistory);
  clearHistoryBtn.classList.toggle('hidden', !hasHistory);

  if (!hasHistory) {
    historyEditionStats.innerHTML = '';
    historyList.innerHTML = '';
    historyAverage.textContent = '—';
    historyBest.textContent = '—';
    historyCount.textContent = '0';
    return;
  }

  const totalQuestions = history.reduce((sum, item) => sum + item.total, 0);
  const totalCorrect = history.reduce((sum, item) => sum + item.correct, 0);
  const average = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
  const best = Math.max(...history.map((item) => item.percent));

  historyAverage.textContent = `${average}%`;
  historyBest.textContent = `${best}%`;
  historyCount.textContent = String(history.length);

  renderEditionStats(historyEditionStats, aggregateEditions(history));

  historyList.innerHTML = '';
  history.forEach((attempt) => {
    const item = document.createElement('article');
    item.className = `history-item ${attempt.approved ? 'approved' : 'failed'}`;
    const chips = (attempt.editions || []).map((ed) => {
      const name = ed.name || 'Edição';
      const total = Number(ed.total) || 0;
      const correct = Number(ed.correct) || 0;
      const chip = document.createElement('span');
      chip.className = 'history-chip';
      chip.textContent = `${name}: ${correct}/${total}`;
      return chip;
    });

    const top = document.createElement('div');
    top.className = 'history-item-top';
    const dateEl = document.createElement('span');
    dateEl.textContent = formatAttemptDate(attempt.date);
    const status = document.createElement('span');
    status.className = `history-item-status ${attempt.approved ? 'approved' : 'failed'}`;
    status.textContent = `${attempt.percent}% · ${attempt.approved ? 'Aprovado' : 'Não aprovado'}`;
    top.appendChild(dateEl);
    top.appendChild(status);

    const meta = document.createElement('p');
    meta.className = 'history-item-meta';
    meta.textContent = `${attempt.total} questões · ${attempt.correct} acertos · Tempo ${formatElapsed(attempt.elapsedSeconds)}`;

    const editionsWrap = document.createElement('div');
    editionsWrap.className = 'history-item-editions';
    chips.forEach((chip) => editionsWrap.appendChild(chip));

    item.appendChild(top);
    item.appendChild(meta);
    item.appendChild(editionsWrap);
    historyList.appendChild(item);
  });
}
