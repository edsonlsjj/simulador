// Estado da aplicação
let currentQuiz = [];
let currentIndex = 0;
let userAnswers = {}; // { questionIndex: 'A' | 'B' ... }
let flaggedQuestions = new Set();
let timerInterval = null;
let secondsRemaining = 0;
let timerMode = 'none';
let desiredCount = 20;

// Elementos do DOM
const setupScreen = document.getElementById('setupScreen');
const quizScreen = document.getElementById('quizScreen');
const resultScreen = document.getElementById('resultScreen');

const totalBankCount = document.getElementById('totalBankCount');
const questionCountGroup = document.getElementById('questionCountGroup');
const timerModeGroup = document.getElementById('timerModeGroup');
const startBtn = document.getElementById('startBtn');

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
const statTotal = document.getElementById('statTotal');
const reviewList = document.getElementById('reviewList');
const restartBtn = document.getElementById('restartBtn');

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  if (typeof QUESTION_BANK !== 'undefined') {
    totalBankCount.textContent = QUESTION_BANK.length;
  }

  setupEventListeners();
});

function setupEventListeners() {
  // Seleção de quantidade de questões
  questionCountGroup.addEventListener('click', (e) => {
    if (e.target.classList.contains('pill-btn')) {
      questionCountGroup.querySelectorAll('.pill-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      desiredCount = parseInt(e.target.getAttribute('data-count'), 10);
    }
  });

  // Seleção de temporizador
  timerModeGroup.addEventListener('click', (e) => {
    if (e.target.classList.contains('pill-btn')) {
      timerModeGroup.querySelectorAll('.pill-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      timerMode = e.target.getAttribute('data-timer');
    }
  });

  startBtn.addEventListener('click', startQuiz);
  prevBtn.addEventListener('click', () => navigateQuestion(currentIndex - 1));
  nextBtn.addEventListener('click', () => navigateQuestion(currentIndex + 1));
  flagBtn.addEventListener('click', toggleFlagCurrent);
  finishBtn.addEventListener('click', confirmFinishQuiz);
  restartBtn.addEventListener('click', resetToSetup);
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

  // Renderizar opções A, B, C, D
  currentQOptions.innerHTML = '';
  q.options.forEach(opt => {
    const optDiv = document.createElement('div');
    optDiv.className = 'option-item';
    if (userAnswers[currentIndex] === opt.letter) {
      optDiv.classList.add('selected');
    }

    optDiv.innerHTML = `
      <span class="option-letter">${opt.letter})</span>
      <span class="option-text">${opt.text}</span>
    `;

    optDiv.addEventListener('click', () => {
      userAnswers[currentIndex] = opt.letter;
      renderCurrentQuestion();
      updateGridStatus();
    });

    currentQOptions.appendChild(optDiv);
  });

  // Atualizar botões de navegação
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === currentQuiz.length - 1;

  flagBtn.textContent = flaggedQuestions.has(currentIndex) ? '🚩 Desmarcar Dúvida' : '🏳️ Marcar Dúvida';
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
  const total = currentQuiz.length;

  currentQuiz.forEach((q, idx) => {
    const userAns = userAnswers[idx];
    const correctAns = (q.answer || '').toUpperCase().trim();

    // Se a questão foi anulada, todos ganham o ponto
    if (correctAns === 'ANULADA' || correctAns === 'X') {
      correctCount++;
    } else if (userAns && userAns === correctAns) {
      correctCount++;
    }
  });

  const percent = Math.round((correctCount / total) * 100);
  const isApproved = percent >= 70; // Corte oficial SBMFC: 70%

  // Banner
  if (isApproved) {
    resultBanner.className = 'result-banner approved';
    resultBadge.textContent = '🎉 APROVADO(A)!';
    resultSubtitle.textContent = `Parabéns! Você alcançou ${percent}%, superando a nota de corte oficial de 70% da SBMFC.`;
  } else {
    resultBanner.className = 'result-banner failed';
    resultBadge.textContent = '⚠️ NÃO APROVADO(A)';
    resultSubtitle.textContent = `Você obteve ${percent}%. A nota de corte oficial para obtenção do Título pela SBMFC é de 70%. Continue treinando!`;
  }

  statScore.textContent = `${percent}%`;
  statCorrect.textContent = correctCount;
  statWrong.textContent = total - correctCount;
  statTotal.textContent = total;

  renderReviewList();
}

function renderReviewList() {
  reviewList.innerHTML = '';
  currentQuiz.forEach((q, idx) => {
    const userAns = userAnswers[idx] || 'Não respondida';
    const correctAns = (q.answer || '').toUpperCase().trim();
    const isAnulada = (correctAns === 'ANULADA' || correctAns === 'X');
    const isCorrect = isAnulada || (userAns === correctAns);

    const card = document.createElement('div');
    card.className = `review-card ${isCorrect ? 'correct' : 'wrong'}`;

    let statusText = isCorrect ? '✅ Acertou' : '❌ Errou';
    if (isAnulada) statusText = '⚖️ Questão Anulada (Ponto Atribuído)';

    let optionsHtml = '';
    q.options.forEach(opt => {
      let mark = '';
      let style = '';
      if (opt.letter === correctAns) {
        mark = ' <strong>(Gabarito Oficial)</strong>';
        style = 'color: var(--success); font-weight: 600;';
      }
      if (opt.letter === userAns && !isCorrect) {
        mark = ' <strong>(Sua resposta)</strong>';
        style = 'color: var(--danger); text-decoration: line-through;';
      }
      optionsHtml += `<div style="margin: 4px 0; ${style}">${opt.letter}) ${opt.text}${mark}</div>`;
    });

    card.innerHTML = `
      <div class="review-meta">
        <span>Questão ${idx + 1} &bull; ${q.edition} (${q.year})</span>
        <span style="${isCorrect ? 'color: var(--success);' : 'color: var(--danger);'}">${statusText}</span>
      </div>
      <p style="margin-bottom: 12px; font-weight: 500;">${q.statement}</p>
      <div style="background: var(--neutral-light); padding: 12px; border-radius: var(--radius-sm); font-size: 14px;">
        ${optionsHtml}
      </div>
    `;

    reviewList.appendChild(card);
  });
}

function resetToSetup() {
  resultScreen.classList.add('hidden');
  quizScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

