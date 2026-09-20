/* =========================================================================
   Arabic Numbers Learning App  —  script.js
   Pure vanilla JavaScript. No frameworks, no build step, no backend.
   =========================================================================

   Structure of this file:
     1.  Arabic number data (1–100)
     2.  State
     3.  DOM references
     4.  Rendering
     5.  Speech synthesis (voice selection + speaking)
     6.  Playback engine (auto-advance loop)
     7.  Controls / events
     8.  Control panel auto-hide behaviour
     9.  Theme handling
    10.  Settings persistence
    11.  Init
   ========================================================================= */

'use strict';

/* =========================================================================
   1. ARABIC NUMBER DATA (1–100)
   -------------------------------------------------------------------------
   All words are stored locally — no API is used.
   Numbers are in Modern Standard Arabic, masculine counting form
   (the form used when simply counting aloud: واحد، اثنان، ثلاثة ...).
   ========================================================================= */

// Units 0–10
const UNITS = [
  '',            // 0 (unused as a standalone in 1..100 except 100)
  'واحد',        // 1
  'اثنان',       // 2
  'ثلاثة',       // 3
  'أربعة',       // 4
  'خمسة',        // 5
  'ستة',         // 6
  'سبعة',        // 7
  'ثمانية',      // 8
  'تسعة',        // 9
  'عشرة'         // 10
];

// Teens 11–19 (irregular forms)
const TEENS = {
  11: 'أحد عشر',
  12: 'اثنا عشر',
  13: 'ثلاثة عشر',
  14: 'أربعة عشر',
  15: 'خمسة عشر',
  16: 'ستة عشر',
  17: 'سبعة عشر',
  18: 'ثمانية عشر',
  19: 'تسعة عشر'
};

// Tens 20, 30, ... 90
const TENS = {
  20: 'عشرون',
  30: 'ثلاثون',
  40: 'أربعون',
  50: 'خمسون',
  60: 'ستون',
  70: 'سبعون',
  80: 'ثمانون',
  90: 'تسعون'
};

/**
 * Convert a number 1–100 into its written Arabic form.
 * Compound numbers are built unit-first: 25 -> خمسة وعشرون
 */
function toArabicWords(n) {
  if (n === 100) return 'مئة';
  if (n <= 10) return UNITS[n];
  if (n < 20) return TEENS[n];

  const tens = Math.floor(n / 10) * 10;
  const unit = n % 10;

  if (unit === 0) return TENS[tens];
  // Unit comes first, joined with "و" (and): خمسة وعشرون
  return UNITS[unit] + ' و' + TENS[tens];
}

/**
 * Convert Western digits to Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩).
 */
const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
function toArabicIndic(n) {
  return String(n)
    .split('')
    .map(d => ARABIC_INDIC_DIGITS[Number(d)])
    .join('');
}

// Pre-build the full dataset once, so rendering is instant.
const NUMBERS = [];
for (let i = 1; i <= 100; i++) {
  NUMBERS.push({
    value: i,
    indic: toArabicIndic(i),
    words: toArabicWords(i)
  });
}

/* =========================================================================
   2. STATE
   ========================================================================= */

const MIN_NUMBER = 1;
const MAX_NUMBER = 100;

const state = {
  current: MIN_NUMBER,   // currently displayed number
  playing: false,        // auto-advance active?
  started: false,        // has the user pressed "Start Learning"?
  muted: false,
  volume: 1,             // 0 .. 1
  rate: 0.85,            // speech rate (slower = clearer for learners)
  gapMs: 900,            // pause after speech finishes, before next number
  loop: true,            // restart from 1 after 100?
  voice: null            // chosen SpeechSynthesisVoice
};

let advanceTimer = null;      // setTimeout handle for the next number
let currentUtterance = null;  // the utterance currently being spoken

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

  volume: document.getElementById('volume'),
  speed: document.getElementById('speed'),
  loopToggle: document.getElementById('loop-toggle'),
  voiceNote: document.getElementById('voice-note'),
  live: document.getElementById('live-region')
};

/* =========================================================================
   4. RENDERING
   ========================================================================= */

/**
 * Paint the current number onto the flashcard.
 * A tiny CSS animation class is re-triggered for a subtle fade/scale-in.
 */
function render() {
  const item = NUMBERS[state.current - MIN_NUMBER];

  el.western.textContent = item.value;
  el.indic.textContent = item.indic;
  el.words.textContent = item.words;

  // Re-trigger the entrance animation
  el.card.classList.remove('is-entering');
  void el.card.offsetWidth; // force reflow so the animation replays
  el.card.classList.add('is-entering');

  // Progress
  const pct = ((state.current - MIN_NUMBER) / (MAX_NUMBER - MIN_NUMBER)) * 100;
  el.progressBar.style.width = pct + '%';
  el.progressLabel.textContent = state.current + ' / ' + MAX_NUMBER;

  // Announce for screen readers
  el.live.textContent = item.value + ' — ' + item.words;
}

/* =========================================================================
   5. SPEECH SYNTHESIS
   ========================================================================= */

const synth = window.speechSynthesis;
const speechSupported = typeof synth !== 'undefined' && 'SpeechSynthesisUtterance' in window;

/**
 * Pick the best available Arabic voice.
 * Preference order: ar-QA > ar-SA > any Gulf/MSA Arabic > any ar-* voice.
 */
function pickArabicVoice() {
  if (!speechSupported) return null;

  const voices = synth.getVoices();
  if (!voices || !voices.length) return null;

  const arabic = voices.filter(v => (v.lang || '').toLowerCase().startsWith('ar'));
  if (!arabic.length) return null;

  const preferred = ['ar-qa', 'ar-sa', 'ar-ae', 'ar-kw', 'ar-bh', 'ar-eg', 'ar-jo', 'ar'];

  for (const tag of preferred) {
    // Prefer non-local (usually higher quality cloud voices) when duplicated
    const matches = arabic.filter(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith(tag));
    if (matches.length) {
      const enhanced = matches.find(v => /enhanced|premium|neural|natural/i.test(v.name));
      return enhanced || matches[0];
    }
  }
  return arabic[0];
}

/**
 * Voices load asynchronously in most browsers — resolve them safely.
 */
function loadVoices() {
  state.voice = pickArabicVoice();
  updateVoiceNote();
}

function updateVoiceNote() {
  if (!speechSupported) {
    el.voiceNote.textContent = 'Speech not supported on this browser.';
    return;
  }
  if (state.voice) {
    el.voiceNote.textContent = 'Voice: ' + state.voice.name + ' (' + state.voice.lang + ')';
  } else {
    el.voiceNote.textContent = 'No Arabic voice installed — visuals still work.';
  }
}

/**
 * Stop anything currently being spoken. Prevents overlapping utterances.
 */
function stopSpeech() {
  if (!speechSupported) return;
  if (currentUtterance) {
    currentUtterance.onend = null;
    currentUtterance.onerror = null;
    currentUtterance = null;
  }
  synth.cancel();
}

/**
 * Speak the Arabic words for the current number.
 * @param {Function} [onDone] callback fired when speech ends (or is skipped)
 */
function speakCurrent(onDone) {
  const item = NUMBERS[state.current - MIN_NUMBER];

  // Always cancel first so utterances never stack up.
  stopSpeech();

  if (!speechSupported || state.muted || state.volume === 0) {
    // No audio: still give the learner time to read the number.
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
  u.onerror = finish; // never let a speech error freeze the loop

  currentUtterance = u;
  synth.speak(u);

  // Safety net: some mobile browsers fail to fire "onend".
  const fallbackMs = Math.max(2500, item.words.length * 220);
  setTimeout(() => {
    if (!finished && !synth.speaking) finish();
  }, fallbackMs);
}

/* =========================================================================
   6. PLAYBACK ENGINE
   ========================================================================= */

function clearAdvanceTimer() {
  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }
}

/**
 * Show the current number, speak it, then queue the next one.
 * Only advances if we are still in "playing" mode when speech finishes.
 */
function playStep() {
  render();
  speakCurrent(() => {
    if (!state.playing) return;
    clearAdvanceTimer();
    advanceTimer = setTimeout(() => {
      if (!state.playing) return;

      if (state.current >= MAX_NUMBER) {
        if (state.loop) {
          state.current = MIN_NUMBER;
          playStep();
        } else {
          pause(); // stop gracefully at 100
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

function togglePlay() {
  state.playing ? pause() : play();
}

/**
 * Manual navigation. Keeps playing if it was already playing.
 */
function goTo(n) {
  const wasPlaying = state.playing;
  clearAdvanceTimer();
  stopSpeech();

  state.current = Math.min(MAX_NUMBER, Math.max(MIN_NUMBER, n));

  if (wasPlaying) {
    playStep();           // continue the automatic sequence from here
  } else {
    render();
    speakCurrent();       // speak once, then stay put
  }
}

function next() { goTo(state.current >= MAX_NUMBER ? MIN_NUMBER : state.current + 1); }
function prev() { goTo(state.current <= MIN_NUMBER ? MAX_NUMBER : state.current - 1); }
function restart() { goTo(MIN_NUMBER); }

/** Repeat the current number without changing it. */
function repeat() {
  clearAdvanceTimer();
  const wasPlaying = state.playing;
  stopSpeech();
  if (wasPlaying) {
    playStep();
  } else {
    speakCurrent();
  }
}

/* =========================================================================
   7. CONTROLS / EVENTS
   ========================================================================= */

function updatePlayPauseUI() {
  const playing = state.playing;
  el.playPauseIcon.textContent = playing ? '❚❚' : '►';
  el.playPauseBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  el.playPauseBtn.setAttribute('aria-pressed', String(playing));
  el.playPauseBtn.title = playing ? 'Pause' : 'Play';
}

function updateMuteUI() {
  el.muteIcon.textContent = state.muted || state.volume === 0 ? '🔇' : '🔊';
  el.muteBtn.setAttribute('aria-pressed', String(state.muted));
  el.muteBtn.title = state.muted ? 'Unmute' : 'Mute';
}

function toggleMute() {
  state.muted = !state.muted;
  if (state.muted) stopSpeech();
  updateMuteUI();
  saveSettings();
}

function bindControls() {
  el.playPauseBtn.addEventListener('click', togglePlay);
  el.nextBtn.addEventListener('click', next);
  el.prevBtn.addEventListener('click', prev);
  el.repeatBtn.addEventListener('click', repeat);
  el.restartBtn.addEventListener('click', restart);
  el.muteBtn.addEventListener('click', toggleMute);

  // Volume slider (0–100 in the UI, 0–1 internally)
  el.volume.addEventListener('input', () => {
    state.volume = Number(el.volume.value) / 100;
    if (state.volume > 0) state.muted = false;
    updateMuteUI();
    saveSettings();
  });

  // Speed preset: slow / normal / fast -> speech rate + gap between numbers
  el.speed.addEventListener('change', () => {
    applySpeedPreset(el.speed.value);
    saveSettings();
  });

  el.loopToggle.addEventListener('change', () => {
    state.loop = el.loopToggle.checked;
    saveSettings();
  });

  // Tap the flashcard to hear the number again
  el.card.addEventListener('click', repeat);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (!state.started) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select') return; // don't hijack sliders

    switch (e.key) {
      case ' ':        e.preventDefault(); togglePlay(); break;
      case 'ArrowRight': next(); break;
      case 'ArrowLeft':  prev(); break;
      case 'r': case 'R': repeat(); break;
      case 'm': case 'M': toggleMute(); break;
      case 'Home':     restart(); break;
      default: return;
    }
    wakePanel();
  });
}

function applySpeedPreset(preset) {
  switch (preset) {
    case 'slow':   state.rate = 0.65; state.gapMs = 1600; break;
    case 'fast':   state.rate = 1.05; state.gapMs = 350;  break;
    default:       state.rate = 0.85; state.gapMs = 900;  break; // normal
  }
  el.speed.value = preset;
}

/* =========================================================================
   8. CONTROL PANEL AUTO-HIDE
   -------------------------------------------------------------------------
   The panel fades to near-transparent after a few idle seconds, leaving
   only the small triangular handle visible.
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

/** Bring the panel back to full opacity and restart the idle countdown. */
function wakePanel() {
  el.panel.classList.remove('is-dimmed');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (panelOpen) el.panel.classList.add('is-dimmed');
  }, IDLE_MS);
}

function bindPanel() {
  el.panelHandle.addEventListener('click', () => setPanelOpen(!panelOpen));

  ['pointerenter', 'pointerdown', 'pointermove', 'focusin', 'input']
    .forEach(evt => el.panel.addEventListener(evt, wakePanel));

  // Any interaction anywhere briefly revives the panel
  document.addEventListener('pointerdown', wakePanel);
}

/* =========================================================================
   9. THEME (light / dark)
   ========================================================================= */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeBtn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  el.themeBtn.textContent = theme === 'dark' ? '☀' : '☾';
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function bindTheme() {
  const saved = localStorage.getItem('arabicNumbers.theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(saved || (prefersLight ? 'light' : 'dark'));

  el.themeBtn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('arabicNumbers.theme', next);
  });
}

/* =========================================================================
   10. SETTINGS PERSISTENCE
   ========================================================================= */

function saveSettings() {
  try {
    localStorage.setItem('arabicNumbers.settings', JSON.stringify({
      volume: state.volume,
      muted: state.muted,
      speed: el.speed.value,
      loop: state.loop
    }));
  } catch (_) { /* storage may be blocked — not critical */ }
}

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('arabicNumbers.settings') || '{}');
  } catch (_) { saved = {}; }

  state.volume = typeof saved.volume === 'number' ? saved.volume : 1;
  state.muted = !!saved.muted;
  state.loop = saved.loop !== false;

  el.volume.value = Math.round(state.volume * 100);
  el.loopToggle.checked = state.loop;
  applySpeedPreset(saved.speed || 'normal');
  updateMuteUI();
}

/* =========================================================================
   11. INIT
   ========================================================================= */

function init() {
  loadSettings();
  bindControls();
  bindPanel();
  bindTheme();
  updatePlayPauseUI();
  render(); // show number 1 behind the start overlay

  // Voices may arrive asynchronously.
  if (speechSupported) {
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    // Extra retries for browsers that populate voices late.
    setTimeout(loadVoices, 600);
    setTimeout(loadVoices, 1800);
  } else {
    updateVoiceNote();
  }

  // The single user gesture that unlocks audio in every modern browser.
  el.startBtn.addEventListener('click', () => {
    state.started = true;
    el.startOverlay.classList.add('is-hidden');

    // Warm up the speech engine with a silent utterance (iOS/Safari need this).
    if (speechSupported) {
      const warm = new SpeechSynthesisUtterance(' ');
      warm.volume = 0;
      synth.speak(warm);
      if (!state.voice) loadVoices();
    }

    state.current = MIN_NUMBER;
    play();
    setPanelOpen(true);
  });

  // Stop audio if the tab goes to the background.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.playing) pause();
  });
}

document.addEventListener('DOMContentLoaded', init);
