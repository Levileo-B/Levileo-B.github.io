// 背景音乐开关 —— 自动注入到每个页面顶部导航栏里。
//
// 曲库来自 data/daily.json 里的 music 字段 —— Internet Archive 的 Netlabels
// 馆藏，全部是 CC 授权，由 Actions 定时刷新。随机起播，可以手动切下一首，
// 当前曲目的标题 / 作者 / 许可会显示在左下角并回链原页（CC 署名要求）。
//
// 曲库取不到时回落到 Web Audio 实时合成的环境音（五声音阶随机音符 +
// 低音铺底），保证任何情况下开关都有反馈，也不会因为外链挂掉就哑掉。
//
// 关于自动播放：浏览器一律禁止未经交互就出声。所以首次必须点一下按钮；
// 之前开过的话，我们只是「预备好」，等用户在页面上第一次点击 / 按键时再启动。
(function () {
  var KEY_ON = 'bgmOn';
  var KEY_VOL = 'bgmVol';
  var state = { on: false, vol: 0.35, started: false, mode: '' };
  var ctx = null, master = null, timer = null, audioEl = null;
  var tracks = [], order = [], cursor = -1, nowEl = null, nextBtn = null, base = '';

  function read(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) {}
  }

  // ---------- 合成音 ----------
  // 五声音阶（C 大调 pentatonic），随便挑都不会难听
  var SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];

  function note(freq, when, dur, gain) {
    var osc = ctx.createOscillator();
    var env = ctx.createGain();
    var filt = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.value = freq;
    filt.type = 'lowpass';
    filt.frequency.value = 1800;

    // 慢起慢落，避免爆音
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(gain, when + 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    osc.connect(filt); filt.connect(env); env.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.1);
  }

  function pad(when) {
    var osc = ctx.createOscillator();
    var env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 130.81;                 // 低八度 C，做铺底
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(0.05, when + 2);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 8);
    osc.connect(env); env.connect(master);
    osc.start(when);
    osc.stop(when + 8.2);
  }

  function tick() {
    if (!ctx) return;
    var t = ctx.currentTime + 0.05;
    // 大部分时候弹一个音，偶尔叠一个五度，偶尔留白
    var r = Math.random();
    if (r < 0.75) {
      var f = SCALE[Math.floor(Math.random() * SCALE.length)];
      note(f, t, 2.4 + Math.random() * 1.5, 0.11);
      if (Math.random() < 0.25) note(f * 1.5, t + 0.18, 2.0, 0.05);
    }
    if (Math.random() < 0.12) pad(t);
  }

  function startSynth() {
    if (timer) return;
    pad(ctx.currentTime + 0.1);
    tick();
    timer = setInterval(tick, 1500);
  }

  function stopSynth() {
    clearInterval(timer);
    timer = null;
  }

  // ---------- 启停 ----------
  function ensureCtx() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = state.vol;
    master.connect(ctx.destination);
    return true;
  }

  // ---------- 歌单 ----------
  function shuffle(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  function showNow(tr) {
    if (!nowEl) return;
    if (!tr) { nowEl.hidden = true; nowEl.innerHTML = ''; return; }
    var who = tr.artist ? ' — ' + tr.artist : '';
    nowEl.hidden = false;
    nowEl.innerHTML =
      '<span class="bgm-now__ico" aria-hidden="true">♪</span>' +
      '<a href="' + esc(tr.page) + '" target="_blank" rel="noopener noreferrer">' +
        esc(tr.title) + esc(who) +
      '</a>' +
      '<span class="bgm-now__lic">CC · Internet Archive</span>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"\']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "\'": '&#39;' }[c];
    });
  }

  var failures = 0;

  function playAt(i) {
    if (!tracks.length) return false;
    cursor = ((i % order.length) + order.length) % order.length;
    var tr = tracks[order[cursor]];

    if (!audioEl) {
      audioEl = new Audio();
      audioEl.addEventListener('ended', function () { next(); });
      audioEl.addEventListener('error', function () {
        // 单曲挂了就跳下一首；整个歌单都挂才回落合成音
        if (++failures >= Math.min(tracks.length, 4)) { toSynth(); return; }
        next();
      });
    }
    audioEl.src = tr.url;
    audioEl.volume = state.vol;
    audioEl.loop = false;
    showNow(tr);
    if (nextBtn) nextBtn.hidden = false;

    var p = audioEl.play();
    if (p && p.catch) {
      p.catch(function () {
        if (++failures >= Math.min(tracks.length, 4)) toSynth();
        else next();
      });
    }
    state.mode = 'track';
    return true;
  }

  function next() {
    if (!state.on) return;
    playAt(cursor + 1);
  }

  function toSynth() {
    state.mode = 'synth';
    if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); }
    showNow(null);
    if (nextBtn) nextBtn.hidden = true;
    if (ensureCtx()) {
      if (ctx.state === 'suspended') ctx.resume();
      startSynth();
    }
  }

  function start() {
    state.started = true;
    failures = 0;
    if (tracks.length) {
      if (cursor < 0) { order = shuffle(tracks.length); cursor = -1; }
      if (playAt(cursor < 0 ? 0 : cursor)) return;
    }
    toSynth();
  }

  function stop() {
    if (audioEl) audioEl.pause();
    stopSynth();
    if (ctx && ctx.state === 'running') ctx.suspend();
    showNow(null);
    if (nextBtn) nextBtn.hidden = true;
  }

  function setVolume(v) {
    state.vol = v;
    if (master) master.gain.value = v;
    if (audioEl) audioEl.volume = v;
    write(KEY_VOL, v);
  }

  // ---------- 界面 ----------
  function build(nav) {
    var wrap = document.createElement('div');
    wrap.className = 'bgm';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bgm__btn';
    btn.setAttribute('aria-pressed', 'false');

    nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'bgm__next';
    nextBtn.textContent = '⏭';
    nextBtn.title = '换一首';
    nextBtn.setAttribute('aria-label', '换一首');
    nextBtn.hidden = true;
    nextBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (state.on) next();
    });

    var slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'bgm__vol';
    slider.min = '0'; slider.max = '1'; slider.step = '0.05';
    slider.value = String(state.vol);
    slider.setAttribute('aria-label', '背景音乐音量');
    slider.title = '音量';

    function paint() {
      btn.textContent = state.on ? '🔊' : '🔇';
      btn.title = state.on ? '关闭背景音乐' : '开启背景音乐';
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', state.on ? 'true' : 'false');
      wrap.classList.toggle('is-on', state.on);
    }

    btn.addEventListener('click', function () {
      state.on = !state.on;
      write(KEY_ON, state.on ? '1' : '0');
      if (state.on) start(); else stop();
      paint();
    });

    slider.addEventListener('input', function () {
      setVolume(parseFloat(slider.value));
    });

    wrap.appendChild(btn);
    wrap.appendChild(nextBtn);
    wrap.appendChild(slider);

    var toggle = nav.querySelector('.theme-toggle');
    if (toggle) nav.insertBefore(wrap, toggle);
    else nav.appendChild(wrap);

    nowEl = document.createElement('div');
    nowEl.className = 'bgm-now';
    nowEl.hidden = true;
    document.body.appendChild(nowEl);

    paint();
    return paint;
  }

  function init() {
    var nav = document.querySelector('.nav');
    if (!nav) return;

    // 从自身 script 路径推出站点根，好让各级子目录都能找到 data/
    var me = document.querySelector('script[src$="bgm.js"]');
    var src = me ? me.getAttribute('src') : 'assets/bgm.js';
    base = src.replace(/assets\/bgm\.js$/, '');

    state.vol = parseFloat(read(KEY_VOL, '0.35'));
    if (isNaN(state.vol)) state.vol = 0.35;

    var paint = build(nav);

    // 歌单来自 Actions 生成的 daily.json，拉不到就用合成音兜底
    fetch(base + 'data/daily.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var list = (d && d.music) || [];
        tracks = list.filter(function (t) { return t && t.url; });
        if (tracks.length) order = shuffle(tracks.length);
        // 已经在放合成音的话，等下一次开关再切到真曲子
      })
      .catch(function () { /* 保持合成音兜底 */ });

    // 上次开着的话，等用户第一次交互再真正出声（浏览器不允许直接自动播放）
    if (read(KEY_ON, '0') === '1') {
      state.on = true;
      paint();
      var arm = function () {
        document.removeEventListener('click', arm);
        document.removeEventListener('keydown', arm);
        if (state.on) start();
      };
      document.addEventListener('click', arm);
      document.addEventListener('keydown', arm);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
