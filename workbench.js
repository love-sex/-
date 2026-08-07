/*******************************
 * 想想 的 AI 工作台
 * 纯前端 PWA：localStorage 自动保存 + JSON 导入导出
 *******************************/

const App = (() => {
  const getKey = () => window.__wbUser ? 'think-workbench-' + window.__wbUser : 'think-workbench-v1';
  const today = new Date();
  let currentDate = new Date();

  // 默认训练计划
  const defaultPlans = {
    chest: [
      { name: '杠铃卧推（轻重量/空杆）', sets: '4组×10次', duration: 12 },
      { name: '哑铃推肩', sets: '4组×10次', duration: 10 },
      { name: '哑铃侧平举', sets: '4组×12次', duration: 8 },
    ],
    back: [
      { name: '高位下拉', sets: '4组×12次', duration: 12 },
      { name: '坐姿划船', sets: '4组×12次', duration: 10 },
      { name: '直臂下压', sets: '3组×15次', duration: 8 },
    ],
    leg: [
      { name: '深蹲', sets: '4组×10次', duration: 12 },
      { name: '臀桥', sets: '4组×12次', duration: 10 },
      { name: '箭步蹲', sets: '3组×12次/侧', duration: 10 },
    ],
    pratice: [
      { name: '普拉提全身拉伸', sets: '1组', duration: 30 },
    ],
    rest: []
  };

  // 空数据结构
  const emptyDay = () => ({
    todos: [],
    sport: { exercises: [], records: [], weight: null, photos: [] },
    finance: { records: [] },
    account: { current: 'pet', kb: {}, topics: [], publish: [], fans: [], money: { ad: 0, other: 0 } },
    excerpt: { copy: [], read: [], pod: [] },
    study: { items: [], notes: [] }
  });

  const defaultData = () => ({
    settings: { theme: 'brown', layout: 'auto', density: 'comfortable', accent: 'gold', navHidden: false, bgMuted: false, bgOverlay: 30,
      hiddenUI: { dateBar: true, calendarPanel: true, bottomNav: true, pageHead: true, statRow: true, quickTodo: true }
    },
    dates: {},
    // 全局待办（独立于日历日期）：每条任务带优先级 / 分类 / 日期
    todos: [],
    todoCategories: [], // [{id, name, color}]
    todoFilter: 'all', // 'all' | 'pending' | 'done'
    todoSort: 'date',  // 'date' | 'created' | 'priority' | 'name'
    todoCatFilter: '', // '' 或 categoryId
    // 自定义主题：用户通过"添加主题"创建
    customThemes: [], // [{id, name, primary, accent, text, bg}]
    // 全局数据（粉丝、健身体重历史等）
    global: {
      fanHistory: [
        { month: '2026-01', fans: 200 }, { month: '2026-02', fans: 350 },
        { month: '2026-03', fans: 520 }, { month: '2026-04', fans: 680 },
        { month: '2026-05', fans: 820 }, { month: '2026-06', fans: 940 },
        { month: '2026-07', fans: 1000 }
      ],
      weightHistory: [
        { date: '2026-07-01', weight: 52.0 }, { date: '2026-07-05', weight: 51.5 },
        { date: '2026-07-12', weight: 51.0 }, { date: '2026-07-18', weight: 50.8 },
        { date: '2026-07-28', weight: 45.0 }
      ]
    }
  });

  /* ---------- 主题系统：预设 + 用户自定义 ---------- */
  // 3 个内置主题：仅 ID/名称/渐变 class；CSS 变量在 [data-theme="xxx"] 中定义
  const PRESET_THEMES = [
    { id: 'brown', name: '深棕',  cls: 'ti-brown' },
    { id: 'mocha', name: '摩卡',  cls: 'ti-mocha' },
    { id: 'sage',  name: '鼠尾草', cls: 'ti-sage'  },
  ];

  const getAllThemes = () => {
    const customs = (data.customThemes || []).map(t => ({
      id: 'custom:' + t.id, name: t.name, custom: t,
    }));
    return [...PRESET_THEMES, ...customs];
  };

  const findCurrentTheme = () => {
    const key = data.settings.theme || 'brown';
    if (key.startsWith('custom:')) {
      const id = key.slice(7);
      const t = (data.customThemes || []).find(x => x.id === id);
      return t ? { id: key, name: t.name, custom: t } : PRESET_THEMES[0];
    }
    return PRESET_THEMES.find(p => p.id === key) || PRESET_THEMES[0];
  };

  // 应用主题：preset 走 CSS，custom 走 inline CSS 变量
  const applyTheme = () => {
    const key = data.settings.theme || 'brown';
    if (key.startsWith('custom:')) {
      const id = key.slice(7);
      const t = (data.customThemes || []).find(x => x.id === id);
      if (t) {
        document.body.removeAttribute('data-theme'); // 清掉预设主题
        // 写入主题变量
        const set = (k, v) => document.body.style.setProperty(k, v);
        const hexToRgb = h => {
          const x = h.replace('#','');
          const v = x.length === 3 ? x.split('').map(c=>c+c).join('') : x;
          const n = parseInt(v, 16);
          return [(n>>16)&255, (n>>8)&255, n&255];
        };
        set('--primary', t.primary);
        set('--primary-rgb', hexToRgb(t.primary).join(', '));
        set('--primary-light', t.primary);
        set('--text', t.text);
        set('--bg', t.bg);
        set('--bg-soft', t.bg);
        set('--surface', t.bg);
        set('--surface-2', t.bg);
        set('--accent', t.accent);
        set('--accent-deep', t.accent);
        set('--accent-light', t.accent);
      }
    } else {
      // 清除 inline 变量，回退到 [data-theme] CSS
      ['--primary','--primary-rgb','--primary-light','--text','--bg','--bg-soft','--surface','--surface-2','--accent','--accent-deep','--accent-light']
        .forEach(k => document.body.style.removeProperty(k));
      document.body.setAttribute('data-theme', key);
    }
  };

  // 渲染主题色板（在设置面板中）
  const renderThemeGrid = () => {
    const grid = $('#themeGrid');
    if (!grid) return;
    const cur = data.settings.theme || 'brown';
    let html = '';
    PRESET_THEMES.forEach(p => {
      html += `<div class="theme-item preset ${p.cls} ${cur === p.id ? 'active' : ''}" data-theme="${p.id}">
        <span class="theme-item-name">${p.name}</span>
      </div>`;
    });
    (data.customThemes || []).forEach(t => {
      const key = 'custom:' + t.id;
      html += `<div class="theme-item custom ${cur === key ? 'active' : ''}" data-theme="${key}"
        style="--ti-bg:${t.bg};--ti-primary:${t.primary};--ti-accent:${t.accent};--ti-text:${t.text}">
        <span class="theme-item-name">${escapeHtml(t.name)}</span>
        <button class="theme-item-del" data-del-theme="${t.id}" title="删除主题">×</button>
      </div>`;
    });
    grid.innerHTML = html;
  };

  /* ---------- IndexedDB：存图片/视频 Blob（localStorage 太小） ---------- */
  const IDB_NAME = 'workbench-bg';
  const IDB_STORE = 'files';
  const idb = {
    _open: null,
    open() {
      if (this._open) return this._open;
      this._open = new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
      });
      return this._open;
    },
    async save(key, blob) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(blob, key);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    },
    async load(key) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => res(req.result || null);
        req.onerror   = () => rej(req.error);
      });
    },
    async remove(key) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    }
  };

  // 当前背景的 ObjectURL（避免内存泄漏）
  let _bgObjectURL = null;
  const clearBgObjectURL = () => {
    if (_bgObjectURL) { URL.revokeObjectURL(_bgObjectURL); _bgObjectURL = null; }
  };

  // 应用背景（type = 'image' | 'video' | null）
  const applyBackground = async () => {
    const layer  = $('#bgLayer');
    const video  = $('#bgVideo');
    const ovl    = $('#bgOverlayLayer');
    const muteBtn = $('#bgMuteBtn');
    const ovlRow = $('#bgOverlayRow');
    const sndRow = $('#bgSoundRow');
    const ovlVal = $('#bgOverlayVal');
    const ovlInp = $('#bgOverlay');

    // 重置
    clearBgObjectURL();
    layer.style.backgroundImage = '';
    layer.hidden = true;
    video.pause(); video.removeAttribute('src'); video.load();
    video.hidden = true;
    ovl.hidden = true;
    ovlRow.style.display = 'none';
    sndRow.style.display = 'none';

    const blob = await idb.load('customBg').catch(() => null);
    if (!blob) {
      const prev = $('#bgPreview'); if (prev) prev.innerHTML = '';
      return;
    }
    _bgObjectURL = URL.createObjectURL(blob);
    const isVideo = (blob.type || '').startsWith('video/');
    const sizeText = (blob.size / 1024 / 1024).toFixed(2) + ' MB';

    if (isVideo) {
      video.src = _bgObjectURL;
      video.muted = false;
      video.volume = data.settings.bgMuted === false ? 1 : 0;
      video.loop = true; video.playsInline = true;
      video.hidden = false;
      ovlRow.style.display = '';
      sndRow.style.display = '';
      muteBtn.textContent = video.volume === 0 ? '🔇 静音' : '🔊 有声';
      ovl.hidden = false;
      video.play().catch(err => {
        console.warn('video autoplay blocked', err);
      });
      const prev = $('#bgPreview');
      prev.innerHTML = `<video src="${_bgObjectURL}" playsinline></video><div class="bg-info">🎬 ${escapeHtml(blob.type)} · ${sizeText}</div>`;
    } else {
      layer.style.backgroundImage = `url(${_bgObjectURL})`;
      layer.hidden = false;
      ovl.hidden = false;
      ovlRow.style.display = '';
      const prev = $('#bgPreview');
      prev.innerHTML = `<img src="${_bgObjectURL}" alt=""><div class="bg-info">🖼 ${escapeHtml(blob.type || 'image')} · ${sizeText}</div>`;
    }

    // 遮罩
    const pct = +data.settings.bgOverlay || 0;
    ovl.style.background = `rgba(0,0,0,${pct/100})`;
    ovlInp.value = pct;
    ovlVal.textContent = pct + '%';
  };

  let data = defaultData();

  /* ---------- 工具函数 ---------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const fmtYM = d => `${d.getFullYear()}年${d.getMonth()+1}月`;
  const fmtCNDate = d => `${d.getMonth()+1}月${d.getDate()}日 周${['日','一','二','三','四','五','六'][d.getDay()]}`;
  const getDay = (d = currentDate) => {
    const key = fmtDate(d);
    if (!data.dates[key]) data.dates[key] = emptyDay();
    return data.dates[key];
  };
  const save = (() => {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(() => {
        localStorage.setItem(getKey(), JSON.stringify(data));
        updateSyncStatus(true);
      }, 350);
    };
  })();
  const updateSyncStatus = (ok) => {
    const el = $('#syncStatus');
    if (!el) return;
    el.classList.toggle('offline', !ok);
    el.title = ok ? '已保存到本地' : '未同步';
  };
  const toast = (msg) => {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  };

  /* ---------- 数据初始化 ---------- */
  const load = () => {
    try {
      const raw = localStorage.getItem(getKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        data = { ...defaultData(), ...parsed, global: { ...defaultData().global, ...(parsed.global || {}) } };
      }
    } catch (e) { console.error(e); }
    getDay();
  };

  /* ---------- 视图切换 ---------- */
  const showView = (name) => {
    $$('.view').forEach(v => v.style.display = v.dataset.view === name ? 'block' : 'none');
    $$('.nav-item').forEach(n => n.classList.toggle('nav-active', n.dataset.nav === name));
    $('#backBtn').style.display = name === 'home' ? 'none' : 'inline-flex';
    document.body.scrollTop = 0;
    $('#appMain').scrollTop = 0;
    if (name === 'home') renderHome();
    if (name === 'todo') renderTodo();
    if (name === 'sport') renderSport();
    if (name === 'finance') renderFinance();
    if (name === 'account') renderAccount();
    if (name === 'excerpt') renderExcerpt();
    if (name === 'study') renderStudy();
    if (name === 'settings') renderSettings();
  };

  /* ---------- 日历 ---------- */
  const renderCalendar = () => {
    const year = currentDate.getFullYear(), month = currentDate.getMonth();
    $('#dateBarTitle').textContent = fmtYM(currentDate);
    $('#datePill').textContent = fmtCNDate(currentDate);
    const first = new Date(year, month, 1);
    const days = new Date(year, month+1, 0).getDate();
    const start = first.getDay();
    const container = $('#calendarDays');
    container.innerHTML = '';
    // 上月
    const prevDays = new Date(year, month, 0).getDate();
    for (let i = start - 1; i >= 0; i--) {
      const b = document.createElement('button');
      b.className = 'cal-day other';
      b.textContent = prevDays - i;
      container.appendChild(b);
    }
    // 当月
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month, d);
      const key = fmtDate(date);
      const b = document.createElement('button');
      b.className = 'cal-day';
      if (fmtDate(date) === fmtDate(currentDate)) b.classList.add('active');
      if (data.dates[key]) b.classList.add('has-data');
      b.innerHTML = `<span>${d}</span>${data.dates[key] ? '<span class="cal-dot"></span>' : ''}`;
      b.onclick = () => { currentDate = date; renderCalendar(); renderHome(); };
      container.appendChild(b);
    }
    // 下月
    const remain = (7 - ((start + days) % 7)) % 7;
    for (let i = 1; i <= remain; i++) {
      const b = document.createElement('button');
      b.className = 'cal-day other';
      b.textContent = i;
      container.appendChild(b);
    }
  };

  /* ---------- 首页 ---------- */
  const renderHome = () => {
    const day = getDay();
    const todayKey = fmtDate(today);
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`;

    // 待办统计（全局 data.todos，兼容旧 data.dates）
    let pending = 0, done = 0;
    data.todos.forEach(t => t.done ? done++ : pending++);
    if (data.todos.length === 0) {
      Object.values(data.dates).forEach(d => {
        (d.todos || []).forEach(t => t.done ? done++ : pending++);
      });
    }
    $('#homeTodoCount').textContent = pending;

    // 运动统计（本月）
    let sportDays = 0;
    Object.entries(data.dates).forEach(([k, d]) => {
      if (k.startsWith(monthKey) && d.sport && d.sport.records && d.sport.records.length) sportDays++;
    });
    $('#homeSportDays').textContent = sportDays;

    // 记账统计（本月）
    let income = 0, expense = 0;
    Object.entries(data.dates).forEach(([k, d]) => {
      if (k.startsWith(monthKey) && d.finance) {
        d.finance.records.forEach(r => r.type === 'income' ? income += r.amount : expense += r.amount);
      }
    });
    $('#homeIncome').textContent = '¥' + income.toLocaleString();
    $('#homeExpense').textContent = '¥' + expense.toLocaleString();

    // 今日概览
    const todayDay = data.dates[todayKey] || emptyDay();
    const tTotal = todayDay.todos.length;
    const tDone = todayDay.todos.filter(t => t.done).length;
    $('#ovTodo').textContent = tDone;
    $('#ovTodoTotal').textContent = tTotal;
    let tExpense = 0;
    (todayDay.finance.records || []).forEach(r => { if (r.type === 'expense') tExpense += r.amount; });
    $('#ovCash').textContent = tExpense;
    let tMin = 0;
    (todayDay.sport.records || []).forEach(r => tMin += Number(r.duration || 0));
    $('#ovSport').textContent = tMin;

    // 今日快速待办（来自 data.todos 中 date === 今天的）
    const qt = $('#homeQuickTodo');
    qt.innerHTML = '';
    const todayTodos = data.todos
      .filter(t => t.date === todayKey || (!t.date && todayKey === todayKey))
      .slice(0, 5);
    todayTodos.forEach(t => {
      const row = document.createElement('div');
      row.className = 'todo-item prio-' + (t.priority || 'medium') + (t.done ? ' done' : '');
      row.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''} disabled><span class="todo-text">${escapeHtml(t.text)}</span>`;
      qt.appendChild(row);
    });
    // 兼容旧数据：data.dates[key].todos
    if (todayTodos.length === 0 && (todayDay.todos || []).length) {
      todayDay.todos.slice(0, 5).forEach(t => {
        const row = document.createElement('div');
        row.className = 'todo-item' + (t.done ? ' done' : '');
        row.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''} disabled><span class="todo-text">${escapeHtml(t.text)}</span>`;
        qt.appendChild(row);
      });
    }
    if (!qt.children.length) qt.innerHTML = '<p class="muted" style="text-align:center;margin:0;">暂无待办，去添加吧～</p>';

    // 最近内容
    const recent = $('#homeRecent');
    recent.innerHTML = '';
    const recs = [];
    Object.entries(data.dates).slice(-7).forEach(([k, d]) => {
      (d.excerpt.copy || []).forEach(x => recs.push({ t: x.content.slice(0, 30) + '…', date: k, type: '文案' }));
      (d.finance.records || []).forEach(x => recs.push({ t: `${x.type==='income'?'+':'-'}¥${x.amount} ${x.purpose}`, date: k, type: '记账' }));
      (d.study.notes || []).forEach(x => recs.push({ t: x.content.slice(0, 30) + '…', date: k, type: '笔记' }));
    });
    recs.slice(-5).reverse().forEach(r => {
      const row = document.createElement('div');
      row.className = 'recent-item';
      row.innerHTML = `<span>[${r.type}] ${r.t}</span><small>${r.date}</small>`;
      recent.appendChild(row);
    });
    if (!recs.length) recent.innerHTML = '<p class="muted" style="text-align:center;margin:0;">暂无记录</p>';
  };

  /* ---------- To-do（全局待办 + 分类 + 优先级 + 筛选排序） ---------- */
  // 简单 id
  const todoId = () => 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // 分类下拉选项
  const refreshCategorySelects = () => {
    const opts = data.todoCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const tci = $('#todoCategoryInput');
    if (tci) tci.innerHTML = `<option value="">默认</option>${opts}`;
    const tcf = $('#todoCategoryFilter');
    if (tcf) tcf.innerHTML = `<option value="">所有分类</option>${opts}`;
  };

  // 分类 chips
  const renderCategoryChips = () => {
    const wrap = $('#categoryChips');
    if (!wrap) return;
    const active = data.todoCatFilter || '';
    let html = `<span class="chip ${active === '' ? 'chip-active' : ''}" data-cat="">全部</span>`;
    data.todoCategories.forEach(c => {
      html += `<span class="chip ${active === c.id ? 'chip-active' : ''}" data-cat="${c.id}" data-has-color="true" style="--chip-color:${c.color}">
        ${c.name}
        <span class="chip-x" data-del-cat="${c.id}" title="删除分类">×</span>
      </span>`;
    });
    wrap.innerHTML = html;
  };

  const renderTodo = () => {
    refreshCategorySelects();
    renderCategoryChips();

    const filter = data.todoFilter || 'all';
    const sort   = data.todoSort   || 'date';
    const cat    = data.todoCatFilter || '';

    // 1. 过滤
    let list = data.todos.slice();
    if (filter === 'pending') list = list.filter(t => !t.done);
    if (filter === 'done')    list = list.filter(t => t.done);
    if (cat)                  list = list.filter(t => (t.categoryId || '') === cat);

    // 2. 排序
    const prioOrder = { high: 0, medium: 1, low: 2 };
    if (sort === 'date') {
      list.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
    } else if (sort === 'created') {
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (sort === 'priority') {
      list.sort((a, b) => (prioOrder[a.priority] ?? 1) - (prioOrder[b.priority] ?? 1));
    } else if (sort === 'name') {
      list.sort((a, b) => (a.text || '').localeCompare(b.text || ''));
    }

    // 3. 统计（始终显示全局）
    const total   = data.todos.length;
    const pending = data.todos.filter(t => !t.done).length;
    const done    = data.todos.filter(t =>  t.done).length;
    const rate    = total ? Math.round(done / total * 100) : 0;
    $('#todoStatTotal').textContent   = total;
    $('#todoStatPending').textContent = pending;
    $('#todoStatDone').textContent    = done;
    $('#todoStatRate').textContent    = rate + '%';
    // 进度条
    const pb = $('#todoProgressBar');
    if (pb) { pb.style.width = rate + '%'; pb.style.background = rate === 100 ? 'var(--success)' : 'var(--accent)'; }

    // 4. 渲染列表
    const ul = $('#todoList');
    ul.innerHTML = '';
    if (!list.length) {
      const emptyMsg = filter === 'done' ? '暂无已完成任务' : (filter === 'pending' ? '暂无待完成任务，太棒了！🎉' : '暂无任务，添加一个吧 ✨');
      const emptyHint = cat ? '（当前分类下）' : '';
      ul.innerHTML = `<div class="todo-empty"><div class="todo-empty-icon">📝</div><div>${emptyMsg}${emptyHint}</div></div>`;
      return;
    }
    list.forEach(t => {
      const cat = data.todoCategories.find(c => c.id === t.categoryId);
      const row = document.createElement('div');
      row.className = 'todo-item prio-' + (t.priority || 'medium') + (t.done ? ' done' : '');
      // 到期提醒
      let dueTip = '';
      if (t.date && !t.done) {
        const today = new Date(); today.setHours(0,0,0,0);
        const due = new Date(t.date);
        const diff = Math.ceil((due - today) / 86400000);
        if (diff < 0) dueTip = '<span class="due-badge overdue">已逾期</span>';
        else if (diff === 0) dueTip = '<span class="due-badge today">今天</span>';
        else if (diff <= 2) dueTip = `<span class="due-badge soon">${diff}天后</span>`;
      }
      row.innerHTML = `
        <input type="checkbox" ${t.done ? 'checked' : ''} data-tid="${t.id}" data-act="toggle" title="标记完成">
        <div class="todo-item-main">
          <div class="todo-item-text" data-tid="${t.id}" data-act="edit">${escapeHtml(t.text)}</div>
          <div class="todo-item-meta">
            <span class="todo-tag prio-${t.priority || 'medium'}">${{high:'🔴 高',medium:'🟡 中',low:'🟢 低'}[t.priority || 'medium']}</span>
            ${cat ? `<span class="todo-tag cat-tag" style="--tag-color:${cat.color}">${escapeHtml(cat.name)}</span>` : ''}
            ${t.date ? `<span class="todo-tag">${dueTip}📅 ${t.date}</span>` : ''}
          </div>
        </div>
        <div class="todo-actions">
          <button class="todo-icon-btn" data-tid="${t.id}" data-act="edit" title="编辑">✏️</button>
          <button class="todo-icon-btn del" data-tid="${t.id}" data-act="del" title="删除">🗑</button>
        </div>
      `;
      ul.appendChild(row);
    });
  };

  // HTML 转义防 XSS
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const bindTodo = () => {
    // 添加任务
    const addOne = () => {
      const input = $('#todoInput');
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      const priority = $('#todoPriorityInput').value;
      const catId    = $('#todoCategoryInput').value;
      const date     = $('#todoDateInput').value || '';
      data.todos.push({ id: todoId(), text: v, done: false, priority, categoryId: catId, date, createdAt: Date.now() });
      input.value = '';
      save(); renderTodo(); renderHome();
      input.focus();
    };
    $('#todoAddBtn').onclick = addOne;
    $('#todoInput').onkeydown = e => { if (e.key === 'Enter') addOne(); };

    // 列表点击（勾选 / 行内编辑 / 删除）
    $('#todoList').onclick = e => {
      const tid = e.target.dataset.tid;
      const act = e.target.dataset.act;
      if (!tid) return;
      const t = data.todos.find(x => x.id === tid);
      if (!t) return;
      if (act === 'toggle') {
        t.done = e.target.checked;
        // 完成动画
        if (t.done) {
          const row = e.target.closest('.todo-item');
          if (row) { row.classList.add('just-checked'); setTimeout(() => row.classList.remove('just-checked'), 300); }
        }
        save(); renderTodo(); renderHome();
      } else if (act === 'del') {
        if (!confirm('确定删除此任务？')) return;
        data.todos = data.todos.filter(x => x.id !== tid);
        save(); renderTodo(); renderHome();
      } else if (act === 'edit') {
        // 行内编辑：把文本替换为 input
        const textEl = e.target.closest('.todo-item-text');
        if (!textEl || textEl.querySelector('input')) return;
        const orig = t.text;
        textEl.innerHTML = `<input type="text" value="${escapeHtml(orig)}" class="todo-inline-edit" data-tid="${tid}">`;
        const inp = textEl.querySelector('input');
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
        const commit = () => {
          const v = inp.value.trim();
          if (v) t.text = v;
          save(); renderTodo(); renderHome();
        };
        inp.onblur = commit;
        inp.onkeydown = ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
          if (ev.key === 'Escape') { inp.value = orig; inp.blur(); }
        };
      }
    };

    // 清除已完成
    $('#clearDoneBtn').onclick = () => {
      const doneCount = data.todos.filter(t => t.done).length;
      if (doneCount === 0) { toast('没有已完成的任务'); return; }
      if (!confirm(`清除 ${doneCount} 个已完成的任务？`)) return;
      data.todos = data.todos.filter(t => !t.done);
      save(); renderTodo(); renderHome();
      toast(`已清除 ${doneCount} 个任务`);
    };

    // 筛选 tabs
    $('#todoFilterTabs').onclick = e => {
      const f = e.target.dataset.filter;
      if (!f) return;
      data.todoFilter = f;
      $('#todoFilterTabs').querySelectorAll('.tab').forEach(b => b.classList.toggle('tab-active', b === e.target));
      renderTodo();
    };

    // 分类筛选 / 排序
    $('#todoCategoryFilter').onchange = e => { data.todoCatFilter = e.target.value; renderTodo(); };
    $('#todoSort').onchange           = e => { data.todoSort     = e.target.value; renderTodo(); };

    // 分类 chips 点击
    $('#categoryChips').onclick = e => {
      // 删除分类
      if (e.target.dataset.delCat) {
        const cid = e.target.dataset.delCat;
        const cat = data.todoCategories.find(c => c.id === cid);
        if (!cat) return;
        const used = data.todos.some(t => t.categoryId === cid);
        const msg = used
          ? `分类「${cat.name}」下还有任务，删除后这些任务将变为默认分类。继续？`
          : `确定删除分类「${cat.name}」？`;
        if (!confirm(msg)) return;
        data.todoCategories = data.todoCategories.filter(c => c.id !== cid);
        data.todos.forEach(t => { if (t.categoryId === cid) t.categoryId = ''; });
        if (data.todoCatFilter === cid) data.todoCatFilter = '';
        save(); renderTodo();
        return;
      }
      // 选中分类
      const chip = e.target.closest('.chip');
      if (!chip) return;
      data.todoCatFilter = chip.dataset.cat || '';
      save(); renderTodo();
    };

    // 添加新分类
    $('#addCategoryBtn').onclick = () => {
      const nameEl = $('#newCategoryName');
      const colorEl = $('#newCategoryColor');
      const name = nameEl.value.trim();
      if (!name) { nameEl.focus(); return; }
      const color = colorEl.value || '#c9a35a';
      const id = 'c_' + Date.now().toString(36);
      data.todoCategories.push({ id, name, color });
      nameEl.value = '';
      save(); renderTodo();
    };
    $('#newCategoryName').onkeydown = e => { if (e.key === 'Enter') $('#addCategoryBtn').click(); };
  };

  /* ---------- 运动 ---------- */
  const renderSport = () => {
    const day = getDay();
    // 周条
    const strip = $('#weekStrip');
    strip.innerHTML = '';
    const weekStart = new Date(currentDate);
    weekStart.setDate(currentDate.getDate() - currentDate.getDay());
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const btn = document.createElement('button');
      btn.className = 'week-day' + (fmtDate(d) === fmtDate(currentDate) ? ' active' : '');
      btn.innerHTML = `<div class="wd-name">${['日','一','二','三','四','五','六'][i]}</div><div class="wd-date">${d.getDate()}</div>`;
      btn.onclick = () => { currentDate = d; renderCalendar(); renderSport(); };
      strip.appendChild(btn);
    }

    // 计划
    const type = day.sport.type || (currentDate.getDay() === 0 || currentDate.getDay() === 6 ? 'rest' : 'chest');
    $('#dayTypeSelect').value = type;
    const names = { chest: '胸肩日', back: '练背日', leg: '臀腿日', pratice: '普拉提', rest: '休息日' };
    $('#todayPlanName').textContent = names[type] || type;
    const el = $('#exerciseList');
    el.innerHTML = '';
    const plan = defaultPlans[type] || [];
    plan.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'exercise-item';
      row.innerHTML = `
        <input type="checkbox" data-idx="${i}" ${day.sport.exercises && day.sport.exercises[i] ? 'checked' : ''}>
        <div class="exercise-info">
          <div>${p.name}</div>
          <small>${p.sets} · ${p.duration}min</small>
        </div>
      `;
      el.appendChild(row);
    });
    if (!plan.length) el.innerHTML = '<p class="muted" style="text-align:center;">今天是休息日，好好放松～</p>';

    // 数据统计
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`;
    let days = 0, minutes = 0;
    Object.entries(data.dates).forEach(([k, d]) => {
      if (k.startsWith(monthKey) && d.sport && d.sport.records) {
        const m = d.sport.records.reduce((a, b) => a + Number(b.duration || 0), 0);
        if (m > 0) { days++; minutes += m; }
      }
    });
    $('#sportDays').textContent = days;
    $('#sportMinutes').textContent = minutes;

    // 体重图表
    drawLineChart($('#weightChart'), data.global.weightHistory.map(w => w.weight),
      data.global.weightHistory.map(w => w.date.slice(5)));
  };

  // 运动计时器
  let timerInterval = null, timerSec = 0, timerRunning = false;
  const updateTimerDisplay = () => {
    const m = String(Math.floor(timerSec / 60)).padStart(2, '0');
    const s = String(timerSec % 60).padStart(2, '0');
    $('#timerDisplay').textContent = `${m}:${s}`;
  };
  const bindSport = () => {
    $('#dayTypeSelect').onchange = e => {
      getDay().sport.type = e.target.value;
      save(); renderSport();
    };
    $('#exerciseList').onchange = e => {
      if (e.target.tagName !== 'INPUT') return;
      const day = getDay();
      if (!day.sport.exercises) day.sport.exercises = [];
      day.sport.exercises[e.target.dataset.idx] = e.target.checked;
      save();
    };
    $('#timerStart').onclick = () => {
      if (timerRunning) return;
      timerRunning = true;
      timerInterval = setInterval(() => { timerSec++; updateTimerDisplay(); }, 1000);
    };
    $('#timerPause').onclick = () => {
      timerRunning = false;
      clearInterval(timerInterval);
    };
    $('#timerReset').onclick = () => {
      timerRunning = false;
      clearInterval(timerInterval);
      timerSec = 0;
      updateTimerDisplay();
    };
    $('#addCustomExercise').onclick = () => {
      const name = $('#todayExerciseName').value.trim();
      const sets = $('#todayExerciseSets').value.trim();
      const dur = Number($('#todayExerciseDuration').value) || 0;
      if (!name) return toast('请输入动作名称');
      getDay().sport.records.push({ name, sets, duration: dur, time: Date.now() });
      $('#todayExerciseName').value = '';
      $('#todayExerciseSets').value = '';
      $('#todayExerciseDuration').value = '';
      save(); renderSport(); renderHome();
      toast('已添加训练记录');
    };
    $('#punchBtn').onclick = () => {
      getDay().sport.records.push({ name: '本次打卡', duration: Math.floor(timerSec / 60), time: Date.now(), punched: true });
      save();
      $('#punchFeedback').style.display = 'block';
      setTimeout(() => $('#punchFeedback').style.display = 'none', 2500);
      renderSport(); renderHome();
    };
    $('#photoUpload').onclick = () => $('#photoFile').click();
    $('#photoFile').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        if (!getDay().sport.photos) getDay().sport.photos = [];
        getDay().sport.photos.push(ev.target.result);
        save(); showPhotos();
      };
      reader.readAsDataURL(file);
    };
    $('#weightSave').onclick = () => {
      const w = parseFloat($('#weightInput').value);
      const latest = parseFloat($('#latestWeight').value);
      if (!isNaN(w)) {
        data.global.weightHistory.push({ date: fmtDate(currentDate), weight: w });
        $('#weightInput').value = '';
      }
      if (!isNaN(latest)) {
        data.global.weightHistory.push({ date: fmtDate(currentDate), weight: latest });
        $('#latestWeight').value = '';
      }
      save(); renderSport();
      toast('体重已记录');
    };
  };
  const showPhotos = () => {
    const box = $('#photoPreview');
    box.innerHTML = '';
    (getDay().sport.photos || []).forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      box.appendChild(img);
    });
  };

  /* ---------- 记账 ---------- */
  const renderFinance = () => {
    const day = getDay();
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`;
    let income = 0, expense = 0;
    Object.entries(data.dates).forEach(([k, d]) => {
      if (k.startsWith(monthKey) && d.finance) {
        d.finance.records.forEach(r => r.type === 'income' ? income += r.amount : expense += r.amount);
      }
    });
    $('#monthIncome').textContent = '¥' + income.toLocaleString();
    $('#monthExpense').textContent = '¥' + expense.toLocaleString();
    $('#monthBalance').textContent = '¥' + (income - expense).toLocaleString();
    const totalIncome = Object.values(data.dates).reduce((sum, d) => sum + (d.finance.records || []).reduce((a, r) => a + (r.type === 'income' ? r.amount : 0), 0), 0);
    const totalExpense = Object.values(data.dates).reduce((sum, d) => sum + (d.finance.records || []).reduce((a, r) => a + (r.type === 'expense' ? r.amount : 0), 0), 0);
    $('#totalSaving').textContent = '¥' + (totalIncome - totalExpense).toLocaleString();

    const list = $('#recordList');
    list.innerHTML = '';
    const all = [];
    Object.entries(data.dates).forEach(([k, d]) => {
      (d.finance.records || []).forEach(r => all.push({ ...r, date: k }));
    });
    all.sort((a, b) => b.date.localeCompare(a.date) || b.time - a.time);
    all.forEach(r => {
      const row = document.createElement('div');
      row.className = 'record-item';
      row.innerHTML = `
        <div class="record-main">
          <div class="r-title">${r.purpose}</div>
          <div class="r-date">${r.date}</div>
        </div>
        <div class="record-amount ${r.type}">${r.type === 'income' ? '+' : '-'}¥${r.amount}</div>
      `;
      list.appendChild(row);
    });
  };
  const bindFinance = () => {
    let rtype = 'expense';
    $$('.rf-type').forEach(b => b.onclick = () => {
      $$('.rf-type').forEach(x => x.classList.remove('seg-active'));
      b.classList.add('seg-active');
      rtype = b.dataset.type;
    });
    $('#recordAdd').onclick = () => {
      const amount = parseFloat($('#recordAmount').value);
      const purpose = $('#recordPurpose').value.trim();
      if (!amount || !purpose) return toast('请输入金额和用途');
      getDay().finance.records.push({ type: rtype, amount, purpose, time: Date.now() });
      $('#recordAmount').value = '';
      $('#recordPurpose').value = '';
      save(); renderFinance(); renderHome();
      toast('已记录');
    };
  };

  /* ---------- 账号 ---------- */
  let currentAccount = 'pet';
  const renderAccount = () => {
    const day = getDay();
    if (!day.account) day.account = emptyDay().account;
    const acc = day.account;
    acc.current = currentAccount;

    // 标签
    $$('.atab').forEach(b => b.classList.toggle('atab-active', b.dataset.account === currentAccount));

    // 知识库
    const kbList = $('#kbList');
    kbList.innerHTML = '';
    const kbs = acc.kb[currentAccount] || [];
    kbs.forEach((k, idx) => {
      const row = document.createElement('div');
      row.className = 'kb-item';
      row.innerHTML = `<span>${k.name}</span><button class="link-more" data-kb="${idx}">查看</button>`;
      kbList.appendChild(row);
    });
    if (!kbs.length) kbList.innerHTML = '<p class="muted" style="text-align:center;">暂无知识库，点击上方 + 添加</p>';

    // 选题
    const tlist = $('#topicList');
    tlist.innerHTML = '';
    const topics = acc.topics.filter(t => t.account === currentAccount);
    topics.forEach((t, idx) => {
      const row = document.createElement('div');
      row.className = 'topic-item';
      row.innerHTML = `
        <div class="topic-head">
          <span style="font-weight:600;">${t.title}</span>
          <span class="topic-status">${t.status}</span>
        </div>
        <div class="ex-item" style="background:transparent;padding:0;">
          <p style="margin:0;color:var(--text-secondary);font-size:13px;">${t.script || '暂无脚本'}</p>
        </div>
        <div class="btn-row" style="justify-content:flex-end;gap:6px;">
          <button class="btn btn-ghost btn-sm topic-ai" data-idx="${idx}" style="padding:4px 10px;font-size:12px;">💡 AI生成脚本</button>
          <button class="btn btn-ghost btn-sm topic-del" data-idx="${idx}" style="padding:4px 10px;font-size:12px;color:var(--danger);">删除</button>
        </div>
      `;
      tlist.appendChild(row);
    });

    // 发布日历
    $('#pubMonth').textContent = fmtYM(currentDate);
    const pContainer = $('#pubCalendarDays');
    pContainer.innerHTML = '';
    const year = currentDate.getFullYear(), month = currentDate.getMonth();
    const first = new Date(year, month, 1), days = new Date(year, month+1, 0).getDate(), start = first.getDay();
    const prevDays = new Date(year, month, 0).getDate();
    for (let i = start - 1; i >= 0; i--) {
      const b = document.createElement('div'); b.className = 'cal-day other'; b.textContent = prevDays - i; pContainer.appendChild(b);
    }
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month, d);
      const key = fmtDate(date);
      const pubs = [];
      Object.values(data.dates).forEach(x => {
        (x.account.publish || []).filter(p => p.account === currentAccount && p.date === key).forEach(p => pubs.push(p));
      });
      const b = document.createElement('button');
      b.className = 'cal-day' + (fmtDate(date) === fmtDate(currentDate) ? ' active' : '');
      b.innerHTML = `<span>${d}</span>${pubs.length ? '<span class="cal-dot"></span>' : ''}`;
      b.onclick = () => { currentDate = date; renderCalendar(); renderAccount(); };
      pContainer.appendChild(b);
    }
    const remain = (7 - ((start + days) % 7)) % 7;
    for (let i = 1; i <= remain; i++) { const b = document.createElement('div'); b.className = 'cal-day other'; b.textContent = i; pContainer.appendChild(b); }

    const pdl = $('#pubDayList');
    pdl.innerHTML = '';
    const todayPubs = acc.publish.filter(p => p.date === fmtDate(currentDate));
    todayPubs.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'pub-item' + (p.type === '广告' ? ' ad' : '');
      row.innerHTML = `<span>${p.content}</span><span class="link-more pub-del" data-idx="${idx}">删除</span>`;
      pdl.appendChild(row);
    });
    if (!todayPubs.length) pdl.innerHTML = '<p class="muted" style="text-align:center;">当天暂无发布计划</p>';

    // 数据图表
    drawLineChart($('#fansChart'), data.global.fanHistory.map(f => f.fans), data.global.fanHistory.map(f => f.month));
  };
  const bindAccount = () => {
    $$('.atab').forEach(b => b.onclick = () => { currentAccount = b.dataset.account; renderAccount(); });
    let kbIndex = -1;
    $('#addKbBtn').onclick = () => {
      kbIndex = -1;
      $('#kbCard').style.display = 'block';
      $('#kbName').value = '';
      $('#kbLink').value = '';
      $('#kbContent').value = '';
      $('#kbResult').innerHTML = '';
    };
    $('#kbList').onclick = e => {
      const idx = e.target.dataset.kb;
      if (idx == null) return;
      kbIndex = Number(idx);
      const kbs = getDay().account.kb[currentAccount] || [];
      const k = kbs[kbIndex];
      $('#kbName').value = k.name;
      $('#kbLink').value = k.link || '';
      $('#kbContent').value = k.content || '';
      $('#kbResult').innerHTML = k.result || '';
      $('#kbCard').style.display = 'block';
    };
    $('#kbAnalyze').onclick = () => {
      const link = $('#kbLink').value.trim();
      const content = $('#kbContent').value.trim();
      let res = '';
      if (link) res = `正在深度解析链接…<br>✅ 已识别账号特征<br>✅ 提取可复用创作模式<br>✅ 专属选题库已生成`;
      else if (content) res = `正在分析内容…<br>✅ 主题定位完成<br>✅ 风格标签提取完成<br>✅ 可复用文案结构已整理`;
      else res = '请先粘贴链接或输入内容';
      $('#kbResult').innerHTML = res;
      toast('分析完成');
    };
    $('#kbChat').onclick = () => {
      const ask = $('#kbAsk').value.trim();
      if (!ask) return toast('请输入问题');
      $('#kbResult').innerHTML = `AI助手：基于「${currentAccount}」知识库分析，<br>建议关注 ${['萌宠互动','好物测评','带货转化'][['pet','good','ecom'].indexOf(currentAccount)]} 方向。`;
      $('#kbAsk').value = '';
    };
    $('#kbSave').onclick = () => {
      const kbs = getDay().account.kb[currentAccount] || [];
      const obj = {
        name: $('#kbName').value.trim() || '未命名知识库',
        link: $('#kbLink').value.trim(),
        content: $('#kbContent').value.trim(),
        result: $('#kbResult').innerHTML
      };
      if (kbIndex >= 0) kbs[kbIndex] = obj; else kbs.push(obj);
      getDay().account.kb[currentAccount] = kbs;
      save(); renderAccount(); $('#kbCard').style.display = 'none';
      toast('知识库已保存');
    };
    $('#kbDelete').onclick = () => {
      if (kbIndex >= 0) {
        getDay().account.kb[currentAccount].splice(kbIndex, 1);
        save(); renderAccount(); $('#kbCard').style.display = 'none';
      }
    };
    $('#kbClose').onclick = () => $('#kbCard').style.display = 'none';
    $('#topicAdd').onclick = () => {
      const title = $('#topicInput').value.trim();
      if (!title) return toast('请输入选题');
      getDay().account.topics.push({ title, status: $('#topicStatus').value, account: currentAccount, time: Date.now() });
      $('#topicInput').value = '';
      save(); renderAccount(); renderHome();
      toast('选题已添加');
    };
    $('#topicAi').onclick = () => {
      const title = $('#topicInput').value.trim();
      if (!title) return toast('请先输入选题');
      getDay().account.topics.push({ title, status: '待发布', account: currentAccount, script: 'AI建议脚本：用生活化场景引入，强调真实体验，结尾引导互动。', time: Date.now() });
      $('#topicInput').value = '';
      save(); renderAccount(); renderHome();
      toast('AI选题已生成');
    };
    $('#topicList').onclick = e => {
      const idx = e.target.dataset.idx;
      if (idx == null) return;
      const topics = getDay().account.topics.filter(t => t.account === currentAccount);
      if (e.target.classList.contains('topic-ai')) {
        topics[idx].script = 'AI生成脚本：开头痛点共鸣 + 中段产品亮点 + 结尾CTA引导。';
      } else if (e.target.classList.contains('topic-del')) {
        const t = topics[idx];
        getDay().account.topics = getDay().account.topics.filter(x => x !== t);
      }
      save(); renderAccount();
    };
    $('#pubAdd').onclick = () => {
      const content = $('#pubContent').value.trim();
      if (!content) return toast('请输入发布内容');
      getDay().account.publish.push({ content, type: $('#pubType').value, account: currentAccount, date: fmtDate(currentDate), time: Date.now() });
      $('#pubContent').value = '';
      save(); renderAccount(); renderHome();
      toast('发布计划已添加');
    };
    $('#pubDayList').onclick = e => {
      if (!e.target.classList.contains('pub-del')) return;
      const idx = Number(e.target.dataset.idx);
      getDay().account.publish.splice(idx, 1);
      save(); renderAccount();
    };
    $('#fansRecord').onclick = () => {
      const f = Number($('#fansInput').value);
      if (!f) return toast('请输入粉丝数');
      const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`;
      const existing = data.global.fanHistory.find(x => x.month === month);
      if (existing) existing.fans = f; else data.global.fanHistory.push({ month, fans: f });
      data.global.fanHistory.sort((a, b) => a.month.localeCompare(b.month));
      $('#fansInput').value = '';
      save(); renderAccount();
      toast('粉丝数已记录');
    };
    $('#moneySave').onclick = () => {
      getDay().account.money.ad = Number($('#moneyAd').value) || 0;
      getDay().account.money.other = Number($('#moneyOther').value) || 0;
      save(); toast('变现数据已保存');
    };
  };

  /* ---------- 摘录本 ---------- */
  const renderExcerpt = () => {
    ['copy', 'read', 'pod'].forEach(type => {
      const list = $(`#ex${type.charAt(0).toUpperCase() + type.slice(1)}List`);
      list.innerHTML = '';
      const all = [];
      Object.entries(data.dates).forEach(([k, d]) => {
        (d.excerpt[type] || []).forEach(x => all.push({ ...x, date: k }));
      });
      all.sort((a, b) => b.time - a.time);
      all.forEach((x, idx) => {
        const row = document.createElement('div');
        row.className = 'ex-item';
        row.innerHTML = `
          <div class="ex-date">${x.date}</div>
          <p>${x.content.replace(/\n/g, '<br>')}</p>
          <div class="ex-source">— ${x.source || '未知来源'}</div>
          <button class="ex-del" data-type="${type}" data-idx="${idx}">删除</button>
        `;
        list.appendChild(row);
      });
    });
  };
  const bindExcerpt = () => {
    const saveEx = (type) => {
      const content = $(`#ex${type.charAt(0).toUpperCase() + type.slice(1)}Content`).value.trim();
      const source = $(`#ex${type.charAt(0).toUpperCase() + type.slice(1)}Source`).value.trim();
      if (!content) return toast('请输入内容');
      if (!getDay().excerpt[type]) getDay().excerpt[type] = [];
      getDay().excerpt[type].push({ content, source, time: Date.now() });
      $(`#ex${type.charAt(0).toUpperCase() + type.slice(1)}Content`).value = '';
      $(`#ex${type.charAt(0).toUpperCase() + type.slice(1)}Source`).value = '';
      save(); renderExcerpt(); renderHome();
      toast('已保存');
    };
    $('#exCopySave').onclick = () => saveEx('copy');
    $('#exReadSave').onclick = () => saveEx('read');
    $('#exPodSave').onclick = () => saveEx('pod');
    $$('.ex-list').forEach(el => el.onclick = e => {
      if (!e.target.classList.contains('ex-del')) return;
      // 简化删除：只删当天
      const type = e.target.dataset.type;
      const idx = Number(e.target.dataset.idx);
      getDay().excerpt[type].splice(idx, 1);
      save(); renderExcerpt(); renderHome();
    });
  };

  /* ---------- 可拖动浮动按钮 ---------- */
  const makeDraggable = (el) => {
    if (!el) return;
    let isDragging = false;
    let startX, startY, startRight, startBottom;

    const onDown = (e) => {
      e.preventDefault();
      isDragging = true;
      el.style.cursor = 'grabbing';
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startX = clientX;
      startY = clientY;
      const style = window.getComputedStyle(el);
      startRight = parseInt(style.right) || 0;
      startBottom = parseInt(style.bottom) || 0;
      const evt = e.touches ? 'touch' : 'mouse';
      document.addEventListener(evt + 'move', getMoveHandler(), { passive: false });
      document.addEventListener(evt + 'up', getUpHandler());
    };

    const getMoveHandler = () => (e) => {
      if (!isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      moveTo(clientX, clientY);
    };

    const getUpHandler = () => () => {
      isDragging = false;
      el.style.cursor = 'grab';
    };

    const moveTo = (clientX, clientY) => {
      const deltaX = startX - clientX;
      const deltaY = startY - clientY;
      let newRight = startRight + deltaX;
      let newBottom = startBottom + deltaY;
      const maxRight = window.innerWidth - el.offsetWidth;
      const maxBottom = window.innerHeight - el.offsetHeight;
      newRight = Math.max(0, Math.min(newRight, maxRight));
      newBottom = Math.max(0, Math.min(newBottom, maxBottom));
      el.style.right = newRight + 'px';
      el.style.bottom = newBottom + 'px';
      el.style.left = 'auto';
      el.style.top = 'auto';
    };

    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: true });
    el.style.cursor = 'grab';
    el.style.userSelect = 'none';
  };

  /* ---------- 视频高清 ---------- */
  let _videoEnhanceSourceUrl = null;
  let _videoEnhanceResultUrl = null;
  const bindVideoEnhance = () => {
    const fileInput = $('#videoEnhanceFile');
    const uploadBtn = $('#videoEnhanceUploadBtn');
    const preview = $('#videoEnhancePreview');
    const source = $('#videoEnhanceSource');
    const info = $('#videoEnhanceInfo');
    const optsCard = $('#videoEnhanceOptsCard');
    const qualitySelect = $('#videoEnhanceQuality');
    const processBtn = $('#videoEnhanceProcessBtn');
    const resultCard = $('#videoEnhanceResultCard');
    const result = $('#videoEnhanceResult');
    const status = $('#videoEnhanceStatus');
    const downloadBtn = $('#videoEnhanceDownloadBtn');
    const resetBtn = $('#videoEnhanceResetBtn');

    const clearUrl = key => {
      if (key === 'source' && _videoEnhanceSourceUrl) URL.revokeObjectURL(_videoEnhanceSourceUrl);
      if (key === 'result' && _videoEnhanceResultUrl) URL.revokeObjectURL(_videoEnhanceResultUrl);
      if (key === 'source') _videoEnhanceSourceUrl = null;
      if (key === 'result') _videoEnhanceResultUrl = null;
    };

    const formatBytes = bytes => {
      if (!bytes) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
      return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + ' ' + units[index];
    };

    const getTargetSize = (video, targetHeight) => {
      const width = video.videoWidth || 16;
      const height = video.videoHeight || 9;
      const targetWidth = Math.max(2, Math.round(width * targetHeight / height / 2) * 2);
      return { width: targetWidth, height: targetHeight };
    };

    const getSupportedMime = () => {
      const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      return types.find(type => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || '';
    };

    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = event => {
      const file = event.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('video/')) return toast('请选择视频文件');
      clearUrl('source');
      clearUrl('result');
      _videoEnhanceSourceUrl = URL.createObjectURL(file);
      source.src = _videoEnhanceSourceUrl;
      source.load();
      preview.style.display = 'block';
      optsCard.style.display = 'block';
      resultCard.style.display = 'none';
      info.textContent = file.name + ' · ' + formatBytes(file.size);
      status.textContent = '';
    };

    processBtn.onclick = async () => {
      if (!source.src || !source.videoWidth) return toast('请先上传视频并等待视频信息加载');
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return toast('当前浏览器不支持视频处理');
      const mimeType = getSupportedMime();
      if (!mimeType) return toast('当前浏览器不支持视频编码');
      processBtn.disabled = true;
      resultCard.style.display = 'block';
      resultCard.classList.add('video-enhance-processing');
      status.textContent = '正在处理，请保持页面打开...';
      let recorder;
      let frameRequestId = 0;
      let frameTimer = 0;
      let stopTimer = 0;
      let canvasStream;
      let mediaStream;
      let stopped = false;
      try {
        const target = getTargetSize(source, Number(qualitySelect.value));
        const canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        const trackFps = 30;
        canvasStream = canvas.captureStream(trackFps);
        const canvasTrack = canvasStream.getVideoTracks()[0];
        const sourceStream = typeof source.captureStream === 'function' ? source.captureStream() : null;
        const audioTracks = sourceStream ? sourceStream.getAudioTracks() : [];
        mediaStream = new MediaStream([canvasTrack, ...audioTracks]);
        recorder = new MediaRecorder(mediaStream, {
          mimeType,
          videoBitsPerSecond: Number(qualitySelect.value) >= 2160 ? 16000000 : 8000000
        });
        const chunks = [];
        let rejectDone;
        const done = new Promise((resolve, reject) => {
          rejectDone = reject;
          recorder.ondataavailable = event => event.data.size && chunks.push(event.data);
          recorder.onerror = () => reject(new Error('视频编码失败'));
          recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        });
        const stopRecording = () => {
          if (stopped) return;
          stopped = true;
          if (stopTimer) clearTimeout(stopTimer);
          if (frameRequestId && typeof source.cancelVideoFrameCallback === 'function') {
            source.cancelVideoFrameCallback(frameRequestId);
          }
          if (frameTimer) clearTimeout(frameTimer);
          if (recorder && recorder.state === 'recording') {
            recorder.requestData();
            recorder.stop();
          }
        };
        const failProcessing = () => {
          if (stopped) return;
          stopped = true;
          if (stopTimer) clearTimeout(stopTimer);
          if (frameRequestId && typeof source.cancelVideoFrameCallback === 'function') {
            source.cancelVideoFrameCallback(frameRequestId);
          }
          rejectDone(new Error('视频读取失败'));
          if (recorder && recorder.state === 'recording') recorder.stop();
        };
        const drawFrame = () => {
          if (stopped || recorder.state !== 'recording' || source.readyState < 2) return;
          ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
          if (typeof canvasTrack.requestFrame === 'function') canvasTrack.requestFrame();
        };
        const scheduleFrame = () => {
          if (stopped) return;
          if (typeof source.requestVideoFrameCallback === 'function') {
            frameRequestId = source.requestVideoFrameCallback(() => {
              drawFrame();
              scheduleFrame();
            });
          } else {
            drawFrame();
            frameTimer = window.setTimeout(scheduleFrame, 1000 / trackFps);
          }
        };
        source.addEventListener('ended', stopRecording, { once: true });
        source.addEventListener('error', failProcessing, { once: true });
        source.addEventListener('stalled', () => {
          status.textContent = '视频读取暂时停滞，正在等待数据...';
        }, { once: true });
        source.pause();
        source.currentTime = 0;
        recorder.start(1000);
        const duration = Number.isFinite(source.duration) && source.duration > 0 ? source.duration : 0;
        stopTimer = window.setTimeout(() => {
          if (!stopped) stopRecording();
        }, Math.max(30000, (duration + 5) * 1000));
        try {
          await source.play();
        } catch (error) {
          rejectDone(error);
          stopRecording();
          throw error;
        }
        scheduleFrame();
        const blob = await Promise.race([
          done,
          new Promise((_, reject) => window.setTimeout(() => reject(new Error('视频编码超时，请尝试较短视频或降低输出画质')), 120000))
        ]);
        source.pause();
        if (!blob.size) throw new Error('未生成有效视频');
        clearUrl('result');
        _videoEnhanceResultUrl = URL.createObjectURL(blob);
        result.src = _videoEnhanceResultUrl;
        result.load();
        status.textContent = '处理完成：' + target.width + ' × ' + target.height + ' · ' + formatBytes(blob.size);
        toast('视频高清处理完成');
      } catch (error) {
        console.error(error);
        status.textContent = '处理失败：' + error.message;
        toast('处理失败：' + error.message);
      } finally {
        if (frameRequestId && typeof source.cancelVideoFrameCallback === 'function') {
          source.cancelVideoFrameCallback(frameRequestId);
        }
        if (frameTimer) clearTimeout(frameTimer);
        if (stopTimer) clearTimeout(stopTimer);
        if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
        if (canvasStream) canvasStream.getTracks().forEach(track => track.stop());
        source.pause();
        processBtn.disabled = false;
        resultCard.classList.remove('video-enhance-processing');
      }
    };

    downloadBtn.onclick = () => {
      if (!_videoEnhanceResultUrl) return toast('请先完成视频处理');
      const link = document.createElement('a');
      link.download = '高清视频_' + Date.now() + '.webm';
      link.href = _videoEnhanceResultUrl;
      link.click();
    };

    resetBtn.onclick = () => {
      clearUrl('source');
      clearUrl('result');
      fileInput.value = '';
      source.removeAttribute('src');
      result.removeAttribute('src');
      preview.style.display = 'none';
      optsCard.style.display = 'none';
      resultCard.style.display = 'none';
      status.textContent = '';
    };
  };

  /* ---------- 已移除的图片提取线稿 ---------- */
  const bindLineart = () => {
    const fileInput = $('#lineartFile');
    const uploadBtn = $('#lineartUploadBtn');
    const preview = $('#lineartPreview');
    const originImg = $('#lineartOriginImg');
    const optsCard = $('#lineartOptsCard');
    const resultCard = $('#lineartResultCard');
    const canvas = $('#lineartCanvas');
    const processBtn = $('#lineartProcessBtn');
    const downloadBtn = $('#lineartDownloadBtn');
    const resetBtn = $('#lineartResetBtn');
    const thickInp = $('#lineartThickness');
    const contrInp = $('#lineartContrast');
    const bgSelect = $('#lineartBg');

    // 参数显示
    thickInp.oninput = () => $('#lineartThicknessVal').textContent = thickInp.value;
    contrInp.oninput = () => $('#lineartContrastVal').textContent = contrInp.value;

    // 选择图片
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          _lineartImg = img;
          originImg.src = ev.target.result;
          preview.style.display = 'flex';
          optsCard.style.display = 'block';
          resultCard.style.display = 'none';
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(f);
    };

    // 提取线稿
    processBtn.onclick = () => {
      if (!_lineartImg) return toast('请先上传图片');
      const thickness = Number(thickInp.value);
      const contrast = Number(contrInp.value);
      const bg = bgSelect.value;
      resultCard.style.display = 'block';
      resultCard.classList.add('lineart-processing');
      setTimeout(() => {
        try {
          extractLineart(canvas, _lineartImg, thickness, contrast, bg);
          resultCard.classList.remove('lineart-processing');
          toast('线稿提取完成');
        } catch (err) {
          console.error(err);
          resultCard.classList.remove('lineart-processing');
          toast('处理失败：' + err.message);
        }
      }, 50);
    };

    // 下载（兼容移动端）
    downloadBtn.onclick = () => {
      if (!canvas.width) return toast('请先生成线稿');
      try {
        const dataURL = canvas.toDataURL('image/png');
        // 移动端兼容：在新窗口打开图片，用户长按保存
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
          const win = window.open('');
          if (win) {
            win.document.write('<img src="' + dataURL + '" style="max-width:100%;" /><p style="text-align:center;font-size:14px;color:#666;">长按图片保存</p>');
          } else {
            // 弹窗被阻止时用 iframe 方式
            const a = document.createElement('a');
            a.href = dataURL;
            a.target = '_blank';
            a.click();
          }
        } else {
          const link = document.createElement('a');
          link.download = '线稿_' + Date.now() + '.png';
          link.href = dataURL;
          link.click();
        }
        toast('已下载');
      } catch (err) {
        toast('下载失败：' + err.message);
      }
    };

    // 重新上传
    resetBtn.onclick = () => {
      _lineartImg = null;
      fileInput.value = '';
      preview.style.display = 'none';
      optsCard.style.display = 'none';
      resultCard.style.display = 'none';
      canvas.width = 0; canvas.height = 0;
    };
  };

  // 线稿提取算法：灰度 → 反相模糊 → 颜色减淡混合
  // Sobel 边缘检测线稿提取
  const extractLineart = (canvas, img, thickness, contrast, bg) => {
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;

    // 限制最大尺寸（最长边不超过1200px）
    const MAX_SIZE = 1200;
    if (w > MAX_SIZE || h > MAX_SIZE) {
      const s = MAX_SIZE / Math.max(w, h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const len = w * h;

    // 1. 转灰度到数组
    const gray = new Float32Array(len);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }

    // 2. 高斯模糊（降噪，半径可调）
    const blurRadius = Math.max(1, thickness);
    const blurred = new Float32Array(gray);
    gaussianBlurFloat(blurred, w, h, blurRadius);

    // 3. Sobel 边缘检测
    const edges = new Float32Array(len);
    let maxGrad = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        // Sobel X: [-1,0,1; -2,0,2; -1,0,1]
        const gx = (-blurred[(y-1)*w+(x-1)] + blurred[(y-1)*w+(x+1)]
                     -2*blurred[y*w+(x-1)] + 2*blurred[y*w+(x+1)]
                     -blurred[(y+1)*w+(x-1)] + blurred[(y+1)*w+(x+1)]);
        // Sobel Y: [-1,-2,-1; 0,0,0; 1,2,1]
        const gy = (-blurred[(y-1)*w+(x-1)] - 2*blurred[(y-1)*w+x] - blurred[(y-1)*w+(x+1)]
                     +blurred[(y+1)*w+(x-1)] + 2*blurred[(y+1)*w+x] + blurred[(y+1)*w+(x+1)]);
        const mag = Math.sqrt(gx * gx + gy * gy);
        edges[idx] = mag;
        if (mag > maxGrad) maxGrad = mag;
      }
    }

    // 4. 归一化 + 对比度增强
    const factor = maxGrad > 0 ? 255 / maxGrad : 1;
    const contrastFactor = 1 + (contrast - 1) * 0.18;
    for (let i = 0; i < len; i++) {
      let v = edges[i] * factor;
      v = ((v / 255 - 0.5) * contrastFactor + 0.5) * 255;
      edges[i] = Math.max(0, Math.min(255, v));
    }

    // 5. 自适应阈值：降低门槛，保留浅色细线
    let threshold = otsuThreshold(edges);
    threshold = Math.max(10, threshold * 0.58);
    const edgeRange = Math.max(18, threshold * 0.7);

    // 6. 边缘膨胀（使线条更粗更连续）
    const dilated = new Float32Array(edges);
    const dilateRadius = Math.max(1, thickness - 1);
    if (dilateRadius >= 1) {
      for (let y = dilateRadius; y < h - dilateRadius; y++) {
        for (let x = dilateRadius; x < w - dilateRadius; x++) {
          const idx = y * w + x;
          if (edges[idx] > threshold) {
            for (let dy = -dilateRadius; dy <= dilateRadius; dy++) {
              for (let dx = -dilateRadius; dx <= dilateRadius; dx++) {
                const nIdx = (y + dy) * w + (x + dx);
                if (edges[nIdx] > threshold * 0.5) {
                  dilated[nIdx] = Math.max(dilated[nIdx], edges[idx] * 0.8);
                }
              }
            }
          }
        }
      }
    }

    // 7. 输出到 canvas
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const edgeVal = dilated[p];
      const edgeStrength = Math.max(0, Math.min(1, (edgeVal - threshold + edgeRange) / edgeRange));
      const isEdge = edgeVal > threshold;

      if (bg === 'transparent') {
        data[i] = 0; data[i+1] = 0; data[i+2] = 0;
        data[i+3] = Math.round(edgeStrength * 255);
      } else if (bg === 'black') {
        const value = Math.round(255 * edgeStrength);
        data[i] = value; data[i+1] = value; data[i+2] = value; data[i+3] = 255;
      } else {
        // 白底黑线，边缘采用抗锯齿灰度过渡
        const value = Math.round(255 * (1 - edgeStrength));
        data[i] = value; data[i+1] = value; data[i+2] = value; data[i+3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  // Otsu 自适应阈值
  const otsuThreshold = (values) => {
    const hist = new Array(256).fill(0);
    const len = values.length;
    for (let i = 0; i < len; i++) {
      hist[Math.min(255, Math.max(0, Math.round(values[i])))]++;
    }
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, wF = 0;
    let maxVar = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = len - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      if (varBetween > maxVar) {
        maxVar = varBetween;
        threshold = t;
      }
    }
    return threshold;
  };

  // 高斯模糊（Float32Array 版本）
  const gaussianBlurFloat = (data, w, h, radius) => {
    if (radius < 1) return;
    const r = Math.min(radius, 10);
    const sigma = r / 2;
    const kernel = [];
    let sum = 0;
    for (let x = -r; x <= r; x++) {
      const g = Math.exp(-(x * x) / (2 * sigma * sigma));
      kernel.push(g);
      sum += g;
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

    const temp = new Float32Array(data);
    // 水平
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let val = 0;
        for (let k = -r; k <= r; k++) {
          const xx = Math.min(w - 1, Math.max(0, x + k));
          val += temp[y * w + xx] * kernel[k + r];
        }
        data[y * w + x] = val;
      }
    }
    // 垂直
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let val = 0;
        for (let k = -r; k <= r; k++) {
          const yy = Math.min(h - 1, Math.max(0, y + k));
          val += data[yy * w + x] * kernel[k + r];
        }
        temp[y * w + x] = val;
      }
    }
    for (let i = 0; i < data.length; i++) data[i] = temp[i];
  };

  // 高斯模糊（用于线稿边缘柔化）
  const gaussianBlur = (data, w, h, radius) => {
    if (radius < 1) return;
    const kernel = [];
    const sigma = radius / 3;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      const g = Math.exp(-(x * x) / (2 * sigma * sigma));
      kernel.push(g);
      sum += g;
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

    const temp = new Uint8ClampedArray(data);
    // 水平模糊
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let val = 0;
          for (let k = -radius; k <= radius; k++) {
            const xx = Math.min(w - 1, Math.max(0, x + k));
            val += temp[(y * w + xx) * 4 + c] * kernel[k + radius];
          }
          data[(y * w + x) * 4 + c] = val;
        }
      }
    }
    // 垂直模糊
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let val = 0;
          for (let k = -radius; k <= radius; k++) {
            const yy = Math.min(h - 1, Math.max(0, y + k));
            val += data[(yy * w + x) * 4 + c] * kernel[k + radius];
          }
          temp[(y * w + x) * 4 + c] = val;
        }
      }
    }
    for (let i = 0; i < data.length; i++) data[i] = temp[i];
  };

  /* ---------- 学习工作 ---------- */
  const renderStudy = () => {
    const day = getDay();
    const list = $('#studyList');
    list.innerHTML = '';
    (day.study.items || []).forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 'study-item';
      row.innerHTML = `
        <div style="font-weight:600;">${s.name}</div>
        <div style="font-size:12px;color:var(--muted);">目标：${s.goal}</div>
        <div class="study-bar"><div style="width:${s.progress}%"></div></div>
        <div style="font-size:12px;color:var(--muted);text-align:right;">${s.progress}%</div>
        <button class="link-more study-del" data-idx="${idx}">删除</button>
      `;
      list.appendChild(row);
    });
    const nl = $('#studyNoteList');
    nl.innerHTML = '';
    (day.study.notes || []).forEach((n, idx) => {
      const row = document.createElement('div');
      row.className = 'ex-item';
      row.innerHTML = `
        <p>${n.content.replace(/\n/g, '<br>')}</p>
        <div class="ex-source">#${n.tag || '无标签'}</div>
        <button class="ex-del study-note-del" data-idx="${idx}">删除</button>
      `;
      nl.appendChild(row);
    });
  };
  const bindStudy = () => {
    $('#studyProgress').oninput = e => $('#studyProgressText').textContent = e.target.value + '%';
    $('#studyAdd').onclick = () => {
      const name = $('#studyName').value.trim();
      const goal = $('#studyGoal').value.trim();
      if (!name) return toast('请输入名称');
      if (!getDay().study.items) getDay().study.items = [];
      getDay().study.items.push({ name, goal, progress: Number($('#studyProgress').value) });
      $('#studyName').value = ''; $('#studyGoal').value = ''; $('#studyProgress').value = 0; $('#studyProgressText').textContent = '0%';
      save(); renderStudy(); renderHome();
      toast('已添加');
    };
    $('#studyNoteSave').onclick = () => {
      const content = $('#studyNote').value.trim();
      if (!content) return toast('请输入笔记');
      if (!getDay().study.notes) getDay().study.notes = [];
      getDay().study.notes.push({ content, tag: $('#studyNoteTag').value.trim(), time: Date.now() });
      $('#studyNote').value = ''; $('#studyNoteTag').value = '';
      save(); renderStudy(); renderHome();
      toast('笔记已保存');
    };
    $('#studyList').onclick = e => {
      if (!e.target.classList.contains('study-del')) return;
      getDay().study.items.splice(Number(e.target.dataset.idx), 1);
      save(); renderStudy();
    };
    $('#studyNoteList').onclick = e => {
      if (!e.target.classList.contains('study-note-del')) return;
      getDay().study.notes.splice(Number(e.target.dataset.idx), 1);
      save(); renderStudy();
    };
  };

  /* ---------- 设置 ---------- */
  // 应用外观设置到 DOM（不刷新页面的情况下立即生效）
  const applyAppearance = () => {
    const accent  = data.settings.accent  || 'gold';
    const density = data.settings.density || 'comfortable';
    const navHidden = false; // 始终显示导航栏，眼睛按钮不再持久化隐藏状态
    // 主题：preset / custom 都由 applyTheme 处理
    applyTheme();
    document.body.setAttribute('data-accent', accent);
    document.body.classList.toggle('nav-hidden', navHidden);
    // 日历密度切换
    const cd = document.getElementById('calendarDays');
    if (cd) cd.classList.toggle('cal-compact', density === 'compact');
    // 眼睛按钮：隐藏/显示所有界面内容
    const nav = document.getElementById('bottomNav');
    const appMain = document.querySelector('.app-main');
    const dateBar = document.querySelector('.date-bar');
    const calPanel = document.querySelector('.calendar-panel');
    if (navHidden) {
      if (nav) nav.style.setProperty('display', 'none', 'important');
      if (appMain) appMain.style.display = 'none';
      if (dateBar) dateBar.style.display = 'none';
      if (calPanel) calPanel.style.display = 'none';
    } else {
      if (nav) nav.style.removeProperty('display');
      if (appMain) appMain.style.removeProperty('display');
      if (dateBar) dateBar.style.removeProperty('display');
      if (calPanel) calPanel.style.removeProperty('display');
    }
  };

  // 眼睛按钮：隐藏/显示所有界面内容（禅模式）- 不持久化状态
  let _eyeHidden = false;
  const bindNavToggle = () => {
    const btn = document.getElementById('navToggleFab');
    if (!btn) return;
    btn.onclick = () => {
      _eyeHidden = !_eyeHidden;
      document.body.classList.toggle('nav-hidden', _eyeHidden);
      const nav = document.getElementById('bottomNav');
      const appMain = document.querySelector('.app-main');
      const dateBar = document.querySelector('.date-bar');
      const calPanel = document.querySelector('.calendar-panel');
      if (_eyeHidden) {
        if (nav) nav.style.setProperty('display', 'none', 'important');
        if (appMain) appMain.style.display = 'none';
        if (dateBar) dateBar.style.display = 'none';
        if (calPanel) calPanel.style.display = 'none';
      } else {
        if (nav) nav.style.removeProperty('display');
        if (appMain) appMain.style.removeProperty('display');
        if (dateBar) dateBar.style.removeProperty('display');
        if (calPanel) calPanel.style.removeProperty('display');
      }
      toast(_eyeHidden ? '已隐藏所有内容（再次点击可恢复）' : '已恢复显示');
    };
  };

  // 应用界面元素隐藏状态
  const applyHiddenUI = () => {
    const h = data.settings.hiddenUI || {};
    // 日期栏
    const dateBar = document.getElementById('dateBar');
    if (dateBar) dateBar.classList.toggle('ui-hidden', !h.dateBar);
    // 日历面板
    const cal = document.getElementById('calendarPanel');
    if (cal) cal.classList.toggle('ui-hidden', !h.calendarPanel);
    // 底部导航
    const bnav = document.getElementById('bottomNav');
    if (bnav) {
      bnav.classList.toggle('ui-hidden', !h.bottomNav);
      // 同步 desktop 布局
      const am = document.querySelector('.app-main');
      if (am) am.style.marginLeft = h.bottomNav ? '' : '0';
    }
    // 页面标题栏（所有 .page-head）
    document.querySelectorAll('.page-head').forEach(el => el.classList.toggle('ui-hidden', !h.pageHead));
    // 统计卡片（所有 .stat-row）
    document.querySelectorAll('.stat-row').forEach(el => el.classList.toggle('ui-hidden', !h.statRow));
    // 首页快捷待办
    const qt = document.getElementById('homeQuickTodo');
    if (qt) {
      const wrap = qt.closest('.card');
      if (wrap) wrap.classList.toggle('ui-hidden', !h.quickTodo);
    }
  };

  // 绑定界面元素隐藏开关
  const bindHiddenUI = () => {
    const h = data.settings.hiddenUI || {};
    const toggles = [
      { id: 'toggleDateBar', key: 'dateBar' },
      { id: 'toggleCalendar', key: 'calendarPanel' },
      { id: 'toggleBottomNav', key: 'bottomNav' },
      { id: 'togglePageHead', key: 'pageHead' },
      { id: 'toggleStatRow', key: 'statRow' },
      { id: 'toggleQuickTodo', key: 'quickTodo' },
    ];
    toggles.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = !!h[key];
      el.onchange = () => {
        data.settings.hiddenUI[key] = el.checked;
        applyHiddenUI();
        save();
      };
    });
  };

  /* ---------- 主题弹窗：实时预览 ---------- */
  const updateThemePreview = () => {
    const preview = $('#newThemePreview');
    if (!preview) return;
    const p = $('#newThemePrimary').value;
    const a = $('#newThemeAccent').value;
    const t = $('#newThemeText').value;
    const b = $('#newThemeBg').value;
    preview.style.setProperty('--mp-bg', b);
    preview.style.setProperty('--mp-text', t);
    preview.style.setProperty('--mp-primary', p);
    preview.style.setProperty('--mp-accent', a);
  };
  const openAddThemeModal = () => {
    const m = $('#addThemeModal'); if (!m) return;
    m.hidden = false;
    $('#newThemeName').value = '';
    $('#newThemePrimary').value = '#6366f1';
    $('#newThemeAccent').value = '#c9a35a';
    $('#newThemeText').value = '#2d1f15';
    $('#newThemeBg').value = '#f8fafc';
    updateThemePreview();
    setTimeout(() => $('#newThemeName').focus(), 50);
  };
  const closeAddThemeModal = () => { const m = $('#addThemeModal'); if (m) m.hidden = true; };
  const bindAddThemeModal = () => {
    ['#newThemePrimary','#newThemeAccent','#newThemeText','#newThemeBg'].forEach(sel => {
      const el = $(sel); if (el) el.addEventListener('input', updateThemePreview);
    });
    $('#addThemeCancel').onclick = closeAddThemeModal;
    $('#addThemeSave').onclick = () => {
      const name = $('#newThemeName').value.trim();
      if (!name) { toast('请输入主题名称'); $('#newThemeName').focus(); return; }
      const t = {
        id: 'th_' + Date.now().toString(36),
        name: name.slice(0, 10),
        primary: $('#newThemePrimary').value,
        accent:  $('#newThemeAccent').value,
        text:    $('#newThemeText').value,
        bg:      $('#newThemeBg').value,
      };
      data.customThemes = data.customThemes || [];
      data.customThemes.push(t);
      data.settings.theme = 'custom:' + t.id;
      save();
      applyAppearance();
      renderThemeGrid();
      closeAddThemeModal();
      toast('主题「' + t.name + '」已添加并应用');
    };
    // 点击遮罩关闭
    $('#addThemeModal').addEventListener('click', e => { if (e.target.id === 'addThemeModal') closeAddThemeModal(); });
  };

  /* ---------- 背景上传 ---------- */
  const bindBackground = () => {
    const file = $('#bgFileInput');
    const upBtn = $('#bgUploadBtn');
    const clrBtn = $('#bgClearBtn');
    const ovlInp = $('#bgOverlay');
    const muteBtn = $('#bgMuteBtn');

    upBtn.onclick = () => file.click();

    file.onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      // 不限制大小/格式：直接存 IDB
      await idb.save('customBg', f);
      // 记录 MIME 方便恢复
      data.settings.bgType = (f.type || '').startsWith('video/') ? 'video' : 'image';
      // 上传后视频默认有声（用 volume 控制，不受浏览器 muted 策略限制）
      if (data.settings.bgType === 'video') data.settings.bgMuted = false;
      save();
      applyBackground();
      toast('背景已' + (f.type.startsWith('video/') ? '上传视频' : '上传图片') + '（' + (f.size/1024/1024).toFixed(2) + ' MB）');
      // 重置 input，允许重复上传同名文件
      file.value = '';
    };

    clrBtn.onclick = async () => {
      if (!confirm('确定清除背景？')) return;
      await idb.remove('customBg').catch(() => {});
      data.settings.bgType = null;
      save();
      applyBackground();
      toast('已清除背景');
    };

    ovlInp.oninput = () => {
      const v = +ovlInp.value;
      data.settings.bgOverlay = v;
      const ovl = $('#bgOverlayLayer');
      ovl.style.background = `rgba(0,0,0,${v/100})`;
      $('#bgOverlayVal').textContent = v + '%';
      save();
    };

    muteBtn.onclick = () => {
      const v = $('#bgVideo');
      // 用 volume 控制声音，避免浏览器 muted 策略限制
      if (v.volume === 0) {
        v.volume = 1;
        data.settings.bgMuted = false;
        muteBtn.textContent = '🔊 有声';
      } else {
        v.volume = 0;
        data.settings.bgMuted = true;
        muteBtn.textContent = '🔇 静音';
      }
      // 确保播放中
      v.play().catch(() => {});
      save();
    };
  };

  const renderSettings = () => {
    renderThemeGrid();
    $('#layoutSelect').value  = data.settings.layout  || 'auto';
    const ds = $('#densitySelect'); if (ds) ds.value = data.settings.density || 'comfortable';
    const as = $('#accentSelect');  if (as) as.value = data.settings.accent   || 'gold';
    // 同步界面元素隐藏开关状态
    const h = data.settings.hiddenUI || {};
    ['toggleDateBar','toggleCalendar','toggleBottomNav','togglePageHead','toggleStatRow','toggleQuickTodo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = !!h[el.dataset.target];
    });
    const hl = $('#historyList');
    hl.innerHTML = '';
    Object.keys(data.dates).sort().reverse().forEach(date => {
      const row = document.createElement('div');
      row.className = 'history-item';
      row.innerHTML = `<span>${date}</span><button class="link-more history-go" data-date="${date}">查看</button>`;
      hl.appendChild(row);
    });
  };
  const bindSettings = () => {
    $('#exportBtn').onclick = () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `think-workbench-${fmtDate(new Date())}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      toast('数据已导出');
    };
    $('#importBtn').onclick = () => $('#importFile').click();
    $('#importFile').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          data = JSON.parse(ev.target.result);
          save(); location.reload();
        } catch (err) { toast('导入失败：文件格式错误'); }
      };
      reader.readAsText(file);
    };
    // 主题：色板点击（preset + custom）
    $('#themeGrid').onclick = e => {
      const delId = e.target.dataset.delTheme;
      if (delId) {
        const t = (data.customThemes || []).find(x => x.id === delId);
        if (!t) return;
        if (!confirm(`确定删除主题「${t.name}」？`)) return;
        data.customThemes = data.customThemes.filter(x => x.id !== delId);
        if (data.settings.theme === 'custom:' + delId) data.settings.theme = 'brown';
        save();
        applyAppearance();
        renderThemeGrid();
        return;
      }
      const item = e.target.closest('.theme-item');
      if (!item) return;
      const key = item.dataset.theme;
      if (!key) return;
      data.settings.theme = key;
      applyAppearance();
      renderThemeGrid();
      save();
      const t = findCurrentTheme();
      toast('已切换到：' + t.name);
    };
    // 添加主题
    $('#addThemeBtn').onclick = openAddThemeModal;
    // 自定义主色/背景色（高级，临时覆盖）
    const onCustomColor = () => {
      const p = $('#customPrimaryColor').value;
      const b = $('#customBgColor').value;
      document.body.style.setProperty('--primary', p);
      document.body.style.setProperty('--bg', b);
      document.body.style.setProperty('--surface', b);
    };
    $('#customPrimaryColor').oninput = onCustomColor;
    $('#customBgColor').oninput = onCustomColor;

    $('#layoutSelect').onchange = e => { data.settings.layout = e.target.value; save(); };
    $('#densitySelect').onchange = e => {
      data.settings.density = e.target.value;
      applyAppearance();
      save();
    };
    $('#accentSelect').onchange = e => {
      data.settings.accent = e.target.value;
      applyAppearance();
      save();
    };
    $('#clearAllBtn').onclick = () => {
      if (confirm('确定清空所有数据？此操作不可恢复。')) {
        data = defaultData();
        save(); location.reload();
      }
    };
    $('#historyList').onclick = e => {
      if (!e.target.classList.contains('history-go')) return;
      currentDate = new Date(e.target.dataset.date + 'T00:00:00');
      renderCalendar();
      showView('home');
    };
    // 界面元素隐藏开关
    bindHiddenUI();
  };

  /* ---------- 折线图 ---------- */
  const drawLineChart = (canvas, values, labels) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    if (!values.length) return;
    const pad = { top: 20, right: 20, bottom: 30, left: 36 };
    const min = Math.min(...values) * 0.95, max = Math.max(...values) * 1.05;
    const x = i => pad.left + (w - pad.left - pad.right) * i / Math.max(1, values.length - 1);
    const y = v => pad.top + (h - pad.top - pad.bottom) * (1 - (v - min) / (max - min));
    // 网格
    ctx.strokeStyle = 'rgba(61,40,23,0.08)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yy = pad.top + (h - pad.top - pad.bottom) * i / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(w - pad.right, yy); ctx.stroke();
    }
    // 线
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--gold').trim() || '#c9a35a';
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    values.forEach((v, i) => { if (i === 0) ctx.moveTo(x(i), y(v)); else ctx.lineTo(x(i), y(v)); });
    ctx.stroke();
    // 点
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3d2817'; ctx.lineWidth = 2;
    values.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(x(i), y(v), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    // 标签
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#9c846b';
    ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    labels.forEach((l, i) => { if (i % Math.ceil(labels.length / 6) === 0) ctx.fillText(l, x(i), h - 8); });
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = min + (max - min) * (1 - i / 4);
      ctx.fillText(Math.round(v), pad.left - 6, pad.top + (h - pad.top - pad.bottom) * i / 4 + 4);
    }
  };

  /* ---------- Tab 切换 ---------- */
  const bindTabs = () => {
    $$('.tabs').forEach(t => {
      t.onclick = e => {
        if (!e.target.classList.contains('tab')) return;
        const parent = t.closest('.view-content') || t.closest('.card');
        $$(`.tab`, t).forEach(x => x.classList.remove('tab-active'));
        e.target.classList.add('tab-active');
        const panel = e.target.dataset.tab;
        $$(`.tab-panel`, parent).forEach(p => p.style.display = p.dataset.panel === panel ? 'block' : 'none');
      };
    });
    $$('.seg').forEach(s => {
      s.onclick = e => {
        if (!e.target.classList.contains('seg-btn')) return;
        $$('.seg-btn', s).forEach(x => x.classList.remove('seg-active'));
        e.target.classList.add('seg-active');
      };
    });
  };

  /* ---------- 初始化 ---------- */
  const init = () => {
    load();
    applyAppearance();
    bindNavToggle();
    // 眼睛按钮和助手按钮可拖动
    makeDraggable(document.getElementById('navToggleFab'));
    makeDraggable(document.getElementById('gameToggleBtn'));
    makeDraggable(document.getElementById('gameRestoreBtn'));
    renderCalendar();
    bindTodo();
    bindSport();
    bindFinance();
    bindAccount();
    bindExcerpt();
    bindVideoEnhance();
    bindStudy();
    bindSettings();
    bindAddThemeModal();
    bindBackground();
    applyBackground(); // 恢复背景
    applyHiddenUI(); // 应用界面元素隐藏状态
    bindTabs();

    // 导航
    $$('.nav-item').forEach(n => n.onclick = () => showView(n.dataset.nav));
    $$('.module-card').forEach(c => c.onclick = () => showView(c.dataset.target));
    $$('.link-more[data-target]').forEach(a => a.onclick = () => showView(a.dataset.target));
    $$('[data-back], .back-btn').forEach(b => b.onclick = () => showView('home'));
    $('#backBtn').onclick = () => showView('home');
    $('#settingsBtn').onclick = () => showView('settings');
    $('#appMenuBtn').onclick = () => showView('home');

    // 切换到首页（确保view状态正确初始化）
    showView('home');

    // 日期条
    $('#dateBarToggle').onclick = () => {
      const p = $('#calendarPanel');
      p.style.display = p.style.display === 'none' ? 'block' : 'none';
      $('#dateBarToggle').classList.toggle('open', p.style.display !== 'none');
    };
    $('#dateJumpBtn').onclick = () => $('#dateBarToggle').click();
    $('#prevMonth').onclick = () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); };
    $('#nextMonth').onclick = () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); };

    // 监听所有输入自动保存
    $('#appMain').addEventListener('change', save, true);

    // 监听 resize 重绘图表
    window.addEventListener('resize', () => {
      renderSport(); renderAccount();
    });

    updateSyncStatus(true);

    // 滚轮滑动支持（手机端方便滑动内容）
    initWheelScroll();
  };

  // 页面滚动：统一将工作台内的滚轮事件交给可滚动主内容区
  const initWheelScroll = () => {
    const main = $('#appMain');
    const container = $('#wbContainer');
    if (!main || !container) return;

    const isFormControl = target => target && target.closest('input, select, textarea, button, [contenteditable="true"], .bottom-nav');
    const canScroll = deltaY => {
      if (main.scrollHeight <= main.clientHeight) return false;
      if (deltaY < 0) return main.scrollTop > 0;
      if (deltaY > 0) return main.scrollTop + main.clientHeight < main.scrollHeight - 1;
      return false;
    };

    const handleWheel = event => {
      if (event.defaultPrevented || event.ctrlKey || !container.contains(event.target)) return;
      if (isFormControl(event.target) || !canScroll(event.deltaY)) return;
      main.scrollTop += event.deltaY;
      event.preventDefault();
    };

    // 在工作台容器捕获阶段处理，避免子元素或覆盖层吞掉滚轮事件。
    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });
  };

  return { init };
})();

// 由 auth 系统控制初始化时机，不自启
