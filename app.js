// ResumeAI — app.js
// Hardware: Web Speech API (mic) + MediaDevices (câmera)
// Storage: localStorage para histórico
// PWA: Service Worker registration + install prompt

'use strict';

// ─── CONSTANTS ───────────────────────────────────────────────
const API_KEY   = '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'; // substituído via env no deploy
const API_URL   = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL     = 'meta-llama/llama-3.3-70b-instruct';
const MAX_HIST  = 10;

const STYLE_PROMPTS = {
  conciso:   'Você é um assistente de resumo. Gere um resumo CONCISO e direto, em no máximo 3 frases curtas, capturando apenas os pontos mais essenciais do texto.',
  detalhado: 'Você é um assistente de resumo. Gere um resumo DETALHADO cobrindo os principais pontos, argumentos e conclusões do texto, em parágrafos claros.',
  topicos:   'Você é um assistente de resumo. Gere um resumo em TÓPICOS (bullet points com •), listando os 5 a 8 pontos mais importantes do texto de forma clara e objetiva.',
  academico: 'Você é um assistente de resumo acadêmico. Gere um resumo no estilo ACADÊMICO com linguagem formal, estrutura dissertativa (contexto, desenvolvimento e síntese) adequado para trabalhos universitários.'
};

// ─── STATE ───────────────────────────────────────────────────
let selectedStyle = 'conciso';
let recognition   = null;
let isListening   = false;
let cameraStream  = null;
let deferredPrompt = null;

// ─── DOM REFS ────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const textInput       = $('text-input');
const submitBtn       = $('submit-btn');
const clearBtn        = $('clear-btn');
const charCount       = $('char-count');
const resultSection   = $('result-section');
const resultBody      = $('result-body');
const loadingState    = $('loading-state');
const micBtn          = $('mic-btn');
const camBtn          = $('cam-btn');
const camModal        = $('cam-modal');
const camClose        = $('cam-close');
const camVideo        = $('cam-video');
const camCanvas       = $('cam-canvas');
const camCapture      = $('cam-capture');
const listeningOverlay= $('listening-overlay');
const copyBtn         = $('copy-btn');
const shareBtn        = $('share-btn');
const historyList     = $('history-list');
const historyEmpty    = $('history-empty');
const clearHistBtn    = $('clear-history-btn');
const installBanner   = $('install-banner');
const installBtn      = $('install-btn');
const installDismiss  = $('install-dismiss');
const offlineToast    = $('offline-toast');
const statOriginal    = $('stat-original');
const statSummary     = $('stat-summary');
const statReduction   = $('stat-reduction');

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  initStyles();
  initTextInput();
  initMic();
  initCamera();
  initResult();
  initHistory();
  initPWAInstall();
  initOfflineDetection();
});

// ─── SERVICE WORKER ──────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .catch(err => console.warn('SW registration failed:', err));
  }
}

// ─── STYLE SELECTOR ──────────────────────────────────────────
function initStyles() {
  document.querySelectorAll('.style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.style-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      selectedStyle = btn.dataset.style;
    });
  });
}

// ─── TEXT INPUT ──────────────────────────────────────────────
function initTextInput() {
  textInput.addEventListener('input', updateInputState);
  clearBtn.addEventListener('click', () => {
    textInput.value = '';
    updateInputState();
    textInput.focus();
  });
}

function updateInputState() {
  const len = textInput.value.length;
  charCount.textContent = `${len.toLocaleString('pt-BR')} / 10.000`;
  submitBtn.disabled = len < 30;

  // Near limit warning
  if (len > 9000) {
    charCount.style.color = 'var(--danger)';
  } else if (len > 7000) {
    charCount.style.color = 'var(--warning)';
  } else {
    charCount.style.color = '';
  }
}

// ─── SUMMARIZE ───────────────────────────────────────────────
submitBtn.addEventListener('click', summarize);

async function summarize() {
  const text = textInput.value.trim();
  if (!text || text.length < 30) return;

  showLoading(true);
  hideResult();

  try {
    const summary = await callAPI(text, selectedStyle);
    showResult(summary, text);
    saveToHistory(summary, text, selectedStyle);
  } catch (err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

async function callAPI(text, style) {
  const systemPrompt = STYLE_PROMPTS[style];

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'ResumeAI'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: `Texto para resumir:\n\n${text}` }
      ]
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Erro na API (${res.status})`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Resposta vazia da IA');
  return content.trim();
}

// ─── RESULT ──────────────────────────────────────────────────
function initResult() {
  copyBtn.addEventListener('click', copyResult);
  shareBtn.addEventListener('click', shareResult);
}

function showResult(summary, originalText) {
  resultBody.textContent = summary;

  // Stats
  const origWords = countWords(originalText);
  const sumWords  = countWords(summary);
  const reduction = origWords > 0
    ? Math.round((1 - sumWords / origWords) * 100)
    : 0;

  statOriginal.textContent  = `Original: ${origWords} palavras`;
  statSummary.textContent   = `Resumo: ${sumWords} palavras`;
  statReduction.textContent = `${reduction}% redução`;

  resultSection.classList.remove('hidden');
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResult() {
  resultSection.classList.add('hidden');
}

function showLoading(show) {
  submitBtn.disabled = true;
  loadingState.classList.toggle('hidden', !show);
  if (!show) submitBtn.disabled = textInput.value.length < 30;
}

function showError(msg) {
  resultBody.innerHTML = `<span style="color:var(--danger)">⚠ Erro: ${msg}</span>`;
  resultSection.classList.remove('hidden');
}

async function copyResult() {
  const text = resultBody.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const orig = copyBtn.innerHTML;
    copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="var(--success)" stroke-width="2.5" stroke-linecap="round"/></svg>`;
    setTimeout(() => { copyBtn.innerHTML = orig; }, 1800);
  } catch {
    // fallback
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}

async function shareResult() {
  const text = resultBody.textContent;
  if (!text) return;
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Resumo — ResumeAI',
        text: text
      });
    } catch { /* user cancelled */ }
  } else {
    await copyResult();
    alert('Resumo copiado! (Web Share API não disponível neste navegador)');
  }
}

function countWords(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

// ─── HISTORY ─────────────────────────────────────────────────
function initHistory() {
  clearHistBtn.addEventListener('click', clearHistory);
  renderHistory();
}

function saveToHistory(summary, original, style) {
  let history = getHistory();
  history.unshift({
    id:       Date.now(),
    summary,
    original,
    style,
    date:     new Date().toISOString()
  });
  if (history.length > MAX_HIST) history = history.slice(0, MAX_HIST);
  localStorage.setItem('resumeai_history', JSON.stringify(history));
  renderHistory();
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('resumeai_history') || '[]');
  } catch { return []; }
}

function renderHistory() {
  const history = getHistory();
  historyEmpty.style.display = history.length ? 'none' : '';
  clearHistBtn.classList.toggle('hidden', history.length === 0);

  // Remove existing items
  document.querySelectorAll('.history-item').forEach(el => el.remove());

  history.forEach(item => {
    const el = document.createElement('article');
    el.className = 'history-item';
    el.setAttribute('role', 'listitem');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `Resumo ${STYLE_LABELS[item.style] || item.style} de ${formatDate(item.date)}`);

    el.innerHTML = `
      <div class="history-item__meta">
        <span class="history-item__style">${STYLE_LABELS[item.style] || item.style}</span>
        <span class="history-item__time">${formatDate(item.date)}</span>
      </div>
      <p class="history-item__preview">${escapeHTML(item.summary)}</p>
    `;

    el.addEventListener('click', () => loadHistoryItem(item));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        loadHistoryItem(item);
      }
    });

    historyList.appendChild(el);
  });
}

function loadHistoryItem(item) {
  textInput.value = item.original;
  updateInputState();

  // Switch style
  document.querySelectorAll('.style-btn').forEach(b => {
    const active = b.dataset.style === item.style;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  selectedStyle = item.style;

  showResult(item.summary, item.original);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearHistory() {
  localStorage.removeItem('resumeai_history');
  renderHistory();
}

const STYLE_LABELS = {
  conciso:   'Conciso',
  detalhado: 'Detalhado',
  topicos:   'Tópicos',
  academico: 'Acadêmico'
};

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapeHTML(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ─── HARDWARE: MICROFONE (Web Speech API) ───────────────────
function initMic() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.title = 'Reconhecimento de voz não suportado neste navegador';
    micBtn.style.opacity = '0.4';
    micBtn.addEventListener('click', () => {
      alert('Seu navegador não suporta reconhecimento de voz.\nTente no Chrome ou Edge.');
    });
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.continuous = true;
  recognition.interimResults = true;

  let finalTranscript = '';

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('active');
    listeningOverlay.classList.remove('hidden');
    finalTranscript = textInput.value;
  };

  recognition.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        finalTranscript += e.results[i][0].transcript + ' ';
      } else {
        interim += e.results[i][0].transcript;
      }
    }
    textInput.value = finalTranscript + interim;
    updateInputState();
  };

  recognition.onerror = e => {
    console.warn('Speech error:', e.error);
    stopListening();
  };

  recognition.onend = () => {
    stopListening();
  };

  micBtn.addEventListener('click', () => {
    if (isListening) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch {
        recognition.abort();
        setTimeout(() => recognition.start(), 200);
      }
    }
  });
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove('active');
  listeningOverlay.classList.add('hidden');
  updateInputState();
}

// ─── HARDWARE: CÂMERA (MediaDevices API) ────────────────────
function initCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    camBtn.title = 'Câmera não suportada neste navegador';
    camBtn.style.opacity = '0.4';
    return;
  }

  camBtn.addEventListener('click', openCamera);
  camClose.addEventListener('click', closeCamera);
  camCapture.addEventListener('click', capturePhoto);
}

async function openCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false
    });
    camVideo.srcObject = cameraStream;
    camModal.classList.remove('hidden');
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      alert('Permissão de câmera negada. Habilite nas configurações do seu navegador.');
    } else {
      alert('Não foi possível acessar a câmera: ' + err.message);
    }
  }
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  camVideo.srcObject = null;
  camModal.classList.add('hidden');
}

async function capturePhoto() {
  if (!cameraStream) return;

  // Draw frame to canvas
  camCanvas.width  = camVideo.videoWidth  || 640;
  camCanvas.height = camVideo.videoHeight || 480;
  const ctx = camCanvas.getContext('2d');
  ctx.drawImage(camVideo, 0, 0);

  const imageData = camCanvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  closeCamera();

  // Use Claude vision to extract text from image
  showLoading(true);
  try {
    const extractedText = await extractTextFromImage(imageData);
    if (extractedText && extractedText.trim().length > 10) {
      textInput.value = (textInput.value ? textInput.value + '\n\n' : '') + extractedText.trim();
      updateInputState();
    } else {
      alert('Nenhum texto detectado na imagem. Tente capturar um texto mais legível.');
    }
  } catch (err) {
    alert('Erro ao extrair texto: ' + err.message);
  } finally {
    showLoading(false);
  }
}

async function extractTextFromImage(base64Image) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'ResumeAI'
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.2-11b-vision-instruct',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Image}` }
          },
          {
            type: 'text',
            text: 'Extraia e transcreva todo o texto visível nesta imagem. Retorne apenas o texto extraído, sem comentários ou formatação adicional. Se não houver texto, responda "SEM_TEXTO".'
          }
        ]
      }]
    })
  });

  if (!res.ok) throw new Error(`Erro API (${res.status})`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';
  if (content === 'SEM_TEXTO' || content === '') return '';
  return content;
}

// ─── PWA INSTALL PROMPT ──────────────────────────────────────
function initPWAInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;

    // Show banner after 3s
    setTimeout(() => {
      installBanner.classList.remove('hidden');
    }, 3000);
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    installBanner.classList.add('hidden');
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('PWA installed');
    }
    deferredPrompt = null;
  });

  installDismiss.addEventListener('click', () => {
    installBanner.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    installBanner.classList.add('hidden');
    deferredPrompt = null;
  });
}

// ─── OFFLINE DETECTION ───────────────────────────────────────
function initOfflineDetection() {
  function updateOnline() {
    offlineToast.classList.toggle('hidden', navigator.onLine);
    const badge = document.querySelector('.badge--live');
    if (badge) {
      badge.textContent = navigator.onLine ? '● Ao vivo' : '● Offline';
      badge.style.background = navigator.onLine
        ? 'rgba(34, 197, 94, 0.12)'
        : 'rgba(239, 68, 68, 0.12)';
      badge.style.color = navigator.onLine ? 'var(--success)' : 'var(--danger)';
    }
  }

  window.addEventListener('online',  updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();
}
