/* ==================================================================
   灵魂角色测试（soul）
   - 40 道情境题 × 10 个人格维度（双极），与 122 位角色做向量匹配
   - 题库与角色数据在同目录 personality-data.js，进入页面时才加载
   - 雷达图：Chart.js 4.4.1（MIT，本地 vendor）
   - 分享长图：html2canvas 1.4.1（MIT，本地 vendor 兜底）
   - 结果存档走工作台数据（window.__soul），跟着「导出全部数据」一起走
   ================================================================== */
(function () {
  'use strict';

  var VERSION = '20261118';
  var DIMS = [
    { k: 'rat', l: '理性', r: '感性' },
    { k: 'ord', l: '秩序', r: '随性' },
    { k: 'solo', l: '孤高', r: '依恋' },
    { k: 'mor', l: '向阳', r: '向暗' },
    { k: 'alt', l: '利他', r: '自我' },
    { k: 'act', l: '果决', r: '自省' },
    { k: 'res', l: '坚韧', r: '敏感' },
    { k: 'pas', l: '外放', r: '内敛' },
    { k: 'inn', l: '纯粹', r: '世故' },
    { k: 'amb', l: '竞逐', r: '无争' }
  ];
  var KEYS = DIMS.map(function (d) { return d.k; });
  var WORDS = {
    'rat+': '清醒至上', 'rat-': '被感受牵着走',
    'ord+': '秩序感强', 'ord-': '随性而为',
    'solo+': '独立自持', 'solo-': '需要联结',
    'mor+': '依然相信光', 'mor-': '直面暗面',
    'alt+': '把别人放在前面', 'alt-': '先顾好自己',
    'act+': '行动优先', 'act-': '三思后行',
    'res+': '抗压耐磨', 'res-': '感受细腻',
    'pas+': '情绪外放', 'pas-': '情绪内敛',
    'inn+': '纯粹天真', 'inn-': '世事洞明',
    'amb+': '野心未熄', 'amb-': '与世无争'
  };
  var LN = ['A', 'B', 'C', 'D'];

  var app = null, QS = null, ALL = null, BASE = null, TOTAL = 40;
  var answers = [], cur = 0, stage = 'intro', chart = null, lastVec = null;
  var booted = false, loadingData = null, loadingChart = null;
  var draftTimer = null;

  /* ---------------- 基础工具 ---------------- */
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }
  function scrollTop() {
    var m = document.getElementById('appMain');
    if (m) m.scrollTop = 0;
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { return; }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2000);
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('资源加载失败：' + src)); };
      document.head.appendChild(s);
    });
  }

  /* ---------------- 存档 ---------------- */
  function store() {
    if (window.__soul && typeof window.__soul.get === 'function') { return window.__soul; }
    var key = 'think-workbench-soul-' + (window.__wbUser || 'guest');
    return {
      get: function () { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } },
      set: function (v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { } }
    };
  }
  function readStore() {
    var s = store().get() || {};
    if (!Array.isArray(s.history)) { s.history = []; }
    if (!('draft' in s)) { s.draft = null; }
    return s;
  }
  function writeStore(s) { store().set(s); }
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      var s = readStore();
      var done = answers.filter(function (a) { return a >= 0; }).length;
      s.draft = done > 0 && done < TOTAL ? { answers: answers.slice(), cur: cur, ts: Date.now() } : null;
      writeStore(s);
    }, 400);
  }

  /* ---------------- 数据 ---------------- */
  function computeBase() {
    var mean = {}, sd = {};
    KEYS.forEach(function (k) {
      var m = 0, varSum = 0;
      QS.forEach(function (q) {
        var vals = q.o.map(function (o) { return (o.s && o.s[k]) || 0; });
        var mu = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
        m += mu;
        varSum += vals.reduce(function (a, v) { return a + (v - mu) * (v - mu); }, 0) / vals.length;
      });
      mean[k] = m; sd[k] = Math.sqrt(varSum) || 1;
    });
    return { mean: mean, sd: sd };
  }
  function ensureData() {
    if (QS && ALL) { return Promise.resolve(); }
    if (loadingData) { return loadingData; }
    loadingData = loadScript('personality-data.js?v=' + VERSION).then(function () {
      QS = window.QUESTIONS || [];
      ALL = (window.CHARACTERS_A || []).concat(window.CHARACTERS_B || []);
      TOTAL = QS.length || 40;
      BASE = computeBase();
    });
    return loadingData;
  }
  function ensureChart() {
    if (window.Chart) { return Promise.resolve(window.Chart); }
    if (loadingChart) { return loadingChart; }
    loadingChart = loadScript('assets/vendor/chart.umd.min.js?v=' + VERSION).then(function () { return window.Chart; });
    return loadingChart;
  }
  function ensureShot() {
    if (window.html2canvas) { return Promise.resolve(window.html2canvas); }
    return loadScript('assets/vendor/html2canvas.min.js?v=' + VERSION).then(function () { return window.html2canvas; });
  }

  /* ---------------- 计分与匹配 ---------------- */
  function scoreUser(list) {
    var v = {};
    KEYS.forEach(function (k) { v[k] = 0; });
    list.forEach(function (ai, qi) {
      if (ai < 0) { return; }
      var s = (QS[qi].o[ai] || {}).s || {};
      for (var k in s) { if (v[k] !== undefined) { v[k] += s[k]; } }
    });
    return KEYS.map(function (k) { return (v[k] - BASE.mean[k]) / BASE.sd[k]; });
  }
  function norm(vec) {
    var m = Math.sqrt(vec.reduce(function (a, x) { return a + x * x; }, 0)) || 1;
    return vec.map(function (x) { return x / m; });
  }
  function compare(vec) {
    var u = norm(vec);
    return ALL.map(function (ch) {
      var c = norm(ch.v), cos = 0, d2 = 0;
      for (var i = 0; i < u.length; i++) {
        cos += u[i] * c[i];
        d2 += (u[i] - c[i]) * (u[i] - c[i]);
      }
      var dist = Math.sqrt(d2);
      return { ch: ch, score: 0.72 * cos + 0.28 * Math.max(0, 1 - dist / 1.6) };
    }).sort(function (a, b) { return b.score - a.score; });
  }
  function pctOf(rank, n) {
    var t = n > 1 ? rank / (n - 1) : 0;
    return Math.round(93 - 28 * Math.pow(t, 0.55));
  }
  function strengthOf(z) { return Math.round(Math.min(100, Math.abs(z) / 3.5 * 100)); }
  function keywordList(vec) {
    return KEYS.map(function (k, i) { return { k: k, z: vec[i] }; })
      .sort(function (a, b) { return Math.abs(b.z) - Math.abs(a.z); })
      .slice(0, 2)
      .map(function (x) { return WORDS[x.k + (x.z >= 0 ? '+' : '-')]; });
  }

  /* ---------------- 首页 ---------------- */
  function renderIntro() {
    stage = 'intro';
    destroyChart();
    var s = readStore();
    var done = s.draft ? s.draft.answers.filter(function (a) { return a >= 0; }).length : 0;
    var resume = done > 0 ? '<button class="soul-btn" id="soulResume" style="margin-bottom:10px;">继续上次（' + done + '/' + TOTAL + '）</button>' : '';
    var his = s.history.slice(0, 5);
    var hisHtml = his.length ? (
      '<div class="soul-sec">历史记录</div><div class="soul-his">' +
      his.map(function (r, i) {
        return '<button class="soul-his-item" data-his="' + i + '">' +
          '<span class="av" style="background:' + esc(r.color || 'linear-gradient(145deg,#6d7683,#31383f)') + '">' + esc((r.name || '?').charAt(0)) + '</span>' +
          '<span class="t">' + esc(r.name) + ' <span class="d">' + esc(r.pct) + '%</span></span>' +
          '<span class="d">' + esc(r.date || '') + '</span>' +
          '</button>';
      }).join('') + '</div>'
    ) : '';

    app.innerHTML = '';
    app.appendChild(el(
      '<div class="soul-wrap">' +
        '<div class="soul-hero">' +
          '<div class="soul-mark">魂</div>' +
          '<div class="soul-kicker">Anime Soul Test</div>' +
          '<h2 class="soul-title">你的<em>动漫灵魂</em>角色是哪一个</h2>' +
          '<p class="soul-sub">不是「你最喜欢谁」，<br>而是「你最像谁」。</p>' +
          '<div class="soul-chips">' +
            '<span class="soul-chip">' + TOTAL + ' 道情境题</span>' +
            '<span class="soul-chip">' + ALL.length + ' 位角色</span>' +
            '<span class="soul-chip">约 7 分钟</span>' +
          '</div>' +
        '</div>' +
        '<div class="soul-rule">测试会从 <b>10 个人格维度</b> 记录你的选择，再与 ' + ALL.length + ' 位动漫角色逐一比对，找出灵魂坐标最接近的那一个。<br>没有正确答案，凭第一反应作答即可。</div>' +
        resume +
        '<button class="soul-btn" id="soulStart">开始测试</button>' +
        hisHtml +
        '<div class="soul-note">匹配度按人格向量的方向相似度与距离综合计算，结果仅供娱乐参考<br>角色台词为流传版本，可能与原作表述略有出入</div>' +
      '</div>'
    ));

    $('#soulStart').onclick = function () {
      answers = new Array(TOTAL).fill(-1);
      cur = 0;
      var st = readStore(); st.draft = null; writeStore(st);
      renderQuiz(true);
    };
    var rb = $('#soulResume');
    if (rb) {
      rb.onclick = function () {
        var st = readStore();
        if (!st.draft) { return renderIntro(); }
        answers = st.draft.answers.slice();
        while (answers.length < TOTAL) { answers.push(-1); }
        cur = Math.min(st.draft.cur || 0, TOTAL - 1);
        renderQuiz(true);
      };
    }
    Array.prototype.forEach.call(app.querySelectorAll('[data-his]'), function (b) {
      b.onclick = function () {
        var r = his[+b.dataset.his];
        if (r && r.vec) { renderResult(r.vec, true); }
      };
    });
    scrollTop();
  }

  /* ---------------- 答题 ---------------- */
  function renderQuiz(fresh) {
    stage = 'quiz';
    var q = QS[cur];
    var answered = answers.filter(function (a) { return a >= 0; }).length;

    if (fresh || !$('#soulOpts')) {
      app.innerHTML = '';
      app.appendChild(el(
        '<div class="soul-wrap">' +
          '<div class="soul-qtop">' +
            '<div class="soul-qmeta">' +
              '<div class="soul-qidx"><b>' + (cur + 1) + '</b> / ' + TOTAL + '</div>' +
              '<button class="soul-back-q" id="soulPrev"' + (cur === 0 ? ' disabled' : '') + '>上一题</button>' +
            '</div>' +
            '<div class="soul-bar"><i id="soulBar"></i></div>' +
          '</div>' +
          '<div class="soul-qtext" id="soulQText"></div>' +
          '<div class="soul-opts" id="soulOpts"></div>' +
          '<div class="soul-hint">凭第一反应作答 · 键盘 1-4 也可以</div>' +
        '</div>'
      ));
      $('#soulPrev').onclick = function () {
        if (cur > 0) { cur--; renderQuiz(true); }
      };
    } else {
      $('#soulPrev').disabled = cur === 0;
    }

    $('#soulQText').textContent = (cur + 1) + '. ' + q.q;
    $('#soulBar').style.width = (answered / TOTAL * 100) + '%';
    var meta = $('.soul-qidx b');
    if (meta) { meta.textContent = cur + 1; }

    var box = $('#soulOpts');
    box.innerHTML = '';
    q.o.forEach(function (op, i) {
      var b = document.createElement('button');
      b.className = 'soul-opt' + (answers[cur] === i ? ' on' : '');
      b.innerHTML = '<span class="k">' + LN[i] + '</span><span>' + esc(op.t) + '</span>';
      b.onclick = function () { pick(i); };
      box.appendChild(b);
    });
    scrollTop();
  }

  function pick(i) {
    if (stage !== 'quiz') { return; }
    answers[cur] = i;
    var box = $('#soulOpts');
    if (box) {
      Array.prototype.forEach.call(box.children, function (c) { c.classList.remove('on'); });
      box.children[i].classList.add('on');
    }
    saveDraft();
    setTimeout(function () {
      if (cur < TOTAL - 1) { cur++; renderQuiz(true); }
      else { finish(); }
    }, 240);
  }

  function finish() {
    var vec = scoreUser(answers);
    var ranked = compare(vec);
    var top = ranked[0];
    var pct = pctOf(0, ranked.length);
    var kw = keywordList(vec);

    var s = readStore();
    s.draft = null;
    s.history.unshift({
      ts: Date.now(),
      date: new Date().toLocaleDateString('zh-CN'),
      name: top.ch.n, from: top.ch.f, color: top.ch.c,
      pct: pct, kw: kw, vec: vec
    });
    s.history = s.history.slice(0, 20);
    writeStore(s);

    renderResult(vec, false);
  }

  /* ---------------- 结果 ---------------- */
  function destroyChart() {
    if (chart) { try { chart.destroy(); } catch (e) { } chart = null; }
  }

  function renderResult(vec, fromHistory) {
    stage = 'result';
    lastVec = vec;
    destroyChart();

    var ranked = compare(vec);
    var top5 = ranked.slice(0, 5);
    var N = ranked.length;
    var best = ranked[0].ch;
    var bestPct = pctOf(0, N);
    var worst = ranked[N - 1].ch;
    var kw = keywordList(vec);

    var dimRows = KEYS.map(function (k, i) {
      var z = vec[i];
      var st = strengthOf(z);
      var isLeft = z >= 0;
      var w = Math.max(2, st / 2);
      var fill = isLeft
        ? 'right:50%;width:' + w + '%;border-radius:6px 0 0 6px'
        : 'left:50%;width:' + w + '%;border-radius:0 6px 6px 0';
      return '<div class="soul-dim">' +
        '<div class="lbl">' + DIMS[i].l + (isLeft ? '<b>' + st + '</b>' : '') + '</div>' +
        '<div class="track"><i style="' + fill + '"></i></div>' +
        '<div class="val">' + (!isLeft ? '<b>' + st + '</b>' : '') + DIMS[i].r + '</div>' +
      '</div>';
    }).join('');

    var rankRows = top5.slice(1).map(function (t, i) {
      var c = t.ch;
      return '<div class="soul-rank-item">' +
        '<div class="rk">' + (i + 2) + '</div>' +
        '<div class="av" style="background:' + esc(c.c) + '">' + esc(c.n.charAt(0)) + '</div>' +
        '<div class="nm"><b>' + esc(c.n) + '</b><span>' + esc(c.f) + '</span></div>' +
        '<div class="pc">' + pctOf(i + 1, N) + '%</div>' +
      '</div>';
    }).join('');

    app.innerHTML = '';
    app.appendChild(el(
      '<div class="soul-wrap">' +
        (fromHistory ? '<div class="soul-note" style="margin:0 0 10px;">这是你保存过的一次结果 · <a href="javascript:void 0" id="soulBackHis">返回列表</a></div>' : '') +
        '<div class="soul-res-head">' +
          '<div class="soul-res-kicker">你的动漫灵魂角色是</div>' +
          '<div class="soul-av" style="background:' + esc(best.c) + '">' + esc(best.n.charAt(0)) + '</div>' +
          '<h2 class="soul-name">' + esc(best.n) + '</h2>' +
          '<div class="soul-from">' + esc(best.f) + '</div>' +
          '<div class="soul-tags">' + (best.tg || []).map(function (t) { return '<span class="soul-tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
        '</div>' +
        '<div class="soul-quote"><p>「' + esc(best.qt || '') + '」</p><span>—— ' + esc(best.f) + '</span></div>' +
        '<div class="soul-info">' +
          '<div><div class="k">性别</div><div class="v">' + esc(best.g) + '</div></div>' +
          '<div><div class="k">年龄</div><div class="v">' + esc(best.a) + '</div></div>' +
          '<div><div class="k">状态</div><div class="v">' + esc(best.st) + '</div></div>' +
          '<div><div class="k">身份</div><div class="v">' + esc(best.j) + '</div></div>' +
        '</div>' +
        '<div class="soul-sec">角色介绍</div>' +
        '<p class="soul-intro">' + esc(best.it) + '</p>' +
        '<div class="soul-sec">灵魂重合度</div>' +
        '<div class="soul-match">' +
          '<div class="num">' + bestPct + '<small>%</small></div>' +
          '<div class="txt">与你的答案向量重合 · 共 ' + N + ' 位角色比对</div>' +
          '<div class="soul-tags" style="margin-top:10px;">' + kw.map(function (w) { return '<span class="soul-tag">' + esc(w) + '</span>'; }).join('') + '</div>' +
        '</div>' +
        '<div class="soul-sec">你的十维坐标</div>' +
        '<div class="soul-match" style="padding:12px;">' +
          '<div class="soul-radar"><canvas id="soulRadar"></canvas></div>' +
        '</div>' +
        '<div class="soul-sec">维度明细</div>' +
        '<div class="soul-match" style="padding:14px 16px;"><div class="soul-dims">' + dimRows + '</div></div>' +
        '<div class="soul-sec">和你也很像的几位</div>' +
        '<div class="soul-rank">' + rankRows + '</div>' +
        '<div class="soul-sec">你的反面</div>' +
        '<div class="soul-rank"><div class="soul-rank-item">' +
          '<div class="rk">—</div>' +
          '<div class="av" style="background:' + esc(worst.c) + '">' + esc(worst.n.charAt(0)) + '</div>' +
          '<div class="nm"><b>' + esc(worst.n) + '</b><span>' + esc(worst.f) + ' · 与你几乎相反</span></div>' +
          '<div class="pc">' + pctOf(N - 1, N) + '%</div>' +
        '</div></div>' +
        '<div class="soul-btn-row" style="margin-top:18px;">' +
          '<button class="soul-btn" id="soulShot">保存长图</button>' +
          '<button class="soul-btn ghost" id="soulCopy">复制结果</button>' +
        '</div>' +
        '<div class="soul-btn-row"><button class="soul-btn ghost" id="soulAgain">再测一次</button></div>' +
        '<div class="soul-note">匹配度按人格向量的方向相似度与距离综合计算，结果仅供娱乐参考</div>' +
      '</div>'
    ));

    $('#soulShot').onclick = function () { shareImage(best, bestPct, kw, top5, N); };
    $('#soulCopy').onclick = function () {
      var txt = '我的动漫灵魂角色是：' + best.n + ' ' + best.f + '\n' +
        '关键词：' + (best.tg || []).join(' / ') + '\n' +
        '「' + (best.qt || '') + '」\n' +
        '重合度 ' + bestPct + '%，性格标签：' + kw.join(' / ') + '\n' +
        '也很像：' + top5.slice(1, 4).map(function (t, i) { return t.ch.n + '(' + pctOf(i + 1, N) + '%)'; }).join('、');
      copyText(txt);
    };
    $('#soulAgain').onclick = function () {
      answers = new Array(TOTAL).fill(-1);
      cur = 0;
      renderIntro();
    };
    var back = $('#soulBackHis');
    if (back) { back.onclick = function () { renderIntro(); }; }

    drawRadar(vec);
    scrollTop();
  }

  /* ---------------- 雷达图 ---------------- */
  function radarLabels(vec) {
    return KEYS.map(function (k, i) {
      return (vec[i] >= 0 ? DIMS[i].l : DIMS[i].r);
    });
  }
  function radarData(vec) {
    return KEYS.map(function (k, i) { return strengthOf(vec[i]); });
  }
  function drawRadar(vec) {
    var cv = $('#soulRadar');
    if (!cv) { return; }
    ensureChart().then(function (Chart) {
      var cs = getComputedStyle(document.body);
      var gold = (cs.getPropertyValue('--gold') || '#c9a35a').trim();
      var goldDeep = (cs.getPropertyValue('--gold-deep') || '#a8833a').trim();
      // 轴上限按本人最强维度自适应，弱画像也不会缩成一个小点
      var peak = Math.max.apply(null, radarData(vec).concat([0]));
      var top = Math.max(45, Math.ceil(peak / 10) * 10);
      destroyChart();
      chart = new Chart(cv, {
        type: 'radar',
        data: {
          labels: radarLabels(vec),
          datasets: [{
            label: '人格强度',
            data: radarData(vec),
            borderColor: goldDeep,
            backgroundColor: 'rgba(201,163,90,.22)',
            pointBackgroundColor: goldDeep,
            pointRadius: 3,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false }, tooltip: { enabled: true } },
          scales: {
            r: {
              min: 0, max: top,
              ticks: { display: false, stepSize: Math.round(top / 4) },
              angleLines: { color: 'rgba(61,40,23,.12)' },
              grid: { color: 'rgba(61,40,23,.10)' },
              pointLabels: { color: '#7d6650', font: { size: 11 } }
            }
          }
        }
      });
    }).catch(function () {
      var host = $('#soulRadar');
      if (host && host.parentNode) {
        host.parentNode.innerHTML = '<div class="soul-note" style="margin:0;text-align:center;">雷达图组件未加载成功，下方维度明细仍然可用</div>';
      }
    });
  }

  /* ---------------- 分享长图 ---------------- */
  function shareImage(best, bestPct, kw, top5, N) {
    var radar = '';
    if (chart) { try { radar = chart.toBase64Image(); } catch (e) { radar = ''; } }
    var more = (top5 || []).slice(1, 4).map(function (t, i) {
      return esc(t.ch.n) + ' ' + pctOf(i + 1, N || 122) + '%';
    }).join(' · ');

    var node = el(
      '<div class="soul-share" id="soulShareCard">' +
        '<div class="sh-kicker">Anime Soul Test</div>' +
        '<div class="sh-name">' + esc(best.n) + '</div>' +
        '<div class="sh-from">' + esc(best.f) + ' · ' + esc(best.j) + '</div>' +
        '<div class="sh-tags">' + (best.tg || []).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' +
        '<div class="sh-quote">「' + esc(best.qt || '') + '」</div>' +
        (radar ? '<div class="sh-radar"><img src="' + radar + '" alt="radar"></div>' : '') +
        '<div class="sh-row">' +
          '<div class="sh-pct">' + bestPct + '%<span style="font-size:11px;font-weight:400;color:#7d6650;"> 灵魂重合度</span></div>' +
          '<div class="sh-kw">' + kw.map(function (w) { return esc(w); }).join(' · ') + '</div>' +
        '</div>' +
        (more ? '<div class="sh-more">也很像：' + more + '</div>' : '') +
        '<div class="sh-foot"><span>ccgcct.com · 想想工作台</span><span>' + new Date().toLocaleDateString('zh-CN') + '</span></div>' +
      '</div>'
    );
    document.body.appendChild(node);

    var done = function () {
      if (node.parentNode) { node.parentNode.removeChild(node); }
    };

    ensureShot().then(function (h2c) {
      return h2c(node, { backgroundColor: '#fffaf0', scale: 2, logging: false, useCORS: true });
    }).then(function (canvas) {
      canvas.toBlob(function (blob) {
        if (!blob) { throw new Error('生成失败'); }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '灵魂角色-' + best.n + '-' + new Date().toISOString().slice(0, 10) + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        toast('长图已保存到下载目录');
        done();
      }, 'image/png');
    }).catch(function (e) {
      done();
      console.warn('[soul] 分享图生成失败', e);
      toast('长图生成失败，已改为复制文字');
      var txt = '我的动漫灵魂角色是：' + best.n + ' ' + best.f + '｜重合度 ' + bestPct + '%｜' + kw.join(' / ');
      copyText(txt);
    });
  }

  function copyText(txt) {
    var ok = function () { toast('已复制，去分享给朋友吧'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok, function () { fallbackCopy(txt, ok); });
    } else { fallbackCopy(txt, ok); }
  }
  function fallbackCopy(txt, cb) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) { toast('复制失败，请手动选择文字'); }
    document.body.removeChild(ta);
  }

  /* ---------------- 键盘 ---------------- */
  document.addEventListener('keydown', function (e) {
    if (stage !== 'quiz' || !app || !app.offsetParent) { return; }
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') { return; }
    if (e.key >= '1' && e.key <= '4') { pick(+e.key - 1); }
    else if (e.key === 'ArrowLeft' && cur > 0) { cur--; renderQuiz(true); }
  });

  /* ---------------- 入口 ---------------- */
  function boot() {
    app = document.getElementById('soulApp');
    if (!app) { return; }
    if (booted) {
      if (stage === 'quiz') { renderQuiz(true); }
      else if (stage === 'result' && lastVec) { renderResult(lastVec, false); }
      else { renderIntro(); }
      return;
    }
    booted = true;
    app.innerHTML = '<div class="soul-loading">正在加载题库…</div>';
    ensureData().then(function () {
      renderIntro();
    }).catch(function (e) {
      console.error('[soul]', e);
      app.innerHTML = '<div class="soul-loading">题库加载失败：' + esc(e.message) +
        '<br><button class="soul-btn mini" id="soulRetry" style="margin:12px auto 0;">重试</button></div>';
      var r = document.getElementById('soulRetry');
      if (r) { r.onclick = function () { booted = false; loadingData = null; boot(); }; }
    });
  }

  window.__soulView = boot;
})();
