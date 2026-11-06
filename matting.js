/* =========================================================
 * 抠图：自动识别主体 → 一键删除背景 → 画笔修补 → 导出透明 PNG / SVG 矢量
 * 另含「魔法橡皮擦」：涂抹要移除的人/物/文字，本地重建背景（对齐 magicremover.org/magic-eraser 的交互）
 * 全部在浏览器本地完成，图片不会上传到任何服务器。
 * 引擎：ISNet（MIT，imgly/isnet-general-onnx）+ onnxruntime-web（MIT）
 * 去物：MI-GAN（MIT，Picsart-AI-Research/MI-GAN，ICCV 2023）本地 wasm 推理为主，
 *       失败/离线时回落到自研插值修复（参考 OpenCV photo 模块 cv::INPAINT_TELEA 的思路）
 * 矢量：ImageTracerJS（The Unlicense / 公有领域）
 * ========================================================= */
(function () {
    'use strict';

    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

    const toast = (msg) => {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 2200);
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // 两档模型：标准（4.7MB，秒开）/ 精细（42MB，边缘更准，首次下载较慢）
    const MODELS = {
        fast: {
            key: 'u2netp', label: '快速', bytes: 4574861, size: 320,
            mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225],
            files: ['u2netp.onnx']
        },
        // DIS / ISNet 的官方预处理是 mean=0.5、std=1.0（不是 ImageNet 那套），
        // 之前套错会让输入整体被拉大到 [-2,2]，输出几乎全空 —— 精细模型"整张图抠没了"就是这个原因
        pro: {
            key: 'isnet', label: '精细', bytes: 44348940, size: 1024,
            mean: [0.5, 0.5, 0.5], std: [1.0, 1.0, 1.0],
            files: ['isnet_quint8.onnx.part1', 'isnet_quint8.onnx.part2', 'isnet_quint8.onnx.part3']
        }
    };
    // 去物（涂抹修复）模型：MI-GAN（Picsart-AI-Research/MI-GAN，ICCV 2023，MIT，706★）
    // 移动端推理网络，26.8MB，固定 512×512 输入；拆两片以适配 jsDelivr 单文件 20MB 上限
    const MIGAN = {
        key: 'migan512', label: 'AI 修复', bytes: 28079181, size: 512,
        files: ['migan.onnx.part1', 'migan.onnx.part2']
    };
    // 多源兜底：jsDelivr 官方 → fastly 镜像 → gcore 镜像 → 站点自身，慢/失败都自动换下一个
    const SOURCES = [
        (f) => 'https://cdn.jsdelivr.net/gh/love-sex/-@main/assets/matting/models/' + f,
        (f) => 'https://fastly.jsdelivr.net/gh/love-sex/-@main/assets/matting/models/' + f,
        (f) => 'https://gcore.jsdelivr.net/gh/love-sex/-@main/assets/matting/models/' + f,
        (f) => new URL('assets/matting/models/' + f, location.href).href
    ];
    // 低于这个速度（字节/秒）就判定该源不可用，立刻换源，避免干等
    const MIN_SPEED = 40 * 1024;
    // 推理引擎（onnxruntime-web 1.31.1）优先走 CDN，站点本地副本作为兜底
    const ORT_VER = '1.31.1';
    const ORT_SOURCES = [
        'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + ORT_VER + '/dist/',
        'https://fastly.jsdelivr.net/npm/onnxruntime-web@' + ORT_VER + '/dist/',
        'https://gcore.jsdelivr.net/npm/onnxruntime-web@' + ORT_VER + '/dist/',
        new URL('assets/matting/ort/', location.href).href
    ];
    const ORT_WASM = { key: 'ort-wasm-simd-threaded.wasm', bytes: 14848852, min: 8 * 1024 * 1024 };
    const TRACER_URL = new URL('assets/matting/imagetracer.js', location.href).href;
    const MAX_SIDE = 1400;

    const S = {
        src: null,        // 原图（ImageBitmap / HTMLImageElement）
        name: '',
        w: 0, h: 0,       // 工作分辨率
        natural: [0, 0],  // 原始分辨率
        view: null, vctx: null,
        raw: null, rctx: null,    // 权威蒙版：模型结果 + 画笔修补
        mask: null, mctx: null,   // 派生蒙版：raw 经过羽化/净化后用于显示与导出
        rgb: null,                // 原图 RGB（引导滤波用）
        fg: null,                 // 去过底色污染的前景图（边缘不再挂背景色）
        bgColor: undefined,       // 估计出来的背景色，null 表示背景太花不做去色
        hasMask: false,
        busy: false,
        session: null,
        sessionKey: null,
        model: 'pro',
        ort: null,
        undo: [], redo: [],
        last: null,
        painting: false,
        mode: 'erase',    // erase | restore | remove | pan
        spaceDown: false, // 按住空格 = 临时抓手
        // 涂抹去物（魔法橡皮擦）：独立于抠图蒙版的红色涂抹区
        rmask: null, rmctx: null,
        rmHas: false,        // 是否有未处理的涂抹
        inpaintHist: [],     // 每次擦除前的整图快照（最多 6 张），支持多步撤销 + 前后对比
        cmpOn: false,        // 前后对比模式
        cmpPos: 50,          // 对比分割线位置（0-100）
        removeEngine: 'ai',  // ai（MI-GAN）| local（本地插值）
        migan: null,         // MI-GAN 会话
        // 画布视图：布局尺寸 = 图片像素 * baseScale，再乘 zoom 得到实际显示大小
        zoom: 1, tx: 0, ty: 0, baseScale: 1, userZoomed: false,
        brush: 40,
        hardness: 0.6,
        feather: 1,
        contrast: 0.4,
        smooth: 0,        // 边缘平滑：blur 后再锐化，圆掉锯齿状凹凸（PS「平滑」）
        shift: 0,         // 移动边缘：>0 外扩、<0 收缩（PS「移动边缘」）
        wandTol: 18,      // 颜色点选（魔术棒）的容差 0-100
        ghost: false,     // 原图残影：恢复主体时用来对齐被删掉的部分
        cutColor: '#d9463c', // 选区的叠加色（PS 快速蒙版默认红系）
        cutOp: 0.3,       // 选区叠加浓度 0-0.8
        selMode: 'new',   // 选区模式：new 新建 / add 加选 / sub 减选（Shift、Alt 可临时切换）
        wandScope: 'contiguous', // 点选范围：连续（只取相连的）/ 全局（全图同色）
        selFeather: 2,    // 应用选区时柔化几像素
        selOn: false,     // 当前有没有选区
        selArea: 0,       // 选区像素数（面板回显）
        // 笔刷库：brushIdx = -1 表示圆头软笔刷，其它是导入的笔尖（.abr / 图片）
        brushes: [],
        brushIdx: -1,
        tip: null,
        spacing: 0.25,    // 笔尖间距，占画笔大小的比例（PS 的 Spacing）
        tipSeq: 1,
        // 笔刷库分组与多选：brushSel 存勾选的笔刷 id，brushGroups 是分组名数组
        brushSel: [],
        brushGroups: [],
        brushOpen: {},     // 分组折叠状态 {组名: true=收起}
        // 文档 / 图层：tree 是图层树（0 = 最底层），组节点可以再套组
        tree: [],
        activeId: '',
        layerSeq: 1,
        groupSeq: 1,
        _actSprite: null,
        bwView: false,    // 黑白蒙版视图（PS 里按 K）
        deepClean: true,  // 清理与背景同色的残留（反光、投影）
        pickKey: null,    // 这张图上「复核后更干净」的模型，换图要清掉
        tracer: null
    };

    /* ================= 文档 / 图层 =================
       一张画布 = 一个文档，文档里是一棵图层树（组可以再套组）。
       所有抠图工具作用的都是「活动图层」：S.src / S.mask / S.rctx 这些字段用
       defineProperty 代理到活动图层上，所以原来那几千行读写单图状态的代码一行都不用改，
       切图层只是换一个被代理的对象。
       渲染分两条路：只有一个普通图层时走原来的单图管线（像素输出和以前完全一致），
       多图层/带组时才走逐层合成，这样已有的测试和手感都不会被改坏。 */
    const LAYER_FIELDS = ['src', 'raw', 'rctx', 'mask', 'mctx', 'rgb', 'fg', 'bgColor', 'hasMask', 'rmask', 'rmctx', 'rmHas', 'inpaintHist'];
    const BLEND_MODES = [
        ['source-over', '正常'], ['multiply', '正片叠底'], ['screen', '滤色'],
        ['overlay', '叠加'], ['soft-light', '柔光'], ['darken', '变暗'], ['lighten', '变亮']
    ];

    const mkCv = (w, h) => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w) || 1);
        c.height = Math.max(1, Math.round(h) || 1);
        return c;
    };
    const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

    const makeLayer = (name, opts) => {
        const o = opts || {};
        const raw = mkCv(S.w, S.h), mask = mkCv(S.w, S.h), rmask = mkCv(S.w, S.h);
        S.layerSeq++;
        return {
            kind: 'layer', id: 'L' + (S.layerSeq - 1), name: name || ('图层 ' + (S.layerSeq - 1)),
            visible: true, opacity: 1, blend: 'source-over',
            src: o.src || null,
            raw, rctx: ctx2d(raw), mask, mctx: ctx2d(mask),
            rgb: null, fg: null, bgColor: undefined,
            hasMask: !!o.hasMask,
            rmask, rmctx: ctx2d(rmask), rmHas: false, inpaintHist: [],
            _rev: 1
        };
    };

    // 树遍历：只到图层（组递归进去）
    const walkLayers = (fn, list) => {
        (list || S.tree).forEach((n) => {
            if (n.kind === 'group') walkLayers(fn, n.children);
            else fn(n);
        });
    };
    const nodeById = (id) => {
        if (!id) return null;
        let hit = null;
        const walk = (arr) => arr.some((n) => {
            if (n.id === id) { hit = n; return true; }
            return n.kind === 'group' && walk(n.children);
        });
        walk(S.tree);
        return hit;
    };
    const layerById = (id) => { const n = nodeById(id); return n && n.kind === 'layer' ? n : null; };
    const actLayer = () => layerById(S.activeId) || (S.tree[0] && S.tree[0].kind === 'layer' ? S.tree[0] : null);
    const activeNode = () => nodeById(S.activeId);
    // 包含某节点的数组（顶层树或某个组的 children）
    const siblingList = (id) => {
        let out = null;
        const walk = (arr) => arr.some((n) => {
            if (n.id === id) { out = arr; return true; }
            return n.kind === 'group' && walk(n.children);
        });
        walk(S.tree);
        return out || S.tree;
    };
    const bumpLayer = (L) => { if (L) L._rev = (L._rev || 0) + 1; };

    // 把单图字段代理到活动图层
    LAYER_FIELDS.forEach((k) => {
        Object.defineProperty(S, k, {
            configurable: true,
            get() {
                const a = actLayer();
                if (a) return a[k];
                return k === 'hasMask' ? false : (k === 'inpaintHist' ? [] : null);
            },
            set(v) { const a = actLayer(); if (a) a[k] = v; }
        });
    });

    const layerRootVisible = () => true;

    // 逐层合成：组的可见性向下传递，组不透明度乘到子层上
    const composeDoc = (ctx, opts) => {
        const a0 = ctx.globalAlpha, o0 = ctx.globalCompositeOperation;
        const walk = (arr, gA, gVis) => {
            for (const n of arr) {
                if (n.kind === 'group') {
                    walk(n.children, gA * (n.opacity == null ? 1 : n.opacity), gVis && n.visible !== false);
                    continue;
                }
                if (n.visible === false || !gVis) continue;
                const sp = layerSprite(n);
                if (!sp) continue;
                ctx.globalAlpha = Math.max(0, Math.min(1, (n.opacity == null ? 1 : n.opacity) * gA));
                ctx.globalCompositeOperation = n.blend || 'source-over';
                ctx.drawImage(sp, 0, 0, S.w, S.h);
            }
        };
        walk(S.tree, 1, true);
        ctx.globalAlpha = a0;
        ctx.globalCompositeOperation = o0;
    };

    // 单图层且没有组/混合/透明度 → 走原来的单图渲染（完全等价，省一次离屏合成）
    const simpleDoc = () => {
        const n = S.tree.length === 1 ? S.tree[0] : null;
        return !!n && n.kind === 'layer' && n.id === S.activeId && n.visible !== false
            && (n.opacity == null || n.opacity === 1)
            && (!n.blend || n.blend === 'source-over');
    };

    // 图层可见像素：src 按 mask 剪裁；活动图层不缓存（正在画），其它层按 _rev 缓存
    const layerSprite = (L) => {
        if (!L || !L.src) return null;
        if (!L.hasMask) return L.src;
        const isAct = L.id === S.activeId;
        let c = isAct ? S._actSprite : L._sp;
        if (!c || c.width !== S.w || c.height !== S.h) {
            c = mkCv(S.w, S.h);
            if (isAct) S._actSprite = c; else L._sp = c;
            L._spRev = -1;
        }
        if (!isAct && L._spRev === L._rev) return c;
        const x = c.getContext('2d');
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';
        x.clearRect(0, 0, S.w, S.h);
        x.drawImage(L.fg || L.src, 0, 0, S.w, S.h);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(L.mask, 0, 0, S.w, S.h);
        x.globalCompositeOperation = 'source-over';
        if (!isAct) L._spRev = L._rev;
        return c;
    };

    /* ---------------- 有图 / 无图 的界面状态 ----------------
       光靠 display:none 会把栅格里的一栏留空，剩下的元素自动往前排（画布曾被压进 58px 的工具条列），
       所以同时给工作区加 has-img，让栅格列数跟着变 */
    const setNeedImg = (has) => {
        $$('.matting-need-img').forEach(el => el.style.display = has ? '' : 'none');
        // 类必须落在栅格容器（.matting-work）本身，落到外层卡片上是匹配不到 :not() 的
        $$('.matting-work').forEach(el => el.classList.toggle('has-img', !!has));
    };

    /* ---------------- 全尺寸临时画布池 ----------------
       删除区预览 / 黑白蒙版每帧要合成好几层，画布复用（同尺寸不重建）；
       退出预览时 S._tmp = null 整体释放，大图能省几十 MB */
    const tmpC = (id) => {
        if (!S._tmp) S._tmp = {};
        let cv = S._tmp[id];
        if (!cv || cv.width !== S.w || cv.height !== S.h) {
            cv = document.createElement('canvas');
            cv.width = S.w; cv.height = S.h;
            S._tmp[id] = cv;
        }
        const g = cv.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.clearRect(0, 0, S.w, S.h);
        return cv;
    };

    /* ---------------- IndexedDB：缓存 42MB 模型，第二次打开秒开 ---------------- */
    const DB_NAME = 'matting-cache';
    let _dbp = null;
    const db = () => {
        if (_dbp) return _dbp;
        _dbp = new Promise((res, rej) => {
            const r = indexedDB.open(DB_NAME, 1);
            r.onupgradeneeded = () => { r.result.createObjectStore('f'); };
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        });
        return _dbp;
    };
    const idbGet = async (k) => {
        try {
            const d = await db();
            return await new Promise((res, rej) => {
                const q = d.transaction('f', 'readonly').objectStore('f').get(k);
                q.onsuccess = () => res(q.result || null);
                q.onerror = () => rej(q.error);
            });
        } catch (e) { return null; }
    };
    const idbPut = async (k, v) => {
        try {
            const d = await db();
            await new Promise((res, rej) => {
                const q = d.transaction('f', 'readwrite').objectStore('f').put(v, k);
                q.onsuccess = () => res();
                q.onerror = () => rej(q.error);
            });
        } catch (e) { /* 缓存失败不影响使用 */ }
    };

    /* ---------------- 状态显示 ---------------- */
    const setStatus = (msg, soft) => {
        const el = $('#mattingStatus');
        if (!el) return;
        const now = Date.now();
        // 后台下载/初始化这些进度播报别盖掉用户刚操作得到的结果（4 秒内让位）
        if (soft && now - (S.statusAt || 0) < 4000) return;
        el.textContent = msg || '';
        if (!soft) S.statusAt = now;
    };
    const setProgress = (p) => {
        const box = $('#mattingProgress');
        const bar = $('#mattingProgressBar');
        if (!box || !bar) return;
        if (p === null || p === undefined || p >= 1 || p < 0) { box.style.display = 'none'; bar.style.width = '0'; return; }
        box.style.display = 'block';
        bar.style.width = Math.round(p * 100) + '%';
    };

    /* ---------------- 画布 ---------------- */
    // 换尺寸 = 开新文档：视图/选区是文档级的，蒙版与像素按图层各存一份
    const setupCanvases = (w, h) => {
        S.w = w; S.h = h;
        S.view = $('#mattingCanvas');
        S.view.width = w; S.view.height = h;
        S.vctx = S.view.getContext('2d');
        // 选区画布：alpha=255 表示选中，点选/套索都写这里，最后统一作用到蒙版
        S.sel = mkCv(w, h);
        S.sctx = ctx2d(S.sel);
        S.selOn = false; S.selArea = 0; S.selDraft = null;
        S.lassoing = false; S.lassoTick = false;
        S._sel = null;
        const selInfo = $('#mattingSelInfo');
        if (selInfo) selInfo.textContent = '未选区：用点选或套索圈出范围';
        // 文档 = 新图层树 + 一个空图层；S.src/S.mask 等字段随后写到这个图层上
        S.tree = [];
        S.layerSeq = 1;
        S.groupSeq = 1;
        const first = makeLayer('图层 1');
        S.tree.push(first);
        S.activeId = first.id;
        S._actSprite = null;
        S.undo = []; S.redo = [];
        S.cmpOn = false;
        S.rmHas = false;
        S.inpaintHist = [];
        syncHistoryButtons();
        renderLayerPanel();
    };

    // 把当前活动图层的 src 画到 (w,h) 并缓存像素（引导滤波 + 修复算法共用）
    const cacheRGB = () => {
        if (!S.w || !S.h || !S.src) { S.rgb = null; return; }
        const g = mkCv(S.w, S.h);
        const gc = g.getContext('2d', { willReadFrequently: true });
        gc.drawImage(S.src, 0, 0, S.w, S.h);
        S.rgb = gc.getImageData(0, 0, S.w, S.h);
    };

    // 涂抹去物：红色半透明覆盖层，让「要移除什么」一眼可见（渲染层，不动权威蒙版）
    // tint 画布复用，避免 pointermove 每帧新建一张全尺寸 canvas 造成 GC 卡顿
    const drawRm = (() => {
        let tint = null;
        return () => {
            if (!S.rmHas || !S.rmctx) return;
            if (!tint || tint.width !== S.w || tint.height !== S.h) tint = mkCv(S.w, S.h);
            const t = tint.getContext('2d');
            t.globalCompositeOperation = 'source-over';
            t.clearRect(0, 0, S.w, S.h);
            t.drawImage(S.rmask, 0, 0);
            t.globalCompositeOperation = 'source-in';
            t.fillStyle = 'rgba(255,46,46,0.5)';
            t.fillRect(0, 0, S.w, S.h);
            S.vctx.drawImage(tint, 0, 0);
        };
    })();

    // 前后对比：左半边画「擦除前」，右半边画「擦除后」，中间一条分割线。
    // 用像素级分割而不是两层 DOM，缩放/平移天然同步，也不再依赖按住手势（手机上好按）
    const drawCompare = () => {
        const ctx = S.vctx;
        const before = S.inpaintHist[S.inpaintHist.length - 1];
        if (!before) return false;
        const cut = Math.max(0, Math.min(S.w, Math.round(S.w * S.cmpPos / 100)));
        ctx.drawImage(before, 0, 0, S.w, S.h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(cut, 0, S.w - cut, S.h);
        ctx.clip();
        ctx.drawImage(S.src, 0, 0, S.w, S.h);
        ctx.restore();
        // 分割线 + 两侧标签
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(cut - 1, 0, 2, S.h);
        const fs = Math.max(12, Math.round(S.w / 42));
        ctx.font = '600 ' + fs + 'px system-ui, -apple-system, sans-serif';
        const pad = Math.round(fs * 0.5);
        const tag = (txt, x) => {
            const w = ctx.measureText(txt).width + pad * 2;
            const h = fs + pad * 1.4;
            const y = pad * 1.6;
            ctx.fillStyle = 'rgba(28,24,20,0.6)';
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = '#fff';
            ctx.fillText(txt, x + pad, y + fs + pad * 0.35);
            return w;
        };
        tag('擦除前', Math.max(pad, cut - Math.max(70, S.w * 0.12)));
        tag('擦除后', Math.min(S.w - Math.max(70, S.w * 0.12), cut + pad));
        return true;
    };

    const hasAnyPixels = () => {
        const walk = (arr) => arr.some((n) => (n.kind === 'group' ? walk(n.children) : !!n.src));
        return walk(S.tree);
    };

    // 原图残影：把活动图层被删掉的部分浅浅显出来，方便恢复时对齐
    const drawGhost = () => {
        if (!S.src) return;
        const ctx = S.vctx;
        const gc0 = tmpC('ghost');
        const gc = gc0.getContext('2d');
        gc.drawImage(S.src, 0, 0, S.w, S.h);
        gc.globalCompositeOperation = 'destination-out';
        if (S.mask) gc.drawImage(S.mask, 0, 0, S.w, S.h);
        gc.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.globalAlpha = 0.24;
        ctx.drawImage(gc0, 0, 0);
        ctx.restore();
    };

    const renderBase = () => {
        const ctx = S.vctx;
        if (!ctx || !S.w || !S.h) return;
        // 活动图层可能是刚建的空图层，但下面还有别的图层要显示
        if (!S.src && !hasAnyPixels()) return;
        ctx.clearRect(0, 0, S.w, S.h);
        ctx.globalCompositeOperation = 'source-over';
        // 对比模式下才显示分割线滑块
        const cmpRow = $('#mattingCmpRow');
        if (cmpRow) cmpRow.classList.toggle('show', !!(S.cmpOn && S.inpaintHist.length));
        // 对比模式优先（不受抠图蒙版影响，否则去掉背景后两边看起来一模一样）
        if (S.cmpOn && drawCompare()) { drawRm(); return; }
        // 多图层 / 组 / 混合：逐层合成
        if (!simpleDoc()) {
            if (S.bwView && S.hasMask) {
                // 黑白蒙版视图只看活动图层的蒙版（PS 里也是逐层的）
                const mt = tmpC('bwMask');
                const mc = mt.getContext('2d');
                mc.drawImage(S.mask, 0, 0, S.w, S.h);
                mc.globalCompositeOperation = 'source-in';
                mc.fillStyle = '#0d0d0d';
                mc.fillRect(0, 0, S.w, S.h);
                mc.globalCompositeOperation = 'source-over';
                const bw = tmpC('bw');
                const bc = bw.getContext('2d');
                bc.fillStyle = '#fff';
                bc.fillRect(0, 0, S.w, S.h);
                bc.drawImage(mt, 0, 0);
                ctx.drawImage(bw, 0, 0);
                return;
            }
            composeDoc(ctx);
            if (S.ghost) drawGhost();
            drawRm();
            return;
        }
        // 正常预览用「去过底色」的前景图，避免边缘挂一圈背景色
        ctx.drawImage((S.hasMask && S.fg) ? S.fg : S.src, 0, 0, S.w, S.h);
        if (!S.hasMask) { drawRm(); return; }
        if (S.bwView) {
            // 黑白蒙版视图（PS 里按 K）：白=保留、黑=删除，检查半透明边缘最直观
            // 注意不能在白底上直接 source-in 上黑，那会把整张画布都涂黑；
            // 先在透明层把蒙版染黑（保留 alpha），再正常叠到白底上
            const mt = tmpC('bwMask');
            const mc = mt.getContext('2d');
            mc.drawImage(S.mask, 0, 0, S.w, S.h);
            mc.globalCompositeOperation = 'source-in';
            mc.fillStyle = '#0d0d0d';
            mc.fillRect(0, 0, S.w, S.h);
            mc.globalCompositeOperation = 'source-over';
            const bw = tmpC('bw');
            const bc = bw.getContext('2d');
            bc.fillStyle = '#fff';
            bc.fillRect(0, 0, S.w, S.h);
            bc.drawImage(mt, 0, 0);
            ctx.drawImage(bw, 0, 0);
            drawRm();
            return;
        }
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(S.mask, 0, 0, S.w, S.h);
        ctx.globalCompositeOperation = 'source-over';
        // 原图残影：只在「被删掉」的区域淡淡显出原图，主体本身保持像素原样，
        // 这样补头发、衣角时能对着淡影对齐（借 cut-it-out 的 ghost 叠加）
        if (S.ghost) drawGhost();
        drawRm();
    };

    /* 选区叠加层：半透明叠加色 + 黑白蚁线。两张图缓存在 S._sel 里，
       只有选区变了才重建，画笔拖动时每帧只是两次 drawImage */
    const drawSelOverlay = () => {
        const ctx = S.vctx;
        if (!ctx) return;
        if (S.selOn && S._sel) {
            if (S._sel.tint) ctx.drawImage(S._sel.tint, 0, 0);
            if (S._sel.ants) ctx.drawImage(S._sel.ants, 0, 0);
        }
        // 正在拖的套索：虚线跟着指针走，松手才变成真选区
        const pts = S.selDraft;
        if (pts && pts.length > 1) {
            const px = 1 / Math.max(0.05, (S.baseScale || 1) * (S.zoom || 1));
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            if (pts.length > 2) ctx.lineTo(pts[0].x, pts[0].y);
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = Math.max(1, 1.6 * px);
            ctx.stroke();
            ctx.setLineDash([6 * px, 4 * px]);
            ctx.strokeStyle = 'rgba(255,255,255,0.95)';
            ctx.lineWidth = Math.max(1, 1.1 * px);
            ctx.stroke();
            ctx.restore();
        }
    };

    const render = () => { renderBase(); drawSelOverlay(); };

    /* ---------------- 画布视图：缩放 / 平移 ----------------
       思路：画布用 CSS transform 变换（左上角为原点），图片仍是原始像素分辨率。
       好处是画笔坐标用 getBoundingClientRect 换算天然正确，不需要额外补偿。 */
    const ZOOM_MIN = 0.2, ZOOM_MAX = 16;

    const sizeStage = () => {
        const st = $('#mattingStage');
        if (!st || !S.w || !S.h) return;
        const vw = st.clientWidth;
        if (!vw) return;
        const h = Math.round(vw * S.h / S.w);
        // 桌面放宽后画布也该大一点，但别把整个窗口顶爆（上限 76vh / 780px）
        const capH = Math.min(780, Math.round((window.innerHeight || 900) * 0.76));
        st.style.height = Math.max(240, Math.min(capH, h)) + 'px';
    };

    const clampView = () => {
        const st = $('#mattingStage');
        if (!st || !S.w) return;
        const vw = st.clientWidth, vh = st.clientHeight;
        const dw = S.w * S.baseScale * S.zoom, dh = S.h * S.baseScale * S.zoom;
        // 图比视口小：至少留 80% 在里头；图比视口大：保证不露出空白边
        if (dw <= vw) S.tx = Math.min(Math.max(S.tx, -dw * 0.2), vw - dw * 0.8);
        else S.tx = Math.min(0, Math.max(vw - dw, S.tx));
        if (dh <= vh) S.ty = Math.min(Math.max(S.ty, -dh * 0.2), vh - dh * 0.8);
        else S.ty = Math.min(0, Math.max(vh - dh, S.ty));
    };

    const applyView = () => {
        const cv = $('#mattingCanvas');
        if (!cv) return;
        clampView();
        cv.style.transform = 'translate(' + S.tx + 'px,' + S.ty + 'px) scale(' + S.zoom + ')';
        const lab = $('#mattingZoomVal');
        if (lab) lab.textContent = Math.round(S.baseScale * S.zoom * 100) + '%';
        if (S.syncRing) S.syncRing();   // 缩放后笔尖圈直径要跟着画布一起变
    };

    // 按容器大小重新算出「刚好铺满」的布局，居中显示
    const fitView = (keepZoom) => {
        const st = $('#mattingStage'), cv = $('#mattingCanvas');
        if (!st || !cv || !S.w || !S.h) return;
        sizeStage();
        const vw = st.clientWidth, vh = st.clientHeight;
        if (!vw || !vh) return;
        // 小图也铺满工作区（PS 的 fit on screen 会放大），最多放大 1.6 倍免得糊
        S.baseScale = Math.min(vw / S.w, vh / S.h, 1.6);
        cv.style.width = Math.round(S.w * S.baseScale) + 'px';
        cv.style.height = Math.round(S.h * S.baseScale) + 'px';
        if (!keepZoom) S.zoom = 1;
        S.tx = (vw - S.w * S.baseScale * S.zoom) / 2;
        S.ty = (vh - S.h * S.baseScale * S.zoom) / 2;
        applyView();
    };

    // 以视口内的 (cx,cy) 为锚点缩放：该点下方的图片内容保持不动
    const zoomAt = (cx, cy, factor) => {
        if (!S.src) return;
        const z0 = S.zoom;
        const z1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z0 * factor));
        if (Math.abs(z1 - z0) < 1e-6) return;
        const k = z1 / z0;
        S.tx = cx - (cx - S.tx) * k;
        S.ty = cy - (cy - S.ty) * k;
        S.zoom = z1;
        S.userZoomed = true;
        applyView();
    };

    const zoomCenter = (factor) => {
        const st = $('#mattingStage');
        if (!st) return;
        zoomAt(st.clientWidth / 2, st.clientHeight / 2, factor);
    };

    // 让某个图片坐标出现在视口中心（推理/重置后对准主体用）
    const centerOn = (px, py) => {
        const st = $('#mattingStage');
        if (!st || !S.w) return;
        const s = S.baseScale * S.zoom;
        S.tx = st.clientWidth / 2 - px * s;
        S.ty = st.clientHeight / 2 - py * s;
        applyView();
    };

    // 尺寸变化但用户已手动缩放：重排布局的同时保持「看到的大小」不变
    const relayout = () => {
        const st = $('#mattingStage'), cv = $('#mattingCanvas');
        if (!st || !cv || !S.w || !S.h) return;
        const oldBase = S.baseScale;
        sizeStage();
        const vw = st.clientWidth, vh = st.clientHeight;
        if (!vw || !vh) return;
        const nb = Math.min(vw / S.w, vh / S.h, 1.6);
        S.baseScale = nb;
        cv.style.width = Math.round(S.w * nb) + 'px';
        cv.style.height = Math.round(S.h * nb) + 'px';
        if (oldBase) S.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, S.zoom * oldBase / nb));
        applyView();
    };

    const updateCursor = () => {
        const cv = $('#mattingCanvas');
        if (cv) {
            cv.style.cursor = wantPan() ? 'grab'
                : S.mode === 'move' ? 'move'
                    : S.mode === 'wand' ? 'pointer' : 'crosshair';
        }
        if (S.syncRing) S.syncRing();   // 切到抓手/点选时把笔尖圈收掉
    };
    const wantPan = () => S.mode === 'pan' || S.spaceDown;

    /* ---------------- 历史（蒙版存单通道灰度；结构变更才整份快照） ----------------
       条目两种：{t:'mask', id, data} 像素级（画笔/选区/后处理，几十 KB 一条）；
                 {t:'doc', snap} 结构级（新建/删除/编组/合并，克隆整棵树，条数限死） */
    const maskBytes = (L) => {
        const d = L.rctx.getImageData(0, 0, S.w, S.h).data;
        const g = new Uint8Array(S.w * S.h);
        for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = d[i + 3];
        return g;
    };
    const writeMask = (L, g) => {
        const im = L.rctx.createImageData(S.w, S.h);
        const d = im.data;
        for (let i = 0, j = 0; j < g.length; i += 4, j++) {
            d[i] = d[i + 1] = d[i + 2] = 255;
            d[i + 3] = g[j];
        }
        L.rctx.putImageData(im, 0, 0);
        L.hasMask = true;
        bumpLayer(L);
    };
    const snapshot = () => { const L = actLayer(); return L ? maskBytes(L) : null; };
    const cloneCanvas = (c) => {
        if (!c) return null;
        const n = mkCv(c.width, c.height);
        n.getContext('2d').drawImage(c, 0, 0);
        return n;
    };
    const cloneLayer = (L) => ({
        kind: 'layer', id: L.id, name: L.name, visible: L.visible, opacity: L.opacity, blend: L.blend,
        src: cloneCanvas(L.src), raw: cloneCanvas(L.raw), mask: cloneCanvas(L.mask), rmask: cloneCanvas(L.rmask),
        fg: cloneCanvas(L.fg), rgb: null, bgColor: L.bgColor, hasMask: L.hasMask, rmHas: L.rmHas,
        inpaintHist: (L.inpaintHist || []).map((c) => cloneCanvas(c)), _rev: 1, _sp: null, _spRev: -1
    });
    const cloneNode = (n) => (n.kind === 'group'
        ? { kind: 'group', id: n.id, name: n.name, visible: n.visible, opacity: n.opacity, collapsed: n.collapsed, children: n.children.map(cloneNode) }
        : cloneLayer(n));
    const captureDoc = () => ({ active: S.activeId, tree: S.tree.map(cloneNode) });
    const adoptLayer = (L) => Object.assign(L, { rctx: ctx2d(L.raw), mctx: ctx2d(L.mask), rmctx: ctx2d(L.rmask), _sp: null, _spRev: -1 });
    const adoptNode = (n) => (n.kind === 'group' ? Object.assign(n, { children: n.children.map(adoptNode) }) : adoptLayer(n));
    const firstLayerId = () => {
        let id = '';
        walkLayers((L) => { if (!id) id = L.id; });
        return id;
    };
    const restoreDoc = (snap) => {
        S.tree = snap.tree.map(adoptNode);
        S.activeId = layerById(snap.active) ? snap.active : firstLayerId();
        S._actSprite = null;
        S.rmHas = false;
        cacheRGB();
    };
    const pushHistory = () => {
        const L = actLayer();
        if (!L || !S.hasMask) return;
        S.undo.push({ t: 'mask', id: L.id, data: maskBytes(L) });
        if (S.undo.length > 12) S.undo.shift();
        S.redo.length = 0;
        syncHistoryButtons();
    };
    // 结构变更（增删图层、编组、合并、可见性、位置）→ 整份快照，条数少一点
    const pushDocHistory = () => {
        S.undo.push({ t: 'doc', snap: captureDoc() });
        if (S.undo.length > 8) S.undo.shift();
        S.redo.length = 0;
        syncHistoryButtons();
    };
    const syncHistoryButtons = () => {
        const u = $('#mattingUndo'), r = $('#mattingRedo');
        if (u) u.disabled = !S.undo.length;
        if (r) r.disabled = !S.redo.length;
    };
    // 撤销/重做：mask＝单通道蒙版，pix＝某一层的像素（移动/缩放），doc＝整棵树结构
    const undo = () => {
        if (!S.undo.length) return;
        const e = S.undo.pop();
        if (e.t === 'mask') {
            const L = layerById(e.id);
            if (!L) { syncHistoryButtons(); return; }
            S.redo.push({ t: 'mask', id: e.id, data: maskBytes(L) });
            if (e.id !== S.activeId) { S.activeId = e.id; S._actSprite = null; cacheRGB(); }
            writeMask(L, e.data);
            postProcess({ refine: false, feather: S.feather, contrast: S.contrast });
        } else if (e.t === 'pix') {
            const L = layerById(e.id);
            if (!L) { syncHistoryButtons(); return; }
            S.redo.push({ t: 'pix', id: e.id, data: snapLayer(L) });
            if (e.id !== S.activeId) { S.activeId = e.id; S._actSprite = null; }
            restorePix(L, e.data);
        } else {
            S.redo.push({ t: 'doc', snap: captureDoc() });
            restoreDoc(e.snap);
        }
        syncHistoryButtons();
        render();
        renderLayerPanel();
    };
    const redo = () => {
        if (!S.redo.length) return;
        const e = S.redo.pop();
        if (e.t === 'mask') {
            const L = layerById(e.id);
            if (!L) { syncHistoryButtons(); return; }
            S.undo.push({ t: 'mask', id: e.id, data: maskBytes(L) });
            if (e.id !== S.activeId) { S.activeId = e.id; S._actSprite = null; cacheRGB(); }
            writeMask(L, e.data);
            postProcess({ refine: false, feather: S.feather, contrast: S.contrast });
        } else if (e.t === 'pix') {
            const L = layerById(e.id);
            if (!L) { syncHistoryButtons(); return; }
            S.undo.push({ t: 'pix', id: e.id, data: snapLayer(L) });
            if (e.id !== S.activeId) { S.activeId = e.id; S._actSprite = null; }
            restorePix(L, e.data);
        } else {
            S.undo.push({ t: 'doc', snap: captureDoc() });
            restoreDoc(e.snap);
        }
        syncHistoryButtons();
        render();
        renderLayerPanel();
    };

    /* ---------------- 图层操作 ---------------- */
    const countLayers = () => { let n = 0; walkLayers(() => n++); return n; };
    const insertNode = (node, refId) => {
        const list = siblingList(refId);
        const i = list.findIndex((n) => n.id === refId);
        list.splice(i < 0 ? list.length : i + 1, 0, node);
    };
    const pruneEmptyGroups = () => {
        const prune = (arr) => {
            for (let i = arr.length - 1; i >= 0; i--) {
                const n = arr[i];
                if (n.kind !== 'group') continue;
                prune(n.children);
                if (!n.children.length) arr.splice(i, 1);
            }
        };
        prune(S.tree);
    };
    const selectLayer = (id) => {
        const L = layerById(id);
        if (!L) return;
        S.activeId = id;
        S._actSprite = null;
        if (!S.rgb) cacheRGB();
        render();
        renderLayerPanel();
    };

    const fileToBitmap = async (file) => {
        const buf = await file.arrayBuffer();
        if (window.createImageBitmap) return await createImageBitmap(new Blob([buf], { type: file.type }));
        return await new Promise((res, rej) => {
            const url = URL.createObjectURL(file);
            const im = new Image();
            im.onload = () => { URL.revokeObjectURL(url); res(im); };
            im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('图片解析失败')); };
            im.src = url;
        });
    };

    const lyrNew = () => {
        if (!S.w) return;
        pushDocHistory();
        const L = makeLayer('');
        insertNode(L, S.activeId);
        selectLayer(L.id);
        setStatus('已新建空图层「' + L.name + '」：用 🖼 贴图 往这层放图片，也可以拿它当编组/合并的单位');
    };
    const lyrDup = () => {
        const cur = activeNode();
        if (!cur || cur.kind !== 'layer') return;
        pushDocHistory();
        const L = adoptLayer(cloneLayer(cur));
        L.id = 'L' + (++S.layerSeq);
        L.name = cur.name + ' 副本';
        insertNode(L, cur.id);
        selectLayer(L.id);
        setStatus('已复制图层');
    };
    const lyrDel = () => {
        const cur = activeNode();
        if (!cur || cur.kind !== 'layer') return;
        if (countLayers() <= 1) return toast('至少要留一个图层');
        pushDocHistory();
        const list = siblingList(cur.id);
        const i = list.indexOf(cur);
        list.splice(i, 1);
        pruneEmptyGroups();
        const next = list[Math.min(i, list.length - 1)];
        S.activeId = next && next.kind === 'layer' ? next.id : firstLayerId();
        S._actSprite = null;
        cacheRGB();
        render();
        renderLayerPanel();
        setStatus('已删除图层「' + cur.name + '」');
    };
    const lyrMove = (dir) => {
        const cur = activeNode();
        if (!cur) return;
        const list = siblingList(cur.id);
        const i = list.indexOf(cur);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return toast(dir > 0 ? '已经在最上面了' : '已经在最下面了');
        pushDocHistory();
        list.splice(i, 1);
        list.splice(j, 0, cur);
        render();
        renderLayerPanel();
    };
    const lyrGroup = () => {
        const cur = activeNode();
        if (!cur) return;
        pushDocHistory();
        const list = siblingList(cur.id);
        const i = list.indexOf(cur);
        S.groupSeq++;
        const g = { kind: 'group', id: 'G' + S.groupSeq, name: '组 ' + S.groupSeq, visible: true, opacity: 1, collapsed: false, children: [cur] };
        list.splice(i, 1, g);
        render();
        renderLayerPanel();
        setStatus('已编组：' + g.name + '（点组名前的箭头折叠，点眼睛整组显隐）');
    };
    const lyrUngroup = (id) => {
        const g = nodeById(id);
        if (!g || g.kind !== 'group') return;
        pushDocHistory();
        const list = siblingList(g.id);
        const i = list.indexOf(g);
        list.splice(i, 1, ...g.children);
        render();
        renderLayerPanel();
        setStatus('已解散分组');
    };
    // 向下合并：把两层按各自的蒙版/不透明度/混合画成一张，替换掉下层
    const lyrMerge = () => {
        const cur = activeNode();
        if (!cur || cur.kind !== 'layer') return;
        const list = siblingList(cur.id);
        const i = list.indexOf(cur);
        const below = list[i - 1];
        if (!below) return toast('下面没有图层可以合并');
        if (below.kind === 'group') return toast('下面是分组，先展开分组再和里面的图层合并');
        pushDocHistory();
        const c = mkCv(S.w, S.h);
        const x = c.getContext('2d');
        const put = (n) => {
            const sp = layerSprite(n);
            if (!sp) return;
            x.globalAlpha = n.opacity == null ? 1 : n.opacity;
            x.globalCompositeOperation = n.blend || 'source-over';
            x.drawImage(sp, 0, 0, S.w, S.h);
        };
        if (below.visible !== false) put(below);
        if (cur.visible !== false) put(cur);
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';
        below.src = c;
        below.fg = null;
        below.hasMask = true;
        below.opacity = 1;
        below.blend = 'source-over';
        below.rctx.clearRect(0, 0, S.w, S.h);
        below.rctx.fillStyle = '#fff';
        below.rctx.fillRect(0, 0, S.w, S.h);
        below.mctx.clearRect(0, 0, S.w, S.h);
        below.mctx.fillStyle = '#fff';
        below.mctx.fillRect(0, 0, S.w, S.h);
        bumpLayer(below);
        list.splice(i, 1);
        S.activeId = below.id;
        S._actSprite = null;
        cacheRGB();
        render();
        renderLayerPanel();
        setStatus('已合并到「' + below.name + '」');
    };
    const lyrToggle = (id) => {
        const n = nodeById(id);
        if (!n) return;
        pushDocHistory();
        n.visible = n.visible === false;
        render();
        renderLayerPanel();
    };
    const lyrCollapse = (id) => {
        const n = nodeById(id);
        if (!n || n.kind !== 'group') return;
        n.collapsed = !n.collapsed;
        renderLayerPanel();
    };
    const lyrRename = (id, name) => {
        const n = nodeById(id);
        if (!n) return;
        const v = String(name || '').trim().slice(0, 24);
        if (!v || v === n.name) return renderLayerPanel();
        pushDocHistory();
        n.name = v;
        renderLayerPanel();
    };
    const lyrOpacity = (v) => {
        const n = activeNode();
        if (!n || n.kind !== 'layer') return;
        n.opacity = Math.max(0, Math.min(1, v / 100));
        bumpLayer(n);
        if (n.id === S.activeId) S._actSprite = null;
        render();
    };
    const lyrBlend = (mode) => {
        const n = activeNode();
        if (!n || n.kind !== 'layer') return;
        n.blend = mode || 'source-over';
        bumpLayer(n);
        render();
    };

    /* ---------------- 移动图层（PS 的移动工具 V） ----------------
       直接平移像素：src / raw / mask / rmask 一起挪，蒙版和图像永远对齐，
       画笔那边完全不用知道偏移量。raw/mask/rmask 的 ctx 跟画布是绑死的，
       所以只能原地重画，不能换画布对象（只有 src 可以换新的）。 */
    const snapLayer = (L) => ({
        src: L.src ? cloneCanvas(L.src) : null,
        raw: cloneCanvas(L.raw),
        mask: L.hasMask ? cloneCanvas(L.mask) : null,
        rmask: cloneCanvas(L.rmask),
        fg: L.fg ? cloneCanvas(L.fg) : null,
        hasMask: !!L.hasMask,
        rmHas: !!L.rmHas
    });

    const paintShifted = (ctx, srcC, dx, dy, sc) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, S.w, S.h);
        if (!srcC) return;
        if (sc && Math.abs(sc - 1) > 1e-4) {
            ctx.translate(S.w / 2 + dx, S.h / 2 + dy);
            ctx.scale(sc, sc);
            ctx.drawImage(srcC, -S.w / 2, -S.h / 2, S.w, S.h);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
            ctx.drawImage(srcC, Math.round(dx), Math.round(dy));
        }
    };

    const applyLayerShift = (L, snap, dx, dy, sc) => {
        if (!L || !snap) return;
        if (snap.src) {
            const c = mkCv(S.w, S.h);
            paintShifted(c.getContext('2d'), snap.src, dx, dy, sc);
            L.src = c;
        }
        paintShifted(L.rctx, snap.raw, dx, dy, sc);
        if (L.hasMask && snap.mask) paintShifted(L.mctx, snap.mask, dx, dy, sc);
        paintShifted(L.rmctx, snap.rmask, dx, dy, sc);
        L.fg = null;      // 去过底色的前景缓存要作废
        L.rgb = null;
        bumpLayer(L);
        if (L.id === S.activeId) { S._actSprite = null; cacheRGB(); }
    };

    // 图层内容的包围盒（在 320px 缩略图上扫一遍，够准也够快）
    const layerBBox = (L) => {
        if (!L || !L.src) return null;
        const k = Math.max(1, Math.max(S.w, S.h) / 320);
        const w = Math.max(1, Math.round(S.w / k)), h = Math.max(1, Math.round(S.h / k));
        const c = mkCv(w, h);
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(L.src, 0, 0, w, h);
        const d = x.getImageData(0, 0, w, h).data;
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let yy = 0; yy < h; yy++) {
            for (let xx = 0; xx < w; xx++) {
                if (d[(yy * w + xx) * 4 + 3] > 8) {
                    if (xx < minX) minX = xx;
                    if (xx > maxX) maxX = xx;
                    if (yy < minY) minY = yy;
                    if (yy > maxY) maxY = yy;
                }
            }
        }
        if (maxX < 0) return null;
        return { x: minX * k, y: minY * k, w: (maxX - minX + 1) * k, h: (maxY - minY + 1) * k };
    };

    // 像素级历史：只存这一层的四张画布（比整棵树的快照便宜得多）
    const pushPixEntry = (L, snap) => {
        if (!L || !snap) return;
        S.undo.push({ t: 'pix', id: L.id, data: snap });
        if (S.undo.length > 12) S.undo.shift();
        S.redo.length = 0;
        syncHistoryButtons();
    };
    const restorePix = (L, snap) => {
        if (!L || !snap) return;
        L.src = snap.src ? cloneCanvas(snap.src) : null;
        paintShifted(L.rctx, snap.raw, 0, 0, 1);
        if (snap.mask) paintShifted(L.mctx, snap.mask, 0, 0, 1);
        paintShifted(L.rmctx, snap.rmask, 0, 0, 1);
        L.hasMask = !!snap.hasMask;
        L.rmHas = !!snap.rmHas;
        L.fg = snap.fg ? cloneCanvas(snap.fg) : null;
        L.rgb = null;
        bumpLayer(L);
        if (L.id === S.activeId) { S._actSprite = null; cacheRGB(); }
    };

    // 一次性移动（键盘微调 / 菜单里的居中铺满都走这里）
    const moveLayerBy = (dx, dy) => {
        const L = actLayer();
        if (!L || !L.src) return toast('当前图层没有像素，先切到有内容的图层');
        if (!dx && !dy) return;
        const snap = snapLayer(L);
        applyLayerShift(L, snap, dx, dy, 1);
        pushPixEntry(L, snap);
        renderLayerPanel();
        render();
    };

    const centerLayer = () => {
        const L = actLayer();
        if (!L || !L.src) return toast('当前图层没有像素');
        const b = layerBBox(L);
        if (!b) return toast('这一层是空的，没东西可移');
        const dx = Math.round((S.w - b.w) / 2 - b.x);
        const dy = Math.round((S.h - b.h) / 2 - b.y);
        if (!dx && !dy) return toast('已经在画面中央了');
        pushDocHistory();
        applyLayerShift(L, snapLayer(L), dx, dy, 1);
        renderLayerPanel();
        render();
        setStatus('图层已居中（位移 ' + dx + ', ' + dy + ' px）');
    };

    const fitLayer = () => {
        const L = actLayer();
        if (!L || !L.src) return toast('当前图层没有像素');
        const b = layerBBox(L);
        if (!b) return toast('这一层是空的');
        const sc = Math.max(S.w / b.w, S.h / b.h);
        pushDocHistory();
        applyLayerShift(L, snapLayer(L), 0, 0, sc);
        const b2 = layerBBox(L);
        if (b2) {
            applyLayerShift(L, snapLayer(L), Math.round((S.w - b2.w) / 2 - b2.x), Math.round((S.h - b2.h) / 2 - b2.y), 1);
        }
        renderLayerPanel();
        render();
        setStatus('图层已铺满画布（缩放 ' + Math.round(sc * 100) + '%）');
    };

    // 拖拽移动：拖动过程中实时重画，松手才记一条撤销
    const layerDrag = { on: false, id: '', snap: null, from: null, dx: 0, dy: 0, pre: null };
    const beginLayerDrag = (e) => {
        const L = actLayer();
        if (!L) return false;
        if (!L.src) { toast('当前图层没有像素，先「🖼 贴图」或切到有内容的图层'); return false; }
        layerDrag.on = true;
        layerDrag.id = L.id;
        layerDrag.snap = snapLayer(L);
        layerDrag.from = toCanvasXY(e);
        layerDrag.dx = 0;
        layerDrag.dy = 0;
        layerDrag.pre = captureDoc();
        return true;
    };
    const moveLayerDrag = (e) => {
        const L = layerById(layerDrag.id);
        if (!L) return;
        const p = toCanvasXY(e);
        const dx = Math.round(p.x - layerDrag.from.x);
        const dy = Math.round(p.y - layerDrag.from.y);
        if (dx === layerDrag.dx && dy === layerDrag.dy) return;
        layerDrag.dx = dx;
        layerDrag.dy = dy;
        applyLayerShift(L, layerDrag.snap, dx, dy, 1);
        render();
    };
    const endLayerDrag = () => {
        if (!layerDrag.on) return;
        layerDrag.on = false;
        const dx = layerDrag.dx, dy = layerDrag.dy;
        const L = layerById(layerDrag.id);
        if ((dx || dy) && L && layerDrag.snap) {
            pushPixEntry(L, layerDrag.snap);
            setStatus('图层已移动 ' + dx + ', ' + dy + ' px（⌘/Ctrl+Z 可撤销）');
            renderLayerPanel();
        }
        layerDrag.snap = null;
        layerDrag.dx = 0;
        layerDrag.dy = 0;
    };

    /* ---------------- 图层层级 / 拼合 ---------------- */
    const moveToEdge = (id, edge) => {
        const n = nodeById(id);
        if (!n) return;
        const list = siblingList(id);
        const i = list.indexOf(n);
        if (i < 0) return;
        if (edge === 'top' && i === list.length - 1) return;
        if (edge === 'bottom' && i === 0) return;
        pushDocHistory();
        list.splice(i, 1);
        if (edge === 'top') list.push(n); else list.unshift(n);
        renderLayerPanel();
        render();
        setStatus(edge === 'top' ? '已置于顶层' : '已置于底层');
    };

    const flattenVisible = () => {
        const vis = [];
        walkLayers((L) => { if (L.visible !== false) vis.push(L); });
        if (vis.length < 2) return toast('可见图层不到两层，不用拼合');
        pushDocHistory();
        const c = mkCv(S.w, S.h);
        composeDoc(c.getContext('2d'), true);
        const L = makeLayer('拼合图层', { src: c, hasMask: true });
        L.rctx.fillStyle = '#fff';
        L.rctx.fillRect(0, 0, S.w, S.h);
        L.mctx.fillStyle = '#fff';
        L.mctx.fillRect(0, 0, S.w, S.h);
        S.tree = [L];
        S.activeId = L.id;
        S._actSprite = null;
        cacheRGB();
        renderLayerPanel();
        render();
        setStatus('已拼合 ' + vis.length + ' 个可见图层（隐藏的图层被丢弃）');
    };

    const deleteNode = (id) => {
        const n = nodeById(id);
        if (!n) return;
        if (n.kind === 'layer') {
            S.activeId = id;
            return lyrDel();
        }
        if (countLayers() - countGroupLayers(n) <= 0) return toast('这一组里没有图层');
        pushDocHistory();
        const list = siblingList(id);
        const i = list.indexOf(n);
        if (i >= 0) list.splice(i, 1);
        S.activeId = firstLayerId();
        S._actSprite = null;
        cacheRGB();
        renderLayerPanel();
        render();
        setStatus('已删除分组「' + n.name + '」和它里面的图层');
    };

    const countGroupLayers = (g) => {
        let c = 0;
        const walk = (arr) => arr.forEach((n) => { if (n.kind === 'group') walk(n.children); else c++; });
        walk(g.children || []);
        return c;
    };

    /* ---------------- 图层右键菜单 ---------------- */
    let hideLayerMenu = () => { };
    const showLayerMenu = (x, y, id) => {
        const menu = $('#lyrMenu');
        const n = nodeById(id);
        if (!menu || !n) return;
        const items = [];
        const sep = () => items.push({ sep: true });
        if (n.kind === 'layer') {
            items.push({ label: '复制图层', fn: () => lyrDup() });
            items.push({ label: '编组', fn: () => lyrGroup() });
            items.push({ label: '向下合并', fn: () => lyrMerge() });
            sep();
            items.push({ label: '居中到画面', fn: () => { selectLayer(n.id); centerLayer(); } });
            items.push({ label: '铺满画布', fn: () => { selectLayer(n.id); fitLayer(); } });
        } else {
            items.push({ label: '解散分组', fn: () => lyrUngroup(n.id) });
        }
        sep();
        items.push({ label: '置于顶层', fn: () => moveToEdge(n.id, 'top') });
        items.push({ label: '置于底层', fn: () => moveToEdge(n.id, 'bottom') });
        sep();
        items.push({ label: '拼合可见图层', fn: () => flattenVisible() });
        items.push({ label: '删除' + (n.kind === 'group' ? '分组' : '图层'), fn: () => deleteNode(n.id), danger: true });
        menu.innerHTML = '';
        items.forEach((it) => {
            if (it.sep) {
                const d = document.createElement('div');
                d.className = 'lyr-menu-sep';
                menu.appendChild(d);
                return;
            }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'lyr-menu-item' + (it.danger ? ' danger' : '');
            b.textContent = it.label;
            b.onclick = () => { hideLayerMenu(); it.fn(); };
            menu.appendChild(b);
        });
        menu.hidden = false;
        // 贴着鼠标，但不许超出视口
        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        const px = Math.min(x, window.innerWidth - mw - 8);
        const py = Math.min(y, window.innerHeight - mh - 8);
        menu.style.left = Math.max(8, px) + 'px';
        menu.style.top = Math.max(8, py) + 'px';
    };
    hideLayerMenu = () => {
        const menu = $('#lyrMenu');
        if (menu) menu.hidden = true;
    };

    /* ---------------- 图层拖动排序 ---------------- */
    const isDescendantOf = (id, rootId) => {
        const root = nodeById(rootId);
        if (!root || root.kind !== 'group') return false;
        let hit = false;
        const walk = (arr) => arr.some((n) => {
            if (n.id === id) { hit = true; return true; }
            return n.kind === 'group' && walk(n.children);
        });
        walk(root.children);
        return hit;
    };
    // 把 node 放到 target 的上面/下面（above/below 是界面方向），或放进组（into）
    const moveNodeTo = (id, targetId, where) => {
        if (!id || !targetId || id === targetId) return false;
        const node = nodeById(id);
        const tgt = nodeById(targetId);
        if (!node || !tgt) return false;
        if (tgt.kind === 'group' && isDescendantOf(tgt.id, id)) return false;   // 不能把组塞进自己
        if (isDescendantOf(id, targetId)) return false;
        if (where === 'into' && tgt.kind !== 'group') return false;
        const from = siblingList(id);
        const fi = from.indexOf(node);
        if (fi < 0) return false;
        // 拖到原位附近就当作没动
        const to0 = siblingList(targetId);
        const ti0 = to0.indexOf(tgt);
        if (from === to0 && where !== 'into') {
            const want = where === 'above' ? ti0 + 1 : ti0;
            if (want === fi || want === fi + 1) return false;
        }
        from.splice(fi, 1);
        if (where === 'into') {
            tgt.children.push(node);
        } else {
            const to = siblingList(targetId);
            const j = to.indexOf(tgt);
            // 界面上的「上面」= 数组里更靠后（数组 0 是最底层）
            const at = where === 'above' ? j + 1 : j;
            to.splice(j < 0 ? to.length : at, 0, node);
        }
        if (node.kind === 'group' && where !== 'into') node.collapsed = false;
        return true;
    };

    const layerThumbURL = (L) => {
        const N = 40;
        const c = mkCv(N, N);
        const x = c.getContext('2d');
        x.fillStyle = '#fff';
        x.fillRect(0, 0, N, N);
        x.fillStyle = '#e8e2d8';
        for (let yy = 0; yy < N; yy += 8) {
            for (let xx = 0; xx < N; xx += 8) if (((xx + yy) / 8) % 2) x.fillRect(xx, yy, 8, 8);
        }
        const sp = L.src ? layerSprite(L) : null;
        if (sp) {
            const k = Math.min(N / S.w, N / S.h);
            const dw = S.w * k, dh = S.h * k;
            x.drawImage(sp, (N - dw) / 2, (N - dh) / 2, dw, dh);
        }
        return c.toDataURL();
    };

    let renderLayerPanel = () => { };
    const buildLayerRow = (n, depth, isGroup) => {
        const row = document.createElement('div');
        row.className = 'lyr-row' + (isGroup ? ' is-group' : '') + (n.id === S.activeId ? ' on' : '') + (n.visible === false ? ' off' : '');
        row.style.paddingLeft = (6 + depth * 14) + 'px';
        row.dataset.id = n.id;
        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'lyr-eye';
        eye.title = n.visible === false ? '显示这一层' : '隐藏这一层';
        eye.textContent = n.visible === false ? '🚫' : '👁';
        eye.onclick = (e) => { e.stopPropagation(); lyrToggle(n.id); };
        row.appendChild(eye);
        if (isGroup) {
            const caret = document.createElement('button');
            caret.type = 'button';
            caret.className = 'lyr-caret';
            caret.textContent = n.collapsed ? '▸' : '▾';
            caret.title = n.collapsed ? '展开' : '折叠';
            caret.onclick = (e) => { e.stopPropagation(); lyrCollapse(n.id); };
            row.appendChild(caret);
            const t = document.createElement('span');
            t.className = 'lyr-name';
            t.textContent = '🗀 ' + n.name;
            t.title = '双击改名；右键解散分组';
            row.appendChild(t);
            const cnt = document.createElement('span');
            cnt.className = 'lyr-count';
            cnt.textContent = '(' + n.children.length + ')';
            row.appendChild(cnt);
            row.ondblclick = () => startRename(row, t, n);
        } else {
            const img = document.createElement('img');
            img.className = 'lyr-thumb';
            img.alt = '';
            img.src = layerThumbURL(n);
            row.appendChild(img);
            const t = document.createElement('span');
            t.className = 'lyr-name';
            t.textContent = n.name;
            t.title = '双击改名';
            row.appendChild(t);
            row.ondblclick = () => startRename(row, t, n);
        }
        row.onclick = () => { if (!isGroup) selectLayer(n.id); };
        row.oncontextmenu = (e) => {
            e.preventDefault();
            if (!isGroup) selectLayer(n.id);
            showLayerMenu(e.clientX, e.clientY, n.id);
        };
        // 拖动排序：按下先记着，真的移动 5px 才算拖，避免和点击/双击冲突
        row.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.lyr-eye') || e.target.closest('.lyr-caret') || e.target.closest('.lyr-rename')) return;
            rowDrag = { id: n.id, x: e.clientX, y: e.clientY, on: false, pre: null, line: null };
        });
        return row;
    };

    /* ---- 拖动排序（PS 里直接拖图层） ---- */
    let rowDrag = null;
    const dropLine = (box, y) => {
        if (!rowDrag.line) {
            rowDrag.line = document.createElement('div');
            rowDrag.line.className = 'lyr-drop-line';
            box.appendChild(rowDrag.line);
        }
        const br = box.getBoundingClientRect();
        rowDrag.line.style.top = Math.max(0, y - br.top + box.scrollTop) + 'px';
    };
    const dropTarget = (x, y) => {
        const el = document.elementFromPoint(x, y);
        const row = el && el.closest ? el.closest('.lyr-row') : null;
        if (!row || row.dataset.id === rowDrag.id) return null;
        const r = row.getBoundingClientRect();
        const rel = (y - r.top) / Math.max(1, r.height);
        const isGroup = row.classList.contains('is-group');
        let where = rel < 0.5 ? 'above' : 'below';
        if (isGroup && rel > 0.3 && rel < 0.7) where = 'into';
        return { id: row.dataset.id, where, top: r.top, bottom: r.bottom };
    };
    const endRowDrag = (x, y) => {
        if (!rowDrag) return;
        const drag = rowDrag;
        // 先算落点再清状态：dropTarget 里要用 rowDrag.id 排除自己
        const tgt = (drag.on && x != null) ? dropTarget(x, y) : null;
        rowDrag = null;
        if (drag.line) drag.line.remove();
        if (!drag.on) return;
        const box = $('#lyrList');
        if (box) box.classList.remove('dragging');
        if (!tgt) return;
        if (!moveNodeTo(drag.id, tgt.id, tgt.where)) return;
        if (drag.pre) {
            S.undo.push({ t: 'doc', snap: drag.pre });
            if (S.undo.length > 8) S.undo.shift();
            S.redo.length = 0;
            syncHistoryButtons();
        }
        renderLayerPanel();
        render();
        setStatus('图层顺序已调整');
    };
    const startRename = (row, span, n) => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'lyr-rename';
        inp.value = n.name;
        span.replaceWith(inp);
        inp.focus();
        inp.select();
        const done = (ok) => {
            const v = inp.value;
            inp.remove();
            span.textContent = (n.kind === 'group' ? '🗀 ' : '') + n.name;
            row.insertBefore(span, row.querySelector('.lyr-count'));
            if (ok) lyrRename(n.id, v);
        };
        inp.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); done(true); }
            else if (e.key === 'Escape') { e.preventDefault(); done(false); }
        };
        inp.onblur = () => done(true);
        inp.onclick = (e) => e.stopPropagation();
    };
    renderLayerPanel = () => {
        const box = $('#lyrList');
        if (!box) return;
        box.innerHTML = '';
        if (!S.tree.length) return;
        const walk = (arr, depth) => {
            for (let i = arr.length - 1; i >= 0; i--) {   // 数组 0 = 最底层，界面从上往下显示
                const n = arr[i];
                if (n.kind === 'group') {
                    box.appendChild(buildLayerRow(n, depth, true));
                    if (!n.collapsed) walk(n.children, depth + 1);
                } else {
                    box.appendChild(buildLayerRow(n, depth, false));
                }
            }
        };
        walk(S.tree, 0);
        const cur = activeNode();
        const op = $('#lyrOpacity'), opv = $('#lyrOpacityVal'), bl = $('#lyrBlend');
        if (cur && cur.kind === 'layer') {
            const v = Math.round((cur.opacity == null ? 1 : cur.opacity) * 100);
            if (op) op.value = String(v);
            if (opv) opv.textContent = v + '%';
            if (bl) bl.value = cur.blend || 'source-over';
        }
        const hint = $('#lyrHint');
        if (hint) hint.textContent = '(' + countLayers() + ' 层)';
    };

    /* ---------------- 新建画布 / 贴图成层 ---------------- */
    const DOC_MAX = 2400;
    const newCanvasDoc = (w, h, bg) => {
        const W = Math.max(16, Math.min(DOC_MAX, Math.round(Number(w) || 1080)));
        const H = Math.max(16, Math.min(DOC_MAX, Math.round(Number(h) || 1080)));
        setupCanvases(W, H);
        S.natural = [W, H];
        S.name = '新建画布';
        S.pickKey = null;
        S.bgColor = undefined;
        const L = actLayer();
        const c = mkCv(W, H);
        const x = c.getContext('2d');
        const solid = bg && bg !== 'transparent';
        if (solid) { x.fillStyle = bg; x.fillRect(0, 0, W, H); }
        L.src = c;
        L.fg = null;
        L.name = solid ? '背景' : '图层 1';
        L.hasMask = true;
        L.rctx.fillStyle = '#fff';
        L.rctx.fillRect(0, 0, W, H);
        L.mctx.fillStyle = '#fff';
        L.mctx.fillRect(0, 0, W, H);
        S.hasMask = true;
        cacheRGB();
        const stage = $('#mattingStage');
        if (stage) {
            stage.classList.remove('is-empty');
            stage.dataset.wheelLock = '1';
        }
        const empty = $('#mattingEmpty');
        if (empty) empty.style.display = 'none';
        setNeedImg(true);
        S.userZoomed = false;
        render();
        renderLayerPanel();
        fitView(false);
        syncHistoryButtons();
        syncRmButtons();
        setStatus('已新建 ' + W + '×' + H + (solid ? ' 画布（' + bg + ' 底色）' : ' 透明画布') + '，可以直接画，也可以用「＋ 贴图」加图层');
        toast('画布已创建');
    };
    const addImageLayer = async (file) => {
        if (!file) return;
        if (!/^image\//.test(file.type || '')) return toast('请选择图片文件');
        if (!S.w) return newCanvasDoc(1080, 1080, 'transparent');
        setStatus('正在把图片加为新图层...');
        let bmp;
        try { bmp = await fileToBitmap(file); } catch (e) { return toast('图片解析失败：' + e.message); }
        pushDocHistory();
        const c = mkCv(S.w, S.h);
        const x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        // 跟 PS 一样按 100% 贴进来：只有比画布大时才缩，小图不再被拉大（否则几张图全糊成一块）
        const k = Math.min(1, S.w / bmp.width, S.h / bmp.height);
        const dw = Math.max(1, Math.round(bmp.width * k)), dh = Math.max(1, Math.round(bmp.height * k));
        x.drawImage(bmp, Math.round((S.w - dw) / 2), Math.round((S.h - dh) / 2), dw, dh);
        const L = makeLayer((file.name || '图片').replace(/\.[^.]+$/, '').slice(0, 16), { src: c });
        insertNode(L, S.activeId);
        selectLayer(L.id);
        cacheRGB();
        render();
        renderLayerPanel();
        setStatus('已添加图层「' + L.name + '」，抠图只作用在这一层，下面的图层不受影响');
    };

    /* ---------------- 笔刷库（PS .abr / 图片笔尖） ----------------
       浏览器里没有 PS 的笔刷引擎，这里只做「笔尖位图」这一层：
       - .abr：按记录特征扫描出 depth/comp/bounds 自洽的笔尖。v1/v2 的 preamble 是 10 字节，
         v6/7/9/10 子版本 1/2 又是 264/301 字节，硬编码偏移在各种导出器上都会错位，
         所以这里不猜结构，直接校验「尺寸 + 位深 + 压缩 + 数据长度」四个条件同时成立。
       - 图片：取透明通道；没有透明通道（JPG/实心 PNG）就按 PS 灰度笔尖的约定取亮度反相。
       - 笔尖统一存成 alpha 数组，画的时候按当前画笔大小缩放成白色精灵再贴（擦除用 destination-out，
         所以颜色无所谓，只看 alpha）。 */
    const TIP_MAX = 1024;      // 单支笔尖最大边长，超出降采样（大笔刷几十 MB 会爆内存）
    const TIP_LIMIT = 60;      // 笔刷库上限

    const readAscii = (buf, off, len) => {
        let s = '';
        for (let i = 0; i < len && off + i < buf.length; i++) {
            const c = buf[off + i];
            if (!c) break;
            s += String.fromCharCode(c);
        }
        return s;
    };

    const tipThumb = (alpha, w, h) => {
        const N = 48;
        const c = document.createElement('canvas');
        c.width = N; c.height = N;
        const cx = c.getContext('2d');
        const img = cx.createImageData(N, N);
        const d = img.data;
        for (let y = 0; y < N; y++) {
            const sy = Math.min(h - 1, Math.floor(y * h / N));
            for (let x = 0; x < N; x++) {
                const sx = Math.min(w - 1, Math.floor(x * w / N));
                const o = (y * N + x) * 4;
                d[o] = 74; d[o + 1] = 59; d[o + 2] = 40; d[o + 3] = alpha[sy * w + sx];
            }
        }
        cx.putImageData(img, 0, 0);
        return c.toDataURL('image/png');
    };

    const shrinkAlpha = (alpha, w, h, max) => {
        if (Math.max(w, h) <= max) return { alpha, w, h };
        const k = max / Math.max(w, h);
        const nw = Math.max(1, Math.round(w * k));
        const nh = Math.max(1, Math.round(h * k));
        const out = new Uint8ClampedArray(nw * nh);
        for (let y = 0; y < nh; y++) {
            const sy = Math.min(h - 1, Math.floor(y * h / nh));
            for (let x = 0; x < nw; x++) {
                const sx = Math.min(w - 1, Math.floor(x * w / nw));
                out[y * nw + x] = alpha[sy * w + sx];
            }
        }
        return { alpha: out, w: nw, h: nh };
    };

    const abrVersionOk = (v) => v === 1 || v === 2 || (v >= 6 && v <= 10);

    // 一条笔尖记录：bounds(4×int32) + depth(u16) + compress(u8) + 位图
    const abrRecordAt = (dv, buf, off) => {
        if (off + 19 > buf.length) return null;
        const top = dv.getInt32(off), left = dv.getInt32(off + 4);
        const bottom = dv.getInt32(off + 8), right = dv.getInt32(off + 12);
        const w = right - left, h = bottom - top;
        if (w < 12 || h < 12 || w > 8192 || h > 8192) return null;
        if (w * h < 256 || w * h > 16000000) return null;
        if (w / h > 8 || h / w > 8) return null;
        const depth = dv.getUint16(off + 16), comp = buf[off + 18];
        if (depth !== 1 && depth !== 8 && depth !== 16) return null;
        if (comp !== 0 && comp !== 1) return null;      // 2/3（zip）暂不支持，跳过
        const rowBytes = depth === 1 ? Math.ceil(w / 8) : depth === 16 ? w * 2 : w;
        const dataOff = off + 19;
        let dataLen;
        if (comp === 0) {
            dataLen = rowBytes * h;
        } else {
            if (dataOff + h * 2 > buf.length) return null;
            dataLen = h * 2;
            for (let y = 0; y < h; y++) dataLen += dv.getUint16(dataOff + y * 2);
        }
        if (dataLen <= 0 || dataOff + dataLen > buf.length) return null;
        return { w, h, depth, comp, dataOff, dataLen, end: dataOff + dataLen };
    };

    const abrDecode = (dv, buf, rec) => {
        const { w, h, depth, comp, dataOff } = rec;
        const rowBytes = depth === 1 ? Math.ceil(w / 8) : depth === 16 ? w * 2 : w;
        const rows = new Uint8Array(rowBytes * h);
        if (comp === 0) {
            rows.set(buf.subarray(dataOff, dataOff + rowBytes * h));
        } else {
            // PackBits：先 h 个 u16 行长，再逐行解压
            let p = dataOff + h * 2;
            for (let y = 0; y < h; y++) {
                const rowLen = dv.getUint16(dataOff + y * 2);
                let q = p, o = 0;
                const qEnd = Math.min(buf.length, p + rowLen);
                while (q < qEnd && o < rowBytes) {
                    let n = buf[q++];
                    if (n > 127) n -= 256;
                    if (n === -128) continue;
                    if (n < 0) {
                        const cnt = -n + 1;
                        const v = buf[q++];
                        for (let k = 0; k < cnt && o < rowBytes; k++) rows[y * rowBytes + o++] = v;
                    } else {
                        const cnt = n + 1;
                        for (let k = 0; k < cnt && o < rowBytes && q < qEnd; k++) rows[y * rowBytes + o++] = buf[q++];
                    }
                }
                p = qEnd;
            }
        }
        const alpha = new Uint8ClampedArray(w * h);
        if (depth === 8) {
            alpha.set(rows);
        } else if (depth === 16) {
            for (let i = 0; i < w * h; i++) alpha[i] = rows[i * 2];    // 大端：高字节就是 8 位灰度
        } else {
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    alpha[y * w + x] = (rows[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
                }
            }
        }
        return alpha;
    };

    const abrTips = (arrayBuffer) => {
        const buf = new Uint8Array(arrayBuffer);
        const dv = new DataView(arrayBuffer);
        let p = 0;
        if (readAscii(buf, 0, 4) === '8BPS') p = 4;
        if (buf.length < p + 4) throw new Error('文件太小，不像 .abr');
        const major = dv.getUint16(p);
        if (!abrVersionOk(major)) throw new Error('不认识的 .abr 版本（' + major + '）');
        const out = [];
        let last = 0;
        for (let off = p + 4; off + 19 <= buf.length && out.length < 40; off++) {
            if (off < last) continue;
            const rec = abrRecordAt(dv, buf, off);
            if (!rec) continue;
            out.push({ alpha: abrDecode(dv, buf, rec), w: rec.w, h: rec.h });
            last = rec.end;
        }
        return out;
    };

    const tipFromImage = async (file) => {
        const url = URL.createObjectURL(file);
        try {
            const img = await new Promise((res, rej) => {
                const im = new Image();
                im.onload = () => res(im);
                im.onerror = () => rej(new Error('图片解码失败'));
                im.src = url;
            });
            const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            if (!w || !h) throw new Error('拿不到图片尺寸');
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const cx = c.getContext('2d', { willReadFrequently: true });
            cx.drawImage(img, 0, 0);
            const d = cx.getImageData(0, 0, w, h).data;
            const alpha = new Uint8ClampedArray(w * h);
            let transparent = false;
            for (let i = 0; i < w * h; i++) {
                const a = d[i * 4 + 3];
                if (a < 250) transparent = true;
                alpha[i] = a;
            }
            if (!transparent) {
                for (let i = 0; i < w * h; i++) {
                    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
                    alpha[i] = 255 - Math.round(r * 0.299 + g * 0.587 + b * 0.114);
                }
            }
            return { alpha, w, h };
        } finally {
            URL.revokeObjectURL(url);
        }
    };

    const addTip = (alpha, w, h, name) => {
        if (!alpha || !(w > 0) || !(h > 0)) return null;
        const t = shrinkAlpha(alpha, w, h, TIP_MAX);
        const tip = {
            id: 'tip' + (S.tipSeq++),
            name: name || '笔刷',
            w: t.w, h: t.h,
            alpha: t.alpha,
            thumb: tipThumb(t.alpha, t.w, t.h),
            group: ''
        };
        S.brushes.push(tip);
        while (S.brushes.length > TIP_LIMIT) {
            const gone = S.brushes.shift();
            const gi = S.brushSel.indexOf(gone.id);
            if (gi >= 0) S.brushSel.splice(gi, 1);
        }
        return tip;
    };

    const selectBrush = (i) => {
        S.brushIdx = i >= 0 && i < S.brushes.length ? i : -1;
        S.tip = S.brushIdx >= 0 ? S.brushes[S.brushIdx] : null;
        renderBrushList();
        const note = $('#mattingBrushTip');
        if (note) {
            note.textContent = S.tip
                ? S.tip.name + ' · ' + S.tip.w + '×' + S.tip.h + ' px（硬度只对圆头生效）'
                : '圆头软笔刷：大小 / 硬度可调';
        }
        if (S.syncRing) S.syncRing();
    };

    /* ---- 勾选 / 分组 / 批量删除 ---- */
    const brushPicked = (id) => S.brushSel.indexOf(id) >= 0;
    const brushPickCount = () => S.brushSel.length;
    const brushTogglePick = (id) => {
        const i = S.brushSel.indexOf(id);
        if (i >= 0) S.brushSel.splice(i, 1); else S.brushSel.push(id);
        renderBrushList();
        syncBrushTools();
    };
    const brushClearPick = () => { S.brushSel = []; renderBrushList(); syncBrushTools(); };
    const brushDelete = () => {
        const ids = S.brushSel.length ? S.brushSel.slice() : (S.tip ? [S.tip.id] : []);
        if (!ids.length) return toast('先勾选要删的笔刷（圆头默认笔刷不能删）');
        const names = ids.map((id) => (S.brushes.find((b) => b.id === id) || {}).name).filter(Boolean);
        S.brushes = S.brushes.filter((b) => ids.indexOf(b.id) < 0);
        // 分组空了就顺手清掉
        S.brushGroups = S.brushGroups.filter((g) => S.brushes.some((b) => b.group === g));
        S.brushSel = [];
        S.brushIdx = -1;
        S.tip = null;
        renderBrushList();
        selectBrush(-1);
        syncBrushTools();
        setStatus('已删除 ' + names.length + ' 支笔刷' + (names.length === 1 ? '：' + names[0] : ''));
    };
    const brushGroupSelected = (name) => {
        const g = String(name || '').trim().slice(0, 14);
        if (!g) return toast('先给分组起个名字');
        const ids = S.brushSel.slice();
        if (!ids.length) return toast('先在笔刷左上角勾选，再点「分组」');
        if (S.brushGroups.indexOf(g) < 0) S.brushGroups.push(g);
        S.brushes.forEach((b) => { if (ids.indexOf(b.id) >= 0) b.group = g; });
        S.brushSel = [];
        S.brushOpen[g] = false;
        renderBrushList();
        syncBrushTools();
        setStatus('已把 ' + ids.length + ' 支笔刷放进「' + g + '」');
    };
    const brushMoveOut = (g) => {
        const ids = S.brushSel.slice();
        const targets = ids.length ? S.brushes.filter((b) => ids.indexOf(b.id) >= 0) : S.brushes.filter((b) => b.group === g);
        targets.forEach((b) => { b.group = ''; });
        S.brushGroups = S.brushGroups.filter((x) => S.brushes.some((b) => b.group === x));
        S.brushSel = [];
        renderBrushList();
        syncBrushTools();
        setStatus('已移出分组 ' + targets.length + ' 支');
    };
    const brushDropGroup = (g) => {
        // 把一个分组整个删掉（笔刷退回未分组）
        S.brushes.forEach((b) => { if (b.group === g) b.group = ''; });
        S.brushGroups = S.brushGroups.filter((x) => x !== g);
        renderBrushList();
        syncBrushTools();
        setStatus('已删除分组「' + g + '」，里面的笔刷回到未分组');
    };
    const toggleBrushGroup = (g) => {
        S.brushOpen[g] = !S.brushOpen[g];
        renderBrushList();
    };
    const syncBrushTools = () => {
        const n = brushPickCount();
        const del = $('#mattingBrushDel');
        const grp = $('#mattingBrushGrp');
        if (del) {
            del.textContent = n ? '🗑 删除 ' + n : '🗑 删除';
            del.classList.toggle('danger', n > 0);
        }
        if (grp) grp.disabled = n === 0;
        const pick = $('#mattingBrushPickAll');
        if (pick) pick.textContent = n ? '☑ 已选 ' + n : '☐ 全选';
    };

    function renderBrushList() {
        const box = $('#mattingBrushList');
        if (!box) return;
        box.innerHTML = '';
        const chip = (tip, idx) => {
            const b = document.createElement('div');
            b.className = 'brush-chip' + (idx < 0 ? ' round' : '') + (S.brushIdx === idx ? ' on' : '')
                + (idx >= 0 && brushPicked(tip.id) ? ' picked' : '');
            b.title = idx < 0 ? '圆头软笔刷（默认，不能删）' : tip.name + '（' + tip.w + '×' + tip.h + '）';
            b.setAttribute('role', 'option');
            b.setAttribute('aria-selected', S.brushIdx === idx ? 'true' : 'false');
            b.dataset.id = idx >= 0 ? tip.id : 'round';
            if (idx >= 0) b.style.backgroundImage = 'url("' + tip.thumb + '")';
            if (idx >= 0) {
                const ck = document.createElement('button');
                ck.type = 'button';
                ck.className = 'brush-ck';
                ck.title = '勾选（可多选后批量删除/分组）';
                ck.textContent = brushPicked(tip.id) ? '✓' : '';
                ck.onclick = (e) => { e.stopPropagation(); brushTogglePick(tip.id); };
                b.appendChild(ck);
            }
            b.onclick = () => selectBrush(idx);
            return b;
        };
        // 默认圆头永远在最前
        box.appendChild(chip(null, -1));
        const norm = (s) => (s || '').trim();
        S.brushGroups = S.brushGroups.filter((g) => S.brushes.some((b) => norm(b.group) === g));
        // 未分组
        const loose = S.brushes.map((t, i) => ({ t, i })).filter((x) => !norm(x.t.group));
        if (loose.length || !S.brushGroups.length) {
            loose.forEach((x) => box.appendChild(chip(x.t, x.i)));
        }
        // 各分组
        S.brushGroups.forEach((g) => {
            const head = document.createElement('div');
            head.className = 'brush-group-h';
            head.dataset.group = g;
            const arrow = document.createElement('button');
            arrow.type = 'button';
            arrow.className = 'brush-group-arrow';
            arrow.textContent = S.brushOpen[g] ? '▸' : '▾';
            arrow.title = S.brushOpen[g] ? '展开' : '收起';
            arrow.onclick = (e) => { e.stopPropagation(); toggleBrushGroup(g); };
            head.appendChild(arrow);
            const nm = document.createElement('span');
            nm.className = 'brush-group-name';
            const items = S.brushes.filter((b) => norm(b.group) === g);
            nm.textContent = g + ' (' + items.length + ')';
            head.appendChild(nm);
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'brush-group-del';
            del.textContent = '✕';
            del.title = '删除这个分组（笔刷退回未分组）';
            del.onclick = (e) => { e.stopPropagation(); brushDropGroup(g); };
            head.appendChild(del);
            // 组头本身就是放置区：把勾选的移进这个组
            head.ondblclick = () => { if (brushPickCount()) { S.brushSel.slice().forEach((id) => { const b = S.brushes.find((x) => x.id === id); if (b) b.group = g; }); S.brushSel = []; renderBrushList(); syncBrushTools(); } };
            box.appendChild(head);
            if (!S.brushOpen[g]) {
                items.forEach((t) => box.appendChild(chip(t, S.brushes.indexOf(t))));
            }
        });
        syncBrushTools();
    }

    const looksAbr = (buf, name) => /\.abr$/i.test(name || '') ||
        readAscii(buf, 0, 4) === '8BPS' || readAscii(buf, 4, 4) === '8BIM';

    const importBrushes = async (files) => {
        const list = Array.from(files || []);
        if (!list.length) return;
        let added = 0;
        const bad = [];
        for (const f of list) {
            try {
                const ab = await f.arrayBuffer();
                const buf = new Uint8Array(ab);
                if (looksAbr(buf, f.name)) {
                    const tips = abrTips(ab);
                    if (!tips.length) throw new Error('没扫到位图笔尖（可能是纯计算笔刷，或用了 zip 压缩）');
                    const base = f.name.replace(/\.abr$/i, '');
                    tips.forEach((t, i) => {
                        if (addTip(t.alpha, t.w, t.h, base + (tips.length > 1 ? ' #' + (i + 1) : ''))) added++;
                    });
                } else {
                    const t = await tipFromImage(f);
                    if (addTip(t.alpha, t.w, t.h, f.name.replace(/\.[^.]+$/, ''))) added++;
                }
            } catch (err) {
                bad.push(f.name + '：' + (err && err.message ? err.message : '读不出来'));
            }
        }
        renderBrushList();
        if (added) {
            selectBrush(S.brushes.length - 1);      // 导入完直接用最新的这支
            setStatus('笔刷已导入 ' + added + ' 支' + (bad.length ? '（' + bad.length + ' 个失败：' + bad[0] + '）' : ''));
        } else {
            setStatus('笔刷没导入成功：' + (bad[0] || '格式不支持'));
        }
    };

    // 笔尖精灵：白色 + 笔尖 alpha，按画笔大小缩放，缓存当前尺寸
    const tipSprite = (tip, size) => {
        const s = Math.max(1, Math.round(size));
        if (tip._sp && tip._spSize === s) return tip._sp;
        const k = s / Math.max(tip.w, tip.h);
        const dw = Math.max(1, Math.round(tip.w * k));
        const dh = Math.max(1, Math.round(tip.h * k));
        const c = document.createElement('canvas');
        c.width = dw; c.height = dh;
        const cx = c.getContext('2d');
        const img = cx.createImageData(dw, dh);
        const d = img.data;
        for (let y = 0; y < dh; y++) {
            const sy = Math.min(tip.h - 1, Math.floor(y * tip.h / dh));
            for (let x = 0; x < dw; x++) {
                const sx = Math.min(tip.w - 1, Math.floor(x * tip.w / dw));
                const o = (y * dw + x) * 4;
                d[o] = 255; d[o + 1] = 255; d[o + 2] = 255;
                d[o + 3] = tip.alpha[sy * tip.w + sx];
            }
        }
        cx.putImageData(img, 0, 0);
        tip._sp = { canvas: c, w: dw, h: dh };
        tip._spSize = s;
        return tip._sp;
    };

    const stampTip = (ctx, x, y, op) => {
        const sp = tipSprite(S.tip, S.brush);
        ctx.globalCompositeOperation = op;
        ctx.drawImage(sp.canvas, Math.round(x - sp.w / 2), Math.round(y - sp.h / 2));
        ctx.globalCompositeOperation = 'source-over';
    };

    /* ---------------- 画笔 ---------------- */
    const paintDot = (x, y) => {
        const r = S.brush;
        // 导入的笔尖：直接贴缩放后的位图；圆头才走下面的径向渐变
        if (S.tip) {
            if (S.mode === 'remove') {
                stampTip(S.rmctx, x, y, 'source-over');
                S.rmHas = true;
                return;
            }
            stampTip(S.rctx, x, y, S.mode === 'restore' ? 'source-over' : 'destination-out');
            return;
        }
        const inner = Math.max(0.02, Math.min(0.98, S.hardness));
        const g = () => {
            const gg = S.rmctx.createRadialGradient(x, y, 0, x, y, r);
            return gg;
        };
        // 涂抹去物：往独立的红蒙版画布上画白笔触，不碰抠图蒙版
        if (S.mode === 'remove') {
            const ctx = S.rmctx;
            const gg = g();
            gg.addColorStop(0, 'rgba(255,255,255,1)');
            gg.addColorStop(inner, 'rgba(255,255,255,1)');
            gg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = gg;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            S.rmHas = true;
            return;
        }
        const ctx = S.rctx;
        const keep = S.mode === 'restore';
        const gg = g();
        if (keep) {
            gg.addColorStop(0, 'rgba(255,255,255,1)');
            gg.addColorStop(inner, 'rgba(255,255,255,1)');
            gg.addColorStop(1, 'rgba(255,255,255,0)');
        } else {
            gg.addColorStop(0, 'rgba(0,0,0,1)');
            gg.addColorStop(inner, 'rgba(0,0,0,1)');
            gg.addColorStop(1, 'rgba(0,0,0,0)');
        }
        // 恢复=叠加白色提高 alpha；擦除=destination-out 减少 alpha
        const gco = keep ? 'source-over' : 'destination-out';
        ctx.globalCompositeOperation = gco;
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';   // 一定要还原，否则下次写入蒙版会被当成擦除
    };
    const paintTo = (x, y) => {
        const from = S.last || { x, y };
        const dx = x - from.x, dy = y - from.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.01) return;
        const step = Math.max(1, S.brush * (S.tip ? S.spacing : 1 / 6));
        // 间距要跨段累积：否则每来一个 pointermove 都会硬落一个笔尖，间距拉大也没缝
        const acc = S.stampAcc || 0;
        const total = acc + dist;
        const n = Math.floor(total / step);
        for (let i = 1; i <= n; i++) {
            const k = (i * step - acc) / dist;
            if (k > 0 && k <= 1) paintDot(from.x + dx * k, from.y + dy * k);
        }
        S.stampAcc = total - n * step;
        S.last = { x, y };
    };
    const toCanvasXY = (e) => {
        const rect = S.view.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (S.view.width / rect.width),
            y: (e.clientY - rect.top) * (S.view.height / rect.height)
        };
    };

    /* ---------------- 蒙版后处理 ---------------- */
    const boxBlurGray = (src, w, h, r, passes) => {
        if (r <= 0) return src;
        let a = src, b = new Float32Array(src.length);
        const win = r * 2 + 1;
        for (let p = 0; p < passes; p++) {
            // 横
            for (let y = 0; y < h; y++) {
                let sum = 0;
                const row = y * w;
                for (let x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))];
                for (let x = 0; x < w; x++) {
                    b[row + x] = sum / win;
                    sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
                }
            }
            // 纵
            for (let x = 0; x < w; x++) {
                let sum = 0;
                for (let y = -r; y <= r; y++) sum += b[Math.min(h - 1, Math.max(0, y)) * w + x];
                for (let y = 0; y < h; y++) {
                    a[y * w + x] = sum / win;
                    sum += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
                }
            }
        }
        return a;
    };

    // 以原图亮度为引导图的引导滤波：让蒙版边缘贴着图像边缘，去掉锯齿与毛边
    const guidedFilter = (mask, rgb, w, h, r, eps) => {
        const n = w * h;
        // 注意：boxBlurGray 会就地改写传入的数组，所以先留一份原始亮度
        const I = new Float32Array(n);
        for (let i = 0, j = 0; j < n; i += 4, j++) {
            I[j] = (0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2]) / 255;
        }
        const meanI = boxBlurGray(new Float32Array(I), w, h, r, 1);
        const II = new Float32Array(n);
        const IP = new Float32Array(n);
        for (let i = 0; i < n; i++) { II[i] = I[i] * I[i]; IP[i] = I[i] * mask[i]; }
        const meanII = boxBlurGray(II, w, h, r, 1);
        const meanIP = boxBlurGray(IP, w, h, r, 1);
        const meanP = boxBlurGray(new Float32Array(mask), w, h, r, 1);
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const mi = meanI[i];
            const cov = meanII[i] - mi * mi;
            const a = cov / (cov + eps);
            const b = meanP[i] - a * mi;
            out[i] = a * I[i] + b;
        }
        return out;
    };

    // 从权威蒙版 raw 派生出用于显示/导出的 mask
    // 估一下背景色（取画面四边像素的中位数）：只在边框颜色足够统一时才用
    const estimateBg = () => {
        if (S.bgColor !== undefined) return S.bgColor;
        if (!S.rgb) { S.bgColor = null; return null; }
        const w = S.w, h = S.h, px = S.rgb.data;
        const ring = Math.max(1, Math.round(Math.min(w, h) * 0.015));
        const rs = [], gs = [], bs = [];
        const take = (x, y) => {
            const i = (y * w + x) * 4;
            rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]);
        };
        for (let x = 0; x < w; x += 2) for (let y = 0; y < ring; y++) { take(x, y); take(x, h - 1 - y); }
        for (let y = 0; y < h; y += 2) for (let x = 0; x < ring; x++) { take(x, y); take(w - 1 - x, y); }
        if (!rs.length) { S.bgColor = null; return null; }
        const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
        const c = [med(rs), med(gs), med(bs)];
        let near = 0;
        for (let k = 0; k < rs.length; k++) {
            if (Math.abs(rs[k] - c[0]) + Math.abs(gs[k] - c[1]) + Math.abs(bs[k] - c[2]) < 60) near++;
        }
        S.bgColor = (near / rs.length > 0.55) ? c : null;   // 背景太花就不做去色
        return S.bgColor;
    };

    // 边缘去底色污染：抠图边缘那圈像素是「主体 + 背景」的混合色，
    // 直接贴到白底/棋盘格上会看到一圈背景色描边。这里按 C = a·F + (1-a)·B 反解出 F
    const buildFg = () => {
        S.fg = null;
        if (!S.hasMask || !S.rgb || !S.mctx) return;
        const B = estimateBg();
        if (!B) return;
        const w = S.w, h = S.h, n = w * h;
        const src = S.rgb.data;
        // 用「原始蒙版」的 alpha 来反解颜色：它才是真实的混合比例
        // （派生蒙版被边缘净化推到 0/1 了，用它会把边缘按实心处理，颜色里的底色就留在图上）
        const rd = S.rctx.getImageData(0, 0, w, h).data;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d');
        const out = cx.createImageData(w, h);
        const o = out.data;
        for (let i = 0; i < n * 4; i += 4) {
            o[i] = src[i]; o[i + 1] = src[i + 1]; o[i + 2] = src[i + 2]; o[i + 3] = 255;
            const a = rd[i + 3] / 255;
            if (a <= 0.2 || a >= 0.97) continue;      // 只动半透明边缘，实心主体保持原色
            const inv = 1 - a;
            for (let k = 0; k < 3; k++) {
                const v = (src[i + k] - inv * B[k]) / a;
                o[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
            }
        }
        cx.putImageData(out, 0, 0);
        S.fg = c;
    };

    let fgTimer = 0;
    const scheduleFg = () => {
        clearTimeout(fgTimer);
        fgTimer = setTimeout(() => { buildFg(); render(); }, 140);
    };

    // 自动 alpha 色阶（除雾）：模型在白雾、反光、同色系图上常给出大片 0.05~0.5 的
    // 低置信输出，显示出来就是一层洗不掉的雾（贴到深色底上尤其明显）。
    // 这里先统计非零 alpha 的分布：低带（雾）占比显著且存在主体带时，用 Otsu 找
    // 雾/主体分界做 smoothstep 重映射 —— 雾归零、主体拉实、边缘保留过渡。
    // 分布健康（如白底商品图 p10≈190）时一行都不改，保护真半透明边缘。
    const autoLevels = (m, n) => {
        let lo = 0, hi = 0, total = 0;
        for (let j = 0; j < n; j++) {
            const v = m[j];
            if (v <= 0.004) continue;
            total++;
            if (v < 0.25) lo++;
            else if (v > 0.5) hi++;
        }
        // 雾占非零像素 1/4 以上、且实心主体确实存在，才值得动手
        if (total < n * 0.002 || lo < total * 0.25 || hi < total * 0.1) return 0;
        const hist = new Float64Array(256);
        for (let j = 0; j < n; j++) { const v = m[j]; if (v > 0.004 && v < 0.996) hist[Math.round(v * 255)]++; }
        let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
        let sumB = 0, wB = 0, best = 0, thr = -1;
        for (let i = 0; i < 256; i++) {
            wB += hist[i]; if (!wB) continue;
            const wF = total - wB; if (wF <= 0) break;
            sumB += i * hist[i];
            const mB = sumB / wB, mF = (sum - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);
            if (between > best) { best = between; thr = i; }
        }
        if (thr < 77 || thr > 191) return 0;     // 分界不在 0.3~0.75 之间说明这不是雾形分布
        const t = thr / 255, half = 0.22;
        const a = Math.max(0.01, t - half), b = Math.min(0.99, t + half);
        let touched = 0;
        for (let j = 0; j < n; j++) {
            const v = (m[j] - a) / (b - a);
            const nv = v < 0 ? 0 : v > 1 ? 1 : v * v * (3 - 2 * v);
            if (nv !== m[j]) { m[j] = nv; touched++; }
        }
        return touched;
    };

    const postProcess = (opts) => {
        const w = S.w, h = S.h, n = w * h;
        // 蒙版以 alpha 通道存储（destination-in 只认 alpha，不认灰度）
        const src = S.rctx.getImageData(0, 0, w, h).data;
        const out = S.mctx.createImageData(w, h);
        const d = out.data;
        let m = new Float32Array(n);
        for (let i = 0, j = 0; j < n; i += 4, j++) {
            const v = src[i + 3] / 255;
            // 极低透明度基本是残留噪点，直接抹掉，避免换底色后浮出淡淡残影
            m[j] = v < 0.08 ? 0 : v;
        }

        if (opts.refine && S.rgb) m = guidedFilter(m, S.rgb.data, w, h, 3, 1e-4);
        // 除雾在贴边滤波之前：先把低置信雾压掉，引导滤波再让边缘贴回图像轮廓
        if (opts.levels !== false) S.levelsUsed = autoLevels(m, n) || 0;
        // 平滑（PS「平滑」）：先 blur 掉锯齿状的小凹凸，后面净化步骤会把边缘重新收紧
        const smooth = opts.smooth === undefined ? (S.smooth || 0) : opts.smooth;
        if (smooth > 0) m = boxBlurGray(m, w, h, Math.round(smooth) + 1, 2);
        if (opts.feather > 0) m = boxBlurGray(m, w, h, Math.round(opts.feather), 2);
        if (opts.contrast > 0) {
            const k = 1 + opts.contrast * 3;
            for (let j = 0; j < n; j++) {
                const v = (m[j] - 0.5) * k + 0.5;
                m[j] = v < 0 ? 0 : v > 1 ? 1 : v;
            }
        }
        // 移动边缘（PS「Shift Edge」）：>0 外扩、<0 收缩，中点按 (m+t)/(1+t) 单调平移，不产生硬阶
        const shift = opts.shift === undefined ? (S.shift || 0) : opts.shift;
        if (shift !== 0) {
            const t = shift;
            for (let j = 0; j < n; j++) {
                const v = (m[j] + t) / (1 + t);
                m[j] = v < 0 ? 0 : v > 1 ? 1 : v;
            }
        }
        for (let i = 0, j = 0; j < n; i += 4, j++) {
            const v = m[j] * 255;
            const g = v < 0 ? 0 : v > 255 ? 255 : v;
            d[i] = d[i + 1] = d[i + 2] = 255;
            d[i + 3] = g;
        }
        S.mctx.putImageData(out, 0, 0);
        // 蒙版一变就重算边缘颜色；涂画笔时先跳过（每帧都算会卡），停手后再补算
        if (S.painting) scheduleFg(); else buildFg();
    };

    // 把「边缘精修」结果写回权威蒙版：后续画笔/撤销都基于同一份数据，画面不会突然变样
    const bakeRefine = () => {
        if (!S.hasMask || !S.rgb) return;
        const w = S.w, h = S.h, n = w * h;
        const src = S.rctx.getImageData(0, 0, w, h).data;
        const m = new Float32Array(n);
        for (let i = 0, j = 0; j < n; i += 4, j++) m[j] = src[i + 3] / 255;
        const r = guidedFilter(m, S.rgb.data, w, h, 3, 1e-4);
        const im = S.rctx.createImageData(w, h);
        const d = im.data;
        for (let i = 0, j = 0; j < n; i += 4, j++) {
            const v = r[j] * 255;
            d[i] = d[i + 1] = d[i + 2] = 255;
            d[i + 3] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
        S.rctx.putImageData(im, 0, 0);
    };

    /* ---------------- 模型加载 + 推理 ---------------- */
    // 单分片下载：带进度；20 秒收不到新数据、或整体速度过慢，都放弃（方便自动换源重试）
    const fetchPart = async (url, onBytes, checkSpeed) => {
        const ctrl = new AbortController();
        let last = Date.now();
        const t0 = Date.now();
        let got = 0;
        const wd = setInterval(() => {
            const el = Date.now() - t0;
            if (Date.now() - last > 20000) ctrl.abort();
            // 后面还有备选源时才做慢速熔断；最后一个源再慢也得下完
            else if (checkSpeed && el > 8000 && got / (el / 1000) < MIN_SPEED) ctrl.abort();
        }, 2000);
        try {
            const res = await fetch(url, { signal: ctrl.signal });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            if (!res.body || !res.body.getReader) return new Uint8Array(await res.arrayBuffer());
            const reader = res.body.getReader();
            const parts = [];
            for (; ;) {
                const r = await reader.read();
                if (r.done) break;
                last = Date.now();
                got += r.value.length;
                parts.push(r.value);
                onBytes(r.value.length);
            }
            const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
            let off = 0;
            parts.forEach(p => { out.set(p, off); off += p.length; });
            return out;
        } finally { clearInterval(wd); }
    };

    // 同时向多个源请求同一个文件，几秒后只留下最快的那个：避免撞上一个被限流到几十 KB/s 的源
    const fetchRaced = async (urls, onBytes) => {
        const ctrls = urls.map(() => new AbortController());
        const st = urls.map(() => ({ got: 0, buf: null, err: null, done: false }));
        urls.map(async (u, i) => {
            try {
                const res = await fetch(u, { signal: ctrls[i].signal });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                if (!res.body || !res.body.getReader) {
                    const b = new Uint8Array(await res.arrayBuffer());
                    st[i].got = b.length; st[i].buf = b; st[i].done = true;
                    return;
                }
                const rd = res.body.getReader();
                const parts = [];
                for (; ;) {
                    const c = await rd.read();
                    if (c.done) break;
                    st[i].got += c.value.length;
                    parts.push(c.value);
                }
                const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
                let off = 0;
                parts.forEach(p => { out.set(p, off); off += p.length; });
                st[i].buf = out; st[i].done = true;
            } catch (e) { st[i].err = (e && e.message) || 'failed'; }
        });
        let waited = 0;
        while (waited < 4000) {
            if (st.some(s => s.done)) break;
            await sleep(250); waited += 250;
        }
        // 全程不提前 abort：任何一个源挂了，其余在跑的源都能顶上（提前 abort 会让
        // 领先者中途失败时无源可用，直接抛「下载失败」）。赢家产出后再统一收尾。
        let reported = 0;
        while (!st.some(s => s.done && s.buf) && st.some(s => !s.err)) {
            let lead = -1;
            st.forEach((s, i) => { if (!s.err && s.got && (lead < 0 || s.got > st[lead].got)) lead = i; });
            if (lead >= 0 && st[lead].got > reported) { if (onBytes) onBytes(st[lead].got - reported); reported = st[lead].got; }
            await sleep(250);
        }
        const win = st.find(s => s.done && s.buf);
        urls.forEach((_, i) => { try { ctrls[i].abort(); } catch (e) { } });
        if (win) { if (onBytes && win.buf.length > reported) onBytes(win.buf.length - reported); return win.buf; }
        throw new Error(st.map(s => s.err).filter(Boolean)[0] || '下载失败');
    };

    // 按清单下载全部分片：优先多源赛马下载，整体失败再逐个源重试，并校验总字节数
    const downloadModel = async (spec) => {
        let got = 0;
        let t0 = Date.now();
        const onBytes = (n) => {
            got += n;
            const sec = Math.max(0.5, (Date.now() - t0) / 1000);
            setProgress(Math.min(0.99, got / spec.bytes));
            setStatus('正在下载' + spec.label + '模型 ' + (got / 1048576).toFixed(1) + ' / ' + (spec.bytes / 1048576).toFixed(1) + ' MB（' + (got / 1048576 / sec).toFixed(1) + ' MB/s）', true);
        };
        let lastErr = null;
        try {
            const parts = [];
            for (const f of spec.files) parts.push(await fetchRaced(SOURCES.map(mk => mk(f)), onBytes));
            return assemble(parts, spec);
        } catch (e) { lastErr = e; }
        for (let s = 0; s < SOURCES.length; s++) {
            try {
                const parts = [];
                const hasFallback = s < SOURCES.length - 1;
                for (const f of spec.files) parts.push(await fetchPart(SOURCES[s](f), onBytes, hasFallback));
                return assemble(parts, spec);
            } catch (e) {
                lastErr = e;
                got = 0;
                setStatus('当前下载源较慢或不通，正在换一个继续...');
            }
        }
        throw new Error(lastErr ? lastErr.message : '模型下载失败');
    };

    const assemble = (parts, spec) => {
        const total = parts.reduce((n, p) => n + p.length, 0);
        if (total !== spec.bytes) throw new Error('文件不完整（' + total + '/' + spec.bytes + ' 字节）');
        const out = new Uint8Array(total);
        let off = 0;
        parts.forEach(p => { out.set(p, off); off += p.length; });
        return out.buffer;
    };

    // 面板一打开就在后台把模型备好，用户选完图基本就能直接开跑
    let prefetching = false;
    const prefetch = () => {
        if (prefetching || S.busy) return;
        // 当前档位的会话已经在内存里就不用再准备
        const wantKey = (MODELS[S.model] || MODELS.fast).key;
        if (S.session && S.sessionKey === wantKey) return;
        if (S.sessions && S.sessions[wantKey]) return;
        const sec = $('section[data-view="matting"]');
        if (!sec || !sec.offsetParent) return;
        prefetching = true;
        setStatus('正在后台准备抠图模型（精细模型 42MB，仅首次需要下载，之后秒开）...');
        setProgress(0.01);
        ensureSession()
            .then(() => { if (!S.hasMask) { setStatus('模型已就绪，上传图片后点「一键去背景」'); setProgress(null); } })
            .catch((e) => { if (!S.hasMask) { setStatus('模型准备失败：' + e.message + '，点「一键去背景」可重试'); setProgress(null); } })
            .finally(() => { prefetching = false; });
    };

    // 给任意 promise 加超时，避免某个 CDN 卡住导致一直转圈
    const withTimeout = (p, ms, msg) => new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error(msg || '网络超时')), ms);
        p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
    });

    // 推理引擎：按源依次尝试；单个源 20 秒没动静就换下一个
    const loadORT = async () => {
        if (S.ort) return S.ort;
        let lastErr = null;
        for (const base of ORT_SOURCES) {
            try {
                const ort = await withTimeout(import(base + 'ort.wasm.min.mjs'), 20000, '引擎加载超时');
                ort.env.wasm.numThreads = 1;      // 不走多线程，省掉 worker 依赖
                ort.env.wasm.wasmPaths = base;
                S.ort = ort;
                return ort;
            } catch (e) { lastErr = e; }
        }
        throw new Error('推理引擎加载失败：' + (lastErr ? lastErr.message : '无可用来源'));
    };

    // wasm 体积大（约 15MB）：自己下载好并缓存，带进度/换源，最后直接喂给引擎
    const loadWasmBinary = async () => {
        let buf = await idbGet('wasm:' + ORT_VER);
        if (buf && buf.byteLength >= ORT_WASM.min) return buf;
        setStatus('首次使用需准备推理引擎，之后就秒开...');
        let got = 0;
        const onBytes = (n) => {
            got += n;
            setStatus('正在准备推理引擎 ' + (got / 1048576).toFixed(1) + ' / ' + (ORT_WASM.bytes / 1048576).toFixed(1) + ' MB');
        };
        const pack = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
        try {
            got = 0;
            const b = await fetchRaced(ORT_SOURCES.map(x => x + ORT_WASM.key), onBytes);
            if (b.byteLength < ORT_WASM.min) throw new Error('引擎文件不完整');
            const out = pack(b);
            await idbPut('wasm:' + ORT_VER, out);
            return out;
        } catch (e) { got = 0; }
        for (let s = 0; s < ORT_SOURCES.length; s++) {
            try {
                got = 0;
                const b = await fetchPart(ORT_SOURCES[s] + ORT_WASM.key, onBytes, false);
                if (b.byteLength < ORT_WASM.min) throw new Error('引擎文件不完整');
                const out = pack(b);
                await idbPut('wasm:' + ORT_VER, out);
                return out;
            } catch (e) { /* 换下一个源 */ }
        }
        throw new Error('推理引擎文件下载失败，请检查网络后重试');
    };

    // 两档模型的会话都留在内存里：出图后可能要拿另一个模型复核，
    // 每次都重建 session 要 3~5 秒，留着切换就是瞬时的
    const ensureSession = async (specArg) => {
        const spec = specArg || MODELS[S.model] || MODELS.fast;
        S.sessions = S.sessions || {};
        if (S.sessions[spec.key]) { S.session = S.sessions[spec.key]; S.sessionKey = spec.key; return S.session; }
        if (S.session && S.sessionKey === spec.key) return S.session;
        setProgress(0.02);
        // 引擎、wasm、模型三件事同时准备，少等几轮
        const bufP = (async () => {
            let buf = await idbGet('model:' + spec.key);
            if (buf && buf.byteLength !== spec.bytes) buf = null;
            if (buf) {
                setStatus('使用已缓存的' + spec.label + '模型');
                return buf;
            }
            buf = await downloadModel(spec);
            await idbPut('model:' + spec.key, buf);
            setStatus(spec.label + '模型已缓存，下次使用秒开');
            return buf;
        })();
        const wasmP = loadWasmBinary();
        const [ort, buf, wasmBuf] = await Promise.all([loadORT(), bufP, wasmP]);
        setProgress(0.99);
        setStatus('正在初始化推理引擎...', true);
        if (wasmBuf) ort.env.wasm.wasmBinary = wasmBuf;   // 跳过引擎内部的二次下载
        S.session = await withTimeout(ort.InferenceSession.create(new Uint8Array(buf), {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        }), 120000, '推理引擎初始化超时，请刷新页面重试');
        S.sessionKey = spec.key;
        S.sessions[spec.key] = S.session;
        setProgress(null);
        return S.session;
    };

    // 同色背景残留清理：从画面四边按颜色蔓延出背景（遇到明显轮廓就停），
    // 再把这块从蒙版里扣掉 —— 桌面反光、投影这类"和背景同色"的残留会被一起带走
    const cleanBgFlood = () => {
        if (!S.hasMask || !S.rgb) return 0;
        const w = S.w, h = S.h, n = w * h;
        const px = S.rgb.data;
        const img = S.rctx.getImageData(0, 0, w, h);
        const d = img.data;
        let opaque = 0;
        for (let j = 0; j < n; j++) if (d[j * 4 + 3] > 128) opaque++;
        if (opaque < n * 0.002) return 0;              // 主体太小，别乱动

        // 1) 估背景色：只取边框上「模型已经判为背景」的像素
        let sr = 0, sg = 0, sb = 0, cnt = 0;
        const ring = Math.max(1, Math.round(Math.min(w, h) * 0.02));
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < ring; y++) {
                [[x, y], [x, h - 1 - y]].forEach(([xx, yy]) => {
                    const i = (yy * w + xx) * 4;
                    if (d[i + 3] > 40) return;
                    sr += px[i]; sg += px[i + 1]; sb += px[i + 2]; cnt++;
                });
            }
        }
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < ring; x++) {
                [[x, y], [w - 1 - x, y]].forEach(([xx, yy]) => {
                    const i = (yy * w + xx) * 4;
                    if (d[i + 3] > 40) return;
                    sr += px[i]; sg += px[i + 1]; sb += px[i + 2]; cnt++;
                });
            }
        }
        if (!cnt) return 0;
        const br = sr / cnt, bg = sg / cnt, bb = sb / cnt;

        // 2) 边缘图：真轮廓处不放行，避免蔓延进主体内部
        const gray = new Float32Array(n);
        for (let j = 0, i = 0; j < n; j++, i += 4) gray[j] = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        const isEdge = new Uint8Array(n);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const j = y * w + x;
                const gx = -gray[j - w - 1] - 2 * gray[j - 1] - gray[j + w - 1] + gray[j - w + 1] + 2 * gray[j + 1] + gray[j + w + 1];
                const gy = -gray[j - w - 1] - 2 * gray[j - w] - gray[j - w + 1] + gray[j + w - 1] + 2 * gray[j + w] + gray[j + w + 1];
                if (Math.abs(gx) + Math.abs(gy) > 32) isEdge[j] = 1;
            }
        }

        // 3) 从四边蔓延
        const seen = new Uint8Array(n);
        const q = new Int32Array(n);
        let qh = 0, qt = 0;
        const nearBg = (j) => {
            const i = j * 4;
            return Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg) + Math.abs(px[i + 2] - bb) < 78;
        };
        const seed = (x, y) => {
            const j = y * w + x;
            if (!seen[j] && !isEdge[j] && nearBg(j)) { seen[j] = 1; q[qt++] = j; }
        };
        for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
        for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
        // 模型已经判成背景的像素也当种子：被主体围住的同色背景（两臂之间、腿缝里的白底）
        // 不连着画框，只从四边蔓延是清不到它们的
        for (let j = 0; j < n; j++) {
            if (d[j * 4 + 3] > 40) continue;
            const x = j % w, y = (j - x) / w;
            if (!seen[j] && !isEdge[j] && nearBg(j)) { seen[j] = 1; q[qt++] = j; }
        }
        while (qh < qt) {
            const j = q[qh++];
            const x = j % w, y = (j - x) / w;
            const p = j * 4;
            const nb = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1];
            for (const k of nb) {
                if (k < 0 || seen[k] || isEdge[k]) continue;
                const i = k * 4;
                if (Math.abs(px[i] - px[p]) + Math.abs(px[i + 1] - px[p + 1]) + Math.abs(px[i + 2] - px[p + 2]) > 26) continue;
                if (!nearBg(k)) continue;
                seen[k] = 1; q[qt++] = k;
            }
        }

        // 4) 扣掉蔓延区；万一蔓延过头（把主体也吃掉了）就整体放弃，宁可留着残留
        let hit = 0;
        for (let j = 0; j < qt; j++) if (d[q[j] * 4 + 3] > 128) hit++;
        if (hit > opaque * 0.6) return 0;
        let cleared = 0;
        for (let j = 0; j < qt; j++) {
            const k = q[j];
            if (d[k * 4 + 3]) { d[k * 4 + 3] = 0; cleared++; }
        }
        if (cleared) S.rctx.putImageData(img, 0, 0);
        return cleared;
    };

    // 蒙版形状统计：最大连通块占多少、其余碎块占多少、一共几块
    const maskShape = () => {
        const w = S.w, h = S.h, n = w * h;
        const d = S.rctx.getImageData(0, 0, w, h).data;
        const lab = new Int32Array(n).fill(-1);
        const stack = new Int32Array(n);
        let comps = 0, best = 0, total = 0;
        for (let j0 = 0; j0 < n; j0++) {
            if (d[j0 * 4 + 3] <= 128 || lab[j0] >= 0) continue;
            const id = comps++;
            let sp = 0, area = 0;
            stack[sp++] = j0; lab[j0] = id;
            while (sp) {
                const c = stack[--sp];
                const x = c % w, y = (c - x) / w;
                area++;
                if (x > 0 && lab[c - 1] < 0 && d[(c - 1) * 4 + 3] > 128) { lab[c - 1] = id; stack[sp++] = c - 1; }
                if (x < w - 1 && lab[c + 1] < 0 && d[(c + 1) * 4 + 3] > 128) { lab[c + 1] = id; stack[sp++] = c + 1; }
                if (y > 0 && lab[c - w] < 0 && d[(c - w) * 4 + 3] > 128) { lab[c - w] = id; stack[sp++] = c - w; }
                if (y < h - 1 && lab[c + w] < 0 && d[(c + w) * 4 + 3] > 128) { lab[c + w] = id; stack[sp++] = c + w; }
            }
            total += area;
            if (area > best) best = area;
        }
        const mainPct = best / n * 100, restPct = (total - best) / n * 100;
        return { comps, mainPct: +mainPct.toFixed(2), restPct: +restPct.toFixed(2) };
    };
    const snapMask = () => {
        const c = document.createElement('canvas');
        c.width = S.w; c.height = S.h;
        c.getContext('2d').drawImage(S.raw, 0, 0);
        return c;
    };
    const restoreMask = (c) => {
        S.rctx.globalCompositeOperation = 'source-over';
        S.rctx.clearRect(0, 0, S.w, S.h);
        S.rctx.drawImage(c, 0, 0);
        S.hasMask = true;
    };
    // 某个档位的模型是否已经在本地（别为了复核再触发一次 42MB 下载）
    const modelCached = async (spec) => {
        const buf = await idbGet('model:' + spec.key).catch(() => null);
        return !!buf && buf.byteLength === spec.bytes;
    };

    const infer = async (specArg) => {
        const spec = specArg || MODELS[S.model] || MODELS.fast;
        const session = await ensureSession(spec);
        const N = spec.size;
        setStatus('正在识别主体区域...');
        // 保持宽高比（letterbox）：原来直接拉伸到 N×N，宽图/长图会被压扁，模型对轮廓的判断随之变差，
        // 表现为细边发虚、背景一块块残留。这里按长边缩放到 N，短边居中，四周用中性灰填充。
        const fit = Math.min(N / S.w, N / S.h);
        const tw = Math.max(1, Math.round(S.w * fit));
        const th = Math.max(1, Math.round(S.h * fit));
        const ox = Math.round((N - tw) / 2);
        const oy = Math.round((N - th) / 2);
        const t = document.createElement('canvas');
        t.width = N; t.height = N;
        const tc = t.getContext('2d', { willReadFrequently: true });
        tc.imageSmoothingEnabled = true;
        tc.imageSmoothingQuality = 'high';
        // 填充色用估出来的背景色（纯色底图最贴），估不出来才用中性灰
        const padB = estimateBg();
        tc.fillStyle = padB ? 'rgb(' + padB[0] + ',' + padB[1] + ',' + padB[2] + ')' : '#808080';
        tc.fillRect(0, 0, N, N);
        tc.drawImage(S.src, ox, oy, tw, th);
        const px = tc.getImageData(0, 0, N, N).data;
        const input = new Float32Array(N * N * 3);
        const plane = N * N;
        for (let i = 0, o = 0; o < plane; i += 4, o++) {
            input[o] = (px[i] / 255 - spec.mean[0]) / spec.std[0];
            input[plane + o] = (px[i + 1] / 255 - spec.mean[1]) / spec.std[1];
            input[plane * 2 + o] = (px[i + 2] / 255 - spec.mean[2]) / spec.std[2];
        }
        const feeds = {};
        feeds[session.inputNames[0]] = new S.ort.Tensor('float32', input, [1, 3, N, N]);
        const out = await session.run(feeds);
        const raw = out[session.outputNames[0]].data;
        const stride = Math.max(1, Math.round(raw.length / plane));
        const chOff = stride >= 4 ? 3 : 0;
        let mn = Infinity, mx = -Infinity;
        for (let o = 0; o < plane; o++) {
            const v = raw[o * stride + chOff];
            if (v < mn) mn = v;
            if (v > mx) mx = v;
        }
        // 有的模型导出时 sigmoid 已经在图里（0~1），有的还是 logits；
        // 原来用「整幅 min-max 拉伸」会把背景那点微弱响应也拉成不透明，正是残留的来源
        const logistic = mn < -0.02 || mx > 1.02;
        const m = document.createElement('canvas');
        m.width = N; m.height = N;
        const mc = m.getContext('2d', { willReadFrequently: true });
        const im = mc.createImageData(N, N);
        for (let i = 0, o = 0; o < plane; i += 4, o++) {
            let v = raw[o * stride + chOff];
            if (logistic) v = 1 / (1 + Math.exp(-v));
            v = v < 0 ? 0 : v > 1 ? 1 : v;
            im.data[i] = im.data[i + 1] = im.data[i + 2] = 255;
            im.data[i + 3] = v * 255;
        }
        mc.putImageData(im, 0, 0);
        // 缩放回工作分辨率，写入权威蒙版
        S.rctx.globalCompositeOperation = 'source-over';   // 防画笔残留的混合模式
        S.rctx.clearRect(0, 0, S.w, S.h);
        S.rctx.imageSmoothingEnabled = true;
        S.rctx.imageSmoothingQuality = 'high';
        // 只取 letterbox 里真正属于画面的那部分，再缩放回工作分辨率（填充区不进蒙版）
        S.rctx.drawImage(m, ox, oy, tw, th, 0, 0, S.w, S.h);
        S.hasMask = true;                      // 清理函数会读这个标志
        // 清理前的形状：碎块多/占面大 = 这次跑糊了，值得换个模型复核
        const rawQ = maskShape();
        S.debug = { model: spec.key, rawQ, speckles: despeckle(), bg: 0, blobs: 0, halo: 0 };
        if (S.deepClean) {
            S.debug.bg = cleanBgFlood();
            S.debug.blobs = purgeBgBlobs();
            S.debug.halo = shrinkBgEdge();
        }
    };

    // 清掉零星碎块：模型常在背景上留下一小撮孤立的高 alpha，换底色后会非常显眼
    const despeckle = () => {
        const w = S.w, h = S.h, n = w * h;
        const img = S.rctx.getImageData(0, 0, w, h);
        const d = img.data;
        const lab = new Int32Array(n).fill(-1);
        const stack = new Int32Array(n);
        const comp = [];                                   // 当前连通块的像素下标
        const mark = new Int32Array(n);                    // 用轮次标记，避免每次清空大数组
        let epoch = 0;
        const minKeep = Math.max(160, Math.round(n * 0.0006));
        let killed = 0;
        for (let j0 = 0; j0 < n; j0++) {
            if (d[j0 * 4 + 3] <= 128 || lab[j0] >= 0) continue;
            let sp = 0;
            comp.length = 0;
            stack[sp++] = j0; lab[j0] = j0;
            while (sp) {
                const c = stack[--sp];
                comp.push(c);
                const x = c % w, y = (c - x) / w;
                if (x > 0 && lab[c - 1] < 0 && d[(c - 1) * 4 + 3] > 128) { lab[c - 1] = j0; stack[sp++] = c - 1; }
                if (x < w - 1 && lab[c + 1] < 0 && d[(c + 1) * 4 + 3] > 128) { lab[c + 1] = j0; stack[sp++] = c + 1; }
                if (y > 0 && lab[c - w] < 0 && d[(c - w) * 4 + 3] > 128) { lab[c - w] = j0; stack[sp++] = c - w; }
                if (y < h - 1 && lab[c + w] < 0 && d[(c + w) * 4 + 3] > 128) { lab[c + w] = j0; stack[sp++] = c + w; }
            }
            if (comp.length >= minKeep) continue;
            epoch++;
            comp.forEach((c) => { d[c * 4 + 3] = 0; mark[c] = epoch; killed++; });
            // 再沿着「半透明」把碎块外围那圈雾一起擦掉，但不跨进其它实心区域
            let sp2 = 0;
            stack[sp2++] = j0;
            while (sp2) {
                const c = stack[--sp2];
                const x = c % w, y = (c - x) / w;
                const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1];
                for (const q of nb) {
                    if (q < 0 || mark[q] === epoch) continue;
                    const a = d[q * 4 + 3];
                    if (a > 0 && a <= 128) { mark[q] = epoch; d[q * 4 + 3] = 0; stack[sp2++] = q; }
                }
            }
        }
        if (killed) S.rctx.putImageData(img, 0, 0);
        return killed;
    };

    // 背景色块清理：模型偶尔会把「和背景同色」的区域整块判成主体。白底图最典型 ——
    // 白背景上的残余块在浅色预览里几乎看不出来，换成深色底或导出透明 PNG 就是一块块白斑。
    // 这里按连通块判断：颜色接近背景、又不是最大主体块的，整块清掉。
    const purgeBgBlobs = () => {
        if (!S.hasMask || !S.rgb) return 0;
        const B = estimateBg();
        if (!B) return 0;
        const w = S.w, h = S.h, n = w * h;
        const px = S.rgb.data;
        const img = S.rctx.getImageData(0, 0, w, h);
        const d = img.data;
        const lab = new Int32Array(n).fill(-1);
        const stack = new Int32Array(n);
        const blobs = [];
        let solid = 0;
        for (let j0 = 0; j0 < n; j0++) {
            if (d[j0 * 4 + 3] <= 128 || lab[j0] >= 0) continue;
            const id = blobs.length;
            let sp = 0, area = 0, sr = 0, sg = 0, sb = 0;
            stack[sp++] = j0; lab[j0] = id;
            while (sp) {
                const c = stack[--sp];
                const x = c % w, y = (c - x) / w;
                const i = c * 4;
                area++; sr += px[i]; sg += px[i + 1]; sb += px[i + 2];
                if (x > 0 && lab[c - 1] < 0 && d[(c - 1) * 4 + 3] > 128) { lab[c - 1] = id; stack[sp++] = c - 1; }
                if (x < w - 1 && lab[c + 1] < 0 && d[(c + 1) * 4 + 3] > 128) { lab[c + 1] = id; stack[sp++] = c + 1; }
                if (y > 0 && lab[c - w] < 0 && d[(c - w) * 4 + 3] > 128) { lab[c - w] = id; stack[sp++] = c - w; }
                if (y < h - 1 && lab[c + w] < 0 && d[(c + w) * 4 + 3] > 128) { lab[c + w] = id; stack[sp++] = c + w; }
            }
            solid += area;
            blobs.push({ area, r: sr / area, g: sg / area, b: sb / area });
        }
        if (blobs.length < 2) return 0;
        let main = 0;
        for (let k = 1; k < blobs.length; k++) if (blobs[k].area > blobs[main].area) main = k;
        const kill = new Uint8Array(blobs.length);
        let killed = 0;
        for (let k = 0; k < blobs.length; k++) {
            if (k === main) continue;
            const bl = blobs[k];
            if (bl.area > blobs[main].area * 0.35) continue;         // 太大，可能是主体的另一部分
            if (Math.abs(bl.r - B[0]) + Math.abs(bl.g - B[1]) + Math.abs(bl.b - B[2]) > 60) continue;
            kill[k] = 1; killed += bl.area;
        }
        if (!killed || killed > solid * 0.5) return 0;              // 删太多说明判错了，整体放弃
        for (let j = 0; j < n; j++) { const l = lab[j]; if (l >= 0 && kill[l]) d[j * 4 + 3] = 0; }
        S.rctx.putImageData(img, 0, 0);
        return killed;
    };

    // 边缘白边：外轮廓那圈像素是「主体 + 背景」的混合色，颜色已经基本是背景的，
    // 留着贴到白底/深色底上就是一圈描边。这里把紧贴透明区的那一圈抹掉。
    const shrinkBgEdge = () => {
        if (!S.hasMask || !S.rgb) return 0;
        const B = estimateBg();
        if (!B) return 0;
        const w = S.w, h = S.h, n = w * h;
        const px = S.rgb.data;
        const img = S.rctx.getImageData(0, 0, w, h);
        const d = img.data;
        const NBG = 18;
        let cleared = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const j = y * w + x, a = d[j * 4 + 3];
                if (a === 0 || a >= 210) continue;                  // 只动半透明的边缘
                const i = j * 4;
                if (Math.abs(px[i] - B[0]) + Math.abs(px[i + 1] - B[1]) + Math.abs(px[i + 2] - B[2]) > NBG) continue;
                if ((x > 0 && d[(j - 1) * 4 + 3] === 0) || (x < w - 1 && d[(j + 1) * 4 + 3] === 0) ||
                    (y > 0 && d[(j - w) * 4 + 3] === 0) || (y < h - 1 && d[(j + w) * 4 + 3] === 0)) {
                    d[j * 4 + 3] = 0;
                    cleared++;
                }
            }
        }
        if (cleared) S.rctx.putImageData(img, 0, 0);
        return cleared;
    };

    /* ---------------- 涂抹去物（魔法橡皮擦） ----------------
       算法：Telea 式图像修复，参考 OpenCV photo 模块 cv::INPAINT_TELEA（Apache-2.0）。
       纯 JS 本地实现：蒙版外扩 → 从边界逐层向内推进，每层用周围已知像素做距离加权平均，
       最后在填充区内部做几轮扩散平滑，让补出来的背景过渡自然。全程不联网。 */
    const dilateMask = (m, w, h, r) => {
        let cur = m;
        for (let p = 0; p < r; p++) {
            const out = new Uint8Array(cur);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    if (cur[i]) continue;
                    if ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) ||
                        (y > 0 && cur[i - w]) || (y < h - 1 && cur[i + w]) ||
                        (x > 0 && y > 0 && cur[i - w - 1]) || (x < w - 1 && y > 0 && cur[i - w + 1]) ||
                        (x > 0 && y < h - 1 && cur[i + w - 1]) || (x < w - 1 && y < h - 1 && cur[i + w + 1])) {
                        out[i] = 1;
                    }
                }
            }
            cur = out;
        }
        return cur;
    };

    // data: RGBA 像素（会被就地修改）；mask: 1 = 待填充
    // 1) 横/纵两方向扫描：洞内像素向两侧最近的已知像素做 1/d² 加权插值（线性级 O(N)，不会有逐层推进的接缝）
    // 2) 洞内扩散平滑若干轮，把插值的棱角磨掉
    const inpaintTelea = (data, mask, w, h) => {
        const N = w * h;
        const known = new Uint8Array(N);
        let holes = 0;
        for (let i = 0; i < N; i++) { if (mask[i]) holes++; else known[i] = 1; }
        if (!holes) return 0;
        const aR = new Float32Array(N), aG = new Float32Array(N), aB = new Float32Array(N), aW = new Float32Array(N);

        // 横向
        for (let y = 0; y < h; y++) {
            let x = 0, row = y * w;
            while (x < w) {
                if (known[row + x]) { x++; continue; }
                let x1 = x;
                while (x1 + 1 < w && !known[row + x1 + 1]) x1++;
                const lx = x - 1, rx = x1 + 1;
                const cL = lx >= 0 ? (row + lx) * 4 : -1;
                const cR = rx < w ? (row + rx) * 4 : -1;
                for (let xx = x; xx <= x1; xx++) {
                    const i = row + xx;
                    let sr = 0, sg = 0, sb = 0, sw = 0;
                    if (cL >= 0) { const d = xx - lx, wt = 1 / (d * d); sr += data[cL] * wt; sg += data[cL + 1] * wt; sb += data[cL + 2] * wt; sw += wt; }
                    if (cR >= 0) { const d = rx - xx, wt = 1 / (d * d); sr += data[cR] * wt; sg += data[cR + 1] * wt; sb += data[cR + 2] * wt; sw += wt; }
                    if (sw > 0) { aR[i] += sr; aG[i] += sg; aB[i] += sb; aW[i] += sw; }
                }
                x = x1 + 1;
            }
        }
        // 纵向（与横向加权合并：离哪个方向的边界近，就更信哪个方向）
        for (let x = 0; x < w; x++) {
            let y = 0;
            while (y < h) {
                if (known[y * w + x]) { y++; continue; }
                let y1 = y;
                while (y1 + 1 < h && !known[(y1 + 1) * w + x]) y1++;
                const ty = y - 1, by = y1 + 1;
                const cT = ty >= 0 ? (ty * w + x) * 4 : -1;
                const cB = by < h ? (by * w + x) * 4 : -1;
                for (let yy = y; yy <= y1; yy++) {
                    const i = yy * w + x;
                    let sr = 0, sg = 0, sb = 0, sw = 0;
                    if (cT >= 0) { const d = yy - ty, wt = 1 / (d * d); sr += data[cT] * wt; sg += data[cT + 1] * wt; sb += data[cT + 2] * wt; sw += wt; }
                    if (cB >= 0) { const d = by - yy, wt = 1 / (d * d); sr += data[cB] * wt; sg += data[cB + 1] * wt; sb += data[cB + 2] * wt; sw += wt; }
                    if (sw > 0) { aR[i] += sr; aG[i] += sg; aB[i] += sb; aW[i] += sw; }
                }
                y = y1 + 1;
            }
        }
        const holeIdx = [];
        for (let i = 0; i < N; i++) {
            if (known[i]) continue;
            holeIdx.push(i);
            if (aW[i] > 0) {
                const q = i * 4;
                data[q] = aR[i] / aW[i]; data[q + 1] = aG[i] / aW[i]; data[q + 2] = aB[i] / aW[i]; data[q + 3] = 255;
            }
        }
        // 洞内扩散平滑：8 邻域加权（对角 0.7），已知像素固定不动
        const tmp = new Float32Array(holeIdx.length * 3);
        for (let it = 0; it < 12; it++) {
            for (let k = 0; k < holeIdx.length; k++) {
                const i = holeIdx[k], x = i % w, y = (i / w) | 0;
                let sr = 0, sg = 0, sb = 0, n = 0;
                const acc = (j, wt) => { const q = j * 4; sr += data[q] * wt; sg += data[q + 1] * wt; sb += data[q + 2] * wt; n += wt; };
                if (x > 0) acc(i - 1, 1);
                if (x < w - 1) acc(i + 1, 1);
                if (y > 0) acc(i - w, 1);
                if (y < h - 1) acc(i + w, 1);
                if (x > 0 && y > 0) acc(i - w - 1, 0.7);
                if (x < w - 1 && y > 0) acc(i - w + 1, 0.7);
                if (x > 0 && y < h - 1) acc(i + w - 1, 0.7);
                if (x < w - 1 && y < h - 1) acc(i + w + 1, 0.7);
                const t = k * 3;
                tmp[t] = n ? sr / n : data[i * 4];
                tmp[t + 1] = n ? sg / n : data[i * 4 + 1];
                tmp[t + 2] = n ? sb / n : data[i * 4 + 2];
            }
            for (let k = 0; k < holeIdx.length; k++) {
                const q = holeIdx[k] * 4, t = k * 3;
                data[q] = tmp[t]; data[q + 1] = tmp[t + 1]; data[q + 2] = tmp[t + 2];
            }
        }
        return holes;
    };

    /* ---------------- MI-GAN：AI 图像修复（本地 wasm 推理） ----------------
       来源：https://github.com/Picsart-AI-Research/MI-GAN （ICCV 2023，MIT）
       移动端优化的轻量 GAN，输入 image(uint8 NCHW 1×3×512×512) + mask(uint8 1×1×512×512)，
       输出 uint8 1×3×512×512。对每个涂抹区裁一块带上下文的正方形，缩放到 512 推理，再贴回原图。 */
    const ensureMigan = async () => {
        if (S.migan) return S.migan;
        let buf = await idbGet('model:' + MIGAN.key).catch(() => null);
        if (buf && buf.byteLength !== MIGAN.bytes) buf = null;
        if (!buf) {
            buf = await downloadModel(MIGAN);
            await idbPut('model:' + MIGAN.key, buf).catch(() => { });
        }
        const needWasm = true;
        const wasmP = needWasm ? loadWasmBinary().catch(() => null) : Promise.resolve(null);
        const [ort, wasmBuf] = await Promise.all([loadORT(), wasmP]);
        if (wasmBuf) ort.env.wasm.wasmBinary = wasmBuf;
        setStatus('正在初始化 AI 修复模型...', true);
        S.migan = await withTimeout(ort.InferenceSession.create(new Uint8Array(buf), {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        }), 120000, 'AI 修复模型初始化超时，请刷新重试');
        S.miganSessionKey = MIGAN.key;
        return S.migan;
    };

    // 把 work 画布上 m 标记的区域交给 MI-GAN 重建；返回 true 表示成功
    const runMigan = async (work, m, w, h) => {
        const sess = await ensureMigan();
        const ort = S.ort;
        const size = MIGAN.size;

        // 1) 涂抹区包围盒
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!m[y * w + x]) continue;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < 0) return false;
        const bw = maxX - minX + 1, bh = maxY - minY + 1;

        // 2) 裁一块正方形（洞外留 0.9 倍上下文，模型才知道该补什么）
        const side = Math.max(64, Math.min(Math.round(Math.max(bw, bh) * 1.9), Math.max(w, h)));
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const ox = Math.round(cx - side / 2), oy = Math.round(cy - side / 2);

        const sq = document.createElement('canvas');
        sq.width = size; sq.height = size;
        const sqc = sq.getContext('2d', { willReadFrequently: true });
        sqc.imageSmoothingEnabled = true;
        sqc.imageSmoothingQuality = 'high';
        sqc.drawImage(work, ox, oy, side, side, 0, 0, size, size);

        // 3) 蒙版按「最近邻」重采样到 512，避免小洞被插值抹掉；再外扩 3px 盖住软边
        const key = new Uint8Array(size * size);
        for (let y = 0; y < size; y++) {
            const sy = Math.floor(oy + (y + 0.5) * side / size);
            for (let x = 0; x < size; x++) {
                const sx = Math.floor(ox + (x + 0.5) * side / size);
                if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
                if (m[sy * w + sx]) key[y * size + x] = 1;
            }
        }
        // 蒙版再外扩 9px（512 尺度）：给模型留出安全边，否则原物体的高反差边（文字/水印）
        // 会从蒙版边缘「漏」进输出，留下淡淡的鬼影
        const mk = dilateMask(key, size, size, 9);

        // 4) 组 tensor
        const px = sqc.getImageData(0, 0, size, size).data;
        const n = size * size;
        const img = new Uint8Array(n * 3);
        for (let i = 0; i < n; i++) {
            img[i] = px[i * 4];
            img[n + i] = px[i * 4 + 1];
            img[2 * n + i] = px[i * 4 + 2];
        }
        // 实测这个 pipeline 的 mask 是「已知区域」=255、待补区域=0（喂反了会把整张图重画成木纹，
        // 这就是第一版「AI 补出一片毛刺纹理」的根因）
        const maskT = new Uint8Array(n);
        for (let i = 0; i < n; i++) maskT[i] = mk[i] ? 0 : 255;

        const t0 = performance.now();
        const res = await sess.run({
            image: new ort.Tensor('uint8', img, [1, 3, size, size]),
            mask: new ort.Tensor('uint8', maskT, [1, 1, size, size])
        });
        const outT = res.result || res[Object.keys(res)[0]];
        const od = outT.data;
        const scaled = outT.dims && outT.dims[1] === 3;

        // 5) 还原成 512 画布
        const outp = document.createElement('canvas');
        outp.width = size; outp.height = size;
        const opc = outp.getContext('2d');
        const oi = opc.createImageData(size, size);
        for (let i = 0; i < n; i++) {
            if (scaled) {
                oi.data[i * 4] = od[i]; oi.data[i * 4 + 1] = od[n + i]; oi.data[i * 4 + 2] = od[2 * n + i];
            } else {
                oi.data[i * 4] = od[i * 3]; oi.data[i * 4 + 1] = od[i * 3 + 1]; oi.data[i * 4 + 2] = od[i * 3 + 2];
            }
            oi.data[i * 4 + 3] = 255;
        }
        opc.putImageData(oi, 0, 0);

        // 6) 贴回：按涂抹 alpha 混合（软边自然过渡，画笔外的像素一律不动）
        const pat = document.createElement('canvas');
        pat.width = w; pat.height = h;
        pat.getContext('2d').drawImage(outp, ox, oy, side, side);

        const bx = Math.max(0, minX - 6), by = Math.max(0, minY - 6);
        const bxx = Math.min(w, maxX + 7), byy = Math.min(h, maxY + 7);
        const cw = bxx - bx, chh = byy - by;
        if (cw <= 0 || chh <= 0) return false;
        const wc = work.getContext('2d', { willReadFrequently: true });
        const dst = wc.getImageData(bx, by, cw, chh);
        const src = pat.getContext('2d').getImageData(bx, by, cw, chh).data;
        const d = dst.data;

        // 融合权重：本次处理的蒙版 → 外扩 3px（盖掉物体残留的一圈边）→ 3×3 均值软化边缘
        const kk = new Float32Array(cw * chh);
        for (let y = 0; y < chh; y++) {
            for (let x = 0; x < cw; x++) {
                kk[y * cw + x] = m[(by + y) * w + (bx + x)] ? 1 : 0;
            }
        }
        const dil = (srcA, radius) => {
            let cur = srcA;
            for (let r = 0; r < radius; r++) {
                const out = new Float32Array(cur);
                for (let y = 0; y < chh; y++) {
                    for (let x = 0; x < cw; x++) {
                        const i = y * cw + x;
                        if (cur[i] > 0) continue;
                        const l = x > 0 && cur[i - 1] > 0;
                        const rr = x < cw - 1 && cur[i + 1] > 0;
                        const u = y > 0 && cur[i - cw] > 0;
                        const dn = y < chh - 1 && cur[i + cw] > 0;
                        if (l || rr || u || dn) out[i] = 1;
                    }
                }
                cur = out;
            }
            return cur;
        };
        const dil2 = dil(kk, 3);
        // 3×3 均值：让贴补区域的边界过渡成 1px 渐变而不是硬切线
        const soft = new Float32Array(cw * chh);
        for (let y = 0; y < chh; y++) {
            for (let x = 0; x < cw; x++) {
                let sum = 0, n = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const xx = x + dx, yy = y + dy;
                        if (xx < 0 || yy < 0 || xx >= cw || yy >= chh) continue;
                        sum += dil2[yy * cw + xx]; n++;
                    }
                }
                soft[y * cw + x] = sum / n;
            }
        }
        for (let y = 0; y < chh; y++) {
            for (let x = 0; x < cw; x++) {
                const k = soft[y * cw + x];
                if (k <= 0.02) continue;
                const q = (y * cw + x) * 4;
                d[q] = d[q] * (1 - k) + src[q] * k;
                d[q + 1] = d[q + 1] * (1 - k) + src[q + 1] * k;
                d[q + 2] = d[q + 2] * (1 - k) + src[q + 2] * k;
            }
        }
        wc.putImageData(dst, bx, by);
        return { ms: Math.round(performance.now() - t0), side, scale: size / side };
    };

    const syncRmButtons = () => {
        const dis = (id, d) => { const el = $(id); if (el) el.disabled = d; };
        const n = S.inpaintHist.length;
        dis('#mattingInpaint', !S.rmHas || !!S.busy);
        dis('#mattingInpaintClear', !S.rmHas);
        // 撤销 / 对比 常开：按钮永远可点，没东西可撤时给 toast 提示，
        // 比灰掉更明确（灰按钮点了毫无反应的体验最差）
        dis('#mattingInpaintUndo', false);
        dis('#mattingInpaintCmp', false);
        const u = $('#mattingInpaintUndo');
        if (u) u.textContent = n > 1 ? '↩ 撤销擦除 (' + n + ')' : '↩ 撤销擦除';
        const c = $('#mattingInpaintCmp');
        if (c) c.classList.toggle('on', !!S.cmpOn);
    };

    const clearRm = (silent) => {
        if (S.rmctx) S.rmctx.clearRect(0, 0, S.w, S.h);
        S.rmHas = false;
        syncRmButtons();
        if (!silent) render();
    };

    const doInpaint = async () => {
        if (!S.src) return toast('请先上传图片');
        if (!S.rmHas) return toast('先在图上涂抹要移除的区域（模式切到「🪄 涂抹去物」）');
        if (S.busy) return toast('正在处理，稍等一下');
        const work = document.createElement('canvas');
        work.width = S.w; work.height = S.h;
        const wc = work.getContext('2d', { willReadFrequently: true });
        wc.drawImage(S.src, 0, 0, S.w, S.h);
        const rm = S.rmctx.getImageData(0, 0, S.w, S.h).data;
        const m0 = new Uint8Array(S.w * S.h);
        let n = 0;
        for (let i = 0; i < m0.length; i++) { if (rm[i * 4 + 3] > 20) { m0[i] = 1; n++; } }
        if (!n) return toast('涂抹区是空的');

        S.busy = true;
        syncRmButtons();
        const t0 = performance.now();
        let engine = 'local';
        let note = '';
        try {
            if (S.removeEngine === 'ai') {
                setProgress(0.05);
                setStatus('AI 正在补全...（首次使用需下载 27MB 模型，之后缓存在本地秒开）');
                await sleep(30);
                try {
                    const r = await runMigan(work, m0, S.w, S.h);
                    if (r) {
                        engine = 'ai';
                        note = ' · AI ' + r.ms + 'ms' + (r.scale > 1 ? ' · 放大 ' + r.scale.toFixed(1) + '×' : '');
                    } else { note = ' · 涂抹区太小，已用本地修复'; }
                } catch (err) {
                    console.warn('[migan]', err);
                    note = ' · AI 模型不可用（' + (err && err.message ? err.message.slice(0, 40) : '未知错误') + '），已用本地修复';
                }
            }
            if (engine === 'local') {
                setStatus(S.removeEngine === 'ai' ? 'AI 不可用，改用本地修复...' : '本地修复中，图大稍等...');
                await sleep(20);
                const im = wc.getImageData(0, 0, S.w, S.h);
                inpaintTelea(im.data, dilateMask(m0, S.w, S.h, 2), S.w, S.h);
                wc.putImageData(im, 0, 0);
            }
            // 擦除前快照：撤销 / 前后对比都靠它（work 已被改写，所以从 S.src 重画）
            const before = document.createElement('canvas');
            before.width = S.w; before.height = S.h;
            before.getContext('2d').drawImage(S.src, 0, 0, S.w, S.h);
            S.inpaintHist.push(before);
            if (S.inpaintHist.length > 6) S.inpaintHist.shift();

            S.src = work;
            cacheRGB();
            clearRm(true);
            if (S.hasMask) scheduleFg(); else render();
            syncRmButtons();
            const sec = ((performance.now() - t0) / 1000).toFixed(1);
            // 洞太大时 512 分辨率不够喂，模型只能补出模糊的平均色 —— 提前把预期讲清楚
            const bigHole = n / (S.w * S.h) > 0.05;
            if (engine === 'ai' && bigHole) note += ' · 涂抹区偏大，建议分 2–3 次小面积擦，边缘更实';
            setStatus('已移除 ' + n.toLocaleString() + ' px（' + sec + 's' + note + '）。可点「对比原图」看前后差异。');
            toast(engine === 'ai' ? 'AI 已补齐背景' : '已移除涂抹区');
        } catch (e) {
            setStatus('修复失败：' + (e && e.message ? e.message : e));
            toast('修复失败，请重试');
        } finally {
            setProgress(null);
            S.busy = false;
            syncRmButtons();
        }
    };

    const undoInpaint = () => {
        if (S.busy) return toast('正在处理，稍等一下');
        if (!S.inpaintHist.length) return toast('还没有擦除记录，先涂抹并点「移除涂抹区」');
        const prev = S.inpaintHist.pop();
        S.src = prev;
        cacheRGB();
        if (!S.inpaintHist.length) S.cmpOn = false;
        if (S.hasMask) scheduleFg(); else render();
        syncRmButtons();
        const left = S.inpaintHist.length;
        toast(left ? '已撤销这次擦除，还可撤销 ' + left + ' 步' : '已撤销到擦除前的原图');
        setStatus(left ? '已撤销一次擦除，还能继续撤销 ' + left + ' 步' : '已回到擦除前的样子');
    };

    /* ---------------- 载入图片 ---------------- */
    const loadFile = async (file) => {
        if (!file) return;
        if (!/^image\//.test(file.type || '')) return toast('请选择图片文件');
        if (file.size > 25 * 1024 * 1024) return toast('图片过大，请换一张 25MB 以内的');
        setStatus('正在读取图片...');
        let bmp;
        try {
            const buf = await file.arrayBuffer();
            if (window.createImageBitmap) bmp = await createImageBitmap(new Blob([buf], { type: file.type }));
            else bmp = await new Promise((res, rej) => {
                const url = URL.createObjectURL(file);
                const im = new Image();
                im.onload = () => { URL.revokeObjectURL(url); res(im); };
                im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('图片解析失败')); };
                im.src = url;
            });
        } catch (e) { return toast('图片解析失败：' + e.message); }

        S.natural = [bmp.width, bmp.height];
        const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
        // 先建文档/图层，再往活动图层里填 src（S.src 现在是活动图层的代理字段）
        setupCanvases(Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)));
        S.src = bmp;
        S.fg = null;
        S.bgColor = undefined;      // 换图要重新估背景色
        S.pickKey = null;           // 换图重新判断哪个模型更合适
        S.name = file.name || '图片';
        if (actLayer()) actLayer().name = S.name.replace(/\.[^.]+$/, '').slice(0, 18) || '图层 1';
        S.hasMask = false;
        cacheRGB();
        renderLayerPanel();
        const stage = $('#mattingStage');
        if (stage) {
            stage.classList.remove('is-empty');
            // 有图才锁滚轮：此后画布上的滚轮只用来缩放，不再带动页面滚动
            stage.dataset.wheelLock = '1';
        }
        const empty = $('#mattingEmpty');
        if (empty) empty.style.display = 'none';
        setNeedImg(true);
        render();
        S.userZoomed = false;      // 换图回到「适应窗口」
        fitView(false);
        setStatus('已载入 ' + S.name + ' · ' + S.natural[0] + '×' + S.natural[1] + '，点「一键去背景」开始');
        toast('图片已载入');
    };

    /* ---------------- 导出 ---------------- */
    const download = (href, name) => {
        const a = document.createElement('a');
        a.href = href;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const exportPNG = () => {
        if (!hasAnyPixels()) return toast('画布还是空的，先上传图片或新建画布');
        setStatus('正在导出透明 PNG...');
        const c = mkCv(S.w, S.h);
        const x = c.getContext('2d');
        // 导出的是整张画布（图层按顺序合成，隐藏的层不导出）
        composeDoc(x, true);
        c.toBlob((blob) => {
            if (!blob) return toast('导出失败');
            const url = URL.createObjectURL(blob);
            download(url, '抠图_' + S.w + 'x' + S.h + '_' + Date.now() + '.png');
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            setStatus('已导出透明 PNG（' + S.w + '×' + S.h + '）');
            toast('已导出透明 PNG');
        }, 'image/png');
    };

    const loadTracer = () => new Promise((res, rej) => {
        if (S.tracer || window.ImageTracer) {
            S.tracer = S.tracer || window.ImageTracer;
            return res(S.tracer);
        }
        const s = document.createElement('script');
        s.src = TRACER_URL;
        s.onload = () => { S.tracer = window.ImageTracer; res(S.tracer); };
        s.onerror = () => rej(new Error('矢量模块加载失败'));
        document.head.appendChild(s);
    });

    const exportSVG = async () => {
        if (!S.hasMask) return toast('请先完成去背景');
        if (!S.src) return toast('当前图层没有像素，先切到有内容的图层');
        setStatus('正在生成矢量图...');
        let tracer;
        try { tracer = await loadTracer(); } catch (e) { return toast(e.message); }
        // 大图先降采样再追踪（矢量坐标按倍数还原），否则上千像素的图要等很久
        const cap = 900;
        const k = Math.max(1, Math.max(S.w, S.h) / cap);
        const tw = Math.max(1, Math.round(S.w / k)), th = Math.max(1, Math.round(S.h / k));
        const c = document.createElement('canvas');
        c.width = tw; c.height = th;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.imageSmoothingEnabled = true;
        x.imageSmoothingQuality = 'high';
        x.drawImage(S.fg || S.src, 0, 0, tw, th);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(S.mask, 0, 0, tw, th);
        const imgd = x.getImageData(0, 0, tw, th);
        // alpha 二值化：合并半透明边缘，避免追踪出散落的小色块/白点
        const dd = imgd.data;
        for (let i = 0; i < dd.length; i += 4) {
            if (dd[i + 3] < 128) { dd[i] = dd[i + 1] = dd[i + 2] = 0; dd[i + 3] = 0; }
            else dd[i + 3] = 255;
        }
        const colors = Number(($('#mattingVecColors') || {}).value || 24);
        const detail = Number(($('#mattingVecDetail') || {}).value || 60);
        const lt = Math.max(0.2, 2.4 - detail / 60);
        try {
            const svg = tracer.imagedataToSVG(imgd, {
                colorsampling: 1,
                numberofcolors: colors,
                ltres: lt,
                qtres: Math.max(0.2, lt * 0.9),
                pathomit: Math.max(1, 6 / k),
                strokewidth: 0,
                linefilter: false,
                scale: k,
                roundcoords: 1,
                viewbox: true,
                desc: false,
                blurradius: 0
            });
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            download(url, '矢量图_' + S.w + 'x' + S.h + '_' + Date.now() + '.svg');
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            const preview = $('#mattingVecPreview');
            if (preview) {
                preview.innerHTML = '';
                const im = document.createElement('img');
                im.alt = '矢量图预览';
                im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
                preview.appendChild(im);
                preview.style.display = 'block';
            }
            setStatus('已导出 SVG 矢量图（' + (svg.length / 1024).toFixed(0) + ' KB）');
            toast('已导出 SVG 矢量图');
        } catch (e) {
            toast('矢量导出失败：' + e.message);
        }
    };

    // 画笔/滑块改动后：由权威蒙版重新派生显示蒙版并重绘
    const refresh = () => {
        postProcess({ refine: false, feather: S.feather, contrast: S.contrast });
        render();
    };

    /* ---------------- 选区（对应 PS 的「选择范围」） ----------------
       点选（魔术棒）和套索只改「选区」，再点「删除/恢复选区」才真正动蒙版：
       和 PS 一样能新建 / 加选 / 减选，反选、扩展、收缩、羽化都只作用在选区本身。
       点选的算法参考 Tamersoul/magic-wand-js：按颜色差生成二值选区；
       我们另外补了「连续 / 全局」两种范围和套索（PS 的套索工具）。 */
    const selCache = (id) => {
        if (!S._sel) S._sel = {};
        let cv = S._sel[id];
        if (!cv || cv.width !== S.w || cv.height !== S.h) {
            cv = document.createElement('canvas');
            cv.width = S.w; cv.height = S.h;
            S._sel[id] = cv;
        }
        return cv;
    };

    const hexRGB = (hex) => {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
        if (!m) return [217, 70, 60];
        const v = parseInt(m[1], 16);
        return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    };

    // 选区一变就重建「叠加色 + 蚁线」两张缓存图，并刷新面板里的面积读数
    const rebuildSelVisual = () => {
        const info = $('#mattingSelInfo');
        if (!S.sel || !S.sctx) return;
        if (!S.selOn) {
            S.selArea = 0;
            if (info) info.textContent = '未选区：用点选或套索圈出范围';
            return;
        }
        const w = S.w, h = S.h, n = w * h;
        const sd = S.sctx.getImageData(0, 0, w, h).data;
        const aa = new Uint8ClampedArray(n);
        let area = 0;
        for (let j = 0; j < n; j++) {
            const v = sd[j * 4 + 3];
            aa[j] = v;
            if (v > 127) area++;
        }
        S.selArea = area;
        // ① 叠加色：浓度直接乘在 alpha 上
        const tint = selCache('tint');
        const tc = tint.getContext('2d');
        const ti = tc.createImageData(w, h);
        const col = hexRGB(S.cutColor);
        const k = Math.max(0, Math.min(1, S.cutOp));
        const td = ti.data;
        for (let j = 0; j < n; j++) {
            const a = aa[j];
            if (!a) continue;
            const i = j * 4;
            td[i] = col[0]; td[i + 1] = col[1]; td[i + 2] = col[2];
            td[i + 3] = a * k;
        }
        tc.putImageData(ti, 0, 0);
        // ② 蚁线：边界像素画成黑白相间的点（不做动画，缩放后也看得清，不做动画省 rAF）
        const ants = selCache('ants');
        const ac = ants.getContext('2d');
        const ai = ac.createImageData(w, h);
        const ad = ai.data;
        for (let y = 0; y < h; y++) {
            const row = y * w;
            for (let x = 0; x < w; x++) {
                const j = row + x;
                if (aa[j] <= 127) continue;
                const edge = (x === 0 || aa[j - 1] <= 127) || (x === w - 1 || aa[j + 1] <= 127)
                    || (y === 0 || aa[j - w] <= 127) || (y === h - 1 || aa[j + w] <= 127);
                if (!edge) continue;
                const i = j * 4;
                const dark = ((((x + y) >> 2) & 1) === 0);
                ad[i] = ad[i + 1] = ad[i + 2] = dark ? 0 : 255;
                ad[i + 3] = 235;
            }
        }
        ac.putImageData(ai, 0, 0);
        if (info) {
            const pct = (area / n * 100).toFixed(area / n < 0.01 ? 2 : 1);
            info.textContent = '选区 ' + area.toLocaleString() + ' px · 占画面 ' + pct + '%';
        }
    };

    const selClear = (quiet) => {
        if (S.sctx) S.sctx.clearRect(0, 0, S.w, S.h);
        S.selOn = false; S.selArea = 0; S.selDraft = null;
        rebuildSelVisual();
        render();
        if (!quiet) setStatus('已取消选区');
    };

    // Shift = 加选、Alt/右键 = 减选，其余按面板里选的模式
    const selModeNow = (e) => {
        if (!e) return S.selMode;
        if (e.shiftKey) return 'add';
        if (e.altKey || e.button === 2) return 'sub';
        return S.selMode;
    };

    // 把这一批像素并进选区（mode: new 覆盖 / add 并集 / sub 差集）
    const applyHitToSel = (hit, mode) => {
        const w = S.w, h = S.h, n = w * h;
        const img = S.sctx.getImageData(0, 0, w, h);
        const a = img.data;
        if (mode === 'new') {
            for (let j = 0; j < n; j++) a[j * 4 + 3] = 0;
        }
        for (let j = 0; j < n; j++) {
            if (!hit[j]) continue;
            a[j * 4 + 3] = mode === 'sub' ? 0 : 255;
        }
        S.sctx.putImageData(img, 0, 0);
        S.selOn = true;
        rebuildSelVisual();
        render();
    };

    const wandToSelection = (e) => {
        if (!S.hasMask || !S.rgb || !S.sctx) return toast('请先点「一键去背景」，再用点选');
        const p = toCanvasXY(e);
        const x0 = Math.round(p.x), y0 = Math.round(p.y);
        if (x0 < 1 || y0 < 1 || x0 >= S.w - 1 || y0 >= S.h - 1) return;
        const mode = selModeNow(e);
        const w = S.w, h = S.h, n = w * h;
        const d = S.rgb.data;
        const s0 = (y0 * w + x0) * 4;
        const r0 = d[s0], g0 = d[s0 + 1], b0 = d[s0 + 2];
        const thr = Math.max(4, (S.wandTol || 18) * 1.8);   // 容差 1-100 → 颜色距离阈值
        const thr2 = thr * thr;
        const hit = new Uint8Array(n);
        let count = 0;
        const similar = (t) => {
            const i = t * 4;
            const dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0;
            return dr * dr + dg * dg + db * db <= thr2;
        };
        if (S.wandScope === 'global') {
            for (let j = 0; j < n; j++) if (similar(j)) { hit[j] = 1; count++; }
        } else {
            const seen = new Uint8Array(n);
            const stack = new Int32Array(n);
            let sp = 0;
            const start = y0 * w + x0;
            seen[start] = 1; hit[start] = 1; stack[sp++] = start; count = 1;
            while (sp > 0) {
                const idx = stack[--sp];
                const x = idx % w, y = (idx - x) / w;
                for (let k = 0; k < 4; k++) {
                    let t = -1;
                    if (k === 0) { if (x > 0) t = idx - 1; }
                    else if (k === 1) { if (x < w - 1) t = idx + 1; }
                    else if (k === 2) { if (y > 0) t = idx - w; }
                    else { if (y < h - 1) t = idx + w; }
                    if (t < 0 || seen[t] || !similar(t)) continue;
                    seen[t] = 1; hit[t] = 1; stack[sp++] = t; count++;
                }
            }
        }
        if (!count) return toast('这里没有可选的颜色');
        applyHitToSel(hit, mode);
        setStatus('选区' + (mode === 'add' ? '加选' : mode === 'sub' ? '减选' : '新建')
            + '：' + count.toLocaleString() + ' px（容差 ' + (S.wandTol || 18) + ' · '
            + (S.wandScope === 'global' ? '全局' : '连续') + '）');
    };

    // 套索：松手时把这一圈点连成多边形，填成选区
    const lassoCommit = (mode) => {
        const pts = S.selDraft;
        S.selDraft = null;
        if (!pts || pts.length < 3) { render(); return; }
        const cv = tmpC('lasso');
        const g = cv.getContext('2d');
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.closePath();
        g.fill();
        const ld = g.getImageData(0, 0, S.w, S.h).data;
        const hit = new Uint8Array(S.w * S.h);
        let count = 0;
        for (let j = 0; j < hit.length; j++) {
            if (ld[j * 4 + 3] > 127) { hit[j] = 1; count++; }
        }
        if (!count) { render(); return toast('这一圈太小了，再画大一点'); }
        applyHitToSel(hit, mode);
        setStatus('套索' + (mode === 'add' ? '加选' : mode === 'sub' ? '减选' : '新建')
            + '：' + count.toLocaleString() + ' px');
    };

    // 反选 / 扩展 / 收缩：只改选区，不动蒙版
    const selInvert = () => {
        if (!S.selOn) return toast('先用点选或套索圈出范围');
        const img = S.sctx.getImageData(0, 0, S.w, S.h);
        const a = img.data;
        for (let j = 0; j < S.w * S.h; j++) a[j * 4 + 3] = 255 - a[j * 4 + 3];
        S.sctx.putImageData(img, 0, 0);
        rebuildSelVisual();
        render();
        setStatus('已反选：' + S.selArea.toLocaleString() + ' px');
    };

    // 全选：整张图都进选区（PS 的 Ctrl+A），后面可以直接「删除选区」清空或「恢复选区」铺满
    const selAll = () => {
        if (!S.sctx) return;
        const img = S.sctx.getImageData(0, 0, S.w, S.h);
        const a = img.data;
        for (let j = 0; j < S.w * S.h; j++) a[j * 4 + 3] = 255;
        S.sctx.putImageData(img, 0, 0);
        S.selOn = true;
        rebuildSelVisual();
        render();
        setStatus('已全选：' + S.selArea.toLocaleString() + ' px');
    };

    const selMorph = (dir) => {
        if (!S.selOn) return toast('先用点选或套索圈出范围');
        const w = S.w, h = S.h, n = w * h;
        const sd = S.sctx.getImageData(0, 0, w, h).data;
        const bin = new Uint8Array(n);
        for (let j = 0; j < n; j++) bin[j] = sd[j * 4 + 3] > 127 ? 1 : 0;
        // 3×3 结构元膨胀；收缩 = 先取反、膨胀、再取反
        const grow = (src) => {
            const out = new Uint8Array(n);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const j = y * w + x;
                    if (src[j]) { out[j] = 1; continue; }
                    let on = 0;
                    for (let dy = -1; dy <= 1 && !on; dy++) {
                        const yy = y + dy;
                        if (yy < 0 || yy >= h) continue;
                        for (let dx = -1; dx <= 1; dx++) {
                            const xx = x + dx;
                            if (xx < 0 || xx >= w) continue;
                            if (src[yy * w + xx]) { on = 1; break; }
                        }
                    }
                    out[j] = on;
                }
            }
            return out;
        };
        const inv = (a) => { const o = new Uint8Array(n); for (let j = 0; j < n; j++) o[j] = a[j] ? 0 : 1; return o; };
        const res = dir > 0 ? grow(bin) : inv(grow(inv(bin)));
        const img = S.sctx.getImageData(0, 0, w, h);
        const a = img.data;
        for (let j = 0; j < n; j++) a[j * 4 + 3] = res[j] ? 255 : 0;
        S.sctx.putImageData(img, 0, 0);
        rebuildSelVisual();
        render();
        setStatus('选区已' + (dir > 0 ? '扩展' : '收缩') + ' 1px：' + S.selArea.toLocaleString() + ' px');
    };

    const selFeatherPx = () => {
        const el = $('#mattingSelFeather');
        return el ? Math.max(0, Math.min(12, Math.round(Number(el.value) || 0))) : (S.selFeather || 0);
    };

    // 把选区作用到蒙版：add=true 恢复主体、false 删除
    const applySelection = (add) => {
        if (!S.hasMask || !S.rctx) return toast('请先点「一键去背景」');
        if (!S.selOn || !S.selArea) return toast('先用点选或套索圈出范围');
        const w = S.w, h = S.h, n = w * h;
        const feather = selFeatherPx();
        S.selFeather = feather;
        let sel = S.sctx.getImageData(0, 0, w, h).data;
        if (feather > 0) {
            // 羽化：把选区 alpha 模糊两遍，边界变成渐隐，作用到蒙版上不会留硬边
            let g = new Float32Array(n);
            for (let j = 0; j < n; j++) g[j] = sel[j * 4 + 3] / 255;
            g = boxBlurGray(g, w, h, feather, 2);
            const img = S.sctx.getImageData(0, 0, w, h);
            const a = img.data;
            for (let j = 0; j < n; j++) {
                const v = g[j];
                a[j * 4 + 3] = (v < 0 ? 0 : v > 1 ? 1 : v) * 255;
            }
            S.sctx.putImageData(img, 0, 0);
            sel = img.data;
        }
        const area = S.selArea;
        pushHistory();
        const mi = S.rctx.getImageData(0, 0, w, h);
        const md = mi.data;
        let changed = 0;
        for (let j = 0; j < n; j++) {
            const k = sel[j * 4 + 3] / 255;
            if (!k) continue;
            const cur = md[j * 4 + 3];
            const next = add ? cur + (255 - cur) * k : cur * (1 - k);
            if (Math.abs(next - cur) > 0.5) changed++;
            md[j * 4 + 3] = next;
        }
        S.rctx.putImageData(mi, 0, 0);
        selClear(true);
        refresh();
        setStatus((add ? '已恢复 ' : '已删除 ') + area.toLocaleString() + ' px（改动 ' + changed.toLocaleString()
            + ' px，羽化 ' + feather + 'px，可撤销）');
    };

    /* ---------------- 补小洞 ----------------
       rembg 的 post_process_mask 是「形态学开 + 闭」：小的前景碎片删掉、小的背景孔补上。
       碎片那一半上面已有 despeckle()（自动流程也在用），这里只补「闭运算」的补洞部分：
       按背景连通域扫一遍，碰不到画面边缘、面积又很小的洞，直接填成实心 */
    const fillHoles = () => {
        const w = S.w, h = S.h, n = w * h;
        const img = S.rctx.getImageData(0, 0, w, h);
        const d = img.data;
        const lab = new Uint8Array(n);
        const stack = new Int32Array(n);
        const minHole = Math.max(24, Math.round(n * 0.00025));   // 2MP 图约 500px
        let filled = 0;
        for (let j0 = 0; j0 < n; j0++) {
            if (d[j0 * 4 + 3] > 128 || lab[j0]) continue;
            let sp = 0, edge = false;
            const comp = [];
            lab[j0] = 1;
            stack[sp++] = j0;
            while (sp) {
                const c = stack[--sp];
                comp.push(c);
                const x = c % w, y = (c - x) / w;
                if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
                if (x > 0 && !lab[c - 1] && d[(c - 1) * 4 + 3] <= 128) { lab[c - 1] = 1; stack[sp++] = c - 1; }
                if (x < w - 1 && !lab[c + 1] && d[(c + 1) * 4 + 3] <= 128) { lab[c + 1] = 1; stack[sp++] = c + 1; }
                if (y > 0 && !lab[c - w] && d[(c - w) * 4 + 3] <= 128) { lab[c - w] = 1; stack[sp++] = c - w; }
                if (y < h - 1 && !lab[c + w] && d[(c + w) * 4 + 3] <= 128) { lab[c + w] = 1; stack[sp++] = c + w; }
            }
            if (edge || comp.length >= minHole) continue;
            for (let k = 0; k < comp.length; k++) d[comp[k] * 4 + 3] = 255;
            filled++;
        }
        if (filled) S.rctx.putImageData(img, 0, 0);
        return filled;
    };

    /* ---------------- 主流程 ---------------- */
    const autoRemove = async () => {
        if (!S.src) return toast('请先上传图片');
        if (S.busy) return;
        S.busy = true;
        const btn = $('#mattingAutoBtn');
        if (btn) { btn.disabled = true; btn.textContent = '正在识别...'; }
        const t0 = performance.now();
        // 精细模型首次要下 42MB：先用已经就绪的快速模型把结果出出来（1~2 秒），
        // 42MB 交给后台继续下，下完再点一次就是精细结果。总比干等半分钟强。
        let usedFast = false;
        if (S.model === 'pro' && S.sessionKey !== MODELS.pro.key) {
            const cached = await idbGet('model:' + MODELS.pro.key).catch(() => null);
            if (!cached || cached.byteLength !== MODELS.pro.bytes) {
                usedFast = true;
                S.model = 'fast';
                setStatus('精细模型还在后台下载，先用快速模型出图；下完之后再点一次会更干净。');
            }
        }
        try {
            render();
            // 同一张图上次哪个模型更干净，这次先用它
            const primary = MODELS[S.pickKey] || MODELS[S.model] || MODELS.fast;
            await withTimeout(infer(primary), 240000, '模型准备超时（网络较慢），请检查网络后再试');
            const q1 = S.debug.rawQ || { comps: 0, mainPct: 0, restPct: 0 };
            const q1c = maskShape();          // 清理后的形状，用来和复核结果比
            // 因为「精细模型还没下完」才降级的不算选优结果，等它下完还要再比一次
            if (!usedFast) S.pickKey = primary.key;
            // 跑糊了（背景上冒出一堆碎块，或者碎块占面很大）：换另一个模型复核一次，
            // 两个里挑干净的那张。量化版 isnet 在某些图（纯白底的产品渲染）上会成片乱响，
            // 小模型反而干净 —— 只看模型大小是选不对的，得看结果。
            if (q1.comps > 24 || q1.restPct > 2.5) {
                const alt = primary.key === 'isnet' ? MODELS.fast : MODELS.pro;
                if (await modelCached(alt)) {
                    const snap = snapMask();
                    const snapDbg = Object.assign({}, S.debug);
                    setStatus('这一版背景有点脏，正在换模型复核...');
                    try {
                        await withTimeout(infer(alt), 180000, '复核超时');
                        const dbgAlt = Object.assign({}, S.debug);
                        const q2 = S.debug.rawQ || { comps: 0, mainPct: 0, restPct: 0 };
                        const q2c = maskShape();
                        // 复核版要「碎块少得多」且「主体没被明显削掉」才算赢，否则退回原来那张
                        if (q2c.comps <= Math.max(3, q1c.comps * 0.5) && q2c.mainPct >= q1c.mainPct * 0.9) {
                            S.pickKey = alt.key;
                            S.debug.retry = { from: primary.key, q1, q1c, q2, q2c, kept: alt.key };
                        } else {
                            restoreMask(snap);
                            S.debug = snapDbg;
                            S.debug.retry = { from: primary.key, q1, q1c, q2, q2c, kept: primary.key };
                        }
                    } catch (e) {
                        restoreMask(snap);
                        S.debug = snapDbg;
                    }
                }
            }
            if (!$('#mattingRefine') || $('#mattingRefine').checked) bakeRefine();
            postProcess({ refine: false, feather: S.feather, contrast: S.contrast });
            pushHistory();
            render();
            const sec = ((performance.now() - t0) / 1000).toFixed(1);
            setStatus('去背景完成 · 用时 ' + sec + ' 秒，可用画笔继续修补'
                + (usedFast ? '；精细模型正在后台下载，下完再点一次会更干净'
                    : S.model === 'fast' ? '；想要更干净的细节边缘，可切到「精细模型」再跑一次' : ''));
            toast('背景已去除');
            loadTracer().catch(() => { });   // 提前备好矢量模块，导出时不用等
        } catch (e) {
            console.error(e);
            const raw = String((e && e.message) || e);
            // 引擎层的报错（维度不符、session 损坏）对用户没意义，换成能操作的提示
            const engineErr = /invalid dimensions|OrtRun|session|deserialize|protobuf/i.test(raw);
            if (engineErr) { S.session = null; S.sessionKey = null; }
            const friendly = engineErr ? '模型运行出错，请刷新页面，或切到另一个模型再试一次' : raw;
            setStatus('处理失败：' + friendly);
            toast('处理失败：' + friendly);
        } finally {
            setProgress(null);
            S.busy = false;
            // 临时降级用完要还原档位：界面仍显示「精细模型」，后台继续把它准备好
            if (usedFast) S.model = 'pro';
            if (btn) { btn.disabled = false; btn.textContent = '✨ 一键去背景'; }
        }
    };

    // 恢复到刚上传的样子：不重新选文件，清掉所有图层的蒙版与历史
    const restoreOriginal = () => {
        // 多图层文档下活动图层可能是空的（如新建的空图层），只要文档里
        // 任何一层有内容就允许恢复；否则停在空图层上点「恢复原图」会没反应
        let anySrc = false;
        walkLayers((L) => { if (L.src) anySrc = true; });
        if (!anySrc) return toast('请先上传图片');
        walkLayers((L) => {
            L.hasMask = false;
            L.fg = null;
            L.inpaintHist = [];
            if (L.rctx) { L.rctx.globalCompositeOperation = 'source-over'; L.rctx.clearRect(0, 0, S.w, S.h); }
            if (L.mctx) L.mctx.clearRect(0, 0, S.w, S.h);
            bumpLayer(L);
        });
        S._actSprite = null;
        S.hasMask = false;
        S.fg = null;
        S.cmpOn = false;
        S.selDraft = null;
        S.undo = []; S.redo = [];
        if (S.sctx) S.sctx.clearRect(0, 0, S.w, S.h);
        S.selOn = false; S.selArea = 0;
        rebuildSelVisual();
        syncHistoryButtons();
        render();
        renderLayerPanel();
        setStatus('已恢复到刚上传的原图，可以重新点「一键去背景」，或直接用画笔涂');
        toast('已恢复原图');
    };

    const reset = () => {
        S.src = null; S.hasMask = false; S.fg = null; S.bgColor = undefined; S.pickKey = null; S.undo = []; S.redo = [];
        S.inpaintHist = []; S.cmpOn = false;
        if (S.rmctx) S.rmctx.clearRect(0, 0, S.w, S.h);
        S.rmHas = false;
        if (S.sctx) S.sctx.clearRect(0, 0, S.w, S.h);
        S.selOn = false; S.selArea = 0; S.selDraft = null;
        rebuildSelVisual();
        syncRmButtons();
        S.userZoomed = false; S.zoom = 1; S.tx = 0; S.ty = 0;
        const stage = $('#mattingStage');
        if (stage) { stage.classList.add('is-empty'); stage.style.height = ''; delete stage.dataset.wheelLock; }
        const cv = $('#mattingCanvas');
        if (cv) { cv.style.transform = ''; cv.style.width = ''; cv.style.height = ''; }
        const lab = $('#mattingZoomVal');
        if (lab) lab.textContent = '100%';
        const empty = $('#mattingEmpty');
        if (empty) empty.style.display = '';
        setNeedImg(false);
        if (S.vctx && S.w) S.vctx.clearRect(0, 0, S.w, S.h);
        const fi = $('#mattingFile');
        if (fi) fi.value = '';
        setStatus('');
        const pv = $('#mattingVecPreview');
        if (pv) { pv.innerHTML = ''; pv.style.display = 'none'; }
        // 图层树一起清掉，否则「重新上传」后旧图层还挂在面板里
        S.tree = [];
        S.activeId = '';
        S._actSprite = null;
        renderLayerPanel();
        syncHistoryButtons();
    };

    /* ---------------- 绑定 ---------------- */
    const bind = () => {
        const file = $('#mattingFile');
        const drop = $('#mattingDrop');

        const pick = () => file && file.click();
        if ($('#mattingUploadBtn')) $('#mattingUploadBtn').onclick = pick;
        if (drop) drop.onclick = pick;
        if (file) file.onchange = (e) => { loadFile(e.target.files && e.target.files[0]); file.value = ''; };

        if (drop) {
            ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
            ['dragleave', 'dragend'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('is-over')));
            drop.addEventListener('drop', (e) => {
                e.preventDefault();
                drop.classList.remove('is-over');
                const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                loadFile(f);
            });
        }

        // 粘贴上传（只在抠图页面可见时接管）
        document.addEventListener('paste', (e) => {
            const sec = $('section[data-view="matting"]');
            if (!sec || !sec.offsetParent) return;
            const items = (e.clipboardData || {}).items || [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].type && items[i].type.indexOf('image/') === 0) {
                    loadFile(items[i].getAsFile());
                    e.preventDefault();
                    return;
                }
            }
        });

        // 矢量参数只做数值回显
        ['#mattingVecColors', '#mattingVecDetail'].forEach((id) => {
            const el = $(id), out = $(id + 'Val');
            if (!el) return;
            const sync = () => { if (out) out.textContent = el.value; };
            el.addEventListener('input', sync);
            sync();
        });

        // 画笔 + 平移 + 缩放
        const cv = $('#mattingCanvas');
        const stage = $('#mattingStage');
        if (cv && stage) {
            const fingers = new Map();     // 多指 → 捏合缩放
            let panFrom = null;            // 平移起点（屏幕坐标）
            let pinchPrev = null;          // 上一帧双指距离与中心

            const stageXY = (e) => {
                const r = stage.getBoundingClientRect();
                return { x: e.clientX - r.left, y: e.clientY - r.top };
            };

            /* ---------- 圆形画笔光标（PS 笔尖圈）：直径永远等于画笔落笔的实际直径 ---------- */
            const ring = document.createElement('div');
            ring.className = 'brush-ring';
            ring.hidden = true;
            stage.appendChild(ring);
            const ringPos = { x: 0, y: 0, has: false };
            const hideRing = () => {
                ringPos.has = false;
                ring.hidden = true;
                stage.classList.remove('ring-on');
            };
            const syncRing = () => {
                // 抓手/平移/点选/套索时不留圈；触屏没有悬停概念，也不显示
                if (!ringPos.has || !S.src || wantPan() || S.mode === 'pan' || S.mode === 'move' || S.mode === 'wand' || S.mode === 'lasso') { hideRing(); return; }
                const d = Math.max(6, S.brush * (S.baseScale || 1) * S.zoom);
                ring.style.width = d + 'px';
                ring.style.height = d + 'px';
                ring.style.left = ringPos.x + 'px';
                ring.style.top = ringPos.y + 'px';
                ring.hidden = false;
                stage.classList.add('ring-on');
            };
            S.syncRing = syncRing;   // 缩放/改画笔大小时由外部再调一次
            const pinchInfo = () => {
                const pts = Array.from(fingers.values());
                if (pts.length < 2) return null;
                const c = stage.getBoundingClientRect();
                const a = pts[0], b = pts[1];
                return {
                    dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
                    cx: (a.x + b.x) / 2 - c.left,
                    cy: (a.y + b.y) / 2 - c.top
                };
            };
            const endPaint = () => {
                if (!S.painting) return;
                S.painting = false; S.last = null;
                if (S.mode === 'remove') { syncRmButtons(); render(); return; }
                scheduleFg();
            };

            // 事件挂在画布区（stage）而不是图片本身：手指/鼠标落到外面一圈也能拖动
            stage.addEventListener('pointerdown', (e) => {
                if (!S.src) return;
                fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                try { stage.setPointerCapture(e.pointerId); } catch (err) { }
                const pinchId = pinchInfo();
                // 两指 → 捏合缩放/平移，不再画笔
                if (pinchId) { endPaint(); pinchPrev = pinchId; return; }
                // 抓手模式 / 按住空格 / 中键 → 拖动画面
                if (wantPan() || e.button === 1) {
                    endPaint();
                    panFrom = { x: e.clientX, y: e.clientY };
                    cv.style.cursor = 'grabbing';
                    e.preventDefault();
                    return;
                }
                // 移动工具（PS 的 V）：拖动挪当前图层的像素，不动视口
                if (S.mode === 'move') {
                    e.preventDefault();
                    endPaint();
                    if (e.button !== 0) return;
                    if (beginLayerDrag(e)) { cv.style.cursor = 'grabbing'; render(); }
                    return;
                }
                if (e.target !== cv && !wantPan()) {          // 点在图片外面：直接当拖动
                    endPaint();
                    panFrom = { x: e.clientX, y: e.clientY };
                    cv.style.cursor = 'grabbing';
                    e.preventDefault();
                    return;
                }
                if (S.mode === 'wand') {
                    // 颜色点选：点一下就圈出同色区域（松开鼠标才不需要拖）
                    endPaint();
                    e.preventDefault();
                    if (e.button !== 0 && e.button !== 2) return;
                    wandToSelection(e);
                    return;
                }
                if (S.mode === 'lasso') {
                    // 套索二合一：按住拖一圈 = 自由套索；单击加点 = 多边形套索，
                    // 点回起点、双击或 Enter 闭合（Shift 加选 / Alt 减选）
                    endPaint();
                    e.preventDefault();
                    if (e.button !== 0 && e.button !== 2) return;
                    if (!S.hasMask) return toast('请先点「一键去背景」，再用套索圈范围');
                    S.lassoMode = selModeNow(e);
                    const p = toCanvasXY(e);
                    if (S.selDraft && !S.lassoing) {
                        // 多边形进行中：点起点附近就闭合，否则继续加点
                        const f = S.selDraft[0];
                        const th = 12 / (S.zoom || 1);
                        if (S.selDraft.length >= 3 && Math.abs(p.x - f.x) + Math.abs(p.y - f.y) <= th) {
                            S.selDraft.push(p);
                            lassoCommit(S.lassoMode);
                        } else {
                            S.selDraft.push(p);
                            render();
                        }
                        return;
                    }
                    S.lassoing = true;
                    S.selDraft = [p];
                    render();
                    return;
                }
                if (S.mode === 'remove') {
                    // 涂抹去物不依赖抠图蒙版，随时可以涂
                    S.painting = true;
                    const p = toCanvasXY(e);
                    S.last = p;
                    S.stampAcc = 0;
                    paintDot(p.x, p.y);
                    render();
                    return;
                }
                if (!S.hasMask) return toast('请先点「一键去背景」，再用画笔修补');
                if (e.button !== 0) { fingers.delete(e.pointerId); return; }
                S.painting = true;
                pushHistory();
                const p = toCanvasXY(e);
                S.last = p;
                S.stampAcc = 0;
                paintDot(p.x, p.y);
                refresh();
            });

            stage.addEventListener('pointermove', (e) => {
                if (e.pointerType === 'touch') {
                    hideRing();            // 手指没有悬停，别留一个停在原地不动的圈
                } else {
                    const p = stageXY(e);
                    ringPos.x = p.x; ringPos.y = p.y; ringPos.has = true;
                    syncRing();
                }
                if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                const pin = pinchInfo();
                if (pin && pinchPrev) {
                    // 增量式：按两指距离比缩放，按中点位移平移
                    const k = pin.dist / pinchPrev.dist;
                    if (Math.abs(k - 1) > 0.0005) zoomAt(pin.cx, pin.cy, k);
                    else { S.tx += pin.cx - pinchPrev.cx; S.ty += pin.cy - pinchPrev.cy; applyView(); }
                    pinchPrev = pin;
                    return;
                }
                if (panFrom) {
                    S.tx += e.clientX - panFrom.x;
                    S.ty += e.clientY - panFrom.y;
                    panFrom = { x: e.clientX, y: e.clientY };
                    S.userZoomed = true;
                    applyView();
                    return;
                }
                if (layerDrag.on) { moveLayerDrag(e); return; }
                if (S.lassoing && S.selDraft) {
                    const p = toCanvasXY(e);
                    const last = S.selDraft[S.selDraft.length - 1];
                    // 太密的点没必要留，既省内存也让虚线更顺
                    if (!last || Math.abs(p.x - last.x) + Math.abs(p.y - last.y) > 2) {
                        S.selDraft.push(p);
                        // 重画整幅图比较贵，压到一帧一次，拖起来才跟手
                        if (!S.lassoTick) {
                            S.lassoTick = true;
                            requestAnimationFrame(() => { S.lassoTick = false; if (S.selDraft) render(); });
                        }
                    }
                    return;
                }
                if (!S.painting) return;
                paintTo(toCanvasXY(e).x, toCanvasXY(e).y);
                if (S.mode === 'remove') render(); else refresh();
            });

            const release = (e) => {
                if (e) fingers.delete(e.pointerId);
                if (fingers.size < 2) pinchPrev = null;
                if (panFrom) { panFrom = null; updateCursor(); }
                if (layerDrag.on) { endLayerDrag(); updateCursor(); }
                // 指针离开画布区就把笔尖圈收起来，否则会一直挂在边缘
                if (e && e.type === 'pointerleave') hideRing();
                // 套索松手才真正生成选区；pointerleave 不算松手（指针捕获还在）
                if (S.lassoing && (!e || e.type !== 'pointerleave')) {
                    S.lassoing = false;
                    // 拖动了（不止一个点）→ 自由套索，松手闭合；
                    // 只点了一下 → 进入多边形套索模式，等下一个点
                    if (S.selDraft && S.selDraft.length > 1) lassoCommit(S.lassoMode || 'new');
                    else render();
                }
                endPaint();
            };
            stage.addEventListener('pointerup', release);
            stage.addEventListener('pointercancel', release);
            stage.addEventListener('pointerleave', release);

            // 多边形套索：双击闭合
            stage.addEventListener('dblclick', (e) => {
                if (S.mode !== 'lasso' || S.lassoing) return;
                if (S.selDraft && S.selDraft.length >= 3) lassoCommit(S.lassoMode || 'new');
            });

            // 滚轮缩放（触控板捏合表现为 ctrl+wheel，同一套处理）
            stage.addEventListener('wheel', (e) => {
                if (!S.src) return;
                e.preventDefault();
                e.stopPropagation();
                const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? 400 : 1);
                const dy = e.deltaY * unit;
                if (!dy) return;
                const p = stageXY(e);
                zoomAt(p.x, p.y, Math.exp(-dy * (e.ctrlKey ? 0.008 : 0.0016)));
            }, { passive: false });

            // 空格 = 临时抓手（在输入框里打字、或已经切到别的模块时不要抢）
            const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
            const viewVisible = () => {
                const sec = document.querySelector('section[data-view="matting"]');
                return !!sec && sec.offsetParent !== null;
            };
            window.addEventListener('keydown', (e) => {
                // 涂抹去物模式下 Ctrl/⌘+Z = 撤销擦除；Esc 退出对比；PS 式单键工具切换
                if (S.src && viewVisible() && !isTyping(e.target)) {
                    // PS 式全局撤销：普通抠图走 undo/redo，去物模式只支持逐步撤销
                    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
                        e.preventDefault();
                        if (S.mode === 'remove') { if (!e.shiftKey) undoInpaint(); }
                        else if (e.shiftKey) redo();
                        else undo();
                        return;
                    }
                    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
                        e.preventDefault();
                        if (S.mode !== 'remove') redo();
                        return;
                    }
                    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                        // V 移动 / E 擦除 / R 恢复 / W 点选 / L 套索 / J 涂抹去物 / H 抓手；[ ] 画笔大小；K 黑白蒙版
                        const toolKeys = { v: 'move', e: 'erase', r: 'restore', w: 'wand', l: 'lasso', j: 'remove', h: 'pan' };
                        const k = e.key.toLowerCase();
                        if (toolKeys[k]) {
                            const btn = document.querySelector('#mattingMode button[data-val="' + toolKeys[k] + '"]');
                            if (btn) { e.preventDefault(); btn.click(); return; }
                        }
                        // 移动工具下方向键 = 1px 微调（Shift 10px），PS 里的手感
                        if (S.mode === 'move' && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
                            e.preventDefault();
                            const step = e.shiftKey ? 10 : 1;
                            const dir = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[e.key];
                            pushDocHistory();
                            moveLayerBy(dir[0], dir[1]);
                            return;
                        }
                        if (k === 'k') {
                            e.preventDefault();
                            const bwBtn = document.querySelector('#mattingBg button[data-val="bw"]');
                            if (bwBtn) bwBtn.click();
                            return;
                        }
                        if (k === '[' || k === ']') {
                            e.preventDefault();
                            const b = $('#mattingBrush');
                            if (b) {
                                const step = S.brush >= 100 ? 20 : (S.brush >= 40 ? 10 : 4);
                                b.value = Math.max(1, Math.min(300, S.brush + (k === ']' ? step : -step)));
                                b.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            return;
                        }
                    }
                    // Ctrl/⌘+D 取消选区、Ctrl/⌘+Shift+I 反选、Enter 删除选区（和 PS 一致）
                    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
                        e.preventDefault();
                        if (S.selOn) selClear(); else toast('当前没有选区');
                        return;
                    }
                    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
                        e.preventDefault();
                        selInvert();
                        return;
                    }
                    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'a' || e.key === 'A')) {
                        e.preventDefault();
                        selAll();
                        return;
                    }
                    if (e.key === 'Enter' && S.selDraft && !S.lassoing) {
                        // 多边形套索：Enter 闭合（不足 3 个点视为放弃）
                        e.preventDefault();
                        if (S.selDraft.length >= 3) lassoCommit(S.lassoMode || 'new');
                        else { S.selDraft = null; render(); }
                        return;
                    }
                    if (e.key === 'Enter' && S.selOn && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        applySelection(false);
                        return;
                    }
                    if (e.key === 'Escape' && S.selDraft && !S.lassoing) {
                        // 多边形套索进行中：Esc 放弃本次圈选
                        e.preventDefault();
                        S.selDraft = null;
                        render();
                        return;
                    }
                    if (e.key === 'Escape' && S.cmpOn) {
                        S.cmpOn = false;
                        render();
                        syncRmButtons();
                        return;
                    }
                    if (e.key === 'Escape' && S.selOn) {
                        e.preventDefault();
                        selClear();
                        return;
                    }
                }
                if (e.code !== 'Space' || isTyping(e.target) || !S.src || !viewVisible()) return;
                if (!S.spaceDown) { S.spaceDown = true; updateCursor(); }
                e.preventDefault();
            });
            window.addEventListener('keyup', (e) => {
                if (e.code !== 'Space') return;
                if (S.spaceDown) { S.spaceDown = false; updateCursor(); }
            });
            window.addEventListener('blur', () => { S.spaceDown = false; updateCursor(); });

            // 画布尺寸变了（窗口缩放、面板刚显示出来）就重新布局：
            // 没手动缩放过就保持「适应窗口」，缩放过则保持倍率、只把画面收回可视范围
            if (window.ResizeObserver) {
                let prevW = 0;
                new ResizeObserver(() => {
                    if (!S.src) return;
                    const w = stage.clientWidth;
                    if (!w || Math.abs(w - prevW) < 0.5) return;
                    const first = !prevW;
                    prevW = w;
                    if (S.userZoomed && !first) relayout();
                    else fitView(false);
                }).observe(stage);
            }
        }

        // 工具条
        const seg = (wrap, onPick) => {
            $$(wrap + ' button').forEach(b => b.onclick = () => {
                $$(wrap + ' button').forEach(x => x.classList.remove('on'));
                b.classList.add('on');
                onPick(b.dataset.val);
            });
        };
        seg('#mattingMode', (v) => {
            S.mode = v;
            updateCursor();
            // 切工具时丢弃未完成的多边形草稿，避免下次进套索把旧点接上
            if (v !== 'lasso' && S.selDraft && !S.lassoing) { S.selDraft = null; render(); }
            if (v === 'wand') setStatus('点选：点一下圈出同色区域（Shift 加选 / Alt 减选），再点「删除选区」或「恢复选区」');
            if (v === 'lasso') setStatus('套索：按住拖一圈松手闭合；或单击加点、回起点 / 双击 / Enter 闭合 = 多边形套索（Shift 加选 / Alt 减选；Esc 取消）');
            if (v === 'pan') setStatus('可拖动画面：把要修的地方移到眼前；滚轮或 ➕➖ 可缩放');
            if (v === 'remove') setStatus('涂抹去物：把要移除的人/物/文字涂红（略超出边缘 4–6px），再点下方「移除涂抹区」');
        });
        seg('#mattingSelMode', (v) => {
            S.selMode = v;
            setStatus('选区模式：' + (v === 'new' ? '新建（每次替换掉旧的）' : v === 'add' ? '加选（并进现有选区）' : '减选（从现有选区里扣掉）'));
        });
        seg('#mattingWandScope', (v) => {
            S.wandScope = v;
            setStatus(v === 'global'
                ? '点选范围：全局 —— 全图和这一点颜色接近的像素都算，不管连不连在一起'
                : '点选范围：连续 —— 只取和点击点连在一起的那片');
        });
        seg('#mattingModel', (v) => {
            S.model = v;
            try { localStorage.setItem('mattingModel', v); } catch (e) { }
        });

        // 记住上次选的模型档位：选用过精细模型的人，下次进来默认就是精细
        try {
            const saved = localStorage.getItem('mattingModel');
            if (saved && MODELS[saved]) {
                S.model = saved;
                $$('#mattingModel button').forEach(b => b.classList.toggle('on', b.dataset.val === saved));
            }
        } catch (e) { }

        // 深度清理开关
        const deep = $('#mattingDeepClean');
        if (deep) {
            deep.checked = S.deepClean;
            deep.onchange = () => {
                S.deepClean = deep.checked;
                if (S.hasMask) setStatus('深度清理已' + (deep.checked ? '开启' : '关闭') + '，重新点「一键去背景」后生效');
            };
        }
        seg('#mattingBg', (v) => {
            const st = $('#mattingStage');
            const applyBg = (bg) => {
                if (!st) return;
                st.classList.remove('tp-white', 'tp-black', 'tp-gray');
                if (bg !== 'checker') st.classList.add('tp-' + bg);
            };
            if (v === 'bw') {
                // 黑白蒙版是「视图开关」不是底色：再点一次退出，恢复上次的底色
                S.bwView = !S.bwView;
                if (!S.bwView) {
                    applyBg(S.lastBg || 'checker');
                    $$('#mattingBg button').forEach(b => b.classList.toggle('on', b.dataset.val === (S.lastBg || 'checker')));
                }
            } else {
                S.bwView = false;
                S.lastBg = v;
                applyBg(v);
            }
            render();
        });

        /* 滑块旁边的数值：既能滚轮调（Shift 大步），也能点进去直接键入。
           原来只是个只读 <span>，调 1px 只能靠拖，想精确到某个值很难 */
        const numify = (rangeEl, outEl, fmt) => {
            if (!rangeEl || !outEl) return null;
            const min = Number(rangeEl.min), max = Number(rangeEl.max);
            let wrap = outEl;
            let inp = null, suf = null;
            if (outEl.tagName !== 'INPUT') {
                wrap = document.createElement('span');
                wrap.className = (outEl.className || 'val') + ' numwrap';
                inp = document.createElement('input');
                inp.type = 'text';
                inp.inputMode = 'decimal';
                inp.autocomplete = 'off';
                inp.className = 'num';
                inp.id = outEl.id;          // 原来的 id 留给输入框，外部仍能按老名字拿到它
                inp.setAttribute('aria-label', outEl.textContent || '数值');
                suf = document.createElement('i');
                suf.className = 'suf';
                wrap.appendChild(inp);
                wrap.appendChild(suf);
                outEl.replaceWith(wrap);
            } else {
                inp = outEl;
            }
            const show = () => {
                const text = fmt(Number(rangeEl.value));
                const m = /^([+-]?\d+(?:\.\d+)?)(.*)$/.exec(text);
                inp.value = m ? m[1] : text;
                if (suf) suf.textContent = m ? m[2] : '';
            };
            const clamp = (v) => Math.min(max, Math.max(min, v));
            const bigStep = () => Math.max(2, Math.round(Math.abs(max - min) / 20));
            const commit = (v) => {
                const num = parseInt(v, 10);
                if (!isFinite(num)) { show(); return; }
                const val = clamp(num);
                if (String(rangeEl.value) !== String(val)) {
                    rangeEl.value = String(val);
                    rangeEl.dispatchEvent(new Event('input', { bubbles: true }));
                    rangeEl.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    show();
                }
            };
            const wheel = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const step = e.shiftKey ? bigStep() : 1;
                commit((Number(rangeEl.value) || 0) + (e.deltaY < 0 ? step : -step));
            };
            wrap.addEventListener('wheel', wheel, { passive: false });
            rangeEl.addEventListener('wheel', wheel, { passive: false });
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(inp.value); inp.blur(); }
                else if (e.key === 'Escape') { e.preventDefault(); show(); inp.blur(); }
                else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const step = e.shiftKey ? bigStep() : 1;
                    commit((Number(inp.value) || 0) + (e.key === 'ArrowUp' ? step : -step));
                }
            });
            inp.addEventListener('focus', () => inp.select());
            inp.addEventListener('blur', () => commit(inp.value));
            show();
            return { show };
        };

        const rng = (id, key, fmt, map, opts) => {
            const el = $(id);
            const out = $(id + 'Val');
            if (!el) return;
            const num = numify(el, out, fmt);
            const sync = () => {
                const raw = Number(el.value);
                S[key] = map ? map(raw) : raw;
                if (num) num.show();
            };
            el.oninput = () => { sync(); if (S.syncRing) S.syncRing(); };
            el.onchange = () => {
                sync();
                if (!(opts && opts.noRefresh) && S.hasMask) refresh();
                if (S.syncRing) S.syncRing();
            };
            sync();
        };
        // 画笔大小/硬度/容差都不影响蒙版，标 noRefresh：滚轮连调时不用每次重算一遍
        rng('#mattingBrush', 'brush', v => v + ' px', null, { noRefresh: true });
        rng('#mattingHard', 'hardness', v => v + '%', v => v / 100, { noRefresh: true });
        rng('#mattingFeather', 'feather', v => v + ' px');
        rng('#mattingContrast', 'contrast', v => v + '%', v => v / 100); // 0-100 → 0-1
        rng('#mattingSmooth', 'smooth', v => String(v));
        rng('#mattingShift', 'shift', v => (v > 0 ? '+' : '') + v + '%', v => v / 100); // >0 外扩 <0 收缩
        rng('#mattingWandTol', 'wandTol', v => String(v), null, { noRefresh: true });   // 点选的容差
        rng('#mattingSelFeather', 'selFeather', v => v + ' px', null, { noRefresh: true });   // 选区羽化：别动蒙版
        rng('#mattingSpacing', 'spacing', v => v + '%', v => v / 100, { noRefresh: true });   // 笔尖间距

        /* ---------------- 笔刷库：导入 / 勾选 / 分组 / 拖进来 ---------------- */
        const brushFile = $('#mattingBrushFile');
        const brushAdd = $('#mattingBrushAdd');
        if (brushAdd) brushAdd.onclick = () => { if (brushFile) brushFile.click(); };
        if (brushFile) {
            brushFile.onchange = (e) => {
                importBrushes(e.target.files);
                e.target.value = '';       // 允许再选同一个文件
            };
        }
        const brushDel = $('#mattingBrushDel');
        if (brushDel) brushDel.onclick = () => brushDelete();
        const brushPickAll = $('#mattingBrushPickAll');
        if (brushPickAll) {
            brushPickAll.onclick = () => {
                if (brushPickCount()) return brushClearPick();
                S.brushSel = S.brushes.map((b) => b.id);
                renderBrushList();
                syncBrushTools();
            };
        }
        // 分组条：点「🗂 分组」展开，输入名字回车即建组并移入勾选项
        const grpBar = $('#mattingBrushGroupBar');
        const grpName = $('#mattingBrushGroupName');
        const grpOpen = (on) => {
            if (!grpBar) return;
            grpBar.hidden = on === false;
            if (on !== false && grpName) {
                grpName.value = '分组 ' + (S.brushGroups.length + 1);
                grpName.focus();
                grpName.select();
            }
        };
        const brushGrp = $('#mattingBrushGrp');
        if (brushGrp) brushGrp.onclick = () => { if (!brushPickCount()) return toast('先在笔刷左上角勾选几支，再分组'); grpOpen(true); };
        const grpOk = $('#mattingBrushGroupOk');
        if (grpOk) grpOk.onclick = () => { brushGroupSelected(grpName ? grpName.value : ''); grpOpen(false); };
        const grpCancel = $('#mattingBrushGroupCancel');
        if (grpCancel) grpCancel.onclick = () => grpOpen(false);
        const grpMoveOut = $('#mattingBrushMoveOut');
        if (grpMoveOut) grpMoveOut.onclick = () => { brushMoveOut(''); grpOpen(false); };
        if (grpName) {
            grpName.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); brushGroupSelected(grpName.value); grpOpen(false); }
                else if (e.key === 'Escape') { e.preventDefault(); grpOpen(false); }
            };
        }
        const bl = $('#mattingBrushList');
        if (bl) {
            bl.addEventListener('dragover', (e) => {
                e.preventDefault();
                bl.classList.add('drop-hover');
            });
            bl.addEventListener('dragleave', () => bl.classList.remove('drop-hover'));
            bl.addEventListener('drop', (e) => {
                e.preventDefault();
                bl.classList.remove('drop-hover');
                if (e.dataTransfer && e.dataTransfer.files.length) importBrushes(e.dataTransfer.files);
            });
        }
        renderBrushList();
        selectBrush(-1);

        /* ---------------- 图层面板 ---------------- */
        const bind2 = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
        bind2('#lyrAdd', () => lyrNew());
        bind2('#lyrImg', () => { const f = $('#lyrFile'); if (f) f.click(); });
        const lyrFile = $('#lyrFile');
        if (lyrFile) {
            lyrFile.onchange = (e) => {
                const f = e.target.files && e.target.files[0];
                if (f) addImageLayer(f);
                e.target.value = '';
            };
        }
        bind2('#lyrDup', () => lyrDup());
        bind2('#lyrGroup', () => lyrGroup());
        bind2('#lyrMerge', () => lyrMerge());
        bind2('#lyrUp', () => lyrMove(1));
        bind2('#lyrDown', () => lyrMove(-1));
        bind2('#lyrDel', () => lyrDel());
        const lyrOp = $('#lyrOpacity');
        if (lyrOp) {
            lyrOp.oninput = () => {
                lyrOpacity(Number(lyrOp.value) || 0);
                const v = $('#lyrOpacityVal');
                if (v) v.textContent = Math.round(Number(lyrOp.value) || 0) + '%';
            };
        }
        const lyrBl = $('#lyrBlend');
        if (lyrBl) lyrBl.onchange = () => { lyrBlend(lyrBl.value); renderLayerPanel(); };
        // 菜单挂到 body：属性面板有 overflow，fixed 元素留在里面会被裁掉
        const menuEl = $('#lyrMenu');
        if (menuEl && menuEl.parentElement !== document.body) document.body.appendChild(menuEl);

        /* ---------------- 图层拖动排序 / 右键菜单的收尾 ---------------- */
        document.addEventListener('pointermove', (e) => {
            if (!rowDrag) return;
            if (!rowDrag.on) {
                if (Math.abs(e.clientX - rowDrag.x) + Math.abs(e.clientY - rowDrag.y) < 5) return;
                rowDrag.on = true;
                rowDrag.pre = captureDoc();      // 拖之前的状态，松手时才记账
                const box0 = $('#lyrList');
                if (box0) box0.classList.add('dragging');
            }
            const box = $('#lyrList');
            if (!box) return;
            const tgt = dropTarget(e.clientX, e.clientY);
            if (tgt) dropLine(box, tgt.where === 'above' ? tgt.top : tgt.bottom);
            else {
                const br = box.getBoundingClientRect();
                dropLine(box, e.clientY < br.top + br.height / 2 ? br.top + 2 : br.bottom - 2);
            }
        }, true);
        document.addEventListener('pointerup', (e) => endRowDrag(e.clientX, e.clientY), true);
        document.addEventListener('pointercancel', () => endRowDrag(null, null), true);

        // 点别处 / Esc / 滚动都收起图层菜单
        document.addEventListener('pointerdown', (e) => {
            const menu = $('#lyrMenu');
            if (menu && !menu.hidden && !(e.target.closest && e.target.closest('#lyrMenu'))) hideLayerMenu();
        }, true);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideLayerMenu(); });
        document.addEventListener('scroll', () => hideLayerMenu(), true);

        /* ---------------- 新建画布 ---------------- */
        const ncCreate = $('#ncCreate');
        if (ncCreate) {
            ncCreate.onclick = () => {
                const w = Number(($('#ncW') || {}).value || 1080);
                const h = Number(($('#ncH') || {}).value || 1080);
                const sel = $('#ncBg'), col = $('#ncColor');
                let bg = sel ? sel.value : 'transparent';
                if (bg === 'custom') bg = col ? col.value : '#ffffff';
                newCanvasDoc(w, h, bg);
            };
        }
        $$('.nc-chip').forEach((b) => {
            b.onclick = () => {
                const w = $('#ncW'), h = $('#ncH');
                if (w) w.value = b.dataset.w;
                if (h) h.value = b.dataset.h;
                $$('.nc-chip').forEach((x) => x.classList.toggle('on', x === b));
            };
        });
        const ncColor = $('#ncColor');
        if (ncColor) ncColor.oninput = () => { const sel = $('#ncBg'); if (sel) sel.value = 'custom'; };

        // 选区的叠加色 / 浓度（PS 快速蒙版那一套）
        const cutColor = $('#mattingCutColor'), cutOp = $('#mattingCutOp');
        const repaintSel = () => { if (S.selOn) { rebuildSelVisual(); render(); } };
        if (cutColor) cutColor.oninput = () => { S.cutColor = cutColor.value; repaintSel(); };
        if (cutOp) {
            const num = numify(cutOp, $('#mattingCutOpVal'), v => v + '%');
            cutOp.oninput = () => {
                S.cutOp = (Number(cutOp.value) || 0) / 100;
                if (num) num.show();
                repaintSel();
            };
        }

        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
        on('#mattingAutoBtn', autoRemove);
        on('#mattingInpaint', doInpaint);
        on('#mattingInpaintUndo', undoInpaint);
        on('#mattingInpaintClear', () => { if (!S.rmHas) return; clearRm(); toast('已清除涂抹'); });
        // 前后对比：点一下开/关（配合下方滑块调分割线位置），不再依赖「按住」——手机上按不住、也没有反馈
        const cmpRow = $('#mattingCmpRow');
        const cmpPos = $('#mattingCmpPos');
        const syncCmp = () => {
            if (cmpRow) cmpRow.classList.toggle('show', !!S.cmpOn);
            if (cmpPos) cmpPos.value = String(S.cmpPos);
            syncRmButtons();
        };
        const cmpBtn = $('#mattingInpaintCmp');
        if (cmpBtn) {
            cmpBtn.onclick = () => {
                if (!S.inpaintHist.length) return toast('先擦除一次，再来对比前后');
                S.cmpOn = !S.cmpOn;
                syncCmp();
                render();
                toast(S.cmpOn ? '对比中：左=擦除前，右=擦除后' : '已退出对比');
            };
        }
        if (cmpPos) {
            cmpPos.oninput = () => { S.cmpPos = Number(cmpPos.value) || 0; if (S.cmpOn) render(); };
        }

        // 补全引擎：AI（MI-GAN）/ 本地快速
        seg('#mattingEngine', (v) => {
            S.removeEngine = v;
            try { localStorage.setItem('mattingRemoveEngine', v); } catch (e) { }
            setStatus(v === 'ai'
                ? '补全引擎：AI（MI-GAN 512，首次需下载 27MB，之后本地缓存秒开）'
                : '补全引擎：本地快速（纯 JS 插值+平滑，适合纯色/渐变背景）');
        });
        try {
            const savedEngine = localStorage.getItem('mattingRemoveEngine');
            if (savedEngine === 'ai' || savedEngine === 'local') {
                S.removeEngine = savedEngine;
                $$('#mattingEngine button').forEach(b => b.classList.toggle('on', b.dataset.val === savedEngine));
            }
        } catch (e) { }
        syncCmp();
        syncRmButtons();
        on('#mattingUndo', undo);
        on('#mattingRedo', redo);
        on('#mattingRestore', restoreOriginal);
        on('#mattingReset', reset);
        on('#mattingZoomIn', () => zoomCenter(1.25));
        on('#mattingZoomOut', () => zoomCenter(0.8));
        on('#mattingZoomFit', () => { S.userZoomed = false; fitView(false); });
        on('#mattingZoom100', () => {
            if (!S.src || !S.baseScale) return;
            S.userZoomed = true;
            zoomCenter((1 / S.baseScale) / S.zoom);
        });
        on('#mattingExportPng', exportPNG);
        on('#mattingExportSvg', exportSVG);
        on('#mattingKeepAll', () => {
            if (!S.hasMask) return toast('请先完成去背景');
            pushHistory();
            S.rctx.globalCompositeOperation = 'source-over';
            S.rctx.fillStyle = '#fff';
            S.rctx.fillRect(0, 0, S.w, S.h);
            refresh();
            toast('已恢复全部画面');
        });
        on('#mattingCutAll', () => {
            if (!S.hasMask) return toast('请先完成去背景');
            pushHistory();
            S.rctx.clearRect(0, 0, S.w, S.h);
            refresh();
            toast('已清空画面');
        });
        on('#mattingRefineApply', () => {
            if (!S.hasMask) return toast('请先完成去背景');
            pushHistory();
            bakeRefine();
            postProcess({ refine: false, feather: S.feather, contrast: S.contrast });
            render();
            toast('边缘已精修');
        });
        // 选区操作：反选 / 扩展 / 收缩 / 删除 / 恢复
        on('#mattingSelInvert', selInvert);
        on('#mattingSelAll', selAll);
        on('#mattingSelGrow', () => selMorph(1));
        on('#mattingSelShrink', () => selMorph(-1));
        on('#mattingSelCut', () => applySelection(false));
        on('#mattingSelKeep', () => applySelection(true));

        // 原图残影（借 cut-it-out 的 ghost 叠加思路）：恢复主体时对齐被删掉的部分
        const ghostBtn = $('#mattingGhost');
        if (ghostBtn) {
            ghostBtn.onclick = () => {
                S.ghost = !S.ghost;
                ghostBtn.classList.toggle('on', S.ghost);
                if (!S.ghost) S._tmp = null;   // 关掉就把全尺寸临时画布放掉
                render();
                setStatus(S.ghost ? '原图残影已开：淡影是被删掉的内容，对着它把主体补回来' : '原图残影已关');
            };
        }

        // 清理杂点 / 补小洞（rembg post_process_mask 的浏览器版：开运算 + 闭运算）
        on('#mattingDespeckle', () => {
            if (!S.hasMask) return toast('请先点「一键去背景」，再清理杂点');
            setStatus('正在清理杂点…');
            setTimeout(() => {
                pushHistory();
                const specks = despeckle();   // 复用自动流程里的碎块清理（连外围半透明雾一起擦）
                const holes = fillHoles();    // 再补主体内部的小孔
                if (!specks && !holes) { setStatus('清理杂点：没发现需要处理的碎片或小孔'); return; }
                refresh();
                setStatus('清理杂点：删掉 ' + specks.toLocaleString() + ' px 碎片、补上 ' + holes + ' 处小孔（可撤销）');
            }, 30);   // 先让状态栏画出来，再跑连通域扫描
        });

        // 点选/套索模式下右键不能弹菜单（右键 = 减选）
        [cv, stage].forEach((el) => {
            if (!el) return;
            el.addEventListener('contextmenu', (e) => { if (S.mode === 'wand' || S.mode === 'lasso') e.preventDefault(); });
        });

        setNeedImg(false);

        // 精细模型如果已经缓存过，就默认用它（不用再等下载，效果明显更好）
        let hasPref = false;
        try { hasPref = !!localStorage.getItem('mattingModel'); } catch (e) { }
        const boot = async () => {
            // 先把快速模型备好（4.7MB，基本秒下）：首次点「一键去背景」立刻能出图，
            // 而不是干等 42MB 的精细模型；随后后台继续把精细模型准备好，第二次起就是精细结果
            if (!hasPref) {
                const want = S.model;
                S.model = 'fast';
                await ensureSession().catch(() => { });
                S.model = want;
                $$('#mattingModel button').forEach(b => b.classList.toggle('on', b.dataset.val === want));
            }
            prefetch();
            setInterval(prefetch, 1500);
        };
        if (hasPref) { boot(); return; }
        idbGet('model:isnet').then((buf) => {
            if (buf && buf.byteLength === MODELS.pro.bytes) {
                S.model = 'pro';
                $$('#mattingModel button').forEach(b => b.classList.toggle('on', b.dataset.val === 'pro'));
            }
        }).catch(() => { }).finally(boot);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();

    window.__matting = {
        state: S, autoRemove, exportPNG, exportSVG, restoreOriginal,
        fitView, zoomCenter, zoomAt, centerOn, applyView,
        purgeBgBlobs, shrinkBgEdge, despeckle, cleanBgFlood, postProcess, render,
        selClear, applySelection, selInvert, selMorph, selAll, rebuildSelVisual,
        abrTips, addTip, selectBrush, importBrushes, renderBrushList,
        brushes: () => S.brushes.map(t => ({ id: t.id, name: t.name, w: t.w, h: t.h, group: t.group || '' })),
        brush: () => ({ idx: S.brushIdx, spacing: S.spacing, tip: S.tip ? S.tip.name : null }),
        brushSel: () => S.brushSel.slice(),
        brushGroups: () => S.brushGroups.slice(),
        brushTogglePick, brushDelete, brushGroupSelected, brushMoveOut, brushDropGroup,
        newCanvasDoc, addImageLayer, layerThumbURL,
        composite: () => { const c = mkCv(S.w, S.h); composeDoc(c.getContext('2d'), true); return c.toDataURL('image/png'); },
        moveLayerBy, centerLayer, fitLayer, moveNodeTo, moveToEdge, flattenVisible, deleteNode,
        showLayerMenu, hideLayerMenu, layerBBox,
        mode: () => S.mode,
        drag: () => ({ on: layerDrag.on, id: layerDrag.id, dx: layerDrag.dx, dy: layerDrag.dy }),
        beginLayerDrag, moveLayerDrag, endLayerDrag,
        lyrNew, lyrDup, lyrDel, lyrMove, lyrGroup, lyrUngroup, lyrMerge,
        lyrToggle, lyrCollapse, lyrRename, lyrOpacity, lyrBlend, selectLayer,
        renderLayerPanel,
        doc: () => ({
            w: S.w, h: S.h, active: S.activeId,
            layers: (() => { const out = []; walkLayers((L) => out.push({ id: L.id, name: L.name, visible: L.visible !== false, opacity: L.opacity == null ? 1 : L.opacity, blend: L.blend || 'source-over', hasMask: !!L.hasMask, hasSrc: !!L.src, group: (() => { let g = ''; const walk = (arr, name) => arr.some((n) => { if (n.kind === 'group') { if (n.children.indexOf(L) >= 0) { g = n.name; return true; } return walk(n.children, n.name); } return n === L; }); walk(S.tree, ''); return g; })() })); return out; })(),
            groups: (() => { const out = []; const walk = (arr) => arr.forEach((n) => { if (n.kind === 'group') { out.push({ id: n.id, name: n.name, visible: n.visible !== false, collapsed: !!n.collapsed, count: n.children.length }); walk(n.children); } }); walk(S.tree); return out; })()
        }),
        sel: () => ({ on: S.selOn, area: S.selArea, mode: S.selMode, scope: S.wandScope, feather: S.selFeather }),
        view: () => ({ zoom: S.zoom, tx: S.tx, ty: S.ty, baseScale: S.baseScale, mode: S.mode })
    };
})();
