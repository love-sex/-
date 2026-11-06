/* ===================================================================
 * 采集台（Collect）
 * 定位：本机跑 MediaCrawler 采集 → 导出 JSON/JSONL/CSV → 拖进这里做
 *       筛选 / 排序 / 热词 / 精选 / 二次导出。
 * 约束：纯前端，不发起任何抓取请求，数据只存本机 localStorage。
 * =================================================================== */
(function () {
  'use strict';

  const STORE_KEY = 'wb.collect.v1';
  const MAX_ITEMS = 3000;      // localStorage 保护上限
  const PAGE_SIZE = 60;        // 列表分页渲染步长

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const PLATFORM_LABEL = {
    xhs: '小红书', dy: '抖音', ks: '快手', bili: 'B站',
    wb: '微博', tieba: '贴吧', zhihu: '知乎', unknown: '未知'
  };

  /* ---------------- 状态 ---------------- */
  let state = {
    items: [],
    picked: [],          // 精选 key 数组
    filter: { q: '', platform: 'all', sort: 'hot', onlyPicked: false },
    page: 1
  };
  let bound = false;

  const saveState = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        items: state.items,
        picked: state.picked,
        filter: state.filter
      }));
    } catch (e) {
      console.warn('[collect] 本地存储写入失败', e);
    }
  };

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (Array.isArray(d.items)) state.items = d.items;
      if (Array.isArray(d.picked)) state.picked = d.picked;
      if (d.filter && typeof d.filter === 'object') {
        state.filter = Object.assign(state.filter, d.filter);
      }
    } catch (e) {
      console.warn('[collect] 读取本地数据失败', e);
    }
  };

  /* ---------------- 字段归一 ---------------- */
  const NUM_KEYS = {
    like: ['liked_count', 'like_count', 'digg_count', 'voteup_count', 'attitudes_count',
      'praise_count', 'good_num', 'likeCount', 'likes', 'like', '赞', '点赞'],
    comment: ['comment_count', 'comments_count', 'reply_count', 'commentCount', 'comments',
      'reply_num', 'comment', '评论'],
    collect: ['collected_count', 'collect_count', 'favorite_count', 'favorites',
      'favorite', 'favoriteCount', 'collectedCount', 'collect', '收藏'],
    share: ['share_count', 'reposts_count', 'forward_count', 'shareCount', 'share', '转发']
  };

  const TITLE_KEYS = ['title', 'desc', 'content', 'note_title', 'text', 'raw_text',
    'question_content', 'article_title', 'note_content', '标题', '内容'];
  const AUTHOR_KEYS = ['nickname', 'user_nickname', 'author', 'user_name', 'username',
    'screen_name', 'user', '作者', '昵称'];
  const URL_KEYS = ['note_url', 'aweme_url', 'share_url', 'web_url', 'article_url',
    'video_url', 'url', 'link', '链接'];
  const ID_KEYS = ['note_id', 'aweme_id', 'photo_id', 'video_id', 'bvid', 'aid', 'tid',
    'comment_id', 'msg_id', 'question_id', 'article_id', 'id'];
  const TIME_KEYS = ['create_time', 'createTime', 'publish_time', 'pubdate', 'pub_time',
    'publish_date', 'created_at', 'last_update_time', 'time', 'date'];
  const KEYWORD_KEYS = ['source_keyword', 'keyword', 'search_keyword', '关键词'];

  const pick = (obj, keys) => {
    for (const k of keys) {
      const v = obj[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return '';
  };

  /** "1.2万" / "3.4w" / "1,234" / "10k" / 1234 → number */
  function toNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return Math.round(v);
    const s = String(v).trim().replace(/,/g, '').replace(/\s/g, '');
    let mul = 1;
    if (/亿/.test(s)) mul = 1e8;
    else if (/[万wW]$/.test(s)) mul = 1e4;
    else if (/[kK]$/.test(s)) mul = 1e3;
    const n = parseFloat(s);
    return isNaN(n) ? 0 : Math.round(n * mul);
  }

  function toTime(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v > 1e11 ? v : v * 1000;
    const s = String(v).trim();
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return n > 1e11 ? n : n * 1000;
    }
    const t = Date.parse(s.replace(/-/g, '/'));
    return isNaN(t) ? 0 : t;
  }

  /** 依据字段特征识别平台 */
  function detectPlatform(row, hint) {
    if (row.note_id !== undefined || row.note_url !== undefined) return 'xhs';
    if (row.aweme_id !== undefined || row.aweme_url !== undefined) return 'dy';
    if (row.photo_id !== undefined) return 'ks';
    if (row.bvid !== undefined || row.aid !== undefined) return 'bili';
    if (row.attitudes_count !== undefined || row.reposts_count !== undefined) return 'wb';
    if (row.reply_num !== undefined || row.tid !== undefined) return 'tieba';
    if (row.question_id !== undefined || row.voteup_count !== undefined) return 'zhihu';

    const h = String(hint || '').toLowerCase();
    if (/xhs|xiaohongshu|小红书/.test(h)) return 'xhs';
    if (/\bdy\b|douyin|抖音/.test(h)) return 'dy';
    if (/kuaishou|\bks\b|快手/.test(h)) return 'ks';
    if (/bili|bilibili|b站/.test(h)) return 'bili';
    if (/weibo|\bwb\b|微博/.test(h)) return 'wb';
    if (/tieba|贴吧/.test(h)) return 'tieba';
    if (/zhihu|知乎/.test(h)) return 'zhihu';
    return 'unknown';
  }

  function normalizeRow(row, hint) {
    if (!row || typeof row !== 'object') return null;

    const title = String(pick(row, TITLE_KEYS) || '').trim();
    const id = String(pick(row, ID_KEYS) || '');
    if (!title && !id) return null;

    const platform = detectPlatform(row, hint);
    const url = String(pick(row, URL_KEYS) || '');

    return {
      k: platform + '|' + (id || title.slice(0, 40)),
      platform,
      id,
      title,
      author: String(pick(row, AUTHOR_KEYS) || ''),
      like: toNum(pick(row, NUM_KEYS.like)),
      comment: toNum(pick(row, NUM_KEYS.comment)),
      collect: toNum(pick(row, NUM_KEYS.collect)),
      share: toNum(pick(row, NUM_KEYS.share)),
      url: /^https?:\/\//i.test(url) ? url : '',
      time: toTime(pick(row, TIME_KEYS)),
      keyword: String(pick(row, KEYWORD_KEYS) || ''),
      ts: Date.now()
    };
  }

  /* ---------------- 解析 ---------------- */
  function parseJSONL(text) {
    const out = [];
    text.split(/\r?\n/).forEach((line) => {
      const s = line.trim();
      if (!s || s[0] !== '{') return;
      try {
        const o = JSON.parse(s);
        if (Array.isArray(o)) out.push(...o);
        else out.push(o);
      } catch (e) { /* 跳过坏行 */ }
    });
    return out;
  }

  function parseJSON(text) {
    const d = JSON.parse(text);
    if (Array.isArray(d)) return d;
    if (!d || typeof d !== 'object') return [];
    for (const k of ['data', 'items', 'list', 'results', 'records', 'notes']) {
      if (Array.isArray(d[k])) return d[k];
    }
    // 单对象：{ data: {...} }
    if (d.data && typeof d.data === 'object') return [d.data];
    return [d];
  }

  /** 完整 CSV 解析（支持引号包裹、字段内逗号与换行、双引号转义） */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuote = false;
    const s = text.replace(/^\uFEFF/, '');

    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuote) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuote = false;
        } else field += c;
        continue;
      }
      if (c === '"') { inQuote = true; continue; }
      if (c === ',') { row.push(field); field = ''; continue; }
      if (c === '\r') continue;
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    if (rows.length < 2) return [];

    const head = rows[0].map((h) => h.trim());
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r.length || (r.length === 1 && !r[0].trim())) continue;
      const o = {};
      head.forEach((h, idx) => { if (h) o[h] = r[idx] !== undefined ? r[idx] : ''; });
      out.push(o);
    }
    return out;
  }

  function parseText(text, fileName) {
    const t = text.trim();
    if (!t) return [];
    if (/\.(jsonl|ndjson)$/i.test(fileName)) return parseJSONL(t);
    if (/^[[{]/.test(t)) {
      try { return parseJSON(t); } catch (e) { return parseJSONL(t); }
    }
    return parseCSV(t);
  }

  /** 把原始行数组并入 state.items，返回 {added, skipped} */
  function ingest(rows, fileName) {
    const exists = new Set(state.items.map((i) => i.k));
    let added = 0, skipped = 0;

    rows.forEach((row) => {
      const it = normalizeRow(row, fileName);
      if (!it) { skipped++; return; }
      if (exists.has(it.k)) { skipped++; return; }
      exists.add(it.k);
      state.items.push(it);
      added++;
    });

    if (state.items.length > MAX_ITEMS) {
      // 超限时保留互动量更高的，避免把有用的挤掉
      state.items.sort((a, b) => hot(b) - hot(a));
      state.items.length = MAX_ITEMS;
    }
    if (added) {
      state.items.sort((a, b) => b.ts - a.ts);
      saveState();
      render();
    }
    return { added, skipped };
  }

  const hot = (it) => it.like + it.comment * 2 + it.collect * 2 + it.share * 3;

  /* ---------------- 热词 ---------------- */
  const STOP = new Set(('的 了 是 我 你 她 他 它 这 那 在 有 和 就 不 都 也 很 太 最 更 还 又 再 才 只 被 把 给 让 从 到 对 与 及 或 而 但 却 因为 所以 如果 可以 我们 你们 他们 她们 自己 什么 怎么 这个 那个 这样 那样 这些 那些 一个 一下 一直 一些 没有 不是 就是 已经 现在 时候 真的 感觉 觉得 知道 需要 东西 事情 非常 特别 比较 其实 不过 只是 还有 然后 而且 或者 起来 出来 过来 回来 看到 看着 好像 应该 可能 一样 这么 那么 还是 就是 这种 那种 大家 今天 明天 昨天 我 们 呢 吗 吧 啊 呀 哦 嗯 啦 嘛 哈 噢 哎 唉 个 们 很 多 少 大 小 好 用 做 去 来 说 想 会 能 要 得 地 着 过 上 下 里 外 好物 分享 推荐 真的 姐妹 宝子 冲 绝了 谁懂 日常 生活').split(/\s+/));

  function hotWords(texts, topN) {
    const counter = new Map();
    const STOP_EDGE = '的了吗呢吧啊呀哦嗯是在和就都也很有我你他她它这那';

    texts.forEach((text) => {
      const runs = String(text || '').match(/[\u4e00-\u9fa5]+/g) || [];
      runs.forEach((run) => {
        const len = run.length;
        for (let n = 2; n <= 3; n++) {
          for (let i = 0; i + n <= len; i++) {
            const g = run.substr(i, n);
            if (STOP.has(g)) continue;
            if (STOP_EDGE.includes(g[0]) || STOP_EDGE.includes(g[g.length - 1])) continue;
            counter.set(g, (counter.get(g) || 0) + 1);
          }
        }
      });
    });

    // 频次优先，同频次时长的优先（避免「勤包」抢在「通勤包」前面）
    const arr = Array.from(counter.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length));

    // 去掉被更长词包含的碎片，以及错位滑窗产生的假词（通勤 → 勤穿）
    const isShift = (a, b) => a.length === b.length &&
      (a.slice(1) === b.slice(0, -1) || b.slice(1) === a.slice(0, -1));

    const kept = [];
    for (const [w, c] of arr) {
      if (kept.length >= (topN || 24)) break;
      const dup = kept.some(([kw, kc]) =>
        (kw.includes(w) && kc >= c * 0.75) || isShift(kw, w));
      if (!dup) kept.push([w, c]);
    }
    return kept;
  }

  /* ---------------- 过滤 ---------------- */
  function filtered() {
    const f = state.filter;
    const q = f.q.trim().toLowerCase();
    const pickedSet = new Set(state.picked);
    let list = state.items.filter((it) => {
      if (f.platform !== 'all' && it.platform !== f.platform) return false;
      if (f.onlyPicked && !pickedSet.has(it.k)) return false;
      if (q) {
        const hay = (it.title + ' ' + it.author + ' ' + it.keyword).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    const sorters = {
      hot: (a, b) => hot(b) - hot(a),
      like: (a, b) => b.like - a.like,
      comment: (a, b) => b.comment - a.comment,
      collect: (a, b) => b.collect - a.collect,
      time: (a, b) => (b.time || b.ts) - (a.time || a.ts),
      added: (a, b) => b.ts - a.ts
    };
    list.sort(sorters[f.sort] || sorters.hot);
    return list;
  }

  const fmtNum = (n) => {
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
    return String(n);
  };
  const fmtDate = (t) => {
    if (!t) return '';
    const d = new Date(t);
    if (isNaN(d.getTime())) return '';
    const p = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  /* ---------------- 渲染 ---------------- */
  function renderStats() {
    const box = $('#clStats');
    if (!box) return;
    const list = filtered();
    const platforms = new Set(state.items.map((i) => i.platform));
    const sumHot = list.reduce((s, i) => s + hot(i), 0);
    box.innerHTML = [
      ['📦', state.items.length, '已导入'],
      ['🌐', platforms.size, '平台数'],
      ['🎯', list.length, '当前筛选'],
      ['🔥', fmtNum(sumHot), '互动合计']
    ].map(([ic, num, label]) =>
      '<div class="cl-stat"><div class="cl-stat-ic">' + ic + '</div>' +
      '<div class="cl-stat-num">' + esc(num) + '</div>' +
      '<div class="cl-stat-label">' + label + '</div></div>'
    ).join('');
  }

  function renderWords() {
    const box = $('#clWords');
    if (!box) return;
    const list = filtered().slice(0, 400);
    const words = hotWords(list.map((i) => i.title + ' ' + (i.keyword || '')), 24);
    if (!words.length) {
      box.innerHTML = '<div class="cl-empty-mini">暂无热词（需要至少 2 条含相同词语的内容）</div>';
      return;
    }
    const max = words[0][1] || 1;
    box.innerHTML = words.map(([w, c]) => {
      const size = 12 + Math.round((c / max) * 8);
      return '<button class="cl-word" data-word="' + esc(w) + '" style="font-size:' + size + 'px">' +
        esc(w) + '<i>' + c + '</i></button>';
    }).join('');
  }

  function renderList() {
    const box = $('#clList');
    if (!box) return;
    const list = filtered();
    if (!list.length) {
      box.innerHTML = state.items.length
        ? '<div class="cl-empty">没有符合条件的内容，换个筛选或关键词试试。</div>'
        : '<div class="cl-empty">还没有数据。在本机跑完 MediaCrawler，把 <code>data/</code> 里导出的 JSON / JSONL / CSV 拖到上面的框里。</div>';
      return;
    }

    const pickedSet = new Set(state.picked);
    const show = list.slice(0, state.page * PAGE_SIZE);

    box.innerHTML = show.map((it) => {
      const on = pickedSet.has(it.k);
      const meta = [];
      if (it.author) meta.push('@' + esc(it.author));
      if (it.time) meta.push(fmtDate(it.time));
      if (it.keyword) meta.push('#' + esc(it.keyword));

      return '<div class="cl-item' + (on ? ' is-picked' : '') + '" data-k="' + esc(it.k) + '">' +
        '<div class="cl-item-top">' +
        '<span class="cl-tag cl-tag-' + esc(it.platform) + '">' + esc(PLATFORM_LABEL[it.platform] || '未知') + '</span>' +
        (meta.length ? '<span class="cl-meta">' + meta.join(' · ') + '</span>' : '') +
        '</div>' +
        '<div class="cl-title">' + esc(it.title || '(无标题)') + '</div>' +
        '<div class="cl-item-bottom">' +
        '<span class="cl-nums">' +
        '<b>❤ ' + fmtNum(it.like) + '</b>' +
        '<b>💬 ' + fmtNum(it.comment) + '</b>' +
        '<b>⭐ ' + fmtNum(it.collect) + '</b>' +
        '</span>' +
        '<span class="cl-acts">' +
        (it.url ? '<a class="cl-link" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">打开</a>' : '') +
        '<button class="cl-pick' + (on ? ' on' : '') + '" data-pick="' + esc(it.k) + '">' + (on ? '已精选' : '精选') + '</button>' +
        '</span>' +
        '</div>' +
        '</div>';
    }).join('');

    if (list.length > show.length) {
      box.insertAdjacentHTML('beforeend',
        '<button class="btn btn-ghost btn-block" id="clMore">加载更多（还有 ' +
        (list.length - show.length) + ' 条）</button>');
    }
    renderStats();
  }

  function render() {
    if (!$('#clApp')) return;
    renderStats();
    renderWords();
    renderList();
    syncControls();
  }

  function syncControls() {
    const f = state.filter;
    const q = $('#clSearch');
    if (q && q.value !== f.q) q.value = f.q;
    const p = $('#clPlatform');
    if (p) p.value = f.platform;
    const s = $('#clSort');
    if (s) s.value = f.sort;
    const op = $('#clOnlyPicked');
    if (op) op.checked = !!f.onlyPicked;
    const cnt = $('#clPickedCount');
    if (cnt) cnt.textContent = String(state.picked.length);
    const plat = $('#clPlatform');
    if (plat) {
      const cur = plat.value;
      const opts = ['<option value="all">全部平台</option>'].concat(
        Object.keys(PLATFORM_LABEL).filter((k) => k !== 'unknown').map((k) =>
          '<option value="' + k + '">' + PLATFORM_LABEL[k] + '</option>')
      ).join('');
      if (plat.innerHTML !== opts) plat.innerHTML = opts;
      plat.value = cur || f.platform;
    }
  }

  /* ---------------- 导出 ---------------- */
  const CSV_HEAD = ['平台', '标题', '作者', '点赞', '评论', '收藏', '转发', '发布时间', '关键词', '链接'];

  function currentExportSet() {
    const list = filtered();
    const pickedSet = new Set(state.picked);
    return pickedSet.size && !state.filter.onlyPicked
      ? list.filter((i) => pickedSet.has(i.k))
      : list;
  }

  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

  function exportCSV() {
    const list = currentExportSet();
    if (!list.length) { toast('没有可导出的内容'); return; }
    const lines = [CSV_HEAD.map(csvCell).join(',')];
    list.forEach((i) => {
      lines.push([
        PLATFORM_LABEL[i.platform] || '未知', i.title, i.author, i.like, i.comment,
        i.collect, i.share, fmtDate(i.time), i.keyword, i.url
      ].map(csvCell).join(','));
    });
    download('采集精选-' + stamp() + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast('已导出 ' + list.length + ' 条 CSV');
  }

  function exportMD() {
    const list = currentExportSet();
    if (!list.length) { toast('没有可导出的内容'); return; }
    const lines = ['# 采集精选 · ' + new Date().toLocaleDateString('zh-CN'), '',
      '共 ' + list.length + ' 条', ''];
    list.forEach((i, idx) => {
      lines.push('## ' + (idx + 1) + '. ' + (i.title || '(无标题)'));
      lines.push('');
      const meta = [];
      meta.push('平台：' + (PLATFORM_LABEL[i.platform] || '未知'));
      if (i.author) meta.push('作者：' + i.author);
      meta.push('互动：❤' + fmtNum(i.like) + ' 💬' + fmtNum(i.comment) + ' ⭐' + fmtNum(i.collect));
      if (i.time) meta.push('发布：' + fmtDate(i.time));
      if (i.keyword) meta.push('关键词：' + i.keyword);
      lines.push('> ' + meta.join('　|　'));
      if (i.url) lines.push('> ' + i.url);
      lines.push('');
    });
    download('采集精选-' + stamp() + '.md', lines.join('\n'), 'text/markdown;charset=utf-8');
    toast('已导出 ' + list.length + ' 条 Markdown');
  }

  const stamp = () => {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  };

  function copyCmd() {
    const pf = ($('#clCmdPlatform') || {}).value || 'xhs';
    const kw = (($('#clCmdKeyword') || {}).value || '').trim();
    const type = ($('#clCmdType') || {}).value || 'search';
    const base = 'uv run main.py --platform ' + pf + ' --lt qrcode --type ' + type;
    const cmd = type === 'search'
      ? base + ' --keywords "' + (kw || '关键词1,关键词2') + '"'
      : base + ' --specified_id "' + (kw || '帖子ID或链接') + '"';
    const out = $('#clCmdOut');
    if (out) out.textContent = cmd;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(() => toast('命令已复制'), () => toast('复制失败，请手动选取'));
    } else {
      toast('已生成命令，请手动复制');
    }
  }

  /* ---------------- 导入交互 ---------------- */
  function readFiles(files) {
    const list = Array.from(files || []);
    if (!list.length) return;
    let total = 0, skipped = 0, pending = list.length;

    list.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const rows = parseText(String(reader.result || ''), f.name);
          const r = ingest(rows, f.name);
          total += r.added; skipped += r.skipped;
        } catch (e) {
          console.error('[collect] 解析失败', f.name, e);
          skipped++;
        }
        if (--pending === 0) {
          toast('导入 ' + total + ' 条' + (skipped ? '，跳过 ' + skipped + ' 条' : ''));
          state.page = 1;
          render();
        }
      };
      reader.onerror = () => {
        if (--pending === 0) render();
      };
      reader.readAsText(f, 'utf-8');
    });
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    if (bound) return;
    const app = $('#clApp');
    if (!app) return;
    bound = true;

    const fileInput = $('#clFile');
    const drop = $('#clDrop');

    if (drop) {
      drop.addEventListener('click', () => fileInput && fileInput.click());
      ['dragenter', 'dragover'].forEach((ev) =>
        drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
      ['dragleave', 'drop'].forEach((ev) =>
        drop.addEventListener(ev, () => drop.classList.remove('is-over')));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files) readFiles(e.dataTransfer.files);
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        readFiles(fileInput.files);
        fileInput.value = '';
      });
    }

    if ($('#clSearch')) {
      $('#clSearch').addEventListener('input', (e) => {
        state.filter.q = e.target.value;
        state.page = 1;
        saveState();
        renderStats(); renderWords(); renderList();
      });
    }
    if ($('#clPlatform')) {
      $('#clPlatform').addEventListener('change', (e) => {
        state.filter.platform = e.target.value;
        state.page = 1; saveState(); render();
      });
    }
    if ($('#clSort')) {
      $('#clSort').addEventListener('change', (e) => {
        state.filter.sort = e.target.value;
        state.page = 1; saveState(); renderList();
      });
    }
    if ($('#clOnlyPicked')) {
      $('#clOnlyPicked').addEventListener('change', (e) => {
        state.filter.onlyPicked = e.target.checked;
        state.page = 1; saveState(); render();
      });
    }

    // 列表内的事件委托
    const listBox = $('#clList');
    if (listBox) {
      listBox.addEventListener('click', (e) => {
        const more = e.target.closest('#clMore');
        if (more) { state.page++; renderList(); return; }

        const pickBtn = e.target.closest('[data-pick]');
        if (pickBtn) {
          const k = pickBtn.dataset.pick;
          const idx = state.picked.indexOf(k);
          if (idx === -1) state.picked.push(k); else state.picked.splice(idx, 1);
          saveState();
          renderStats(); renderList();
          return;
        }
      });
    }

    const words = $('#clWords');
    if (words) {
      words.addEventListener('click', (e) => {
        const w = e.target.closest('[data-word]');
        if (!w) return;
        const input = $('#clSearch');
        if (input) input.value = w.dataset.word;
        state.filter.q = w.dataset.word;
        state.page = 1;
        saveState();
        render();
      });
    }

    if ($('#clExportCsv')) $('#clExportCsv').addEventListener('click', exportCSV);
    if ($('#clExportMd')) $('#clExportMd').addEventListener('click', exportMD);
    if ($('#clCopyCmd')) $('#clCopyCmd').addEventListener('click', copyCmd);
    if ($('#clClearAll')) {
      $('#clClearAll').addEventListener('click', () => {
        if (!state.items.length) { toast('已经是空的'); return; }
        if (!confirm('确定清空本机已导入的 ' + state.items.length + ' 条采集数据和精选？')) return;
        state.items = [];
        state.picked = [];
        state.page = 1;
        saveState();
        render();
        toast('已清空');
      });
    }
    if ($('#clUnpick')) {
      $('#clUnpick').addEventListener('click', () => {
        state.picked = [];
        saveState();
        render();
        toast('已取消全部精选');
      });
    }
  }

  /* ---------------- 对外接口 ---------------- */
  window.__collect = {
    render: () => { bind(); render(); },
    importText: (text, name) => {
      const r = ingest(parseText(text, name || 'pasted.json'), name || 'pasted.json');
      render();
      return r;
    },
    clear: () => { state.items = []; state.picked = []; saveState(); render(); },
    stats: () => ({ items: state.items.length, picked: state.picked.length, filtered: filtered().length })
  };

  const init = () => {
    loadState();
    if ($('#clApp')) { bind(); render(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
