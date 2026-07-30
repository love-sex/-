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
    settings: { theme: 'brown', layout: 'auto', density: 'comfortable', accent: 'gold' },
    dates: {},
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

    // 待办统计
    let pending = 0, done = 0;
    Object.values(data.dates).forEach(d => {
      d.todos.forEach(t => t.done ? done++ : pending++);
    });
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

    // 今日快速待办
    const qt = $('#homeQuickTodo');
    qt.innerHTML = '';
    todayDay.todos.slice(0, 5).forEach(t => {
      const row = document.createElement('div');
      row.className = 'todo-item' + (t.done ? ' done' : '');
      row.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''} disabled><span class="todo-text">${t.text}</span>`;
      qt.appendChild(row);
    });
    if (!todayDay.todos.length) qt.innerHTML = '<p class="muted" style="text-align:center;margin:0;">暂无待办，去添加吧～</p>';

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

  /* ---------- To-do ---------- */
  const renderTodo = () => {
    const day = getDay();
    const list = $('#todoList');
    list.innerHTML = '';
    day.todos.forEach((t, idx) => {
      const row = document.createElement('div');
      row.className = 'todo-item' + (t.done ? ' done' : '');
      row.innerHTML = `
        <input type="checkbox" ${t.done ? 'checked' : ''} data-idx="${idx}">
        <span class="todo-text">${t.text}</span>
        <button class="todo-del" data-idx="${idx}">×</button>
      `;
      list.appendChild(row);
    });
    const pending = day.todos.filter(t => !t.done).length;
    const done = day.todos.filter(t => t.done).length;
    $('#todoStatPending').textContent = pending;
    $('#todoStatDone').textContent = done;
    $('#todoStatTotal').textContent = pending;
    if (!day.todos.length) list.innerHTML = '<p class="muted" style="text-align:center;">暂无待办</p>';
  };
  const bindTodo = () => {
    $('#todoAddBtn').onclick = () => {
      const input = $('#todoInput');
      const v = input.value.trim();
      if (!v) return;
      getDay().todos.push({ text: v, done: false, created: Date.now() });
      input.value = '';
      save(); renderTodo(); renderHome();
    };
    $('#todoInput').onkeydown = e => { if (e.key === 'Enter') $('#todoAddBtn').click(); };
    $('#todoList').onclick = e => {
      const idx = e.target.dataset.idx;
      if (idx == null) return;
      const day = getDay();
      if (e.target.tagName === 'INPUT') {
        day.todos[idx].done = e.target.checked;
      } else if (e.target.classList.contains('todo-del')) {
        day.todos.splice(idx, 1);
      }
      save(); renderTodo(); renderHome();
    };
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
    const theme   = data.settings.theme   || 'brown';
    const density = data.settings.density || 'comfortable';
    const accent  = data.settings.accent  || 'gold';
    document.body.setAttribute('data-theme', theme);
    document.body.setAttribute('data-accent', accent);
    // 日历密度切换
    const cd = document.getElementById('calendarDays');
    if (cd) cd.classList.toggle('cal-compact', density === 'compact');
    // 主题色板高亮
    document.querySelectorAll('#themeSwatches .swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.theme === theme);
    });
  };

  const renderSettings = () => {
    $('#themeSelect').value   = data.settings.theme   || 'brown';
    $('#layoutSelect').value  = data.settings.layout  || 'auto';
    const ds = $('#densitySelect'); if (ds) ds.value = data.settings.density || 'comfortable';
    const as = $('#accentSelect');  if (as) as.value = data.settings.accent   || 'gold';
    // 同步色板
    document.querySelectorAll('#themeSwatches .swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.theme === (data.settings.theme || 'brown'));
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
    // 主题：色板点击
    document.querySelectorAll('#themeSwatches .swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        const t = sw.dataset.theme;
        data.settings.theme = t;
        document.body.setAttribute('data-theme', t);
        $('#themeSelect').value = t;
        // 切换 active 状态
        document.querySelectorAll('#themeSwatches .swatch').forEach(s => s.classList.toggle('active', s === sw));
        save();
        toast('主题已切换：' + (t === 'brown' ? '深棕' : t === 'mocha' ? '摩卡' : '鼠尾草'));
      });
    });
    // 主题：下拉（兼容旧版）
    $('#themeSelect').onchange = e => {
      const t = e.target.value;
      data.settings.theme = t;
      document.body.setAttribute('data-theme', t);
      document.querySelectorAll('#themeSwatches .swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === t));
      save();
    };
    $('#layoutSelect').onchange = e => { data.settings.layout = e.target.value; save(); };
    // 日历密度
    $('#densitySelect').onchange = e => {
      data.settings.density = e.target.value;
      applyAppearance();
      save();
    };
    // 主色强调
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
    document.body.setAttribute('data-theme', data.settings.theme);
    applyAppearance();
    renderCalendar();
    bindTodo();
    bindSport();
    bindFinance();
    bindAccount();
    bindExcerpt();
    bindStudy();
    bindSettings();
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
  };

  return { init };
})();

// 由 auth 系统控制初始化时机，不自启
