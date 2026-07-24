// 2048 —— 无依赖实现，支持键盘与触屏
(function () {
  var SIZE = 4;
  var KEY_BEST = 'best2048';

  var boardEl = document.getElementById('board');
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlay-title');
  var overlayText = document.getElementById('overlay-text');
  var overlayBtn = document.getElementById('overlay-btn');
  var keepGoingBtn = document.getElementById('keep-going');

  var grid, score, best, dead, won, keptGoing, fresh;

  function readBest() {
    try { return parseInt(localStorage.getItem(KEY_BEST), 10) || 0; } catch (e) { return 0; }
  }
  function writeBest(v) {
    try { localStorage.setItem(KEY_BEST, String(v)); } catch (e) {}
  }

  function empty() {
    var out = [];
    for (var r = 0; r < SIZE; r++) {
      out.push([]);
      for (var c = 0; c < SIZE; c++) out[r].push(0);
    }
    return out;
  }

  function freeCells() {
    var cells = [];
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        if (!grid[r][c]) cells.push([r, c]);
    return cells;
  }

  function addTile() {
    var cells = freeCells();
    if (!cells.length) return null;
    var pick = cells[Math.floor(Math.random() * cells.length)];
    grid[pick[0]][pick[1]] = Math.random() < 0.9 ? 2 : 4;
    return pick;
  }

  // 顺时针旋转，用来把四个方向都归约成「向左滑」
  function rotateCW(b) {
    var out = empty();
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        out[c][SIZE - 1 - r] = b[r][c];
    return out;
  }
  function rotate(b, times) {
    var out = b;
    for (var i = 0; i < (times % 4 + 4) % 4; i++) out = rotateCW(out);
    return out;
  }

  // 单行向左压缩合并，返回新行与本次得分
  function slideRow(row) {
    var vals = row.filter(function (v) { return v; });
    var gained = 0;
    for (var i = 0; i < vals.length - 1; i++) {
      if (vals[i] === vals[i + 1]) {
        vals[i] *= 2;
        gained += vals[i];
        vals.splice(i + 1, 1);
      }
    }
    while (vals.length < SIZE) vals.push(0);
    return { row: vals, gained: gained };
  }

  function same(a, b) {
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        if (a[r][c] !== b[r][c]) return false;
    return true;
  }

  // 旋转 k 次后「向左滑」分别等价于：0 左、1 下、2 右、3 上
  var TURNS = { left: 0, down: 1, right: 2, up: 3 };

  function move(dir) {
    if (dead) return;
    var k = TURNS[dir];
    var work = rotate(grid, k);
    var gained = 0;

    for (var r = 0; r < SIZE; r++) {
      var res = slideRow(work[r]);
      work[r] = res.row;
      gained += res.gained;
    }

    var next = rotate(work, 4 - k);
    if (same(grid, next)) return;   // 这个方向推不动，不消耗一步

    grid = next;
    score += gained;
    if (score > best) { best = score; writeBest(best); }

    fresh = addTile();
    render();

    if (!won && hasValue(2048)) {
      won = true;
      if (!keptGoing) return finish('拼出 2048 了！', '还可以继续往上叠，看能走多远。', true);
    }
    if (!canMove()) {
      dead = true;
      finish('没有可走的步了', '最终得分 ' + score + '。', false);
    }
  }

  function hasValue(v) {
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        if (grid[r][c] === v) return true;
    return false;
  }

  function canMove() {
    if (freeCells().length) return true;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = grid[r][c];
        if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
        if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  function render() {
    var html = '';
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = grid[r][c];
        var isNew = fresh && fresh[0] === r && fresh[1] === c;
        html += '<div class="tile' + (isNew ? ' tile--new' : '') + '"' +
                (v ? ' data-v="' + v + '"' : '') + ' role="gridcell">' +
                (v || '') + '</div>';
      }
    }
    boardEl.innerHTML = html;
    scoreEl.textContent = score;
    bestEl.textContent = best;
  }

  function finish(title, text, winning) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    keepGoingBtn.hidden = !winning;
    overlay.classList.add('is-open');
  }

  function closeOverlay() {
    overlay.classList.remove('is-open');
  }

  function reset() {
    grid = empty();
    score = 0;
    dead = false;
    won = false;
    keptGoing = false;
    fresh = null;
    best = readBest();
    addTile();
    fresh = addTile();
    closeOverlay();
    render();
  }

  // ---- 输入 ----
  var KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
    A: 'left', D: 'right', W: 'up', S: 'down'
  };

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var dir = KEYS[e.key];
    if (!dir) return;
    e.preventDefault();          // 避免方向键把页面滚走
    move(dir);
  });

  var start = null;
  boardEl.addEventListener('touchstart', function (e) {
    var t = e.changedTouches[0];
    start = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  boardEl.addEventListener('touchmove', function (e) {
    e.preventDefault();          // 滑动时不要连带滚动页面
  }, { passive: false });

  boardEl.addEventListener('touchend', function (e) {
    if (!start) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - start.x;
    var dy = t.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;   // 太短当作误触
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
                                     : (dy > 0 ? 'down' : 'up'));
  });

  document.getElementById('restart').addEventListener('click', reset);
  overlayBtn.addEventListener('click', reset);
  keepGoingBtn.addEventListener('click', function () {
    keptGoing = true;
    closeOverlay();
  });

  reset();
})();
