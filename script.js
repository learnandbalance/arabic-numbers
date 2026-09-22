/* =========================================================================
   Arabic Numbers Learning App — script.js (v5)
   -------------------------------------------------------------------------
   Plain ES5-style JavaScript. No frameworks, no build step, no backend.

   v5 changes
     • Panel markup split into a pinned header + scrollable body, so the
       "Go to" field can no longer scroll out of view.
     • Clear focus feedback is driven by CSS; JS only adds is-ok / is-invalid.
     • Defensive init retained: every startup step is isolated so one
       failure can never stop the Start button from working.

   Sections
     1.  Arabic number engine (0–9999)
     2.  State
     3.  DOM helpers
     4.  Rotating drum wheel
     5.  Rendering
     6.  Speech synthesis
     7.  Playback engine
     8.  Manual entry
     9.  Controls
    10.  Panel
    11.  Theme + settings
    12.  Init
   ========================================================================= */

'use strict';

/* =========================================================================
   1. ARABIC NUMBER ENGINE (0–9999)
   -------------------------------------------------------------------------
   Modern Standard Arabic, masculine counting form.
   Grammar handled:
     • 11–19 irregular                -> أحد عشر
     • compounds are unit-first       -> 25 = خمسة وعشرون
     • fused hundreds                 -> 300 = ثلاثمئة
     • dual for 200 / 2000            -> مئتان / ألفان
     • plural "آلاف" for 3000–10000   -> 5000 = خمسة آلاف
   ========================================================================= */

var UNITS = ['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة'];

var TEENS = {
  11:'أحد عشر', 12:'اثنا عشر', 13:'ثلاثة عشر', 14:'أربعة عشر', 15:'خمسة عشر',
  16:'ستة عشر', 17:'سبعة عشر', 18:'ثمانية عشر', 19:'تسعة عشر'
};

var TENS = {
  20:'عشرون', 30:'ثلاثون', 40:'أربعون', 50:'خمسون',
  60:'ستون', 70:'سبعون', 80:'ثمانون', 90:'تسعون'
};

var HUNDREDS = {
  1:'مئة', 2:'مئتان', 3:'ثلاثمئة', 4:'أربعمئة', 5:'خمسمئة',
  6:'ستمئة', 7:'سبعمئة', 8:'ثمانمئة', 9:'تسعمئة'
};

function under100(n){
  if(n === 0) return '';
  if(n <= 10) return UNITS[n];
  if(n < 20) return TEENS[n];
  var t = Math.floor(n/10)*10, u = n%10;
  return u === 0 ? TENS[t] : UNITS[u] + ' و' + TENS[t];
}

function under1000(n){
  var h = Math.floor(n/100), r = n%100, p = [];
  if(h) p.push(HUNDREDS[h]);
  if(r) p.push(under100(r));
  return p.join(' و');
}

function thousandsWord(k){
  if(k === 1) return 'ألف';
  if(k === 2) return 'ألفان';
  if(k >= 3 && k <= 10) return UNITS[k] + ' آلاف';
  return under1000(k) + ' ألفاً';
}

function toArabicWords(n){
  if(n === 0) return 'صفر';
  var k = Math.floor(n/1000), r = n%1000, p = [];
  if(k) p.push(thousandsWord(k));
  if(r) p.push(under1000(r));
  return p.join(' و');
}

var AR_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];

function toArabicIndic(n){
  return String(n).split('').map(function(d){ return AR_DIGITS[Number(d)]; }).join('');
}

function makeItem(n){
  return { value:n, indic:toArabicIndic(n), words:toArabicWords(n) };
}

/** Accept Western or Arabic-Indic digits, discard everything else. */
function normaliseDigits(str){
  return String(str == null ? '' : str)
    .replace(/[٠-٩]/g, function(d){ return String(AR_DIGITS.indexOf(d)); })
    .replace(/[^0-9]/g, '');
}

/* =========================================================================
   2. STATE
   ========================================================================= */

var ABS_MIN = 0, ABS_MAX = 9999;

var state = {
  current: 1,
  rangeStart: 1,
  rangeEnd: 100,
  playing: false,
  started: false,
  muted: false,
  volume: 1,
  rate: 0.85,
  gapMs: 900,
  loop: true,
  voice: null
};

var advanceTimer = null;
var currentUtterance = null;

/* =========================================================================
   3. DOM HELPERS
   ========================================================================= */

function $(id){ return document.getElementById(id); }

var el = {};

function collectDom(){
  el.startOverlay  = $('start-overlay');
  el.startBtn      = $('start-btn');
  el.card          = $('card');
  el.western       = $('western');
  el.indic         = $('indic');
  el.words         = $('words');
  el.wheel         = $('wheel');
  el.wheelTrack    = $('wheel-track');
  el.progressBar   = $('progress-bar');
  el.progressLabel = $('progress-label');
  el.panel         = $('panel');
  el.panelHandle   = $('panel-handle');
  el.playPauseBtn  = $('btn-playpause');
  el.playPauseIcon = $('icon-playpause');
  el.prevBtn       = $('btn-prev');
  el.nextBtn       = $('btn-next');
  el.repeatBtn     = $('btn-repeat');
  el.restartBtn    = $('btn-restart');
  el.muteBtn       = $('btn-mute');
  el.muteIcon      = $('icon-mute');
  el.themeBtn      = $('btn-theme');
  el.jumpInput     = $('jump-input');
  el.sayBtn        = $('btn-say');
  el.rangeStart    = $('range-start');
  el.rangeEnd      = $('range-end');
  el.volume        = $('volume');
  el.speed         = $('speed');
  el.loopToggle    = $('loop-toggle');
  el.voiceNote     = $('voice-note');
  el.live          = $('live-region');
}

/** Run a startup step in isolation so its failure cannot break the rest. */
function safe(label, fn){
  try{ fn(); }
  catch(err){ console.error('[ArabicNumbers] ' + label + ' failed:', err); }
}

/** Attach a listener only when the element actually exists. */
function on(node, evt, handler, opts){
  if(node && node.addEventListener) node.addEventListener(evt, handler, opts);
}

/* =========================================================================
   4. ROTATING DRUM WHEEL
   -------------------------------------------------------------------------
   Ticks are absolutely positioned at x = (value - centre) * TICK_W and
   rotated around the Y axis in proportion to that offset, so the row reads
   as the curved surface of a spinning drum. Only a small window of ticks
   exists in the DOM and the nodes are reused on every frame.
   ========================================================================= */

var TICK_W = 58;    // spacing between ticks, px
var WINDOW = 11;    // ticks drawn on each side of centre
var MAX_ROT = 62;   // rotation at the far edge, degrees

var tickPool = [];
var wheelCentre = 1;

function buildWheelPool(){
  if(!el.wheelTrack) return;
  el.wheelTrack.innerHTML = '';
  tickPool.length = 0;
  for(var i = 0; i < WINDOW*2 + 1; i++){
    var t = document.createElement('div');
    t.className = 'tick';
    t.style.position = 'absolute';
    t.style.width = (TICK_W - 10) + 'px';
    t.style.height = '38px';
    el.wheelTrack.appendChild(t);
    tickPool.push(t);
  }
}

function renderWheel(centre){
  if(!el.wheelTrack || !tickPool.length) return;

  wheelCentre = centre;
  var base = Math.round(centre);
  var half = WINDOW;

  for(var i = 0; i < tickPool.length; i++){
    var node = tickPool[i];
    var value = base - half + i;

    if(value < state.rangeStart || value > state.rangeEnd){
      node.style.display = 'none';
      continue;
    }
    node.style.display = 'grid';

    var dx = (value - centre) * TICK_W;
    var norm = Math.max(-1, Math.min(1, dx / (half * TICK_W)));

    var rotY  = -norm * MAX_ROT;
    var scale = 1 - Math.abs(norm) * 0.35;
    var depth = -Math.abs(norm) * 90;

    node.textContent = value;
    node.style.transform =
      'translateX(' + (dx - (TICK_W - 10)/2) + 'px)' +
      ' translateZ(' + depth + 'px)' +
      ' rotateY(' + rotY + 'deg)' +
      ' scale(' + scale + ')';

    // Fade + darken with distance so the centre reads as the lit face
    node.style.opacity = String(1 - Math.abs(norm) * 0.55);
    node.style.filter = 'brightness(' + (1 - Math.abs(norm) * 0.5).toFixed(3) + ')';

    if(value === state.current && Math.abs(dx) < 2) node.classList.add('is-active');
    else node.classList.remove('is-active');
  }

  if(el.wheel) el.wheel.setAttribute('aria-valuenow', String(state.current));
}

function bindWheel(){
  if(!el.wheel) return;

  var dragging = false, startX = 0, startValue = 1;
  var lastX = 0, lastT = 0, velocity = 0, moved = false;

  on(el.wheel, 'pointerdown', function(e){
    dragging = true; moved = false;
    startX = lastX = e.clientX;
    startValue = state.current;
    lastT = performance.now();
    velocity = 0;
    el.wheel.classList.add('is-dragging');
    if(el.wheelTrack) el.wheelTrack.classList.remove('is-animating');
    try{ el.wheel.setPointerCapture(e.pointerId); }catch(_){}
    pause();
  });

  on(el.wheel, 'pointermove', function(e){
    if(!dragging) return;
    var dx = e.clientX - startX;
    if(Math.abs(dx) > 3) moved = true;

    var now = performance.now(), dt = now - lastT;
    if(dt > 0){
      velocity = (e.clientX - lastX) / dt;   // px per ms
      lastX = e.clientX; lastT = now;
    }

    // Dragging right goes to LOWER numbers, like a physical dial
    var centre = startValue - dx / TICK_W;
    centre = Math.max(state.rangeStart, Math.min(state.rangeEnd, centre));

    state.current = Math.round(centre);
    renderWheel(centre);
    renderCard();
  });

  function endDrag(){
    if(!dragging) return;
    dragging = false;
    el.wheel.classList.remove('is-dragging');

    // A flick carries the wheel a little further
    var target = wheelCentre;
    if(Math.abs(velocity) > 0.35) target -= velocity * 9;
    target = Math.max(state.rangeStart, Math.min(state.rangeEnd, Math.round(target)));

    if(el.wheelTrack) el.wheelTrack.classList.add('is-animating');

    if(moved) goTo(target, { stop:true });
    else repeat();          // a tap without movement repeats the number
  }

  on(el.wheel, 'pointerup', endDrag);
  on(el.wheel, 'pointercancel', endDrag);

  on(el.wheel, 'wheel', function(e){
    e.preventDefault();
    goTo(state.current + ((e.deltaY > 0 || e.deltaX > 0) ? 1 : -1), { stop:true });
  }, { passive:false });

  on(el.wheel, 'keydown', function(e){
    if(e.key === 'ArrowLeft'){ e.preventDefault(); goTo(state.current - 1, { stop:true }); }
    if(e.key === 'ArrowRight'){ e.preventDefault(); goTo(state.current + 1, { stop:true }); }
  });
}

/* =========================================================================
   5. RENDERING
   ========================================================================= */

function renderCard(){
  var item = makeItem(state.current);

  if(el.western) el.western.textContent = item.value;
  if(el.indic)   el.indic.textContent = item.indic;
  if(el.words){
    el.words.textContent = item.words;
    if(item.words.length > 22) el.words.classList.add('is-long');
    else el.words.classList.remove('is-long');
  }

  var span = Math.max(1, state.rangeEnd - state.rangeStart);
  var pct = ((state.current - state.rangeStart) / span) * 100;
  if(el.progressBar) el.progressBar.style.width = Math.min(100, Math.max(0, pct)) + '%';
  if(el.progressLabel) el.progressLabel.textContent = state.current + ' / ' + state.rangeEnd;
  if(el.live) el.live.textContent = item.value + ' — ' + item.words;
}

function render(){
  renderCard();
  if(el.card){
    el.card.classList.remove('is-entering');
    void el.card.offsetWidth;          // force reflow so the animation replays
    el.card.classList.add('is-entering');
  }
  if(el.wheelTrack) el.wheelTrack.classList.add('is-animating');
  renderWheel(state.current);
}

/* =========================================================================
   6. SPEECH SYNTHESIS
   ========================================================================= */

var synth = window.speechSynthesis;
var speechSupported = typeof synth !== 'undefined' && 'SpeechSynthesisUtterance' in window;

/** Preference: ar-QA > ar-SA > other Gulf > any Arabic voice. */
function pickArabicVoice(){
  if(!speechSupported) return null;
  var voices = synth.getVoices();
  if(!voices || !voices.length) return null;

  var arabic = voices.filter(function(v){
    return (v.lang || '').toLowerCase().indexOf('ar') === 0;
  });
  if(!arabic.length) return null;

  var preferred = ['ar-qa','ar-sa','ar-ae','ar-kw','ar-bh','ar-eg','ar-jo','ar'];
  for(var i = 0; i < preferred.length; i++){
    var tag = preferred[i];
    var m = arabic.filter(function(v){
      return (v.lang || '').toLowerCase().replace('_','-').indexOf(tag) === 0;
    });
    if(m.length){
      var better = m.filter(function(v){ return /enhanced|premium|neural|natural/i.test(v.name); });
      return better.length ? better[0] : m[0];
    }
  }
  return arabic[0];
}

function loadVoices(){
  state.voice = pickArabicVoice();
  if(el.voiceNote){
    el.voiceNote.textContent = !speechSupported ? 'No speech'
      : (state.voice ? state.voice.lang : 'No Arabic voice');
  }
}

function stopSpeech(){
  if(!speechSupported) return;
  if(currentUtterance){
    currentUtterance.onend = null;
    currentUtterance.onerror = null;
    currentUtterance = null;
  }
  try{ synth.cancel(); }catch(_){}
}

function speakCurrent(onDone){
  var item = makeItem(state.current);
  stopSpeech();                       // never let utterances overlap

  if(!speechSupported || state.muted || state.volume === 0){
    if(onDone) onDone();
    return;
  }

  var u = new SpeechSynthesisUtterance(item.words);
  u.lang = state.voice ? state.voice.lang : 'ar-SA';
  if(state.voice) u.voice = state.voice;
  u.rate = state.rate;
  u.pitch = 1;
  u.volume = state.volume;

  var done = false;
  function finish(){
    if(done) return;
    done = true;
    currentUtterance = null;
    if(onDone) onDone();
  }
  u.onend = finish;
  u.onerror = finish;                 // an error must never freeze the loop

  currentUtterance = u;

  /* Chrome and Safari silently DROP an utterance queued in the same tick
     as cancel(). Defer the real speak() by one short timeout. */
  setTimeout(function(){
    if(currentUtterance !== u) return;   // superseded while waiting
    try{ synth.speak(u); }catch(_){ finish(); }
  }, 60);

  // Safety net for mobile browsers that never fire "onend"
  var fallback = Math.max(2800, item.words.length * 220);
  setTimeout(function(){
    if(!done && !synth.speaking && !synth.pending) finish();
  }, fallback);
}

/* =========================================================================
   7. PLAYBACK ENGINE
   ========================================================================= */

function clearAdvanceTimer(){
  if(advanceTimer){ clearTimeout(advanceTimer); advanceTimer = null; }
}

function playStep(){
  render();
  speakCurrent(function(){
    if(!state.playing) return;
    clearAdvanceTimer();
    advanceTimer = setTimeout(function(){
      if(!state.playing) return;
      if(state.current >= state.rangeEnd){
        if(state.loop){ state.current = state.rangeStart; playStep(); }
        else pause();
        return;
      }
      state.current++;
      playStep();
    }, state.gapMs);
  });
}

function play(){
  if(state.playing) return;
  if(state.current < state.rangeStart || state.current > state.rangeEnd){
    state.current = state.rangeStart;
  }
  state.playing = true;
  updatePlayPauseUI();
  playStep();
}

function pause(){
  if(!state.playing){ updatePlayPauseUI(); return; }
  state.playing = false;
  clearAdvanceTimer();
  stopSpeech();
  updatePlayPauseUI();
}

function togglePlay(){ state.playing ? pause() : play(); }

function goTo(n, opts){
  var keepPlaying = !(opts && opts.stop) && state.playing;
  clearAdvanceTimer();
  stopSpeech();

  state.current = Math.min(ABS_MAX, Math.max(ABS_MIN, n));

  if(keepPlaying){
    playStep();
  } else {
    if(state.playing) pause();
    render();
    speakCurrent();
  }
}

function next(){ goTo(state.current >= state.rangeEnd ? state.rangeStart : state.current + 1); }
function prev(){ goTo(state.current <= state.rangeStart ? state.rangeEnd : state.current - 1); }
function restart(){ goTo(state.rangeStart); }

function repeat(){
  clearAdvanceTimer();
  var wasPlaying = state.playing;
  stopSpeech();
  if(wasPlaying) playStep();
  else speakCurrent();
}

/* =========================================================================
   8. MANUAL ENTRY
   -------------------------------------------------------------------------
   Type any number 0–9999 (years, birth dates, surgery dates) and hear it.
   Visual state is handled by CSS :focus; JS only flags success/failure.
   ========================================================================= */

function flagInvalid(){
  if(!el.jumpInput) return;
  el.jumpInput.classList.remove('is-ok');
  el.jumpInput.classList.add('is-invalid');
  setTimeout(function(){ el.jumpInput.classList.remove('is-invalid'); }, 700);
}

function flashOk(){
  if(!el.jumpInput) return;
  el.jumpInput.classList.remove('is-invalid');
  el.jumpInput.classList.add('is-ok');
  setTimeout(function(){ el.jumpInput.classList.remove('is-ok'); }, 800);
}

function submitJump(){
  if(!el.jumpInput) return;

  var clean = normaliseDigits(el.jumpInput.value).slice(0, 4);
  if(clean === ''){ flagInvalid(); el.jumpInput.focus(); return; }

  var n = parseInt(clean, 10);
  if(isNaN(n) || n < ABS_MIN || n > ABS_MAX){ flagInvalid(); return; }

  pause();                     // hold on the typed number
  state.current = n;

  // Widen the wheel range so the typed number is reachable on the drum
  if(n < state.rangeStart || n > state.rangeEnd){
    state.rangeStart = Math.max(ABS_MIN, n - 50);
    state.rangeEnd   = Math.min(ABS_MAX, n + 50);
    if(el.rangeStart) el.rangeStart.value = state.rangeStart;
    if(el.rangeEnd)   el.rangeEnd.value = state.rangeEnd;
    saveSettings();
  }

  render();
  speakCurrent();
  flashOk();
}

function applyRange(){
  if(!el.rangeStart || !el.rangeEnd) return;

  var s = parseInt(normaliseDigits(el.rangeStart.value), 10);
  var e = parseInt(normaliseDigits(el.rangeEnd.value), 10);
  if(isNaN(s)) s = 1;
  if(isNaN(e)) e = 100;
  s = Math.max(ABS_MIN, Math.min(ABS_MAX, s));
  e = Math.max(ABS_MIN, Math.min(ABS_MAX, e));
  if(e < s){ var t = s; s = e; e = t; }

  state.rangeStart = s;
  state.rangeEnd = e;
  el.rangeStart.value = s;
  el.rangeEnd.value = e;

  if(state.current < s || state.current > e) state.current = s;

  render();
  saveSettings();
}

/* =========================================================================
   9. CONTROLS
   ========================================================================= */

function updatePlayPauseUI(){
  if(el.playPauseIcon) el.playPauseIcon.textContent = state.playing ? '❚❚' : '►';
  if(el.playPauseBtn){
    el.playPauseBtn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    el.playPauseBtn.setAttribute('aria-pressed', String(state.playing));
  }
}

function updateMuteUI(){
  if(el.muteIcon) el.muteIcon.textContent = (state.muted || state.volume === 0) ? '🔇' : '🔊';
  if(el.muteBtn) el.muteBtn.setAttribute('aria-pressed', String(state.muted));
}

function toggleMute(){
  state.muted = !state.muted;
  if(state.muted) stopSpeech();
  updateMuteUI();
  saveSettings();
}

function applySpeedPreset(p){
  if(p === 'slow'){ state.rate = 0.65; state.gapMs = 1600; }
  else if(p === 'fast'){ state.rate = 1.05; state.gapMs = 350; }
  else { p = 'normal'; state.rate = 0.85; state.gapMs = 900; }
  if(el.speed) el.speed.value = p;
}

function bindControls(){
  on(el.playPauseBtn, 'click', togglePlay);
  on(el.nextBtn, 'click', next);
  on(el.prevBtn, 'click', prev);
  on(el.repeatBtn, 'click', repeat);
  on(el.restartBtn, 'click', restart);
  on(el.muteBtn, 'click', toggleMute);

  /* ---------------- Manual entry ----------------
     No <form> element: a form without an action behaves inconsistently
     across mobile browsers. Every route is bound explicitly. */

  // pointerdown fires BEFORE the input loses focus — essential on touch
  on(el.sayBtn, 'pointerdown', function(e){
    e.preventDefault();
    e.stopPropagation();
    submitJump();
  });
  on(el.sayBtn, 'click', function(e){
    e.preventDefault();
    e.stopPropagation();
    if(!window.PointerEvent) submitJump();   // fallback for old browsers
  });

  on(el.jumpInput, 'keydown', function(e){
    e.stopPropagation();          // keep global shortcuts out of the field
    if(e.key === 'Enter'){ e.preventDefault(); submitJump(); }
  });

  on(el.jumpInput, 'input', function(){
    var raw = el.jumpInput.value;
    var clean = normaliseDigits(raw).slice(0, 4);
    if(raw !== clean) el.jumpInput.value = clean;
  });

  on(el.jumpInput, 'pointerdown', function(e){
    e.stopPropagation();
    setPanelOpen(true);
    wakePanel();
  });

  on(el.jumpInput, 'focus', function(){
    el.jumpInput.select();        // typing replaces the previous value
    wakePanel();
  });

  on(el.rangeStart, 'change', applyRange);
  on(el.rangeEnd, 'change', applyRange);
  on(el.rangeStart, 'keydown', function(e){ e.stopPropagation(); });
  on(el.rangeEnd, 'keydown', function(e){ e.stopPropagation(); });

  on(el.volume, 'input', function(){
    state.volume = Number(el.volume.value) / 100;
    if(state.volume > 0) state.muted = false;
    updateMuteUI();
    saveSettings();
  });

  on(el.speed, 'change', function(){ applySpeedPreset(el.speed.value); saveSettings(); });
  on(el.loopToggle, 'change', function(){ state.loop = el.loopToggle.checked; saveSettings(); });
  on(el.card, 'click', repeat);

  document.addEventListener('keydown', function(e){
    if(!state.started) return;
    var tag = (e.target && e.target.tagName ? e.target.tagName : '').toLowerCase();
    if(tag === 'input' || tag === 'select' || tag === 'textarea') return;

    switch(e.key){
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowRight': next(); break;
      case 'ArrowLeft': prev(); break;
      case 'r': case 'R': repeat(); break;
      case 'm': case 'M': toggleMute(); break;
      case 'Home': restart(); break;
      case '/':
        e.preventDefault();
        setPanelOpen(true);
        if(el.jumpInput) el.jumpInput.focus();
        break;
      default: return;
    }
    wakePanel();
  });
}

/* =========================================================================
   10. PANEL
   ========================================================================= */

var IDLE_MS = 3500;
var idleTimer = null;
var panelOpen = true;

function setPanelOpen(open){
  panelOpen = open;
  if(el.panel) el.panel.classList.toggle('is-collapsed', !open);
  if(el.panelHandle){
    el.panelHandle.setAttribute('aria-expanded', String(open));
    el.panelHandle.setAttribute('aria-label', open ? 'Hide controls' : 'Show controls');
  }
  if(open) wakePanel();
}

function wakePanel(){
  if(!el.panel) return;
  el.panel.classList.remove('is-dimmed');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(function(){
    // Never dim while the user is typing a number
    if(panelOpen && document.activeElement !== el.jumpInput){
      el.panel.classList.add('is-dimmed');
    }
  }, IDLE_MS);
}

function bindPanel(){
  on(el.panelHandle, 'click', function(){ setPanelOpen(!panelOpen); });
  ['pointerenter','pointerdown','pointermove','focusin','input'].forEach(function(ev){
    on(el.panel, ev, wakePanel);
  });
  document.addEventListener('pointerdown', wakePanel);
}

/* =========================================================================
   11. THEME + SETTINGS
   ========================================================================= */

function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  if(el.themeBtn) el.themeBtn.textContent = t === 'dark' ? '☀' : '☾';
}

function bindTheme(){
  var saved = null;
  try{ saved = localStorage.getItem('arabicNumbers.theme'); }catch(_){}
  var prefersLight = window.matchMedia &&
                     window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(saved || (prefersLight ? 'light' : 'dark'));

  on(el.themeBtn, 'click', function(){
    var cur = document.documentElement.getAttribute('data-theme') || 'dark';
    var nt = cur === 'dark' ? 'light' : 'dark';
    applyTheme(nt);
    try{ localStorage.setItem('arabicNumbers.theme', nt); }catch(_){}
  });
}

function saveSettings(){
  try{
    localStorage.setItem('arabicNumbers.settings', JSON.stringify({
      volume: state.volume,
      muted: state.muted,
      speed: el.speed ? el.speed.value : 'normal',
      loop: state.loop,
      rangeStart: state.rangeStart,
      rangeEnd: state.rangeEnd
    }));
  }catch(_){}
}

function loadSettings(){
  var s = {};
  try{ s = JSON.parse(localStorage.getItem('arabicNumbers.settings') || '{}') || {}; }
  catch(_){ s = {}; }

  state.volume     = typeof s.volume === 'number' ? s.volume : 1;
  state.muted      = !!s.muted;
  state.loop       = s.loop !== false;
  state.rangeStart = typeof s.rangeStart === 'number' ? s.rangeStart : 1;
  state.rangeEnd   = typeof s.rangeEnd === 'number' ? s.rangeEnd : 100;
  state.current    = state.rangeStart;

  if(el.volume)     el.volume.value = Math.round(state.volume * 100);
  if(el.loopToggle) el.loopToggle.checked = state.loop;
  if(el.rangeStart) el.rangeStart.value = state.rangeStart;
  if(el.rangeEnd)   el.rangeEnd.value = state.rangeEnd;
  applySpeedPreset(s.speed || 'normal');
  updateMuteUI();
}

/* =========================================================================
   12. INIT
   -------------------------------------------------------------------------
   The Start button is wired FIRST and in its own try/catch, so the app can
   always be started even if a later step fails.
   ========================================================================= */

function startSession(){
  state.started = true;
  if(el.startOverlay) el.startOverlay.classList.add('is-hidden');

  // Warm up the speech engine inside the user gesture (required by iOS)
  if(speechSupported){
    try{
      var warm = new SpeechSynthesisUtterance(' ');
      warm.volume = 0;
      synth.speak(warm);
    }catch(_){}
    if(!state.voice) loadVoices();
  }

  state.current = state.rangeStart;
  play();
  setPanelOpen(true);
}

function init(){
  collectDom();

  // --- 1. Start button FIRST, so nothing can block it ---
  if(el.startBtn){
    el.startBtn.addEventListener('click', function(){
      safe('startSession', startSession);
    });
  } else {
    console.error('[ArabicNumbers] start-btn missing — index.html is out of date.');
  }

  // --- 2. Everything else, each isolated ---
  safe('loadSettings', loadSettings);
  safe('buildWheel',   buildWheelPool);
  safe('bindWheel',    bindWheel);
  safe('bindControls', bindControls);
  safe('bindPanel',    bindPanel);
  safe('bindTheme',    bindTheme);
  safe('updatePlayUI', updatePlayPauseUI);
  safe('render',       render);

  safe('voices', function(){
    loadVoices();
    if(speechSupported && synth.addEventListener){
      synth.addEventListener('voiceschanged', loadVoices);
    }
    setTimeout(loadVoices, 600);
    setTimeout(loadVoices, 1800);
  });

  document.addEventListener('visibilitychange', function(){
    if(document.hidden && state.playing) pause();
  });

  window.addEventListener('resize', function(){
    safe('resize', function(){ renderWheel(state.current); });
  });
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();   // script loaded after the DOM was already parsed
}
