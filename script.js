/* =========================================================================
   Arabic Numbers Learning App — v2
   Adds: manual number entry (0–9999), clickable number strip,
         extended Arabic grammar for hundreds/thousands (dates, years).
   Pure vanilla JavaScript. No frameworks, no backend.
   =========================================================================
     1.  Arabic number engine (0–9999)
     2.  State
     3.  DOM references
     4.  Rendering
     5.  Number strip
     6.  Speech synthesis
     7.  Playback engine
     8.  Manual entry
     9.  Controls / events
    10.  Panel auto-hide
    11.  Theme + settings
    12.  Init
   ========================================================================= */

'use strict';

/* =========================================================================
   1. ARABIC NUMBER ENGINE (0–9999)
   -------------------------------------------------------------------------
   Everything is generated locally — no API.
   Modern Standard Arabic, masculine counting form (the form used when
   reading a number aloud: واحد، اثنان، ثلاثة ...).

   Grammar rules implemented:
     • 11–19 are irregular                 -> أحد عشر
     • Compounds are unit-first with "و"   -> 25 = خمسة وعشرون
     • Hundreds have fused forms           -> 300 = ثلاثمئة
     • 200 / 2000 use the dual             -> مئتان / ألفان
     • 3000–10000 use the plural "آلاف"    -> 5000 = خمسة آلاف
   ========================================================================= */

const UNITS = [
  '',        // 0 handled separately
  'واحد',    // 1
  'اثنان',   // 2
  'ثلاثة',   // 3
  'أربعة',   // 4
  'خمسة',    // 5
  'ستة',     // 6
  'سبعة',    // 7
  'ثمانية',  // 8
  'تسعة',    // 9
  'عشرة'     // 10
];

const TEENS = {
  11: 'أحد عشر',   12: 'اثنا عشر',  13: 'ثلاثة عشر',
  14: 'أربعة عشر', 15: 'خمسة عشر',  16: 'ستة عشر',
  17: 'سبعة عشر',  18: 'ثمانية عشر', 19: 'تسعة عشر'
};

const TENS = {
  20: 'عشرون', 30: 'ثلاثون', 40: 'أربعون', 50: 'خمسون',
  60: 'ستون',  70: 'سبعون',  80: 'ثمانون', 90: 'تسعون'
};

const HUNDREDS = {
  1: 'مئة',      2: 'مئتان',    3: 'ثلاثمئة',
  4: 'أربعمئة',  5: 'خمسمئة',   6: 'ستمئة',
  7: 'سبعمئة',   8: 'ثمانمئة',  9: 'تسعمئة'
};

/** 1–99 */
function under100(n) {
  if (n === 0) return '';
  if (n <= 10) return UNITS[n];
  if (n < 20) return TEENS[n];
  const tens = Math.floor(n / 10) * 10;
  const unit = n % 10;
  return unit === 0 ? TENS[tens] : UNITS[unit] + ' و' + TENS[tens];
}

/** 1–999 */
function under1000(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (h) parts.push(HUNDREDS[h]);
  if (rest) parts.push(under100(rest));
  return parts.join(' و');
}

/** The "thousands" portion, e.g. 2 -> ألفان, 5 -> خمسة آلاف */
function thousandsWord(k) {
  if (k === 1) return 'ألف';
  if (k === 2) return 'ألفان';
  if (k >= 3 && k <= 10) return UNITS[k] + ' آلاف';
  return under1000(k) + ' ألفاً';
}

/**
 * Main converter. Handles 0–9999, which covers years, birth dates,
 * surgery dates, room numbers, prices, etc.
 */
function toArabicWords(n) {
  if (n === 0) return 'صفر';
  const k = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts = [];
  if (k) parts.push(thousandsWord(k));
  if (rest) parts.push(under1000(rest));
  return parts.join(' و');
}

/** Western digits -> Arabic-Indic digits */
const ARABIC_INDIC_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
function toArabicIndic(n) {
  return String(n).split('').map(d => ARABIC_INDIC_DIGITS[Number(d)]).join('');
}

/** Build one display record for any number. */
function makeItem(n) {
  return { value: n, indic: toArabicIndic(n), words: toArabicWords(n) };
}

/* =========================================================================
   2. STATE
   ========================================================================= */

const ABS_MIN = 0;
const ABS_MAX = 9999;

const state = {
  current: 1,
  rangeStart: 1,       // auto-play sequence start
  rangeEnd: 100,       // auto-play sequence end
  playing: false,
  started: false,
  muted: false,
  volume: 1,
  rate: 0.85,
  gapMs: 900,
  loop: true,
  voice: null
};

let advanceTimer = null;
let currentUtterance = null;

/* =========================================================================
   3. DOM REFERENCES
   ========================================================================= */

const el = {
  startOverlay: document.getElementById('start-overlay'),
  startBtn: document.getElementById('start-btn'),

  card: document.getElementById('card'),
  western: document.getElementById('western'),
  indic: document.getElementById('indic'),
  words: document.getElementById('words'),

  strip: document.getElementById('strip'),
  progressBar: document.getElementById('progress-bar'),
  progressLabel: document.getElementById('progress-label'),

  panel: document.getElementById('panel'),
  panelHandle: document.getElementById('panel-handle'),

  playPauseBtn: document.getElementById('btn-playpause'),
  playPauseIcon: document.getElementById('icon-playpause'),
  prevBtn: document.getElementById('btn-prev'),
  nextBtn: document.getElementById('btn-next'),
  repeatBtn: document.getElementById('btn-repeat'),
  restartBtn: document.getElementById('btn-restart'),
  muteBtn: document.getElementById('btn-mute'),
  muteIcon: document.getElementById('icon-mute'),
  themeBtn: document.getElementById('btn-theme'),

  jumpInput: document.getElementById('jump-input'),
  jumpForm: document.getElementById('jump-form'),

  rangeStart: document.getElementById('range-start'),
  rangeEnd: document.getElementById('range-end'),

  volume: document.getElementById('volume'),
  speed: document.getElementById('speed'),
  loopToggle: document.getElementById('loop-toggle'),
  voiceNote: document.getElementById('voice-note'),
  live: document.getElementById('live-region')
};

/* =========================================================================
   4. RENDERING
   ========================================================================= */

function render() {
  const item = makeItem(state.current);

  el.western.textContent = item.value;
  el.indic.textContent = item.indic;
  el.words.textContent = item.words;

  // Long words (e.g. 9999) need to shrink to stay on one line
  el.words.classList.toggle('is-long', item.words.length > 22);

  // Replay the entrance animation
  el.card.classList.remove('is-entering');
  void el.card.offsetWidth;
  el.card.classList.add('is-entering');

  // Progress relative to the active range
  const span = Math.max(1, state.rangeEnd - state.rangeStart);
  const pct = ((state.current - state.rangeStart) / span) * 100;
  el.progressBar.style.width = Math.min(100, Math.max(0, pct)) + '%';
  el.progressLabel.textContent = state.current + ' / ' + state.rangeEnd;

  highlightStrip();
  el.live.textContent = item.value + ' — ' + item.words;
}

/* =========================================================================
   5. NUMBER STRIP
   -------------------------------------------------------------------------
   A horizontally scrolling row of numbers along the bottom.
   Clicking any chip jumps straight to that number.
   ========================================================================= */

function buildStrip() {
  el.strip.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (let i = state.rangeStart; i <= state.rangeEnd; i++) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.n = i;
    chip.textContent = i;
    chip.setAttribute('aria-label', 'Go to number ' + i);
    frag.appendChild(chip);
  }
  el.strip.appendChild(frag);
}

function highlightStrip() {
  const prev = el.strip.querySelector('.chip.is-active');
  if (prev) prev.classList.remove('is-active');

  const chip = el.strip.querySelector('.chip[data-n="' + state.current + '"]');
  if (chip) {
    chip.classList.add('is-active');
    // Keep the active chip centred without scrolling the page itself
    chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

/* =========================================================================
   6. SPEECH SYNTHESIS
   ========================================================================= */

const synth = window.speechSynthesis;
const speechSupported = typeof synth !== 'undefined' && 'SpeechSynthesisUtterance' in window;

/** Preference: ar-QA > ar-SA > other Gulf > any Arabic voice. */
function pickArabicVoice() {
  if (!speechSupported) return null;
  const voices = synth.getVoices();
  if (!voices || !voices.length) return null;

  const arabic = voices.filter(v => (v.lang || '').toLowerCase().startsWith('ar'));
  if (!arabic.length) return null;

  const preferred = ['ar-qa','ar-sa','ar-ae','ar-kw','ar-bh','ar-eg','ar-jo','ar'];
  for (const tag of preferred) {
    const matches = arabic.filter(v =>
      (v.lang || '').toLowerCase().replace('_', '-').startsWith(tag));
    if (matches.length) {
      const enhanced = matches.find(v => /enhanced|premium|neural|natural/i.test(v.name));
      return enhanced || matches[0];
    }
  }
  return arabic[0];
}

function loadVoices() {
  state.voice = pickArabicVoice();
  updateVoiceNote();
}

function updateVoiceNote() {
  if (!speechSupported) {
    el.voiceNote.textContent = 'Speech not supported here.';
    return;
  }
  el.voiceNote.textContent = state.voice
    ? state.voice.lang
    : 'No Arabic voice';
}

function stopSpeech() {
  if (!speechSupported) return;
  if (currentUtterance) {
    currentUtterance.onend = null;
    currentUtterance.onerror = null;
    currentUtterance = null;
  }
  synth.cancel();
}

function speakCurrent(onDone) {
  const item = makeItem(state.current);
  stopSpeech(); // never let utterances overlap

  if (!speechSupported || state.muted || state.volume === 0) {
    if (onDone) onDone();
    return;
  }

  const u = new SpeechSynthesisUtterance(item.words);
  u.lang = state.voice ? state.voice.lang : 'ar-SA';
  if (state.voice) u.voice = state.voice;
  u.rate = state.rate;
  u.pitch = 1;
  u.volume = state.volume;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    currentUtterance = null;
    if (onDone) onDone();
  };
  u.onend = finish;
  u.onerror = finish;

  currentUtterance = u;
  synth.speak(u);

  // Safety net for mobile browsers that skip "onend"
  const fallbackMs = Math.max(2500, item.words.length * 220);
  setTimeout(() => { if (!finished && !synth.speaking) finish(); }, fallbackMs);
}

/* =========================================================================
   7. PLAYBACK ENGINE
   ========================================================================= */

function clearAdvanceTimer() {
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
}

function playStep() {
  render();
  speakCurrent(() => {
    if (!state.playing) return;
    clearAdvanceTimer();
    advanceTimer = setTimeout(() => {
      if (!state.playing) return;

      if (state.current >= state.rangeEnd) {
        if (state.loop) {
          state.current = state.rangeStart;
          playStep();
        } else {
          pause();
        }
        return;
      }
      state.current++;
      playStep();
    }, state.gapMs);
  });
}

function play() {
  if (state.playing) return;
  // If we're sitting outside the range (after a manual jump), re-enter it
  if (state.current < state.rangeStart || state.current > state.rangeEnd) {
    state.current = state.rangeStart;
  }
  state.playing = true;
  updatePlayPauseUI();
  playStep();
}

function pause() {
  state.playing = false;
  clearAdvanceTimer();
  stopSpeech();
  updatePlayPauseUI();
}

function togglePlay() { state.playing ? pause() : play(); }

/** Move to a number; keeps auto-play running if it was running. */
function goTo(n, opts) {
  const keepPlaying = !(opts && opts.stop) && state.playing;
  clearAdvanceTimer();
  stopSpeech();

  state.current = Math.min(ABS_MAX, Math.max(ABS_MIN, n));

  if (keepPlaying) {
    playStep();
  } else {
    if (state.playing) pause();
    render();
    speakCurrent();
  }
}

function next() { goTo(state.current >= state.rangeEnd ? state.rangeStart : state.current + 1); }
function prev() { goTo(state.current <= state.rangeStart ? state.rangeEnd : state.current - 1); }
function restart() { goTo(state.rangeStart); }

function repeat() {
  clearAdvanceTimer();
  const wasPlaying = state.playing;
  stopSpeech();
  wasPlaying ? playStep() : speakCurrent();
}

/* =========================================================================
   8. MANUAL ENTRY
   -------------------------------------------------------------------------
   Type any number 0–9999 and hear it immediately.
   Works for years and dates: 1987, 2026, 1445 ...
   Auto-play pauses so the typed number stays on screen.
   ========================================================================= */

function submitJump() {
  const raw = (el.jumpInput.value || '').trim();
  if (raw === '') return;

  // Accept Arabic-Indic digits typed on an Arabic keyboard too
  const normalised = raw.replace(/[٠-٩]/g, d => String(ARABIC_INDIC_DIGITS.indexOf(d)));
  const n = parseInt(normalised, 10);

  if (isNaN(n) || n < ABS_MIN || n > ABS_MAX) {
    el.jumpInput.classList.add('is-invalid');
    setTimeout(() => el.jumpInput.classList.remove('is-invalid'), 600);
    return;
  }

  goTo(n, { stop: true }); // pause the sequence and hold on this number
  el.jumpInput.blur();     // dismiss the mobile keyboard
}

/** Apply a new auto-play range and rebuild the clickable strip. */
function applyRange() {
  let s = parseInt(el.rangeStart.value, 10);
  let e = parseInt(el.rangeEnd.value, 10);

  if (isNaN(s)) s = 1;
  if (isNaN(e)) e = 100;
  s = Math.min(ABS_MAX, Math.max(ABS_MIN, s));
  e = Math.min(ABS_MAX, Math.max(ABS_MIN, e));
  if (e < s) { const t = s; s = e; e = t; }

  // A huge strip would hurt performance — cap the clickable chips
  if (e - s > 500) e = s + 500;

  state.rangeStart = s;
  state.rangeEnd = e;
  el.rangeStart.value = s;
  el.rangeEnd.value = e;

  if (state.current < s || state.current > e) state.current = s;

  buildStrip();
  render();
  saveSettings();
}

/* =========================================================================
   9. CONTROLS / EVENTS
   ========================================================================= */

function updatePlayPauseUI() {
  el.playPauseIcon.textContent = state.playing ? '❚❚' : '►';
  el.playPauseBtn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  el.playPauseBtn.setAttribute('aria-pressed', String(state.playing));
  el.playPauseBtn.title = state.playing ? 'Pause' : 'Play';
}

function updateMuteUI() {
  el.muteIcon.textContent = (state.muted || state.volume === 0) ? '🔇' : '🔊';
  el.muteBtn.setAttribute('aria-pressed', String(state.muted));
  el.muteBtn.title = state.muted ? 'Unmute' : 'Mute';
}

function toggleMute() {
  state.muted = !state.muted;
  if (state.muted) stopSpeech();
  updateMuteUI();
  saveSettings();
}

function applySpeedPreset(preset) {
  switch (preset) {
    case 'slow': state.rate = 0.65; state.gapMs = 1600; break;
    case 'fast': state.rate = 1.05; state.gapMs = 350;  break;
    default:     state.rate = 0.85; state.gapMs = 900;  break;
  }
  el.speed.value = preset;
}

function bindControls() {
  el.playPauseBtn.addEventListener('click', togglePlay);
  el.nextBtn.addEventListener('click', next);
  el.prevBtn.addEventListener('click', prev);
  el.repeatBtn.addEventListener('click', repeat);
  el.restartBtn.addEventListener('click', restart);
  el.muteBtn.addEventListener('click', toggleMute);

  // Manual entry
  el.jumpForm.addEventListener('submit', (e) => { e.preventDefault(); submitJump(); });

  // Range inputs
  el.rangeStart.addEventListener('change', applyRange);
  el.rangeEnd.addEventListener('change', applyRange);

  // Clickable strip (event delegation — one listener for all chips)
  el.strip.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    goTo(Number(chip.dataset.n), { stop: true });
  });

  el.volume.addEventListener('input', () => {
    state.volume = Number(el.volume.value) / 100;
    if (state.volume > 0) state.muted = false;
    updateMuteUI();
    saveSettings();
  });

  el.speed.addEventListener('change', () => { applySpeedPreset(el.speed.value); saveSettings(); });
  el.loopToggle.addEventListener('change', () => { state.loop = el.loopToggle.checked; saveSettings(); });

  // Tap the card to hear it again
  el.card.addEventListener('click', repeat);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (!state.started) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select') return; // don't hijack typing

    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowRight': next(); break;
      case 'ArrowLeft': prev(); break;
      case 'r': case 'R': repeat(); break;
      case 'm': case 'M': toggleMute(); break;
      case 'Home': restart(); break;
      case '/': e.preventDefault(); setPanelOpen(true); el.jumpInput.focus(); break;
      default: return;
    }
    wakePanel();
  });
}

/* =========================================================================
   10. PANEL AUTO-HIDE
   ========================================================================= */

const IDLE_MS = 3500;
let idleTimer = null;
let panelOpen = true;

function setPanelOpen(open) {
  panelOpen = open;
  el.panel.classList.toggle('is-collapsed', !open);
  el.panelHandle.setAttribute('aria-expanded', String(open));
  el.panelHandle.setAttribute('aria-label', open ? 'Hide controls' : 'Show controls');
  if (open) wakePanel();
}

function wakePanel() {
  el.panel.classList.remove('is-dimmed');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    // Never dim while the user is typing a number
    if (panelOpen && document.activeElement !== el.jumpInput) {
      el.panel.classList.add('is-dimmed');
    }
  }, IDLE_MS);
}

function bindPanel() {
  el.panelHandle.addEventListener('click', () => setPanelOpen(!panelOpen));
  ['pointerenter','pointerdown','pointermove','focusin','input']
    .forEach(evt => el.panel.addEventListener(evt, wakePanel));
  document.addEventListener('pointerdown', wakePanel);
}

/* =========================================================================
   11. THEME + SETTINGS
   ========================================================================= */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeBtn.textContent = theme === 'dark' ? '☀' : '☾';
  el.themeBtn.title = theme === 'dark' ? 'Light mode' : 'Dark mode';
}

function bindTheme() {
  const saved = localStorage.getItem('arabicNumbers.theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(saved || (prefersLight ? 'light' : 'dark'));

  el.themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = cur === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    localStorage.setItem('arabicNumbers.theme', nextTheme);
  });
}

function saveSettings() {
  try {
    localStorage.setItem('arabicNumbers.settings', JSON.stringify({
      volume: state.volume, muted: state.muted, speed: el.speed.value,
      loop: state.loop, rangeStart: state.rangeStart, rangeEnd: state.rangeEnd
    }));
  } catch (_) { /* storage blocked — not critical */ }
}

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('arabicNumbers.settings') || '{}'); }
  catch (_) { saved = {}; }

  state.volume = typeof saved.volume === 'number' ? saved.volume : 1;
  state.muted = !!saved.muted;
  state.loop = saved.loop !== false;
  state.rangeStart = typeof saved.rangeStart === 'number' ? saved.rangeStart : 1;
  state.rangeEnd = typeof saved.rangeEnd === 'number' ? saved.rangeEnd : 100;
  state.current = state.rangeStart;

  el.volume.value = Math.round(state.volume * 100);
  el.loopToggle.checked = state.loop;
  el.rangeStart.value = state.rangeStart;
  el.rangeEnd.value = state.rangeEnd;
  applySpeedPreset(saved.speed || 'normal');
  updateMuteUI();
}

/* =========================================================================
   12. INIT
   ========================================================================= */

function init() {
  loadSettings();
  buildStrip();
  bindControls();
  bindPanel();
  bindTheme();
  updatePlayPauseUI();
  render();

  if (speechSupported) {
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    setTimeout(loadVoices, 600);
    setTimeout(loadVoices, 1800);
  } else {
    updateVoiceNote();
  }

  // One gesture unlocks audio for the whole session
  el.startBtn.addEventListener('click', () => {
    state.started = true;
    el.startOverlay.classList.add('is-hidden');

    if (speechSupported) {
      const warm = new SpeechSynthesisUtterance(' ');
      warm.volume = 0;
      synth.speak(warm);
      if (!state.voice) loadVoices();
    }

    state.current = state.rangeStart;
    play();
    setPanelOpen(true);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.playing) pause();
  });
}

document.addEventListener('DOMContentLoaded', init);
