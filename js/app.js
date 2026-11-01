// Estado da aplicação
let currentQuiz = [];
let currentIndex = 0;
let userAnswers = {}; // { questionIndex: 'A' | 'B' ... }
let flaggedQuestions = new Set();
let timerInterval = null;
let secondsRemaining = 0;
let timerMode = 'none';
let desiredCount = 20;
let quizStartedAt = 0;

const HISTORY_STORAGE_KEY = 'temfc-sim:v1';
const THEME_STORAGE_KEY = 'temfc-theme:v1';
const HISTORY_LIMIT = 50;

// Elementos do DOM
const setupScreen = document.getElementById('setupScreen');
const quizScreen = document.getElementById('quizScreen');
const resultScreen = document.getElementById('resultScreen');

const totalBankCount = document.getElementById('totalBankCount');
const questionCountGroup = document.getElementById('questionCountGroup');
const timerModeGroup = document.getElementById('timerModeGroup');
const startBtn = document.getElementById('startBtn');
const themeToggle = document.getElementById('themeToggle');

const timerContainer = document.getElementById('timerContainer');
const timerDisplay = document.getElementById('timerDisplay');

const currentQProgress = document.getElementById('currentQProgress');
const currentQOrigin = document.getElementById('currentQOrigin');
const currentQStatement = document.getElementById('currentQStatement');
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

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  if (typeof QUESTION_BANK !== 'undefined') {
    totalBankCount.textContent = QUESTION_BANK.length;
  }

  applyTheme(getInitialTheme());
  setupEventListeners();
  renderHistory();
});

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

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (getSavedTheme()) return;
    applyTheme(event.matches ? 'dark' : 'light');
  });

  document.addEventListener('keydown', handleQuizKeyboard);
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
  renderCurrentQuestion();
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
  if (!QUESTION_BANK || QUESTION_BANK.length === 0) {
    alert("Banco de questões não encontrado.");
    return;
  }

  // Sorteia questões de diferentes anos e provas
  const count = Math.min(desiredCount, QUESTION_BANK.length);
  currentQuiz = getRandomSample(QUESTION_BANK, count);
  currentIndex = 0;
  userAnswers = {};
  flaggedQuestions.clear();
  quizStartedAt = Date.now();

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
  renderCurrentQuestion();
}

function startTimer() {
  clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    secondsRemaining--;
    updateTimerDisplay();
    if (secondsRemaining <= 0) {
      clearInterval(timerInterval);
      alert("Tempo limite de prova atingido! O simulado será finalizado agora.");
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

function renderCurrentQuestion() {
  const q = currentQuiz[currentIndex];
  if (!q) return;

  currentQProgress.textContent = `Questão ${currentIndex + 1} de ${currentQuiz.length}`;
  currentQOrigin.textContent = `Origem: ${q.edition} (${q.year}) - Item #${q.number}`;
  currentQStatement.textContent = q.statement;

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

    const textSpan = document.createElement('span');
    textSpan.className = 'option-text';
    textSpan.textContent = opt.text;

    optBtn.appendChild(letterSpan);
    optBtn.appendChild(textSpan);
    optBtn.addEventListener('click', () => {
      userAnswers[currentIndex] = opt.letter;
      renderCurrentQuestion();
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
}

function navigateQuestion(newIndex) {
  if (newIndex >= 0 && newIndex < currentQuiz.length) {
    currentIndex = newIndex;
    renderCurrentQuestion();
  }
}

function toggleFlagCurrent() {
  if (flaggedQuestions.has(currentIndex)) {
    flaggedQuestions.delete(currentIndex);
  } else {
    flaggedQuestions.add(currentIndex);
  }
  renderCurrentQuestion();
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

    // Se a questão foi anulada, todos ganham o ponto
    if (correctAns === 'ANULADA' || correctAns === 'X') {
      correctCount++;
      scored = true;
      anuladaCount++;
    } else if (userAns && userAns === correctAns) {
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
    const userAns = userAnswers[idx] || 'Não respondida';
    const correctAns = (q.answer || '').toUpperCase().trim();
    const isAnulada = (correctAns === 'ANULADA' || correctAns === 'X');
    const isCorrect = isAnulada || (userAns === correctAns);

    const card = document.createElement('article');
    card.className = `review-card ${isAnulada ? 'anulada' : (isCorrect ? 'correct' : 'wrong')}`;

    let statusText = isCorrect ? 'Acertou' : 'Errou';
    let statusClass = isCorrect ? 'correct' : 'wrong';
    if (isAnulada) {
      statusText = 'Questão anulada (ponto atribuído)';
      statusClass = 'anulada';
    }

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'review-options';
    q.options.forEach((opt) => {
      const line = document.createElement('div');
      line.className = 'review-option';
      let mark = '';
      if (opt.letter === correctAns) {
        mark = ' (Gabarito oficial)';
        line.classList.add('gabarito');
      }
      if (opt.letter === userAns && !isCorrect) {
        mark = ' (Sua resposta)';
        line.classList.add('sua-resposta');
      }
      line.textContent = `${opt.letter}) ${opt.text}${mark}`;
      optionsWrap.appendChild(line);
    });

    const meta = document.createElement('div');
    meta.className = 'review-meta';
    const origin = document.createElement('span');
    origin.textContent = `Questão ${idx + 1} • ${q.edition} (${q.year})`;
    const status = document.createElement('span');
    status.className = `review-status ${statusClass}`;
    status.textContent = statusText;
    meta.appendChild(origin);
    meta.appendChild(status);

    const statement = document.createElement('p');
    statement.className = 'review-statement';
    statement.textContent = q.statement;

    card.appendChild(meta);
    card.appendChild(statement);
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
  history.forEach(attempt => {
    (attempt.editions || []).forEach(ed => {
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
  const best = Math.max(...history.map(item => item.percent));

  historyAverage.textContent = `${average}%`;
  historyBest.textContent = `${best}%`;
  historyCount.textContent = String(history.length);

  renderEditionStats(historyEditionStats, aggregateEditions(history));

  historyList.innerHTML = '';
  history.forEach(attempt => {
    const item = document.createElement('article');
    item.className = `history-item ${attempt.approved ? 'approved' : 'failed'}`;
    const chips = (attempt.editions || []).map(ed => {
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
