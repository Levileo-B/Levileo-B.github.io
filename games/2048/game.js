// 2048 的界面层 —— 只负责渲染、输入和存档，棋盘运算全在 board.js 里
(function () {
  var B = window.Board2048;
  var SIZE = B.SIZE;
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

  function addTile() {
    var cells = B.freeCells(grid);
    if (!cells.length) return null;
    var pick = cells[Math.floor(Math.random() * cells.length)];
    grid[pick[0]][pick[1]] = Math.random() < 0.9 ? 2 : 4;
    return pick;
  }

  function move(dir) {
    if (dead) return;

    var res = B.slide(grid, dir);
    if (!res.moved) return;                 // 这个方向推不动，不算一步

    grid = res.grid;
    score += res.gained;
    if (score > best) { best = score; writeBest(best); }

    fresh = addTile();
    render();

    if (!won && B.hasValue(grid, 2048)) {
      won = true;
      if (!keptGoing) {
        finish('拼出 2048 了！', '还可以继续往上叠，看能走多远。', true);
        return;
      }
    }
    if (!B.canMove(grid)) {
      dead = true;
      finish('没有可走的步了', '最终得分 ' + score + '。', false);
    }
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

  function closeOverlay() { overlay.classList.remove('is-open'); }

  function reset() {
    grid = B.emptyGrid();
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

  // ---------- 输入 ----------
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
