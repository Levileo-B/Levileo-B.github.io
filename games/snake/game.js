// 贪吃蛇 —— canvas 实现，颜色跟随站点主题变量
(function () {
  var N = 20;                 // 20 x 20 格
  var KEY_BEST = 'bestSnake';
  var BASE_MS = 145;          // 初始步进间隔
  var MIN_MS = 70;
  var STEP_DOWN = 4;          // 每吃一个加速多少毫秒

  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlay-title');
  var overlayText = document.getElementById('overlay-text');
  var overlayBtn = document.getElementById('overlay-btn');

  var cell = cv.width / N;
  var snake, dir, queued, food, score, best, interval, timer, state;
  // state: 'ready' | 'running' | 'paused' | 'over'

  var DIRS = {
    up:    { x: 0, y: -1 },
    down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  function readBest() {
    try { return parseInt(localStorage.getItem(KEY_BEST), 10) || 0; } catch (e) { return 0; }
  }
  function writeBest(v) {
    try { localStorage.setItem(KEY_BEST, String(v)); } catch (e) {}
  }

  function theme() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fallback) {
      return (cs.getPropertyValue(name) || '').trim() || fallback;
    }
    return {
      accent: v('--accent', '#2563eb'),
      border: v('--border', '#d8dee4'),
      surface: v('--surface', '#ffffff'),
      muted: v('--text-muted', '#59636e')
    };
  }

  function placeFood() {
    var taken = {};
    snake.forEach(function (s) { taken[s.x + ',' + s.y] = true; });
    var free = [];
    for (var x = 0; x < N; x++)
      for (var y = 0; y < N; y++)
        if (!taken[x + ',' + y]) free.push({ x: x, y: y });
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  function draw() {
    var t = theme();

    ctx.fillStyle = t.surface;
    ctx.fillRect(0, 0, cv.width, cv.height);

    // 淡淡的网格
    ctx.strokeStyle = t.border;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 1; i < N; i++) {
      ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, cv.height);
      ctx.moveTo(0, i * cell); ctx.lineTo(cv.width, i * cell);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 食物
    if (food) {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc((food.x + 0.5) * cell, (food.y + 0.5) * cell, cell * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }

    // 蛇身，越靠近头部越不透明
    var pad = cell * 0.12;
    for (var s = 0; s < snake.length; s++) {
      var seg = snake[s];
      ctx.globalAlpha = s === 0 ? 1 : 0.45 + 0.5 * (1 - s / snake.length);
      ctx.fillStyle = t.accent;
      var r = cell * 0.22;
      var x = seg.x * cell + pad, y = seg.y * cell + pad;
      var w = cell - pad * 2, h = w;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function step() {
    if (queued) { dir = queued; queued = null; }
    var head = snake[0];
    var next = { x: head.x + DIRS[dir].x, y: head.y + DIRS[dir].y };

    // 撞墙
    if (next.x < 0 || next.y < 0 || next.x >= N || next.y >= N) return die();
    // 咬到自己（尾巴这一格本回合会让出来，所以不算）
    for (var i = 0; i < snake.length - 1; i++) {
      if (snake[i].x === next.x && snake[i].y === next.y) return die();
    }

    snake.unshift(next);

    if (food && next.x === food.x && next.y === food.y) {
      score++;
      scoreEl.textContent = score;
      if (score > best) { best = score; writeBest(best); bestEl.textContent = best; }
      food = placeFood();
      if (!food) return win();
      interval = Math.max(MIN_MS, interval - STEP_DOWN);
      restartTimer();
    } else {
      snake.pop();
    }

    draw();
  }

  function restartTimer() {
    clearInterval(timer);
    timer = setInterval(step, interval);
  }

  function die() {
    state = 'over';
    clearInterval(timer);
    draw();
    show('游戏结束', '本局得分 ' + score + '，最高 ' + best + '。', '再来一局');
  }

  function win() {
    state = 'over';
    clearInterval(timer);
    draw();
    show('通关了', '整个棋盘都被填满了，得分 ' + score + '。', '再来一局');
  }

  function show(title, text, btn) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayBtn.textContent = btn;
    overlay.classList.add('is-open');
  }

  function hide() {
    overlay.classList.remove('is-open');
  }

  function reset() {
    clearInterval(timer);
    var mid = Math.floor(N / 2);
    snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
    dir = 'right';
    queued = null;
    score = 0;
    interval = BASE_MS;
    best = readBest();
    food = placeFood();
    state = 'ready';
    scoreEl.textContent = score;
    bestEl.textContent = best;
    draw();
    show('准备好了吗', '方向键 / WASD 控制，手机可以滑动或用下面的方向键。', '开始');
  }

  function begin() {
    if (state === 'over' || state === 'ready') {
      if (state === 'over') reset();
      hide();
      state = 'running';
      restartTimer();
    }
  }

  function togglePause() {
    if (state === 'running') {
      state = 'paused';
      clearInterval(timer);
      show('已暂停', '按空格或点下面的按钮继续。', '继续');
    } else if (state === 'paused') {
      hide();
      state = 'running';
      restartTimer();
    }
  }

  // 不允许直接掉头
  function turn(d) {
    if (state === 'ready') begin();
    if (state !== 'running') return;
    var cur = DIRS[queued || dir];
    if (DIRS[d].x === -cur.x && DIRS[d].y === -cur.y) return;
    queued = d;
  }

  var KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  };

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      if (state === 'ready' || state === 'over') begin();
      else togglePause();
      return;
    }
    var d = KEYS[e.key];
    if (!d) return;
    e.preventDefault();
    turn(d);
  });

  var wrap = cv.parentNode;
  var start = null;
  wrap.addEventListener('touchstart', function (e) {
    var t = e.changedTouches[0];
    start = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  wrap.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  wrap.addEventListener('touchend', function (e) {
    if (!start) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - start.x, dy = t.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
                                     : (dy > 0 ? 'down' : 'up'));
  });

  Array.prototype.forEach.call(document.querySelectorAll('.dpad button'), function (b) {
    b.addEventListener('click', function () { turn(b.dataset.dir); });
  });

  overlayBtn.addEventListener('click', function () {
    if (state === 'paused') togglePause();
    else begin();
  });
  document.getElementById('restart').addEventListener('click', function () {
    reset();
    hide();
    state = 'running';
    restartTimer();
  });

  // 切换深浅色后重绘，让画布颜色跟上
  var toggle = document.querySelector('.theme-toggle');
  if (toggle) toggle.addEventListener('click', function () { setTimeout(draw, 0); });

  reset();
})();
