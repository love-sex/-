/* ==================================================================
   灵魂角色测试（soul）
   - 40 道情境题 × 10 个人格维度（双极），与 134 位角色做向量匹配
   - 选项都不合适时可以自己写一段话，用关键词词典换算成维度分
   - 结果接近时追加 6 道加试题（权重 ×2）把第 1、2 名拉开
   - 雷达图 Chart.js 4.4.1 / 长图 html2canvas 1.4.1 / 动效 anime.js 4.0.2（均 MIT，本地 vendor）
   - 角色立绘：assets/soul/index.json 里登记后自动启用，取不到就用渐变字牌兜底
   ================================================================== */
(function () {
  'use strict';

  var VERSION = '20261118b';
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

  /* 自定义回答用的关键词词典：词 → [维度, 强度] */
  var LEX = {
    '理性': ['rat', 2], '逻辑': ['rat', 2], '分析': ['rat', 1.5], '客观': ['rat', 2], '冷静': ['rat', 2],
    '道理': ['rat', 1], '利弊': ['rat', 2], '数据': ['rat', 1.5], '推理': ['rat', 1.5], '判断': ['rat', 1],
    '感性': ['rat', -2], '感觉': ['rat', -1.5], '情绪': ['rat', -2], '直觉': ['rat', -2], '心动': ['rat', -1.5],
    '眼泪': ['rat', -1.5], '共情': ['rat', -1, 'alt', 1.5],
    '计划': ['ord', 2], '安排': ['ord', 1.5], '规律': ['ord', 2], '整洁': ['ord', 1.5], '清单': ['ord', 1.5],
    '提前': ['ord', 1], '预算': ['ord', 2], '记账': ['ord', 1.5], '流程': ['ord', 1.5],
    '随性': ['ord', -2], '自由': ['ord', -1.5], '临时': ['ord', -1.5], '摆烂': ['ord', -1.5], '躺平': ['ord', -1.5],
    '随便': ['ord', -1.5], '乱': ['ord', -1.5], '拖延': ['act', -1.5, 'ord', -1],
    '一个人': ['solo', 2], '独处': ['solo', 2.5], '独立': ['solo', 1.5], '自己扛': ['solo', 1.5],
    '不麻烦': ['solo', 1.5], '独来独往': ['solo', 2.5],
    '陪伴': ['solo', -2], '一起': ['solo', -1.5], '依赖': ['solo', -2], '抱抱': ['solo', -1.5],
    '朋友': ['solo', -1], '团队': ['solo', -1], '家人': ['solo', -1.5],
    '希望': ['mor', 2], '相信': ['mor', 1.5], '乐观': ['mor', 2], '值得': ['mor', 1.5], '温柔': ['mor', 1],
    '笑': ['mor', 1], '治愈': ['mor', 1.5],
    '绝望': ['mor', -2.5], '黑暗': ['mor', -2], '厌世': ['mor', -2.5], '痛苦': ['mor', -1.5],
    '现实': ['mor', -1], '麻木': ['mor', -1.5],
    '帮': ['alt', 2], '照顾': ['alt', 2], '牺牲': ['alt', 2.5], '别人': ['alt', 1], '护': ['alt', 1.5],
    '安慰': ['alt', 2], '让着': ['alt', 1.5],
    '自己': ['alt', -1], '自私': ['alt', -2], '利益': ['alt', -1.5], '算计': ['alt', -2], '先顾': ['alt', -1.5],
    '立刻': ['act', 2], '马上': ['act', 1.5], '冲': ['act', 2], '动手': ['act', 2], '先做': ['act', 2],
    '行动': ['act', 2], '决定': ['act', 1.5],
    '犹豫': ['act', -2], '纠结': ['act', -1.5], '想清楚': ['act', -1.5], '三思': ['act', -2], '慢': ['act', -1],
    '坚持': ['res', 2], '扛': ['res', 2], '熬': ['res', 1.5], '不放弃': ['res', 2.5], '习惯': ['res', 1],
    '硬撑': ['res', 1.5],
    '脆弱': ['res', -2], '崩溃': ['res', -2.5], '敏感': ['res', -2], '难过': ['res', -1.5], '躲': ['res', -1.5],
    '热闹': ['pas', 2], '社交': ['pas', 2], '说出来': ['pas', 2], '开心': ['pas', 1.5], '大声': ['pas', 1.5],
    '分享': ['pas', 1.5], '倾诉': ['pas', 2],
    '安静': ['pas', -1.5], '沉默': ['pas', -2], '憋': ['pas', -2], '不说': ['pas', -2], '消化': ['pas', -1.5],
    '善良': ['inn', 2], '简单': ['inn', 1.5], '天真': ['inn', 2], '真诚': ['inn', 1.5], '干净': ['inn', 1],
    '世故': ['inn', -2], '套路': ['inn', -2], '看透': ['inn', -1.5], '冷漠': ['inn', -1.5], '利用': ['inn', -2],
    '赢': ['amb', 2], '野心': ['amb', 2.5], '目标': ['amb', 1.5], '竞争': ['amb', 2], '证明': ['amb', 1.5],
    '第一名': ['amb', 2.5],
    '无争': ['amb', -2], '够了': ['amb', -2], '平淡': ['amb', -2], '不争': ['amb', -2.5], '无所谓': ['amb', -1.5]
  };
  var LEX_KEYS = Object.keys(LEX).sort(function (a, b) { return b.length - a.length; });
  var NEGS = '不没别无未非甭';
  var INTENS = '很超太极巨挺真特';

  var app = null, QS = null, ALL = null, BASE = null, TOTAL = 40;
  var chart = null, lastVec = null, artMap = null, meta = null;
  var stage = 'intro', booted = false;
  var loadingData = null, loadingChart = null, loadingAnime = null;
  var draftTimer = null, lastRecordTs = 0, lastRefined = false;

  // 主测与加试两套作答上下文
  var MAIN = { qs: [], ans: [], cur: 0, mode: 'main' };
  var EXTRA = { qs: [], ans: [], cur: 0, mode: 'extra' };
  var act = MAIN;

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
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('资源加载失败：' + src)); };
      document.head.appendChild(s);
    });
  }
  function answered(a) { return a !== -1 && a != null; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

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
      var done = MAIN.ans.filter(answered).length;
      s.draft = done > 0 && done < TOTAL ? { answers: MAIN.ans.slice(), cur: MAIN.cur, ts: Date.now() } : null;
      writeStore(s);
    }, 350);
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
      ALL = (window.CHARACTERS_A || []).concat(window.CHARACTERS_B || [], window.CHARACTERS_C || []);
      meta = window.SOUL_META || null;
      TOTAL = QS.length || 40;
      BASE = computeBase();
      MAIN.qs = QS;
      EXTRA.qs = window.SOUL_EXTRA || [];
      if (!MAIN.ans.length) { MAIN.ans = new Array(TOTAL).fill(-1); }
    });
    return loadingData;
  }
  /* 追加数据：不改代码也能加角色/加题（assets/soul/*.json） */
  function validChar(c) {
    return c && typeof c.n === 'string' && c.n && Array.isArray(c.v) &&
      c.v.length === 10 && c.v.every(function (x) { return typeof x === 'number'; });
  }
  function validQuestion(q) {
    return q && typeof q.q === 'string' && Array.isArray(q.o) && q.o.length >= 2 &&
      q.o.every(function (o) { return o && typeof o.t === 'string' && o.s && Object.keys(o.s).length; });
  }
  function loadJson(path) {
    return fetch(path, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function ensureExtra() {
    return Promise.all([
      loadJson('assets/soul/characters-extra.json'),
      loadJson('assets/soul/questions-extra.json')
    ]).then(function (res) {
      var chars = Array.isArray(res[0]) ? res[0].filter(validChar) : [];
      var qs = Array.isArray(res[1]) ? res[1].filter(validQuestion) : [];
      var seen = {};
      ALL.forEach(function (c) { seen[c.n] = 1; });
      chars.forEach(function (c) { if (!seen[c.n]) { ALL.push(c); seen[c.n] = 1; } });
      if (qs.length) { window.SOUL_EXTRA = (window.SOUL_EXTRA || []).concat(qs); }
      return { chars: chars.length, questions: qs.length };
    }).catch(function () { return { chars: 0, questions: 0 }; });
  }

  function ensureChart() {
    if (window.Chart) { return Promise.resolve(window.Chart); }
    if (loadingChart) { return loadingChart; }
    loadingChart = loadScript('assets/vendor/chart.umd.min.js?v=4.4.1').then(function () { return window.Chart; });
    return loadingChart;
  }
  function ensureShot() {
    if (window.html2canvas) { return Promise.resolve(window.html2canvas); }
    return loadScript('assets/vendor/html2canvas.min.js?v=1.4.1').then(function () { return window.html2canvas; });
  }
  function ensureZoom() {
    if (window.mediumZoom) { return Promise.resolve(window.mediumZoom); }
    return loadScript('assets/vendor/medium-zoom.min.js?v=1.1.0').then(function () { return window.mediumZoom; });
  }
  function ensureAnime() {
    if (window.anime) { return Promise.resolve(window.anime); }
    if (loadingAnime) { return loadingAnime; }
    loadingAnime = loadScript('assets/vendor/anime.iife.min.js?v=4.0.2').then(function () { return window.anime; });
    return loadingAnime;
  }
  function motion(fn) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
    ensureAnime().then(fn).catch(function () { });
  }
  function ensureArt() {
    if (artMap) { return Promise.resolve(artMap); }
    artMap = {};
    if (window.SOUL_ART_OVERRIDE) {
      Object.keys(window.SOUL_ART_OVERRIDE).forEach(function (n) { artMap[n] = window.SOUL_ART_OVERRIDE[n]; });
      return Promise.resolve(artMap);
    }
    return fetch('assets/soul/index.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) { return artMap; }
        if (Array.isArray(j)) {
          j.forEach(function (n) { artMap[n] = 'assets/soul/' + encodeURIComponent(n) + '.webp'; });
        } else if (j.map) {
          Object.keys(j.map).forEach(function (n) { artMap[n] = j.map[n]; });
        } else if (Array.isArray(j.names)) {
          j.names.forEach(function (n) { artMap[n] = 'assets/soul/' + encodeURIComponent(n) + '.webp'; });
        }
        return artMap;
      })
      .catch(function () { return artMap; });
  }

  /* ---------------- 自由文本 → 维度分 ---------------- */
  function parseCustom(text) {
    var src = String(text || '');
    var used = new Array(src.length).fill(false);
    var v = {}, kw = [];
    var negRe = new RegExp('[' + NEGS + ']');
    var intRe = new RegExp('[' + INTENS + ']');
    for (var i = 0; i < src.length; i++) {
      if (used[i]) { continue; }
      for (var n = 0; n < LEX_KEYS.length; n++) {
        var word = LEX_KEYS[n];
        if (src.substr(i, word.length) !== word) { continue; }
        var conflict = false;
        for (var u = 0; u < word.length; u++) { if (used[i + u]) { conflict = true; break; } }
        if (conflict) { continue; }
        for (var u2 = 0; u2 < word.length; u2++) { used[i + u2] = true; }
        var before = src.slice(Math.max(0, i - 3), i);
        var sign = negRe.test(before) ? -1 : 1;
        var boost = intRe.test(before) ? 1.4 : 1;
        var def = LEX[word];
        for (var d = 0; d < def.length; d += 2) {
          var key = def[d], val = def[d + 1] * sign * boost;
          v[key] = clamp((v[key] || 0) + val, -3, 3);
        }
        kw.push(word);
        i += word.length - 1;
        break;
      }
    }
    return { v: v, kw: kw };
  }

  /* ---------------- 计分与匹配 ---------------- */
  /* 加试只当"微调"：把加试题单独归一成方向向量，再按 BETA 的小步长叠加到主测坐标上。
     这样既能拉开第 1、2 名，又不会因为多答 6 题就把坐标整体改写（之前 ×2 权重会把雷达图撑变形）。 */
  var EXTRA_BETA = 0.5;
  function statsOf(qs) {
    var mean = {}, sd = {};
    KEYS.forEach(function (k) {
      var m = 0, vr = 0;
      qs.forEach(function (q) {
        var vals = q.o.map(function (o) { return (o.s && o.s[k]) || 0; });
        var mu = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
        m += mu;
        vr += vals.reduce(function (a, v) { return a + (v - mu) * (v - mu); }, 0) / vals.length;
      });
      mean[k] = m; sd[k] = Math.sqrt(vr) || 1;
    });
    return { mean: mean, sd: sd };
  }
  function scoreUser(main, extra) {
    var raw = {};
    KEYS.forEach(function (k) { raw[k] = 0; });
    (main || []).forEach(function (a, qi) {
      if (!answered(a)) { return; }
      if (typeof a === 'number') {
        var s = (QS[qi].o[a] || {}).s || {};
        Object.keys(s).forEach(function (k) { if (raw[k] !== undefined) { raw[k] += s[k]; } });
      } else if (a && a.v) {
        Object.keys(a.v).forEach(function (k) { if (raw[k] !== undefined) { raw[k] += a.v[k] * 1.2; } });
      }
    });
    var zMain = KEYS.map(function (k) { return (raw[k] - BASE.mean[k]) / BASE.sd[k]; });

    var exQs = (window.SOUL_EXTRA || []).slice(0, (extra || []).length || 0);
    var used = (extra || []).filter(function (a) { return typeof a === 'number'; }).length;
    if (!used || !exQs.length) { return zMain; }

    var re = {};
    KEYS.forEach(function (k) { re[k] = 0; });
    (extra || []).forEach(function (a, qi) {
      if (typeof a !== 'number' || !exQs[qi]) { return; }
      var s = (exQs[qi].o[a] || {}).s || {};
      Object.keys(s).forEach(function (k) { if (re[k] !== undefined) { re[k] += s[k]; } });
    });
    var st = statsOf(exQs);
    var zEx = KEYS.map(function (k) { return (re[k] - st.mean[k]) / st.sd[k]; });
    var ue = norm(zEx);
    return KEYS.map(function (k, i) { return zMain[i] + ue[i] * EXTRA_BETA; });
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
      return { ch: ch, score: 0.72 * cos + 0.28 * Math.max(0, 1 - Math.sqrt(d2) / 1.6) };
    }).sort(function (a, b) { return b.score - a.score; });
  }
  function pctOf(rank, n) {
    var t = n > 1 ? rank / (n - 1) : 0;
    return Math.round(93 - 28 * Math.pow(t, 0.55));
  }
  /* 0-100 强度：开方式映射，弱维度也能撑起形状，强维度不会一根尖刺戳到顶 */
  function strengthOf(z) { return Math.round(Math.min(100, Math.sqrt(Math.abs(z) / 3) * 100)); }
  function keywordList(vec) {
    return KEYS.map(function (k, i) { return { k: k, z: vec[i] }; })
      .sort(function (a, b) { return Math.abs(b.z) - Math.abs(a.z); })
      .slice(0, 2)
      .map(function (x) { return WORDS[x.k + (x.z >= 0 ? '+' : '-')]; });
  }
  /* 挑区分度最高的加试题：让前两名在这些题上分开最多 */
  function pickExtraQuestions(c1, c2, n) {
    var pool = window.SOUL_EXTRA || [];
    if (!pool.length) { return []; }
    var diff = KEYS.map(function (_, i) { return c1.v[i] - c2.v[i]; });
    var nd = norm(diff);
    return pool.map(function (q) {
      var proj = q.o.map(function (o) {
        var vec = KEYS.map(function (k) { return o.s[k] || 0; });
        var u = norm(vec);
        return u.reduce(function (a, x, i) { return a + x * nd[i]; }, 0);
      });
      return { q: q, spread: Math.max.apply(null, proj) - Math.min.apply(null, proj) };
    }).sort(function (a, b) { return b.spread - a.spread; })
      .slice(0, n || 6)
      .map(function (x) { return x.q; });
  }

  /* ---------------- 首页 ---------------- */
  function renderIntro() {
    stage = 'intro';
    act = MAIN;
    destroyChart();
    var s = readStore();
    var done = s.draft ? s.draft.answers.filter(answered).length : 0;
    var resume = done > 0 ? '<button class="soul-btn" id="soulResume" style="margin-bottom:10px;">继续上次（' + done + '/' + TOTAL + '）</button>' : '';
    var his = s.history.slice(0, 20);
    var selCount = 0;
    his.forEach(function (r) { if (hisSel[r.ts]) { selCount++; } });
    var hisHtml = his.length ? (
      '<div class="soul-sec soul-sec-row"><span>历史记录</span>' +
        (hisManage
          ? '<span class="soul-his-tools">' +
              '<button class="soul-mini" id="soulHisAll">' + (selCount === his.length ? '取消全选' : '全选') + '</button>' +
              '<button class="soul-mini danger" id="soulHisDel"' + (selCount ? '' : ' disabled') + '>删除所选' +
                (selCount ? '（' + selCount + '）' : '') + '</button>' +
              '<button class="soul-mini" id="soulHisDone">完成</button>' +
            '</span>'
          : '<button class="soul-mini primary" id="soulHisManage">✎ 编辑</button>') +
      '</div><div class="soul-his">' +
      his.map(function (r) {
        var label = r.label || r.name;
        var av = '<span class="av" style="background:' + esc(r.color || 'linear-gradient(145deg,#6d7683,#31383f)') + '">' +
          esc((r.name || '?').charAt(0)) + '</span>';
        if (hisManage) {
          var on = !!hisSel[r.ts];
          var editing = renaming === r.ts;
          return '<div class="soul-his-item manage' + (on ? ' sel' : '') + '" data-ts="' + r.ts + '">' +
            '<span class="ck"><i></i></span>' + av +
            '<span class="t">' +
              (editing
                ? '<input class="soul-rename" data-rename="' + r.ts + '" maxlength="12" value="' + esc(label) + '">'
                : '<b>' + esc(label) + '</b>' +
                  '<span class="d">' + (r.label ? esc(r.name) + ' · ' : '') + esc(r.pct) + '%' +
                  (r.refined ? ' · 精算' : '') + ' · ' + esc(r.date || '') + '</span>') +
            '</span>' +
            (editing ? '' :
              '<span class="acts">' +
                '<button class="soul-mini" data-act="rename" data-ts="' + r.ts + '">改名</button>' +
                '<button class="soul-mini danger" data-act="del" data-ts="' + r.ts + '">删除</button>' +
              '</span>') +
          '</div>';
        }
        return '<button class="soul-his-item" data-his="' + r.ts + '">' + av +
          '<span class="t">' + esc(label) + ' <span class="d">' + esc(r.pct) + '%' +
          (r.refined ? ' · 精算' : '') + '</span></span>' +
          '<span class="d">' + esc(r.date || '') + '</span>' +
        '</button>';
      }).join('') + '</div>'
    ) : '';
    var metaLine = meta ? '题库更新于 ' + esc(meta.updated) : '';

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
            '<span class="soul-chip">可自己写答案</span>' +
            '<span class="soul-chip">约 7 分钟</span>' +
          '</div>' +
        '</div>' +
        '<div class="soul-rule">测试从 <b>10 个人格维度</b> 记录你的选择，再与 ' + ALL.length + ' 位动漫角色逐一比对，找出灵魂坐标最接近的那一个。<br>四个选项都不像你？点「自己写」，用一句话描述你会怎么做，照样能算。</div>' +
        resume +
        '<button class="soul-btn" id="soulStart">开始测试</button>' +
        '<button class="soul-glink" id="soulGallery">角色图鉴 · 看看全部 ' + ALL.length + ' 位角色的立绘 →</button>' +
        hisHtml +
        '<div class="soul-note">匹配度按人格向量的方向相似度与距离综合计算，结果仅供娱乐参考<br>角色台词为流传版本，可能与原作表述略有出入' + (metaLine ? '<br>' + metaLine : '') + '</div>' +
      '</div>'
    ));

    $('#soulStart').onclick = function () {
      MAIN.ans = new Array(TOTAL).fill(-1);
      MAIN.cur = 0;
      var st = readStore(); st.draft = null; writeStore(st);
      renderQuiz(true);
    };
    var gl = $('#soulGallery');
    if (gl) { gl.onclick = renderGallery; }
    var rb = $('#soulResume');
    if (rb) {
      rb.onclick = function () {
        var st = readStore();
        if (!st.draft) { return renderIntro(); }
        MAIN.ans = st.draft.answers.slice();
        while (MAIN.ans.length < TOTAL) { MAIN.ans.push(-1); }
        MAIN.cur = Math.min(st.draft.cur || 0, TOTAL - 1);
        renderQuiz(true);
      };
    }
    Array.prototype.forEach.call(app.querySelectorAll('[data-his]'), function (b) {
      b.onclick = function () {
        var ts = +b.dataset.his;
        var r = his.filter(function (x) { return x.ts === ts; })[0];
        if (r && r.vec) {
          renderResult(r.vec, { fromHistory: true, refined: !!r.refined, drift: r.drift, label: r.label });
        }
      };
    });
    bindHistoryTools(his);
    scrollTop();
  }

  /* ---- 历史记录：管理 / 多选 / 改名 / 删除 ---- */
  var hisManage = false, hisSel = {}, renaming = 0;

  function deleteHistory(tsList) {
    var s = readStore();
    s.history = s.history.filter(function (r) { return tsList.indexOf(r.ts) === -1; });
    writeStore(s);
    tsList.forEach(function (ts) { delete hisSel[ts]; });
  }
  function renameHistory(ts, label) {
    var s = readStore();
    s.history.forEach(function (r) {
      if (r.ts !== ts) { return; }
      if (label) { r.label = label; } else { delete r.label; }
    });
    writeStore(s);
  }
  function bindHistoryTools(his) {
    var m = $('#soulHisManage');
    if (m) {
      m.onclick = function () {
        hisManage = true; hisSel = {}; renaming = 0;
        renderIntro();
      };
    }
    var d = $('#soulHisDone');
    if (d) {
      d.onclick = function () {
        hisManage = false; hisSel = {}; renaming = 0;
        renderIntro();
      };
    }
    var a = $('#soulHisAll');
    if (a) {
      a.onclick = function () {
        var all = his.every(function (r) { return hisSel[r.ts]; });
        hisSel = {};
        if (!all) { his.forEach(function (r) { hisSel[r.ts] = true; }); }
        renderIntro();
      };
    }
    var del = $('#soulHisDel');
    if (del) {
      del.onclick = function () {
        var list = his.filter(function (r) { return hisSel[r.ts]; }).map(function (r) { return r.ts; });
        if (!list.length) { return; }
        if (!window.confirm('删除选中的 ' + list.length + ' 条历史记录？删除后无法恢复。')) { return; }
        deleteHistory(list);
        toast('已删除 ' + list.length + ' 条');
        if (!readStore().history.length) { hisManage = false; }
        renderIntro();
      };
    }
    Array.prototype.forEach.call(app.querySelectorAll('.soul-his-item.manage'), function (row) {
      row.onclick = function (e) {
        if (e.target.closest('button, input')) { return; }
        var ts = +row.dataset.ts;
        hisSel[ts] = !hisSel[ts];
        renderIntro();
      };
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-act]'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var ts = +b.dataset.ts;
        if (b.dataset.act === 'del') {
          deleteHistory([ts]);
          toast('已删除 1 条');
          var left = readStore().history.length;
          if (!left) { hisManage = false; }
          renderIntro();
        } else {
          renaming = ts;
          renderIntro();
          var input = $('.soul-rename');
          if (input) { input.focus(); input.select(); }
        }
      };
    });
    var input = $('.soul-rename');
    if (input) {
      var commit = function () {
        var ts = +input.dataset.rename;
        var v = input.value.trim();
        renaming = 0;
        renameHistory(ts, v);
        renderIntro();
      };
      input.onkeydown = function (e) {
        if (e.key === 'Enter') { commit(); }
        if (e.key === 'Escape') { renaming = 0; renderIntro(); }
      };
      input.onblur = commit;
    }
  }

  /* ---------------- 答题 ---------------- */
  function renderQuiz(fresh) {
    stage = 'quiz';
    var qs = act.qs, cur = act.cur, total = qs.length;
    var q = qs[cur];
    var done = act.ans.filter(answered).length;

    if (fresh || !$('#soulOpts')) {
      app.innerHTML = '';
      app.appendChild(el(
        '<div class="soul-wrap soul-wrap-quiz">' +
          '<div class="soul-qtop">' +
            '<div class="soul-qmeta">' +
              '<div class="soul-qidx">' + (act.mode === 'extra' ? '<span class="soul-flag">加试</span>' : '') +
                '<b>' + (cur + 1) + '</b> / ' + total + '</div>' +
              '<button class="soul-back-q" id="soulPrev"' + (cur === 0 ? ' disabled' : '') + '>上一题</button>' +
            '</div>' +
            '<div class="soul-bar"><i id="soulBar"></i></div>' +
          '</div>' +
          '<div class="soul-qtext" id="soulQText"></div>' +
          '<div class="soul-opts" id="soulOpts"></div>' +
          '<div class="soul-chosen" id="soulChosen" hidden></div>' +
          '<button class="soul-custom-btn" id="soulCustomBtn">都不像我 · 自己写一段 ✎</button>' +
          '<div class="soul-custom" id="soulCustom" hidden>' +
            '<textarea id="soulCustomText" rows="3" maxlength="140" placeholder="例：我会先忍着不说，回家自己消化一晚，第二天照常上班"></textarea>' +
            '<div class="soul-custom-row">' +
              '<span class="soul-custom-tip" id="soulCustomTip">写得越具体，匹配越准</span>' +
              '<button class="soul-btn mini ghost" id="soulCustomCancel">取消</button>' +
              '<button class="soul-btn mini" id="soulCustomOk">提交</button>' +
            '</div>' +
            '<div class="soul-anchor" id="soulAnchor" hidden></div>' +
          '</div>' +
          '<div class="soul-hint">凭第一反应作答 · 键盘 1-4 也可以</div>' +
        '</div>'
      ));
      $('#soulPrev').onclick = function () {
        if (act.cur > 0) { act.cur--; renderQuiz(true); }
      };
      bindCustom();
    } else {
      $('#soulPrev').disabled = cur === 0;
      var flag = $('.soul-flag');
      if (act.mode !== 'extra' && flag) { flag.remove(); }
    }

    $('#soulQText').textContent = (cur + 1) + '. ' + q.q;
    $('#soulBar').style.width = (done / total * 100) + '%';
    var meta2 = $('.soul-qidx b');
    if (meta2) { meta2.textContent = cur + 1; }

    var box = $('#soulOpts');
    box.innerHTML = '';
    q.o.forEach(function (op, i) {
      var b = document.createElement('button');
      b.className = 'soul-opt' + (act.ans[cur] === i ? ' on' : '');
      b.innerHTML = '<span class="k">' + LN[i] + '</span><span>' + esc(op.t) + '</span>';
      b.onclick = function () { pick(i); };
      box.appendChild(b);
    });

    // 已用过自定义回答的题，回看时给个提示
    var chosen = $('#soulChosen');
    var a = act.ans[cur];
    if (a && typeof a === 'object' && a.c) {
      chosen.hidden = false;
      chosen.innerHTML = '<b>你的回答</b>' + esc(a.c) +
        (a.kw && a.kw.length ? '<i>识别到：' + esc(a.kw.join('、')) + '</i>' : '');
    } else {
      chosen.hidden = true;
      chosen.innerHTML = '';
    }
    closeCustom();
    scrollTop();
  }

  function pick(i) {
    if (stage !== 'quiz') { return; }
    act.ans[act.cur] = i;
    var box = $('#soulOpts');
    if (box) {
      Array.prototype.forEach.call(box.children, function (c) { c.classList.remove('on'); });
      if (box.children[i]) { box.children[i].classList.add('on'); }
    }
    if (act.mode === 'main') { saveDraft(); }
    setTimeout(function () {
      if (act.cur < act.qs.length - 1) { act.cur++; renderQuiz(true); }
      else { finish(); }
    }, 240);
  }

  /* ---- 自定义回答 ---- */
  function closeCustom() {
    var p = $('#soulCustom');
    if (p) { p.hidden = true; }
    var b = $('#soulCustomBtn');
    if (b) { b.hidden = false; }
    var t = $('#soulCustomText');
    if (t) { t.value = ''; }
    var an = $('#soulAnchor');
    if (an) { an.hidden = true; an.innerHTML = ''; }
    var tip = $('#soulCustomTip');
    if (tip) { tip.textContent = '写得越具体，匹配越准'; }
  }
  function bindCustom() {
    var btn = $('#soulCustomBtn'), panel = $('#soulCustom'), ta = $('#soulCustomText');
    var ok = $('#soulCustomOk'), cancel = $('#soulCustomCancel'), tip = $('#soulCustomTip'), anchor = $('#soulAnchor');
    if (!btn) { return; }
    btn.onclick = function () {
      panel.hidden = false;
      btn.hidden = true;
      setTimeout(function () {
        ta.focus();
        // 把题干顶到视口上方，选项和输入面板一起进画面
        var anchor = $('#soulQText');
        try { (anchor || panel).scrollIntoView({ block: 'start', behavior: 'smooth' }); }
        catch (e) { (anchor || panel).scrollIntoView(); }
      }, 60);
    };
    cancel.onclick = closeCustom;
    ok.onclick = function () {
      var text = (ta.value || '').trim();
      if (text.length < 4) { tip.textContent = '再多写几个字（至少 4 个字）'; ta.focus(); return; }
      var r = parseCustom(text);
      if (!r.kw.length) {
        tip.textContent = '没抓到能判断的词，换个说法，或者选一个最接近的：';
        anchor.hidden = false;
        anchor.innerHTML = act.qs[act.cur].o.map(function (op, i) {
          return '<button class="soul-anchor-btn" data-i="' + i + '">' + LN[i] + ' · ' + esc(op.t) + '</button>';
        }).join('');
        Array.prototype.forEach.call(anchor.querySelectorAll('[data-i]'), function (b) {
          b.onclick = function () {
            var i = +b.dataset.i;
            var s = (act.qs[act.cur].o[i] || {}).s || {};
            var v = {};
            Object.keys(s).forEach(function (k) { v[k] = clamp(s[k] * 0.6, -3, 3); });
            commitCustom({ c: text, v: v, kw: [], a: i });
          };
        });
        return;
      }
      tip.textContent = '已识别：' + r.kw.slice(0, 4).join('、');
      commitCustom({ c: text, v: r.v, kw: r.kw });
    };
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { ok.click(); }
    });
  }
  function commitCustom(answer) {
    if (stage !== 'quiz') { return; }
    act.ans[act.cur] = answer;
    if (act.mode === 'main') { saveDraft(); }
    var tip = $('#soulCustomTip');
    if (tip) { tip.textContent = '已记录，正在计算…'; }
    var kw = answer.kw && answer.kw.length ? '已记录自定义回答（' + answer.kw.slice(0, 3).join('、') + '）' : '已记录自定义回答';
    toast(kw);
    setTimeout(function () {
      if (act.cur < act.qs.length - 1) { act.cur++; renderQuiz(true); }
      else { finish(); }
    }, 420);
  }

  /* ---- 收尾 ---- */
  function finish() {
    if (act.mode === 'main') { finishMain(); }
    else { finishExtra(); }
  }
  function finishMain() {
    var vec = scoreUser(MAIN.ans, null);
    var ranked = compare(vec);
    var top = ranked[0];
    var ts = Date.now();
    lastRecordTs = ts;
    lastRefined = false;

    var s = readStore();
    s.draft = null;
    s.history.unshift({
      ts: ts,
      date: new Date().toLocaleDateString('zh-CN'),
      name: top.ch.n, from: top.ch.f, color: top.ch.c,
      pct: pctOf(0, ranked.length), kw: keywordList(vec), vec: vec,
      refined: false, qCount: MAIN.ans.filter(answered).length
    });
    s.history = s.history.slice(0, 20);
    writeStore(s);
    renderResult(vec, {});
  }
  function finishExtra() {
    var vec = scoreUser(MAIN.ans, EXTRA.ans);
    var base = scoreUser(MAIN.ans, null);
    var drift = 0;
    KEYS.forEach(function (k, i) { drift = Math.max(drift, Math.abs(strengthOf(vec[i]) - strengthOf(base[i]))); });
    var ranked = compare(vec);
    var top = ranked[0];
    lastRefined = true;

    var s = readStore();
    var rec = s.history.filter(function (r) { return r.ts === lastRecordTs; })[0];
    if (rec) {
      rec.name = top.ch.n; rec.from = top.ch.f; rec.color = top.ch.c;
      rec.pct = pctOf(0, ranked.length); rec.kw = keywordList(vec); rec.vec = vec;
      rec.refined = true;
      rec.drift = drift;
      rec.qCount = MAIN.ans.filter(answered).length + EXTRA.ans.filter(function (x) { return typeof x === 'number'; }).length;
    }
    writeStore(s);
    renderResult(vec, { refined: true, drift: drift });
  }

  /* ---------------- 结果 ---------------- */
  function destroyChart() {
    if (chart) { try { chart.destroy(); } catch (e) { } chart = null; }
  }
  function artOf(name) {
    if (!artMap) { return null; }
    return artMap[name] || artMap['*'] || null;   // '*' 是全角色的默认立绘
  }
  function avatarHtml(ch, size) {
    var art = artOf(ch.n);
    var cls = 'soul-av' + (art ? ' soul-av-art' : '');
    if (art) {
      return '<div class="' + cls + '" style="background:' + esc(ch.c) + '">' +
        '<img src="' + esc(art) + '" data-art="' + esc(art) + '" alt="' + esc(ch.n) +
        '" loading="lazy" decoding="async">' +
        '<span class="soul-aura"></span></div>';
    }
    return '<div class="' + cls + '" style="background:' + esc(ch.c) + '">' + esc(ch.n.charAt(0)) +
      '<span class="soul-aura"></span></div>';
  }

  /* 立绘下载失败大多是网络抖动，自动重试 2 次（加 ?r=n 绕开缓存），仍失败才退回渐变字牌 */
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.getAttribute('data-art')) { return; }
    var tried = (+img.getAttribute('data-try') || 0) + 1;
    var box = img.parentNode;
    if (tried > 2) {
      var label = img.getAttribute('alt') || '';
      if (box) {
        box.classList.remove('soul-av-art');
        box.innerHTML = (label ? esc(label.charAt(0)) : '?') + '<span class="soul-aura"></span>';
      }
      return;
    }
    img.setAttribute('data-try', tried);
    var src = img.getAttribute('data-art');
    setTimeout(function () {
      img.src = src + (src.indexOf('?') < 0 ? '?' : '&') + 'r=' + tried;
    }, 420 * tried);
  }, true);

  /* 图鉴里的计数跟着图片的 load/error 走，不依赖定时器（后台标签页会被节流） */
  document.addEventListener('load', function (e) {
    var img = e.target;
    if (img && img.tagName === 'IMG' && img.parentNode && img.parentNode.className &&
      String(img.parentNode.className).indexOf('soul-gart') >= 0) {
      galleryStat();
    }
  }, true);

  /* ---------------- 角色图鉴（全员立绘 + 模糊搜索） ---------------- */
  var GAL = { q: '', fuse: null, statTimer: 0 };

  function ensureFuse() {
    if (window.Fuse) { return Promise.resolve(window.Fuse); }
    return loadScript('assets/vendor/fuse.min.js?v=7.0.0').then(function () { return window.Fuse; });
  }
  function galleryItemHtml(c) {
    var art = artOf(c.n);
    return '<button class="soul-gitem" data-gn="' + esc(c.n) + '" title="' + esc(c.n + ' · ' + c.f) + '">' +
      '<div class="soul-gart" style="background:' + esc(c.c) + '">' +
        (art
          ? '<img src="' + esc(art) + '" data-art="' + esc(art) + '" alt="' + esc(c.n) + '" loading="lazy" decoding="async">'
          : '<span>' + esc(c.n.charAt(0)) + '</span>') +
      '</div>' +
      '<div class="soul-gname">' + esc(c.n) + '</div>' +
      '<div class="soul-gfrom">' + esc(c.f) + '</div>' +
    '</button>';
  }
  function galleryStat() {
    var stat = $('#soulGStat');
    if (!stat) { return; }
    var imgs = app.querySelectorAll('.soul-gart img');
    var ok = 0;
    Array.prototype.forEach.call(imgs, function (i) { if (i.complete && i.naturalWidth > 0) { ok++; } });
    var done = !imgs.length || ok >= imgs.length;
    stat.textContent = '立绘已加载 ' + ok + ' / ' + imgs.length + (done ? ' · 全部就位' : ' · 正在加载…');
  }
  function filterGallery() {
    var q = (GAL.q || '').trim();
    var list = ALL;
    if (q) {
      if (window.Fuse) {
        if (!GAL.fuse) {
          GAL.fuse = new window.Fuse(ALL, {
            keys: ['n', 'f', 'tg'], threshold: 0.42, ignoreLocation: true, minMatchCharLength: 1
          });
        }
        list = GAL.fuse.search(q).map(function (r) { return r.item; });
      } else {
        list = ALL.filter(function (c) {
          return c.n.indexOf(q) >= 0 || (c.f || '').indexOf(q) >= 0 ||
            (c.tg || []).some(function (t) { return t.indexOf(q) >= 0; });
        });
      }
    }
    var grid = $('#soulGrid');
    if (!grid) { return; }
    grid.innerHTML = list.length ? list.map(galleryItemHtml).join('') :
      '<div class="soul-gempty">没找到「' + esc(q) + '」这个角色，换个词试试</div>';
    galleryStat();
  }
  function renderGallery() {
    stage = 'gallery';
    destroyChart();
    app.innerHTML = '';
    app.appendChild(el(
      '<div class="soul-wrap soul-wrap-quiz">' +
        '<div class="soul-gtop">' +
          '<button class="soul-back" id="soulGBack">← 返回</button>' +
          '<div class="soul-gtitle">角色图鉴<span>' + ALL.length + ' 位</span></div>' +
        '</div>' +
        '<div class="soul-gsearch"><input id="soulGInput" type="search" autocomplete="off" ' +
          'placeholder="搜角色名或作品，例如 芙莉莲 / 电锯人"></div>' +
        '<div class="soul-gstat" id="soulGStat"></div>' +
        '<div class="soul-grid" id="soulGrid"></div>' +
        '<div class="soul-note">立绘取自 AniList 公开角色库，版权归原作者与制作委员会。<br>' +
          '某张显示成字牌＝这张图暂时没取到，多为网络抖动；重新打开或刷新会自动重试。</div>' +
      '</div>'
    ));
    $('#soulGBack').onclick = function () { renderIntro(); };
    var input = $('#soulGInput');
    var timer = 0;
    input.oninput = function () {
      GAL.q = input.value;
      clearTimeout(timer);
      timer = setTimeout(filterGallery, 140);
    };
    filterGallery();
    ensureFuse().then(function () {
      if (GAL.q) { filterGallery(); }
    }).catch(function () { });
    scrollTop();
  }

  function renderResult(vec, opt) {
    opt = opt || {};
    stage = 'result';
    act = MAIN;
    lastVec = vec;
    destroyChart();

    var ranked = compare(vec);
    var top5 = ranked.slice(0, 5);
    var N = ranked.length;
    var best = ranked[0].ch;
    var bestPct = pctOf(0, N);
    var worst = ranked[N - 1].ch;
    var kw = keywordList(vec);
    var gap = ranked.length > 1 ? (ranked[0].score - ranked[1].score) : 1;
    var closeCall = gap < 0.012;
    var customCount = MAIN.ans.filter(function (a) { return a && typeof a === 'object'; }).length;

    var dimRows = KEYS.map(function (k, i) {
      var z = vec[i], st = strengthOf(z), isLeft = z >= 0;
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
      var art = artOf(c.n);
      return '<div class="soul-rank-item">' +
        '<div class="rk">' + (i + 2) + '</div>' +
        (art ? '<div class="av soul-av-art"><img src="' + esc(art) + '" alt=""></div>'
             : '<div class="av" style="background:' + esc(c.c) + '">' + esc(c.n.charAt(0)) + '</div>') +
        '<div class="nm"><b>' + esc(c.n) + '</b><span>' + esc(c.f) + '</span></div>' +
        '<div class="pc">' + pctOf(i + 1, N) + '%</div>' +
      '</div>';
    }).join('');

    var canRefine = !opt.refined && (window.SOUL_EXTRA || []).length >= 4;

    app.innerHTML = '';
    app.appendChild(el(
      '<div class="soul-wrap">' +
        (opt.fromHistory ? '<div class="soul-note" style="margin:0 0 10px;">这是你保存过的一次结果 · <a href="javascript:void 0" id="soulBackHis">返回列表</a></div>' : '') +
        '<div class="soul-res-head">' +
          '<div class="soul-res-kicker">你的动漫灵魂角色是</div>' +
          avatarHtml(best) +
          '<h2 class="soul-name">' + esc(best.n) + '</h2>' +
          '<div class="soul-from">' + esc(best.f) + '</div>' +
          (opt.label ? '<div class="soul-mylabel">备注：' + esc(opt.label) + '</div>' : '') +
          '<div class="soul-tags">' + (best.tg || []).map(function (t) { return '<span class="soul-tag">' + esc(t) + '</span>'; }).join('') +
            (opt.refined ? '<span class="soul-tag soul-tag-live">已精算</span>' : '') + '</div>' +
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
          '<div class="txt">与你的答案向量重合 · 共 ' + N + ' 位角色比对' +
            (opt.refined ? ' · 加试 6 题后微调' + (opt.drift ? '，单维最大变化 ' + opt.drift + ' 分' : '') : '') +
            (customCount && !opt.fromHistory ? ' · 其中 ' + customCount + ' 题是你自己写的回答' : '') + '</div>' +
          '<div class="soul-tags" style="margin-top:10px;">' + kw.map(function (w) { return '<span class="soul-tag">' + esc(w) + '</span>'; }).join('') + '</div>' +
        '</div>' +
        (canRefine ? '<div class="soul-refine">' +
          '<div class="soul-refine-t">' + (closeCall
            ? '第 1 名和第 2 名咬得非常紧（' + esc(ranked[1].ch.n) + '）'
            : '还想更准一点？') + '</div>' +
          '<div class="soul-refine-d">再答 6 道最能区分你和第 2 名的题。加试只做小幅微调（约占总坐标 15%），不会推翻主测的十维形状。</div>' +
          '<button class="soul-btn" id="soulRefine">开始加试 6 题</button>' +
        '</div>' : '') +
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
        '<div class="soul-note">匹配度按人格向量的方向相似度与距离综合计算，结果仅供娱乐参考' +
          (meta ? '<br>' + esc(meta.updated) + ' 数据版 · ' + ALL.length + ' 位角色' : '') + '</div>' +
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
      MAIN.ans = new Array(TOTAL).fill(-1);
      MAIN.cur = 0;
      MAIN.qs = QS;
      act = MAIN;
      renderIntro();
    };
    var rf = $('#soulRefine');
    if (rf) { rf.onclick = function () { startExtra(ranked); }; }
    var back = $('#soulBackHis');
    if (back) { back.onclick = function () { renderIntro(); }; }

    drawRadar(vec);
    animateResult();
    // 点角色立绘可以放大看原图
    var heroImg = $('.soul-av-art img');
    if (heroImg) {
      ensureZoom().then(function (mz) {
        if (typeof mz === 'function') {
          mz(heroImg, { margin: 28, background: 'rgba(255,250,240,.97)', scrollOffset: 0 });
        }
      }).catch(function () { });
    }
    scrollTop();
  }

  function animateResult() {
    motion(function (anime) {
      anime.animate('.soul-res-head > *', {
        opacity: [0, 1], translateY: [14, 0],
        delay: anime.stagger(70), duration: 460, ease: 'out(2)'
      });
      anime.animate('.soul-rank-item', {
        opacity: [0, 1], translateX: [-8, 0],
        delay: anime.stagger(45, { start: 180 }), duration: 380, ease: 'out(2)'
      });
    });
  }

  /* ---------------- 加试 ---------------- */
  function startExtra(ranked) {
    var picked = pickExtraQuestions(ranked[0].ch, ranked[1].ch, 6);
    if (!picked.length) { toast('暂时没有可用的加试题'); return; }
    EXTRA.qs = picked;
    EXTRA.ans = new Array(picked.length).fill(-1);
    EXTRA.cur = 0;
    act = EXTRA;
    renderQuiz(true);
  }

  /* ---------------- 雷达图 ---------------- */
  function radarLabels(vec) {
    return KEYS.map(function (k, i) { return (vec[i] >= 0 ? DIMS[i].l : DIMS[i].r); });
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
      var top = 100;
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
    var art = artOf(best.n);

    var node = el(
      '<div class="soul-share" id="soulShareCard">' +
        '<div class="sh-kicker">Anime Soul Test</div>' +
        (art ? '<div class="sh-art"><img src="' + esc(art) + '" alt=""></div>' : '') +
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

    var done = function () { if (node.parentNode) { node.parentNode.removeChild(node); } };

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
      copyText('我的动漫灵魂角色是：' + best.n + ' ' + best.f + '｜重合度 ' + bestPct + '%｜' + kw.join(' / '));
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
    else if (e.key === 'ArrowLeft' && act.cur > 0) { act.cur--; renderQuiz(true); }
  });

  /* ---------------- 入口 ---------------- */
  function boot() {
    app = document.getElementById('soulApp');
    if (!app) { return; }
    if (booted) {
      if (stage === 'quiz') { renderQuiz(true); }
      else if (stage === 'gallery') { renderGallery(); }
      else if (stage === 'result' && lastVec) { renderResult(lastVec, { refined: lastRefined }); }
      else { renderIntro(); }
      return;
    }
    booted = true;
    app.innerHTML = '<div class="soul-loading">正在加载题库…</div>';
    Promise.all([ensureData().then(ensureExtra), ensureArt()]).then(function () {
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
