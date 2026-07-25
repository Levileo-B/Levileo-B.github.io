// 背景音乐开关 —— 自动注入到每个页面顶部导航栏里。
//
// 声音是用 Web Audio 实时合成的：五声音阶上的随机音符 + 一层低音铺底，
// 所以不需要任何音乐文件，也就不存在版权问题，还省掉了几 MB 的加载。
//
// 想换成自己的曲子：给引入这个脚本的 <script> 加一个 data-src，例如
//   <script src="assets/bgm.js" data-src="assets/bgm.mp3"></script>
// 不写 data-src 就只用合成音 —— 默认不去猜某个文件是否存在，
// 否则每次打开页面控制台都会多一条 404。
//
// 关于自动播放：浏览器一律禁止未经交互就出声。所以首次必须点一下按钮；
// 之前开过的话，我们只是「预备好」，等用户在页面上第一次点击 / 按键时再启动。
(function () {
  var KEY_ON = 'bgmOn';
  var KEY_VOL = 'bgmVol';
  var state = { on: false, vol: 0.35, started: false };
  var ctx = null, master = null, timer = null, audioEl = null, customSrc = '';

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

  function start() {
    // 只有显式配了 data-src 才走音频文件，否则直接用合成音
    if (customSrc && !audioEl && !state.started) {
      audioEl = new Audio(customSrc);
      audioEl.loop = true;
      audioEl.volume = state.vol;
      audioEl.addEventListener('error', function () {
        audioEl = null;
        if (state.on && ensureCtx()) {
          if (ctx.state === 'suspended') ctx.resume();
          startSynth();
        }
      }, { once: true });
    }
    state.started = true;

    if (audioEl) {
      audioEl.volume = state.vol;
      var p = audioEl.play();
      if (p && p.catch) {
        p.catch(function () {
          audioEl = null;
          if (ensureCtx()) { if (ctx.state === 'suspended') ctx.resume(); startSynth(); }
        });
      }
      return;
    }
    if (ensureCtx()) {
      if (ctx.state === 'suspended') ctx.resume();
      startSynth();
    }
  }

  function stop() {
    if (audioEl) { audioEl.pause(); }
    stopSynth();
    if (ctx && ctx.state === 'running') ctx.suspend();
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
    wrap.appendChild(slider);

    var toggle = nav.querySelector('.theme-toggle');
    if (toggle) nav.insertBefore(wrap, toggle);
    else nav.appendChild(wrap);

    paint();
    return paint;
  }

  function init() {
    var nav = document.querySelector('.nav');
    if (!nav) return;

    var me = document.querySelector('script[src$="bgm.js"]');
    customSrc = (me && me.getAttribute('data-src')) || '';

    state.vol = parseFloat(read(KEY_VOL, '0.35'));
    if (isNaN(state.vol)) state.vol = 0.35;

    var paint = build(nav);

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
