// ══════════════════════════════════════════════════════════════════════════════
// StudyAI – app.js  (Supabase Edition)
// ══════════════════════════════════════════════════════════════════════════════

const BACKEND   = 'https://studyai-backend-gray.vercel.app';
const SUPA_URL  = 'https://pxskdaweaclfmhtjohxj.supabase.co';
const SUPA_ANON = 'sb_publishable_zmDuqGl6vDlfbMm5TqWXeA_oJ5Op2qj';

// ── State ────────────────────────────────────────────────────────────────────
let currentUser   = null;
let userToken     = null;
let currentSet    = null;   // Set gerade im Ergebnis-Screen
let openSetId     = null;   // Set gerade im StudySet-View
let allSets       = [];
let planItems     = [];
let currentMode   = 'all';
let fcIndex       = 0;
let fcCards       = [];
let fcDifficulty  = {};
let quizData      = [];
let quizIndex     = 0;
let quizScore     = 0;
let quizAnswered  = false;
let quizWrong     = [];
let timerInterval = null;
let timerSeconds  = 25 * 60;
let timerTotal    = 25 * 60;
let timerRunning  = false;
let isDark        = true;

// ── Helpers ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showToast(msg, type = 'success') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = 'toast', 3000);
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $(`screen-${name}`).style.display = 'block';
  const nb = $(`nav-${name}`);
  if (nb) nb.classList.add('active');
  if (name === 'dashboard') loadDashboard();
  if (name === 'library')   loadLibrary();
  if (name === 'plan')      loadPlan();
}

function closeModal() {
  $('modal-overlay').style.display = 'none';
}

// ── Auth ─────────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  $('tab-login').classList.toggle('active', tab === 'login');
  $('tab-signup').classList.toggle('active', tab === 'signup');
  $('auth-login-form').style.display  = tab === 'login'  ? 'block' : 'none';
  $('auth-signup-form').style.display = tab === 'signup' ? 'block' : 'none';
  $('auth-error').style.display   = 'none';
  $('auth-success').style.display = 'none';
}

function showAuthError(msg) {
  const el = $('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
  $('auth-success').style.display = 'none';
}

function showAuthSuccess(msg) {
  const el = $('auth-success');
  el.textContent = msg;
  el.style.display = 'block';
  $('auth-error').style.display = 'none';
}

async function doSignup() {
  const name     = $('signup-name').value.trim();
  const email    = $('signup-email').value.trim();
  const password = $('signup-password').value;
  if (!name || !email || !password) return showAuthError('Bitte alle Felder ausfüllen.');
  if (password.length < 6) return showAuthError('Passwort mind. 6 Zeichen.');
  $('signup-btn-text').textContent = 'Wird erstellt...';
  try {
    const res  = await fetch(`${SUPA_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body: JSON.stringify({ email, password, data: { name } })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || data.msg);
    if (data.session) {
      await initSession(data.session, name);
    } else {
      showAuthSuccess('Bestätigungs-E-Mail gesendet! Bitte bestätige deine E-Mail.');
    }
  } catch (e) {
    showAuthError(e.message);
  }
  $('signup-btn-text').textContent = 'Konto erstellen';
}

async function doLogin() {
  const email    = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) return showAuthError('Bitte E-Mail und Passwort eingeben.');
  $('login-btn-text').textContent = 'Anmelden...';
  try {
    const res  = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.error || data.error_description) throw new Error(data.error_description || data.error);
    await initSession(data, null);
  } catch (e) {
    showAuthError('Login fehlgeschlagen: ' + e.message);
  }
  $('login-btn-text').textContent = 'Anmelden';
}

async function doLogout() {
  try {
    await fetch(`${SUPA_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON, 'Authorization': `Bearer ${userToken}` }
    });
  } catch {}
  currentUser = null;
  userToken   = null;
  localStorage.removeItem('sai_session');
  $('app').style.display        = 'none';
  $('auth-screen').style.display = 'flex';
}

async function initSession(session, nameOverride) {
  userToken   = session.access_token;
  currentUser = session.user;
  const name  = nameOverride || currentUser.user_metadata?.name || currentUser.email.split('@')[0];
  currentUser.displayName = name;
  localStorage.setItem('sai_session', JSON.stringify({ access_token: userToken, user: currentUser }));
  $('auth-screen').style.display = 'none';
  $('app').style.display         = 'block';
  $('user-avatar').textContent   = name.charAt(0).toUpperCase();
  $('user-dropdown-name').textContent  = name;
  $('user-dropdown-email').textContent = currentUser.email;
  await ensureUserSettings();
  showScreen('dashboard');
}

async function tryRestoreSession() {
  const saved = localStorage.getItem('sai_session');
  if (!saved) return;
  try {
    const s = JSON.parse(saved);
    // Token prüfen
    const res  = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPA_ANON, 'Authorization': `Bearer ${s.access_token}` }
    });
    if (!res.ok) { localStorage.removeItem('sai_session'); return; }
    const user = await res.json();
    s.user = user;
    await initSession(s, null);
  } catch { localStorage.removeItem('sai_session'); }
}

// ── Supabase DB Calls ─────────────────────────────────────────────────────────
function dbHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPA_ANON,
    'Authorization': `Bearer ${userToken}`,
  };
}

async function dbGet(table, params = '') {
  const res  = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}`, { headers: dbHeaders() });
  return res.ok ? res.json() : [];
}

async function dbInsert(table, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...dbHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function dbUpdate(table, id, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...dbHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(body)
  });
  return res.ok;
}

async function dbDelete(table, id) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'DELETE',
    headers: dbHeaders()
  });
  return res.ok;
}

async function ensureUserSettings() {
  const rows = await dbGet('user_settings', `user_id=eq.${currentUser.id}`);
  if (!rows || rows.length === 0) {
    await dbInsert('user_settings', {
      user_id: currentUser.id, streak: 0, theme: 'dark', activity_log: {}
    });
  }
  updateStreakUI();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 17 ? 'Guten Tag' : 'Guten Abend';
  $('dash-greeting').textContent = `${greeting}, ${currentUser.displayName}! 👋`;

  const sets   = await dbGet('learning_sets', `user_id=eq.${currentUser.id}&order=updated_at.desc`);
  const stats  = await dbGet('quiz_stats',    `user_id=eq.${currentUser.id}`);
  allSets = sets || [];

  $('stat-sets').textContent    = allSets.length;
  $('stat-quizzes').textContent = stats.length;
  if (stats.length > 0) {
    const avg = Math.round(stats.reduce((a, s) => a + (s.score / s.total * 100), 0) / stats.length);
    $('stat-score').textContent = avg + '%';
  }

  // Letzte Sets
  const recentEl = $('recent-sets-list');
  recentEl.innerHTML = allSets.slice(0, 5).map(s =>
    `<div class="recent-set-item" onclick="openSet('${s.id}')">
      <span class="recent-set-title">${s.title}</span>
      <span class="recent-set-sub">${s.subject || 'Allgemein'}</span>
    </div>`
  ).join('') || '<p class="empty-hint-small">Noch keine Sets</p>';

  renderHeatmap(stats);
  updateStreakUI();
}

function renderHeatmap(stats) {
  const el   = $('activity-heatmap');
  const days = 63;
  const counts = {};
  stats.forEach(s => {
    const d = s.date?.split('T')[0];
    if (d) counts[d] = (counts[d] || 0) + 1;
  });
  let html = '';
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d   = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const n   = counts[key] || 0;
    const lvl = n === 0 ? 0 : n < 2 ? 1 : n < 4 ? 2 : 3;
    html += `<div class="heatmap-cell lv${lvl}" title="${key}: ${n} Quiz"></div>`;
  }
  el.innerHTML = html;
}

async function updateStreakUI() {
  const rows = await dbGet('user_settings', `user_id=eq.${currentUser.id}`);
  if (rows && rows.length > 0) {
    $('streak-count').textContent = rows[0].streak || 0;
  }
}

// ── File Upload & Analyse ─────────────────────────────────────────────────────
let uploadedFileData = null;
let uploadedFileType = null;

function resetUpload() {
  uploadedFileData = null;
  uploadedFileType = null;
  $('file-preview').style.display   = 'none';
  $('upload-options').style.display = 'none';
  $('upload-area').style.display    = 'block';
  $('file-input').value = '';
}

async function handleFile(file) {
  if (!file) return;
  $('upload-area').style.display    = 'none';
  $('file-preview').style.display   = 'block';
  $('upload-options').style.display = 'block';
  $('file-preview-name').textContent = file.name;
  $('set-title-input').value = file.name.replace(/\.[^.]+$/, '');
  uploadedFileType = file.type;

  if (file.name.endsWith('.docx')) {
    const ab   = await file.arrayBuffer();
    const res  = await mammoth.extractRawText({ arrayBuffer: ab });
    uploadedFileData = { type: 'text', content: res.value };
  } else if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
    const b64  = await fileToBase64(file);
    uploadedFileData = { type: file.type.startsWith('image/') ? 'image' : 'pdf', content: b64, mimeType: file.type };
  } else {
    const text = await file.text();
    uploadedFileData = { type: 'text', content: text };
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function setMode(m) {
  currentMode = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  $(`mode-${m}`).classList.add('active');
}

async function analyzeDocument() {
  if (!uploadedFileData) return showToast('Kein Dokument geladen', 'error');
  const title = $('set-title-input').value.trim() || 'Unbenannt';
  $('loading-overlay').style.display = 'flex';
  $('analyze-btn').disabled = true;

  try {
    const modes = currentMode === 'all' ? ['flashcards', 'summary', 'quiz'] : [currentMode];
    let flashcards = [], summary = '', quiz = [];

    for (const mode of modes) {
      $('loading-text').textContent = `Erstelle ${mode === 'flashcards' ? 'Karteikarten' : mode === 'summary' ? 'Zusammenfassung' : 'Quiz'}...`;
      const prompt = buildPrompt(mode, uploadedFileData);
      const result = await callBackend(prompt, uploadedFileData);
      if (mode === 'flashcards') flashcards = parseFlashcards(result);
      if (mode === 'summary')    summary    = result;
      if (mode === 'quiz')       quiz       = parseQuiz(result);
    }

    currentSet = { title, subject: '', flashcards, summary, quiz };
    renderResult(currentSet);
    showScreen('result');
  } catch (e) {
    showToast('Fehler: ' + e.message, 'error');
  }

  $('loading-overlay').style.display = 'none';
  $('analyze-btn').disabled = false;
}

function buildPrompt(mode, fileData) {
  const content = fileData.type === 'text' ? `\n\nDokumentinhalt:\n${fileData.content.slice(0, 8000)}` : '';
  if (mode === 'flashcards') return `Erstelle 15 Karteikarten aus diesem Dokument. Antworte NUR mit JSON-Array:\n[{"front":"Frage","back":"Antwort"}]\nKein Text ausserhalb des JSON!${content}`;
  if (mode === 'summary')    return `Erstelle eine strukturierte Zusammenfassung auf Deutsch mit Markdown (Überschriften, Listen, Fettdruck). Umfang: 300-500 Wörter.${content}`;
  if (mode === 'quiz')       return `Erstelle 10 Quizfragen auf Deutsch. Mix aus multiple_choice, true_false und freetext. Antworte NUR mit JSON-Array:\n[{"type":"multiple_choice","question":"...","options":["A","B","C","D"],"correct":0},{"type":"true_false","question":"...","correct":true},{"type":"freetext","question":"...","answer":"..."}]\nKein Text ausserhalb des JSON!${content}`;
}

async function callBackend(prompt, fileData) {
  let body;
  if (fileData.type === 'text') {
    body = { prompt };
  } else {
    body = { prompt, fileData };
  }
  const res  = await fetch(`${BACKEND}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Backend-Fehler');
  }
  const data = await res.json();
  return data.result;
}

function parseFlashcards(text) {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch { return []; }
}

function parseQuiz(text) {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch { return []; }
}

// ── Result Screen ─────────────────────────────────────────────────────────────
function renderResult(set) {
  // Flashcards
  fcCards = set.flashcards || [];
  fcIndex = 0;
  fcDifficulty = {};
  renderFlashcard();

  // Summary
  $('summary-content').innerHTML = set.summary ? marked.parse(set.summary) : '<p>Keine Zusammenfassung</p>';

  // Quiz
  quizData = set.quiz || [];
  $('quiz-start-info').textContent = `${quizData.length} Fragen`;
  $('result-title').textContent = set.title;

  // Tabs
  const hasFc   = fcCards.length > 0;
  const hasSumm = !!set.summary;
  const hasQuiz = quizData.length > 0;
  $('rtab-flash').style.display   = hasFc   ? 'block' : 'none';
  $('rtab-summary').style.display = hasSumm ? 'block' : 'none';
  $('rtab-quiz').style.display    = hasQuiz ? 'block' : 'none';

  if      (hasFc)   switchResultTab('flash');
  else if (hasSumm) switchResultTab('summary');
  else if (hasQuiz) switchResultTab('quiz');
}

function switchResultTab(tab) {
  ['flash', 'summary', 'quiz'].forEach(t => {
    $(`result-${t}`).style.display = t === tab ? 'block' : 'none';
    $(`rtab-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'quiz') {
    $('quiz-start-screen').style.display  = 'flex';
    $('quiz-play-screen').style.display   = 'none';
    $('quiz-result-screen').style.display = 'none';
  }
}

// ── Flashcards ────────────────────────────────────────────────────────────────
function renderFlashcard() {
  if (fcCards.length === 0) {
    $('fc-wrap').innerHTML = '<p class="empty-hint">Keine Karteikarten</p>';
    return;
  }
  const card = fcCards[fcIndex];
  $('fc-front-text').textContent = card.front;
  $('fc-back-text').textContent  = card.back;
  $('fc-counter').textContent    = `${fcIndex + 1} / ${fcCards.length}`;
  const pct = ((fcIndex + 1) / fcCards.length * 100);
  $('fc-progress-fill').style.width = pct + '%';
  const fc = $('fc-card');
  fc.classList.remove('flipped');
  const diff = fcDifficulty[fcIndex];
  $('fc-diff-badge').textContent = diff === 'easy' ? '😊 Leicht' : diff === 'medium' ? '🤔 Mittel' : diff === 'hard' ? '😰 Schwer' : '';
  $('fc-diff-badge').className   = `diff-badge ${diff ? 'diff-badge-' + diff : ''}`;
}

function flipCard() { $('fc-card').classList.toggle('flipped'); }

function fcNav(dir) {
  fcIndex = Math.max(0, Math.min(fcCards.length - 1, fcIndex + dir));
  renderFlashcard();
}

function setDifficulty(d) { fcDifficulty[fcIndex] = d; renderFlashcard(); }

function repeatHard() {
  const hard = fcCards.filter((_, i) => fcDifficulty[i] === 'hard');
  if (hard.length === 0) { showToast('Keine schwierigen Karten!'); return; }
  fcCards = hard; fcIndex = 0; fcDifficulty = {};
  renderFlashcard();
  showToast(`${hard.length} schwierige Karten zum Wiederholen`);
}

// ── Quiz ──────────────────────────────────────────────────────────────────────
function startQuiz() {
  quizIndex   = 0;
  quizScore   = 0;
  quizAnswered = false;
  quizWrong   = [];
  $('quiz-start-screen').style.display  = 'none';
  $('quiz-play-screen').style.display   = 'block';
  $('quiz-result-screen').style.display = 'none';
  renderQuestion();
}

function renderQuestion() {
  if (quizIndex >= quizData.length) { showQuizResult(); return; }
  const q = quizData[quizIndex];
  quizAnswered = false;
  $('quiz-q-num').textContent     = `Frage ${quizIndex + 1}/${quizData.length}`;
  $('quiz-q-type').textContent    = q.type === 'multiple_choice' ? 'Multiple Choice' : q.type === 'true_false' ? 'Wahr/Falsch' : 'Freitext';
  $('quiz-question-text').textContent = q.question;
  $('quiz-progress-fill').style.width = ((quizIndex / quizData.length) * 100) + '%';
  $('quiz-feedback').style.display    = 'none';
  $('quiz-next-btn').style.display    = 'none';
  $('quiz-explanation').style.display = 'none';
  $('quiz-freetext-wrap').style.display = 'none';
  $('quiz-options-wrap').innerHTML    = '';

  if (q.type === 'freetext') {
    $('quiz-freetext-wrap').style.display = 'block';
    $('quiz-freetext-input').value = '';
  } else {
    const options = q.type === 'true_false' ? ['Wahr', 'Falsch'] : q.options;
    options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className   = 'quiz-option-btn';
      btn.textContent = opt;
      btn.onclick     = () => selectAnswer(i, q);
      $('quiz-options-wrap').appendChild(btn);
    });
  }
}

function selectAnswer(i, q) {
  if (quizAnswered) return;
  quizAnswered = true;
  const opts   = document.querySelectorAll('.quiz-option-btn');
  let correct;
  if (q.type === 'true_false') {
    correct = (i === 0) === q.correct;
    const correctIdx = q.correct ? 0 : 1;
    opts.forEach((b, idx) => b.classList.add(idx === correctIdx ? 'correct' : 'wrong'));
  } else {
    correct = i === q.correct;
    opts.forEach((b, idx) => b.classList.add(idx === q.correct ? 'correct' : idx === i ? 'wrong' : ''));
  }
  if (correct) quizScore++; else quizWrong.push(q);
  showFeedback(correct, q);
}

async function submitFreetext() {
  if (quizAnswered) return;
  const answer = $('quiz-freetext-input').value.trim();
  if (!answer) return;
  quizAnswered = true;
  $('quiz-freetext-input').disabled = true;
  const q = quizData[quizIndex];
  const prompt = `Frage: "${q.question}"\nMusterantwort: "${q.answer}"\nAntwort des Schülers: "${answer}"\nIst die Antwort inhaltlich korrekt? Antworte mit "KORREKT" oder "FALSCH" und einer kurzen Erklärung (1-2 Sätze).`;
  const res = await callBackend(prompt, { type: 'text', content: '' });
  const correct = res.toUpperCase().includes('KORREKT');
  if (correct) quizScore++; else quizWrong.push(q);
  showFeedback(correct, q, res);
}

function showFeedback(correct, q, explanation) {
  $('quiz-feedback').style.display = 'block';
  $('quiz-feedback-text').innerHTML = correct
    ? '<span class="feedback-correct">✓ Richtig!</span>'
    : `<span class="feedback-wrong">✗ Falsch!</span> Richtige Antwort: <strong>${q.type === 'true_false' ? (q.correct ? 'Wahr' : 'Falsch') : q.options?.[q.correct] || q.answer}</strong>`;
  if (explanation && !correct) {
    $('quiz-explanation').textContent = explanation;
    $('quiz-explanation').style.display = 'block';
  }
  $('quiz-next-btn').style.display = 'block';
}

async function explainAnswer() {
  const q = quizData[quizIndex];
  $('quiz-explain-btn').textContent = 'Lädt...';
  const prompt = `Erkläre kurz (2-3 Sätze) warum folgende Antwort korrekt ist:\nFrage: "${q.question}"\nAntwort: "${q.type === 'true_false' ? (q.correct ? 'Wahr' : 'Falsch') : q.options?.[q.correct] || q.answer}"`;
  const res = await callBackend(prompt, { type: 'text', content: '' });
  $('quiz-explanation').textContent = res;
  $('quiz-explanation').style.display = 'block';
  $('quiz-explain-btn').style.display = 'none';
}

function nextQuestion() {
  quizIndex++;
  $('quiz-freetext-input').disabled = false;
  renderQuestion();
}

async function showQuizResult() {
  $('quiz-play-screen').style.display   = 'none';
  $('quiz-result-screen').style.display = 'flex';
  const pct = Math.round(quizScore / quizData.length * 100);
  $('quiz-result-score').textContent = `${pct}%`;
  $('quiz-result-text').textContent  = `${quizScore} von ${quizData.length} Fragen richtig`;

  // Score speichern
  if (openSetId) {
    await dbInsert('quiz_stats', { user_id: currentUser.id, set_id: openSetId, score: quizScore, total: quizData.length });
  }

  // Streak updaten
  await updateStreak();

  if (pct >= 80) launchConfetti();

  if (quizWrong.length > 0) {
    $('quiz-weakness-wrap').style.display = 'block';
    $('quiz-weakness-text').textContent   = 'Analysiere Schwächen...';
    const wrongList = quizWrong.map(q => `- ${q.question}`).join('\n');
    const prompt = `Der Schüler hat folgende Fragen falsch beantwortet:\n${wrongList}\nGib eine kurze Schwächenanalyse (3-4 Sätze) und konkrete Lerntipps.`;
    const res = await callBackend(prompt, { type: 'text', content: '' });
    $('quiz-weakness-text').textContent = res;
  }
}

async function updateStreak() {
  const rows = await dbGet('user_settings', `user_id=eq.${currentUser.id}`);
  if (!rows || rows.length === 0) return;
  const s    = rows[0];
  const today = new Date().toISOString().split('T')[0];
  if (s.last_active === today) return;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr  = yesterday.toISOString().split('T')[0];
  const streak = s.last_active === yStr ? (s.streak || 0) + 1 : 1;
  await dbUpdate('user_settings', currentUser.id, { streak, last_active: today, user_id: currentUser.id });
  // Für user_settings ist user_id der PK, nicht id
  await fetch(`${SUPA_URL}/rest/v1/user_settings?user_id=eq.${currentUser.id}`, {
    method: 'PATCH',
    headers: { ...dbHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify({ streak, last_active: today })
  });
  $('streak-count').textContent = streak;
}

function restartQuiz() {
  quizIndex = 0; quizScore = 0; quizWrong = [];
  $('quiz-start-screen').style.display  = 'flex';
  $('quiz-play-screen').style.display   = 'none';
  $('quiz-result-screen').style.display = 'none';
}

// ── Save Set ──────────────────────────────────────────────────────────────────
async function saveSet() {
  if (!currentSet) return;
  $('save-btn').textContent = '💾 Speichern...';
  try {
    const row = await dbInsert('learning_sets', {
      user_id:    currentUser.id,
      title:      currentSet.title,
      subject:    currentSet.subject || '',
      flashcards: currentSet.flashcards,
      summary:    currentSet.summary,
      quiz:       currentSet.quiz,
    });
    openSetId = row?.id;
    showToast('Set gespeichert! ✓');
    $('save-btn').textContent = '✓ Gespeichert';
    $('save-btn').disabled    = true;
  } catch (e) {
    showToast('Fehler beim Speichern', 'error');
  }
}

// ── Library ───────────────────────────────────────────────────────────────────
async function loadLibrary() {
  $('library-loading').style.display = 'block';
  $('library-grid').innerHTML        = '';
  allSets = await dbGet('learning_sets', `user_id=eq.${currentUser.id}&order=updated_at.desc`) || [];
  $('library-loading').style.display = 'none';

  if (allSets.length === 0) {
    $('library-empty').style.display = 'block';
    return;
  }
  $('library-empty').style.display = 'none';

  const subjects = [...new Set(allSets.map(s => s.subject || 'Allgemein'))];
  const filters  = $('subject-filters');
  filters.innerHTML = '<button class="subject-pill active" onclick="filterBySubject(\'all\', this)">Alle</button>' +
    subjects.map(s => `<button class="subject-pill" onclick="filterBySubject('${s}', this)">${s}</button>`).join('');

  renderLibraryCards(allSets);
}

function renderLibraryCards(sets) {
  $('library-grid').innerHTML = sets.map(s => `
    <div class="lib-card" onclick="openSet('${s.id}')">
      <div class="lib-card-title">${s.title}</div>
      <div class="lib-card-meta">
        <span class="subject-tag">${s.subject || 'Allgemein'}</span>
        <span>${(s.flashcards?.length || 0)} Karten · ${s.quiz?.length || 0} Fragen</span>
      </div>
      <div class="lib-card-date">${new Date(s.updated_at).toLocaleDateString('de-CH')}</div>
    </div>`).join('');
}

function filterBySubject(subject, btn) {
  document.querySelectorAll('.subject-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const filtered = subject === 'all' ? allSets : allSets.filter(s => (s.subject || 'Allgemein') === subject);
  renderLibraryCards(filtered);
}

function filterLibrary() {
  const q = $('lib-search').value.toLowerCase();
  renderLibraryCards(allSets.filter(s => s.title.toLowerCase().includes(q) || (s.subject || '').toLowerCase().includes(q)));
}

async function openSet(id) {
  const set = allSets.find(s => s.id === id) || await dbGet('learning_sets', `id=eq.${id}`).then(r => r[0]);
  if (!set) return;
  openSetId = id;
  currentSet = set;
  $('studyset-title').textContent = set.title;

  // Flashcards
  fcCards = set.flashcards || []; fcIndex = 0; fcDifficulty = {};
  $('ss-flash').innerHTML = '';
  if (fcCards.length > 0) {
    $('ss-flash').innerHTML = `
      <div class="fc-progress-row"><span id="ss-fc-counter">1 / ${fcCards.length}</span><div class="fc-progress-bar"><div id="ss-fc-fill" class="fc-progress-fill"></div></div></div>
      <div class="flashcard-wrap"><div class="flashcard" id="ss-fc-card" onclick="ssFlipCard()"><div class="fc-face fc-front"><div class="fc-content" id="ss-fc-front"></div></div><div class="fc-face fc-back"><div class="fc-content" id="ss-fc-back"></div></div></div></div>
      <div class="fc-flip-hint">Klicken zum Umdrehen</div>
      <div class="fc-actions"><button class="fc-btn fc-btn-wrong" onclick="ssFcNav(-1)">← Zurück</button><button class="fc-btn fc-btn-right" onclick="ssFcNav(1)">Weiter →</button></div>`;
    ssFcRender();
  }

  // Summary
  $('ss-summary').innerHTML = set.summary ? `<div class="summary-wrap">${marked.parse(set.summary)}</div>` : '<p class="empty-hint">Keine Zusammenfassung</p>';

  // Quiz
  quizData = set.quiz || [];
  $('ss-quiz').innerHTML = quizData.length > 0
    ? `<div class="quiz-start-card"><h3>Quiz starten</h3><p>${quizData.length} Fragen</p><button class="btn-primary" onclick="startSSQuiz()">Quiz starten →</button></div>`
    : '<p class="empty-hint">Kein Quiz</p>';

  switchSSTab('flash');
  showScreen('studyset');
}

function ssFcRender() {
  const c = fcCards[fcIndex];
  const front = document.getElementById('ss-fc-front');
  const back  = document.getElementById('ss-fc-back');
  const cnt   = document.getElementById('ss-fc-counter');
  const fill  = document.getElementById('ss-fc-fill');
  if (front) front.textContent = c.front;
  if (back)  back.textContent  = c.back;
  if (cnt)   cnt.textContent   = `${fcIndex + 1} / ${fcCards.length}`;
  if (fill)  fill.style.width  = ((fcIndex + 1) / fcCards.length * 100) + '%';
  document.getElementById('ss-fc-card')?.classList.remove('flipped');
}
function ssFlipCard() { document.getElementById('ss-fc-card')?.classList.toggle('flipped'); }
function ssFcNav(dir) { fcIndex = Math.max(0, Math.min(fcCards.length - 1, fcIndex + dir)); ssFcRender(); }

function startSSQuiz() {
  $('ss-quiz').innerHTML = `
    <div id="quiz-start-screen" style="display:none"></div>
    <div id="quiz-play-screen"></div>
    <div id="quiz-result-screen" style="display:none"></div>`;
  startQuiz();
}

function switchSSTab(tab) {
  ['flash', 'summary', 'quiz'].forEach(t => {
    $(`ss-${t}`).style.display = t === tab ? 'block' : 'none';
    $(`sstab-${t}`).classList.toggle('active', t === tab);
  });
}

async function deleteCurrentSet() {
  if (!openSetId) return;
  if (!confirm('Set wirklich löschen?')) return;
  await dbDelete('learning_sets', openSetId);
  showToast('Set gelöscht');
  showScreen('library');
}

// ── Lernplan ──────────────────────────────────────────────────────────────────
async function loadPlan() {
  $('plan-loading').style.display = 'block';
  planItems = await dbGet('study_plan', `user_id=eq.${currentUser.id}&order=date.asc`) || [];
  $('plan-loading').style.display = 'none';
  renderPlan();
}

function renderPlan() {
  const groups = {};
  planItems.forEach(item => {
    const d = item.date;
    if (!groups[d]) groups[d] = [];
    groups[d].push(item);
  });
  const today = new Date().toISOString().split('T')[0];
  $('plan-list').innerHTML = Object.keys(groups).length === 0
    ? '<p class="empty-hint">Noch keine Lernziele. Füge eines hinzu!</p>'
    : Object.entries(groups).map(([date, items]) => {
        const isPast = date < today;
        const dateObj = new Date(date + 'T12:00:00');
        const label   = dateObj.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
        return `<div class="plan-group ${isPast ? 'plan-past' : ''}">
          <div class="plan-date-label">${label}</div>
          ${items.map(item => `
            <div class="plan-item ${item.done ? 'plan-done' : ''}">
              <input type="checkbox" ${item.done ? 'checked' : ''} onchange="togglePlanItem('${item.id}', this.checked)"/>
              <span>${item.title}</span>
              <button class="btn-ghost btn-sm" onclick="deletePlanItem('${item.id}')">✕</button>
            </div>`).join('')}
        </div>`;
      }).join('');
}

function openAddPlanModal() {
  $('modal-content').innerHTML = `
    <h3 style="margin-bottom:1rem">Lernziel hinzufügen</h3>
    <div class="auth-field"><label>Titel</label><input type="text" id="plan-title-input" placeholder="z.B. Mathe Kapitel 3 wiederholen"/></div>
    <div class="auth-field"><label>Datum</label><input type="date" id="plan-date-input" value="${new Date().toISOString().split('T')[0]}"/></div>
    <div style="display:flex;gap:0.75rem;margin-top:1rem">
      <button class="btn-primary" onclick="addPlanItem()">Hinzufügen</button>
      <button class="btn-ghost" onclick="closeModal()">Abbrechen</button>
    </div>`;
  $('modal-overlay').style.display = 'flex';
}

async function addPlanItem() {
  const title = $('plan-title-input').value.trim();
  const date  = $('plan-date-input').value;
  if (!title || !date) return showToast('Bitte Titel und Datum eingeben', 'error');
  await dbInsert('study_plan', { user_id: currentUser.id, title, date, done: false });
  closeModal();
  loadPlan();
  showToast('Lernziel hinzugefügt ✓');
}

async function togglePlanItem(id, done) {
  await fetch(`${SUPA_URL}/rest/v1/study_plan?id=eq.${id}`, {
    method: 'PATCH', headers: { ...dbHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify({ done })
  });
  const item = planItems.find(p => p.id === id);
  if (item) item.done = done;
  renderPlan();
}

async function deletePlanItem(id) {
  await dbDelete('study_plan', id);
  planItems = planItems.filter(p => p.id !== id);
  renderPlan();
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function toggleTimer() {
  const p = $('timer-panel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function timerRender() {
  const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
  const s = (timerSeconds % 60).toString().padStart(2, '0');
  $('timer-display').textContent = `${m}:${s}`;
  const pct    = timerSeconds / timerTotal;
  const circum = 2 * Math.PI * 54;
  $('timer-ring-fill').style.strokeDashoffset = circum * (1 - pct);
  $('timer-ring-fill').style.strokeDasharray  = circum;
}

function toggleTimerRun() {
  if (timerRunning) {
    clearInterval(timerInterval); timerRunning = false;
    $('timer-start-btn').textContent = '▶ Start';
  } else {
    timerRunning = true;
    $('timer-start-btn').textContent = '⏸ Pause';
    timerInterval = setInterval(() => {
      if (timerSeconds <= 0) { clearInterval(timerInterval); timerRunning = false; $('timer-start-btn').textContent = '▶ Start'; showToast('⏰ Zeit ist um!'); return; }
      timerSeconds--;
      timerRender();
    }, 1000);
  }
}

function resetTimer() {
  clearInterval(timerInterval); timerRunning = false;
  timerSeconds = timerTotal;
  $('timer-start-btn').textContent = '▶ Start';
  timerRender();
}

document.querySelectorAll('.timer-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.timer-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    clearInterval(timerInterval); timerRunning = false;
    timerTotal = timerSeconds = parseInt(btn.dataset.minutes) * 60;
    const labels = { '25': '🍅 Pomodoro', '5': '☕ Kurze Pause', '10': '🌿 Lange Pause' };
    $('timer-mode-label').textContent = labels[btn.dataset.minutes];
    $('timer-start-btn').textContent  = '▶ Start';
    timerRender();
  });
});

// ── Theme ─────────────────────────────────────────────────────────────────────
function toggleTheme() {
  isDark = !isDark;
  document.body.classList.toggle('light-mode', !isDark);
}

function toggleUserMenu() {
  const d = $('user-dropdown');
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', e => {
  if (!e.target.closest('.user-menu')) $('user-dropdown').style.display = 'none';
});

// ── Confetti ──────────────────────────────────────────────────────────────────
function launchConfetti() {
  const canvas = $('confetti-canvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width, y: -10,
    vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 2,
    color: `hsl(${Math.random() * 360},80%,60%)`,
    size: Math.random() * 8 + 4, rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 5
  }));
  let frame;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
      p.x += p.vx; p.y += p.vy; p.rot += p.rotV;
    });
    if (particles.some(p => p.y < canvas.height)) frame = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  draw();
  setTimeout(() => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, canvas.width, canvas.height); }, 5000);
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!currentUser) return;
  const activeScreen = document.querySelector('.screen[style*="block"]')?.id;
  if (activeScreen === 'screen-result' && $('result-flash')?.style.display !== 'none') {
    if (e.key === ' ') { e.preventDefault(); flipCard(); }
    if (e.key === 'ArrowRight') fcNav(1);
    if (e.key === 'ArrowLeft')  fcNav(-1);
  }
});

// ── Drag & Drop ────────────────────────────────────────────────────────────────
const uploadArea = $('upload-area');
if (uploadArea) {
  uploadArea.addEventListener('dragover',  e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
  uploadArea.addEventListener('dragleave', ()  => uploadArea.classList.remove('drag-over'));
  uploadArea.addEventListener('drop', e => {
    e.preventDefault(); uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
timerRender();
tryRestoreSession();
