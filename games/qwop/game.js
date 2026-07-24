// QWOP 式跑步 —— Verlet 质点 + 距离约束搭出来的简易布娃娃
//
// 没有「前进键」：位移完全来自四个键给关节施加的力矩，通过脚与地面的
// 摩擦转化成推进力。这也是原版 QWOP 那么难的原因。
(function () {
  var cv = document.getElementById('stage');
  var ctx = cv.getContext('2d');
  var distEl = document.getElementById('dist');
  var bestEl = document.getElementById('best');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlay-title');
  var overlayText = document.getElementById('overlay-text');
  var overlayBtn = document.getElementById('overlay-btn');

  var W = cv.width, H = cv.height;
  var GROUND = 246;          // 地面 y
  var PPM = 58;              // 每米像素，人物约 105px ≈ 1.8m
  var G = 0.34;              // 重力（px/步²）
  var DAMP = 0.994;          // 速度衰减
  var MAXV = 12;             // 单步位移上限，防止数值爆炸
  var ITER = 12;             // 约束迭代次数
  var TORQUE = 0.62;         // 肌肉力矩强度
  var CORE = 1.15;           // 核心力量：抵抗躯干倒伏的力矩系数
  var LEG_MIN = 32;          // 髋到脚的最小距离，防止腿完全折叠
  var STEP_MS = 1000 / 60;
  var KEY_BEST = 'bestQwop';

  var pts, links, state, dist, bestDist, startX, acc, last, raf;
  // state: 'ready' | 'running' | 'over'

  var held = { q: false, w: false, o: false, p: false };

  function readBest() {
    try { return parseFloat(localStorage.getItem(KEY_BEST)) || 0; } catch (e) { return 0; }
  }
  function writeBest(v) {
    try { localStorage.setItem(KEY_BEST, v.toFixed(1)); } catch (e) {}
  }

  function P(x, y, friction) {
    return { x: x, y: y, px: x, py: y, fr: friction === undefined ? 0.18 : friction };
  }

  function link(a, b, stiff) {
    return { a: a, b: b, len: Math.hypot(b.x - a.x, b.y - a.y), stiff: stiff === undefined ? 1 : stiff };
  }

  function build() {
    var x = 150;
    // 起手是一个前后分腿的站姿：双脚并拢的话人物一开始就没有支撑面，
    // 还没等玩家按键就已经倒了。
    var head  = P(x,      GROUND - 118);
    var chest = P(x,      GROUND - 100);
    var hip   = P(x,      GROUND - 64);
    var kneeL = P(x + 14, GROUND - 34);
    var footL = P(x + 24, GROUND - 1, 0.8);
    var kneeR = P(x - 12, GROUND - 34);
    var footR = P(x - 22, GROUND - 1, 0.8);
    var handL = P(x + 16, GROUND - 74);
    var handR = P(x - 16, GROUND - 74);

    pts = { head: head, chest: chest, hip: hip,
            kneeL: kneeL, footL: footL, kneeR: kneeR, footR: footR,
            handL: handL, handR: handR };

    links = [
      link(head, chest),
      link(chest, hip),
      link(hip, kneeL), link(kneeL, footL),
      link(hip, kneeR), link(kneeR, footR),
      link(chest, handL, 0.4), link(chest, handR, 0.4),
      // 头到髋的斜拉，让躯干整体保持刚性，不会在腰上对折
      link(head, hip, 0.9)
    ];

    startX = hip.x;
    dist = 0;
  }

  function all() {
    return [pts.head, pts.chest, pts.hip, pts.kneeL, pts.footL,
            pts.kneeR, pts.footR, pts.handL, pts.handR];
  }

  // 绕 pivot 给 tip 施加切向力矩，pivot 受反作用
  function torque(pivot, tip, amt) {
    var dx = tip.x - pivot.x, dy = tip.y - pivot.y;
    var len = Math.hypot(dx, dy);
    if (len < 0.001) return;
    var tx = -dy / len, ty = dx / len;
    tip.x += tx * amt;         tip.y += ty * amt;
    pivot.x -= tx * amt * 0.35; pivot.y -= ty * amt * 0.35;
  }

  // 核心力量：把躯干往竖直方向拉回来。没有这一项，四个键控制的布娃娃
  // 就是个倒立摆，还没等玩家反应过来就已经躺平了 —— 实测存活不到 1 秒。
  // 力矩与倾角成正比，倾得越狠拉得越用力，但上限有限，玩太野照样会摔。
  function core() {
    var dx = pts.chest.x - pts.hip.x;
    var dy = pts.chest.y - pts.hip.y;
    var lean = Math.atan2(dx, -dy);          // 0 为竖直，正为前倾
    var amt = -lean * CORE;
    if (amt >  1.6) amt =  1.6;
    if (amt < -1.6) amt = -1.6;
    torque(pts.hip, pts.chest, amt);
  }

  // 膝盖不能无限折叠：限制髋到脚的最小距离
  function limitMin(a, b, minLen) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.hypot(dx, dy);
    if (d >= minLen || d < 0.0001) return;
    var diff = ((d - minLen) / d) * 0.5;
    a.x += dx * diff; a.y += dy * diff;
    b.x -= dx * diff; b.y -= dy * diff;
  }

  function muscles() {
    var t = TORQUE;
    // Q / W：两条大腿反向摆动（绕髋）
    if (held.q) { torque(pts.hip, pts.kneeR, -t); torque(pts.hip, pts.kneeL,  t); }
    if (held.w) { torque(pts.hip, pts.kneeL, -t); torque(pts.hip, pts.kneeR,  t); }
    // O / P：两条小腿反向摆动（绕膝）
    if (held.o) { torque(pts.kneeR, pts.footR, -t); torque(pts.kneeL, pts.footL,  t); }
    if (held.p) { torque(pts.kneeL, pts.footL, -t); torque(pts.kneeR, pts.footR,  t); }
  }

  function integrate(p) {
    var vx = (p.x - p.px) * DAMP;
    var vy = (p.y - p.py) * DAMP;
    if (vx >  MAXV) vx =  MAXV; if (vx < -MAXV) vx = -MAXV;
    if (vy >  MAXV) vy =  MAXV; if (vy < -MAXV) vy = -MAXV;
    p.px = p.x; p.py = p.y;
    p.x += vx;
    p.y += vy + G;
  }

  function solve(c) {
    var a = c.a, b = c.b;
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.hypot(dx, dy);
    if (d < 0.0001) return;
    var diff = ((d - c.len) / d) * 0.5 * c.stiff;
    var ox = dx * diff, oy = dy * diff;
    a.x += ox; a.y += oy;
    b.x -= ox; b.y -= oy;
  }

  function ground(p) {
    if (p.y > GROUND) {
      p.y = GROUND;
      var vx = p.x - p.px;
      p.px = p.x - vx * (1 - p.fr);   // 水平摩擦
    }
  }

  function physics() {
    core();
    muscles();
    var list = all();
    var i;
    for (i = 0; i < list.length; i++) integrate(list[i]);
    for (var k = 0; k < ITER; k++) {
      for (i = 0; i < links.length; i++) solve(links[i]);
      limitMin(pts.hip, pts.footL, LEG_MIN);
      limitMin(pts.hip, pts.footR, LEG_MIN);
      for (i = 0; i < list.length; i++) ground(list[i]);
    }

    // 数值兜底：一旦出现 NaN 直接判定摔倒，避免画面卡死
    for (i = 0; i < list.length; i++) {
      if (!isFinite(list[i].x) || !isFinite(list[i].y)) return over('出了点意外');
    }

    // 纪录要在跑的过程中实时保存：只在摔倒时才记的话，中途点「重新开始」
    // 这一趟的成绩就白跑了。
    var d = (pts.hip.x - startX) / PPM;
    if (d > dist) {
      dist = d;
      distEl.textContent = dist.toFixed(1);
      if (dist > bestDist) {
        bestDist = dist;
        writeBest(bestDist);
        bestEl.textContent = bestDist.toFixed(1);
      }
    }

    // 上半身或臀部触地即结束。光判断头和胸是不够的：人物很容易瘫成一个
    // 双腿摊平的坐姿，头胸恰好还在阈值之上，于是一边贴地蹭一边继续计距离。
    if (pts.head.y > GROUND - 14 ||
        pts.chest.y > GROUND - 10 ||
        pts.hip.y > GROUND - 16) over('摔倒了');
  }

  function over(title) {
    if (state === 'over') return;
    state = 'over';
    show(title, '这次跑了 ' + dist.toFixed(1) + ' 米，最远 ' + bestDist.toFixed(1) + ' 米。', '再来一次');
  }

  // ---------- 绘制 ----------
  function theme() {
    var cs = getComputedStyle(document.documentElement);
    function v(n, f) { return (cs.getPropertyValue(n) || '').trim() || f; }
    return {
      accent: v('--accent', '#2563eb'),
      border: v('--border', '#d8dee4'),
      surface: v('--surface', '#ffffff'),
      soft: v('--bg-soft', '#f6f8fa'),
      text: v('--text', '#1f2328'),
      muted: v('--text-muted', '#59636e')
    };
  }

  function limb(a, b, width, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function draw() {
    var t = theme();
    var camX = pts.hip.x - 210;

    ctx.fillStyle = t.surface;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-camX, 0);

    // 跑道刻度：每米一个短刻度，每 5 米标数字
    var from = Math.floor((camX - PPM) / PPM), to = Math.ceil((camX + W + PPM) / PPM);
    ctx.strokeStyle = t.border;
    ctx.fillStyle = t.muted;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (var m = from; m <= to; m++) {
      var mx = startX + m * PPM;
      var big = m % 5 === 0;
      ctx.globalAlpha = big ? 0.85 : 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, GROUND + 1);
      ctx.lineTo(mx, GROUND + (big ? 14 : 7));
      ctx.stroke();
      if (big && m >= 0) ctx.fillText(m + 'm', mx, GROUND + 30);
    }
    ctx.globalAlpha = 1;

    // 地面
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(camX - 10, GROUND + 1);
    ctx.lineTo(camX + W + 10, GROUND + 1);
    ctx.stroke();

    // 远端肢体画淡一点，制造前后层次
    limb(pts.chest, pts.handR, 6, t.accent, 0.45);
    limb(pts.hip, pts.kneeR, 9, t.accent, 0.45);
    limb(pts.kneeR, pts.footR, 7, t.accent, 0.45);

    limb(pts.chest, pts.hip, 13, t.accent, 1);
    limb(pts.hip, pts.kneeL, 9, t.accent, 1);
    limb(pts.kneeL, pts.footL, 7, t.accent, 1);
    limb(pts.chest, pts.handL, 6, t.accent, 1);

    // 头
    ctx.fillStyle = t.accent;
    ctx.beginPath();
    ctx.arc(pts.head.x, pts.head.y, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ---------- 主循环 ----------
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (state !== 'running') { draw(); return; }
    if (!last) last = now;
    acc += now - last;
    last = now;
    if (acc > 250) acc = 250;              // 切后台回来别一次补太多帧
    var guard = 0;
    while (acc >= STEP_MS && guard++ < 10) {
      physics();
      acc -= STEP_MS;
      if (state !== 'running') break;
    }
    draw();
  }

  function show(title, text, btn) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayBtn.textContent = btn;
    overlay.classList.add('is-open');
  }
  function hide() { overlay.classList.remove('is-open'); }

  function reset() {
    build();
    state = 'ready';
    acc = 0; last = 0;
    held.q = held.w = held.o = held.p = false;
    bestDist = readBest();
    distEl.textContent = '0.0';
    bestEl.textContent = bestDist.toFixed(1);
    draw();
  }

  function begin() {
    if (state === 'over' || state === 'ready') {
      reset();
      hide();
      state = 'running';
      last = 0;
    }
  }

  // ---------- 输入 ----------
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    var k = e.key.toLowerCase();
    if (k === ' ' || k === 'spacebar') { e.preventDefault(); begin(); return; }
    if (k in held) {
      e.preventDefault();
      if (state !== 'running') begin();
      held[k] = true;
    }
  });

  document.addEventListener('keyup', function (e) {
    var k = e.key.toLowerCase();
    if (k in held) held[k] = false;
  });

  // 触屏按键：按住生效
  Array.prototype.forEach.call(document.querySelectorAll('.keys button'), function (b) {
    var k = b.dataset.key;
    function down(e) {
      e.preventDefault();
      if (state !== 'running') begin();
      held[k] = true;
      b.classList.add('is-down');
    }
    function up() { held[k] = false; b.classList.remove('is-down'); }
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('pointercancel', up);
  });

  overlayBtn.addEventListener('click', begin);
  document.getElementById('restart').addEventListener('click', function () {
    reset();
    hide();
    state = 'running';
    last = 0;
  });

  var toggle = document.querySelector('.theme-toggle');
  if (toggle) toggle.addEventListener('click', function () { setTimeout(draw, 0); });

  reset();
  show('准备起跑', 'Q / W 交替摆动大腿，O / P 控制小腿落地。和原版 QWOP 一样，这很难。', '开始');
  raf = requestAnimationFrame(frame);
})();
