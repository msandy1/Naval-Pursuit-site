// The hero's backdrop: the game's main-menu sea. The sonar grid pans slowly
// over an endless sea of fleets while shots land on it in slow motion, drawn
// as the game board draws them. A plain-JS port of the game's
// components/MenuBackdrop.jsx and utils/backdrop.js, so keep the two in step.
//
// Shots aim at cells clear of anything marked data-sea-avoid (the logo and
// text, the screenshots); behind data-sea-avoid="scrim" the sea is dimmed so
// the text reads. The scene holds still with reduced motion and stops
// drawing while the hero is off screen.
(function () {
  var canvas = document.getElementById('sea');
  if (!canvas || !canvas.getContext) return;
  var host = canvas.parentElement;
  var ctx = canvas.getContext('2d');

  var CELL = 40;
  var PAN_CELL_MS = 13000;   // the pan moves one cell down and right this often
  var SLOW = 4;              // missiles and impacts play this much slower than in a game
  var SCENE_ALPHA = 0.45;    // ships and shots, dimmed behind the text
  var SHIP = '96, 165, 250'; // your own ships' blue in a game
  var FLIGHT = 260;          // a streak missile's flight in a game (ms)
  var STREAK_DISTANCE = 3.2;
  var TRAIL_CELLS = 1.35;
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  var NUMBER_FONT = 'bold 18px "Courier New", Courier, monospace';
  var PAGE_BG = '11, 17, 32'; // --bg, which the scene fades into at the bottom
  var FADE = 140;

  var BLOCK = 12;
  var SHOT_EVERY_MS = 2200;
  var CATCH_UP = 4;
  var SEEDED = 7;
  var HIT_CHANCE = 0.65;
  var SHIPS = [['CAR', 5], ['FRI', 4], ['CRU', 3], ['DES', 2], ['SUB', 1]];
  // The game's four orientations: right, down, down-right, down-left.
  var STEPS = [[1, 0], [0, 1], [1, 1], [-1, 1]];

  function easeOut(t) { return 1 - (1 - t) * (1 - t); }

  // mulberry32: the same seed, the same numbers.
  function seededRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The fleet in block (bx, by), laid out as the game's auto-configure does.
  function fleetFor(bx, by) {
    var random = seededRandom(Math.imul(bx, 73856093) ^ Math.imul(by, 19349663));
    var taken = {};
    var cells = {};
    SHIPS.forEach(function (ship) {
      for (var attempt = 0; attempt < 200; attempt++) {
        var x = Math.floor(random() * BLOCK);
        var y = Math.floor(random() * BLOCK);
        var step = STEPS[Math.floor(random() * STEPS.length)];
        var run = [];
        for (var k = 0; k < ship[1]; k++) run.push([x + step[0] * k, y + step[1] * k]);
        var fits = run.every(function (c) { return c[0] >= 0 && c[1] >= 0 && c[0] < BLOCK && c[1] < BLOCK && !taken[c[0] + ',' + c[1]]; });
        if (fits) {
          run.forEach(function (c) {
            taken[c[0] + ',' + c[1]] = true;
            cells[(bx * BLOCK + c[0]) + ',' + (by * BLOCK + c[1])] = ship[0];
          });
          break;
        }
      }
    });
    return cells;
  }

  // The sea: its fleets, and the shots fired at it.
  var random = seededRandom(7);
  var fleets = {};
  var shots = [];
  var shot = {};
  var nextShot = 0;
  var count = 0;

  function shipAt(x, y) {
    var key = Math.floor(x / BLOCK) + ',' + Math.floor(y / BLOCK);
    if (!fleets[key]) fleets[key] = fleetFor(Math.floor(x / BLOCK), Math.floor(y / BLOCK));
    return fleets[key][x + ',' + y];
  }

  function fireAt(at, candidates) {
    var area = candidates().filter(function (c) { return !shot[c[0] + ',' + c[1]]; });
    if (!area.length) return;
    var ships = area.filter(function (c) { return shipAt(c[0], c[1]); });
    var pool = ships.length && random() < HIT_CHANCE ? ships : area;
    var c = pool[Math.floor(random() * pool.length)];
    count++;
    shot[c[0] + ',' + c[1]] = true;
    shots.push({ x: c[0], y: c[1], round: (count % 24) + 1, start: at });
  }

  function fire(now, candidates) {
    if (now - nextShot > SHOT_EVERY_MS * CATCH_UP) nextShot = now - SHOT_EVERY_MS * CATCH_UP;
    while (now >= nextShot) {
      var at = nextShot;
      nextShot += SHOT_EVERY_MS;
      fireAt(at, candidates);
    }
  }

  // The scene as it opens: a battle already under way, a few shots in.
  function seed(candidates) {
    if (count > 0) return;
    for (var i = 0; i < SEEDED; i++) fireAt(-60000 + i, candidates);
    nextShot = 900;
  }

  // Lets go of what has drifted off the top and left.
  function forget(firstX, firstY) {
    shots = shots.filter(function (s) { return s.x >= firstX - 2 && s.y >= firstY - 2; });
    Object.keys(shot).forEach(function (key) {
      var p = key.split(',');
      if (+p[0] < firstX - 2 || +p[1] < firstY - 2) delete shot[key];
    });
    var bx = Math.floor(firstX / BLOCK) - 1, by = Math.floor(firstY / BLOCK) - 1;
    Object.keys(fleets).forEach(function (key) {
      var p = key.split(',');
      if (+p[0] < bx || +p[1] < by) delete fleets[key];
    });
  }

  // Drawing, as the game board draws ships, missiles and impacts.

  function drawGrid(w, h, cam) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = -(cam % CELL); x < w; x += CELL) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
    for (var y = -(cam % CELL); y < h; y += CELL) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
    ctx.stroke();
  }

  function drawShipCell(x, y, code, hit) {
    ctx.fillStyle = hit ? 'rgba(127, 29, 29, 0.8)' : '#1e293b';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.strokeStyle = 'rgba(' + SHIP + ', 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    ctx.fillStyle = 'rgba(' + SHIP + ', 0.8)';
    ctx.font = 'bold 9px ' + MONO;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(code, x + 2, y + 2);
  }

  function glowAt(x, y, rad, stops) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // A streak missile, its impact flash and ember, `t` ms (game time) after launch.
  function drawMissile(cx, cy, t) {
    var len = CELL * STREAK_DISTANCE;
    var p0 = { x: cx + len * 0.8, y: cy - len * 0.6 };
    if (t < FLIGHT) {
      var k = t / FLIGHT;
      var head = { x: p0.x + (cx - p0.x) * k, y: p0.y + (cy - p0.y) * k };
      var path = Math.hypot(cx - p0.x, cy - p0.y);
      var dir = { x: (cx - p0.x) / path, y: (cy - p0.y) / path };
      var trail = Math.min(CELL * TRAIL_CELLS, path * k);
      var maxWidth = Math.max(1.5, CELL * 0.07);
      var pieces = 14;
      ctx.lineCap = 'round';
      for (var i = 0; i < pieces; i++) {
        var heat = 1 - i / pieces;
        ctx.strokeStyle = heat > 0.85 ? 'rgba(255, 247, 214, ' + heat + ')' : heat > 0.45 ? 'rgba(251, 146, 60, ' + heat + ')' : 'rgba(239, 68, 68, ' + heat * 0.9 + ')';
        ctx.lineWidth = 0.4 + heat * maxWidth;
        ctx.beginPath();
        ctx.moveTo(head.x - dir.x * trail * (i + 1) / pieces, head.y - dir.y * trail * (i + 1) / pieces);
        ctx.lineTo(head.x - dir.x * trail * i / pieces, head.y - dir.y * trail * i / pieces);
        ctx.stroke();
      }
      glowAt(head.x, head.y, Math.max(3, CELL * 0.18), [[0, 'rgba(255, 255, 255, 1)'], [0.4, 'rgba(253, 186, 116, 0.9)'], [1, 'rgba(239, 68, 68, 0)']]);
      return;
    }
    var since = t - FLIGHT;
    if (since < 300) {
      var a = since > 240 ? (300 - since) / 60 : 1;
      glowAt(cx, cy, Math.max(3, CELL * 0.16), [[0, 'rgba(251, 146, 60, ' + 0.9 * a + ')'], [1, 'rgba(239, 68, 68, 0)']]);
    }
    var f = since / 260;
    if (f < 1) {
      glowAt(cx, cy, CELL * 0.75 * (0.3 + f * 0.7), [[0, 'rgba(255, 255, 255, ' + (1 - f) + ')'], [0.35, 'rgba(251, 146, 60, ' + 0.8 * (1 - f) + ')'], [1, 'rgba(239, 68, 68, 0)']]);
    }
  }

  // The two impact rings and the round number fading in, `ms` after landing.
  function drawImpact(cx, cy, ms, round) {
    [[0, 2], [250, 1]].forEach(function (ring) {
      var t = (ms - ring[0]) / 900;
      if (t > 0 && t < 1) {
        var e = easeOut(t);
        ctx.strokeStyle = 'rgba(248, 113, 113, ' + (1 - e) + ')';
        ctx.lineWidth = ring[1];
        ctx.beginPath();
        ctx.arc(cx, cy, CELL * 0.35 * (0.2 + 1.6 * e), 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    var a = Math.max(0, Math.min(1, (ms - 200) / 400));
    if (a > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + a + ')';
      ctx.font = NUMBER_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(round), cx, cy + 1);
    }
  }

  // The soft green glow from just above the middle, as on the game's menu.
  function drawGlow(w, h) {
    ctx.save();
    ctx.translate(w / 2, h * 0.4);
    ctx.scale(Math.max(w / h, 0.6), 1);
    var reach = 0.6 * Math.hypot(w / 2, h * 0.6);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    g.addColorStop(0, 'rgba(43, 227, 107, 0.10)');
    g.addColorStop(1, 'rgba(43, 227, 107, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
    ctx.restore();
  }

  // Into the page's own background at the bottom edge.
  function drawFade(w, h) {
    var g = ctx.createLinearGradient(0, h - FADE, 0, h);
    g.addColorStop(0, 'rgba(' + PAGE_BG + ', 0)');
    g.addColorStop(1, 'rgba(' + PAGE_BG + ', 1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h - FADE, w, FADE);
  }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var width = 0, height = 0, frame = 0, visible = true;
  var start = performance.now();

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    width = host.clientWidth;
    height = host.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // The hero's content, in the canvas's coordinates.
  function avoidRects() {
    var origin = canvas.getBoundingClientRect();
    return Array.prototype.map.call(host.querySelectorAll('[data-sea-avoid]'), function (el) {
      var r = el.getBoundingClientRect();
      return { left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top, width: r.width, height: r.height, scrim: el.getAttribute('data-sea-avoid') === 'scrim' };
    }).filter(function (r) { return r.width > 0; });
  }

  // A soft dark wash behind text, fading out past its edges.
  function drawScrims(rects) {
    rects.forEach(function (r) {
      if (!r.scrim) return;
      ctx.save();
      ctx.translate((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      ctx.scale(r.width * 0.75, r.height * 0.65);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(15, 23, 42, 0.75)');
      g.addColorStop(0.6, 'rgba(15, 23, 42, 0.55)');
      g.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    });
  }

  // Visible cells clear of the hero's content, for the next shot.
  function clearCells(cam, firstX, firstY, avoid) {
    return function () {
      var cells = [];
      // Not in the fade at the bottom.
      var top = 0, bottom = height - FADE * 0.6;
      for (var y = firstY + 1; y < firstY + Math.ceil(height / CELL) - 1; y++) {
        for (var x = firstX + 1; x < firstX + Math.ceil(width / CELL) - 1; x++) {
          var left = x * CELL - cam, cellTop = y * CELL - cam;
          if (cellTop < top || cellTop + CELL > bottom) continue;
          var blocked = avoid.some(function (r) { return left < r.right + 8 && left + CELL > r.left - 8 && cellTop < r.bottom + 8 && cellTop + CELL > r.top - 8; });
          if (!blocked) cells.push([x, y]);
        }
      }
      return cells;
    };
  }

  function draw(now) {
    var cam = reduced ? 0 : (now / PAN_CELL_MS) * CELL;
    var firstX = Math.floor(cam / CELL), firstY = firstX;
    var avoid = avoidRects();
    var candidates = clearCells(cam, firstX, firstY, avoid);
    seed(candidates);
    if (!reduced) fire(now, candidates);
    forget(firstX, firstY);

    drawGrid(width, height, cam);
    ctx.save();
    ctx.globalAlpha = SCENE_ALPHA;
    var landed = {};
    shots.forEach(function (s) { landed[s.x + ',' + s.y] = s.start + FLIGHT * SLOW; });
    var cols = Math.ceil(width / CELL) + 1, rows = Math.ceil(height / CELL) + 1;
    for (var y = firstY; y < firstY + rows; y++) {
      for (var x = firstX; x < firstX + cols; x++) {
        var code = shipAt(x, y);
        if (!code) continue;
        var hitAt = landed[x + ',' + y];
        drawShipCell(x * CELL - cam, y * CELL - cam, code, hitAt !== undefined && now >= hitAt);
      }
    }
    shots.forEach(function (s) {
      var cx = s.x * CELL - cam + CELL / 2, cy = s.y * CELL - cam + CELL / 2;
      var t = (now - s.start) / SLOW;
      if (t < FLIGHT + 400) drawMissile(cx, cy, t);
      if (t >= FLIGHT) drawImpact(cx, cy, ((t - FLIGHT) * SLOW) / 2, s.round);
    });
    ctx.restore();
    drawScrims(avoid);
    drawGlow(width, height);
    drawFade(width, height);
  }

  function tick() {
    frame = 0;
    if (!visible) return;
    draw(performance.now() - start);
    frame = requestAnimationFrame(tick);
  }

  function redraw() {
    resize();
    if (reduced) draw(0);
  }

  redraw();
  if (!reduced) {
    frame = requestAnimationFrame(tick);
    // Only while the hero is on screen.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible && !frame) frame = requestAnimationFrame(tick);
      }).observe(host);
    }
  }
  if ('ResizeObserver' in window) new ResizeObserver(redraw).observe(host);
  else window.addEventListener('resize', redraw);
})();
