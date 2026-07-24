// 2048 的棋盘运算 —— 纯逻辑，不碰 DOM，可以单独在 Node 里跑测试。
//
// 这里所有函数都是「传入旧棋盘、返回新棋盘」，任何一步都不原地修改入参。
// 之所以强调这点：早期版本的 rotate(grid, 0) 直接把原数组返回了，向左滑时
// 中间变量和棋盘是同一个对象，改完再比较「有没有变化」自然永远相等，
// 于是「向左」整个方向静默失效。纯函数 + 单测能挡住这类别名 bug。
(function (root) {
  var SIZE = 4;

  function emptyGrid() {
    var out = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(0);
      out.push(row);
    }
    return out;
  }

  function cloneGrid(b) {
    var out = [];
    for (var r = 0; r < SIZE; r++) out.push(b[r].slice());
    return out;
  }

  function gridsEqual(a, b) {
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        if (a[r][c] !== b[r][c]) return false;
    return true;
  }

  function freeCells(b) {
    var cells = [];
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        if (!b[r][c]) cells.push([r, c]);
    return cells;
  }

  function rotateCW(b) {
    var out = emptyGrid();
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        out[c][SIZE - 1 - r] = b[r][c];
    return out;
  }

  // 无论转几次都返回全新数组；times 为 0 时也不会把入参漏出去
  function rotate(b, times) {
    var n = ((times % 4) + 4) % 4;
    var out = cloneGrid(b);
    for (var i = 0; i < n; i++) out = rotateCW(out);
    return out;
  }

  // 单行向左压缩合并，返回新行与本次得分
  function slideRow(row) {
    var vals = [];
    for (var i = 0; i < row.length; i++) if (row[i]) vals.push(row[i]);

    var out = [];
    var gained = 0;
    for (var j = 0; j < vals.length; j++) {
      if (j + 1 < vals.length && vals[j] === vals[j + 1]) {
        var merged = vals[j] * 2;
        out.push(merged);
        gained += merged;
        j++;                       // 跳过被吃掉的那格，保证一步只合并一次
      } else {
        out.push(vals[j]);
      }
    }
    while (out.length < SIZE) out.push(0);
    return { row: out, gained: gained };
  }

  // 旋转 k 次后「向左滑」分别等价于：0 左、1 下、2 右、3 上
  var TURNS = { left: 0, down: 1, right: 2, up: 3 };

  function slide(b, dir) {
    var k = TURNS[dir];
    var work = rotate(b, k);
    var gained = 0;
    for (var r = 0; r < SIZE; r++) {
      var res = slideRow(work[r]);
      work[r] = res.row;
      gained += res.gained;
    }
    var next = rotate(work, -k);
    return { grid: next, gained: gained, moved: !gridsEqual(b, next) };
  }

  function hasValue(b, v) {
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        if (b[r][c] === v) return true;
    return false;
  }

  function canMove(b) {
    if (freeCells(b).length) return true;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (c + 1 < SIZE && b[r][c + 1] === b[r][c]) return true;
        if (r + 1 < SIZE && b[r + 1][c] === b[r][c]) return true;
      }
    }
    return false;
  }

  var api = {
    SIZE: SIZE,
    emptyGrid: emptyGrid,
    cloneGrid: cloneGrid,
    gridsEqual: gridsEqual,
    freeCells: freeCells,
    rotate: rotate,
    slideRow: slideRow,
    slide: slide,
    hasValue: hasValue,
    canMove: canMove
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Board2048 = api;
})(typeof self !== 'undefined' ? self : this);
