/* =========================================================
 * 抠图：自动识别主体 → 一键删除背景 → 画笔修补 → 导出透明 PNG / SVG 矢量
 * 全部在浏览器本地完成，图片不会上传到任何服务器。
 * 引擎：ISNet（MIT，imgly/isnet-general-onnx）+ onnxruntime-web（MIT）
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
        model: 'fast',
        ort: null,
        undo: [], redo: [],
        last: null,
        painting: false,
        mode: 'erase',    // erase | restore | pan
        spaceDown: false, // 按住空格 = 临时抓手
        // 画布视图：布局尺寸 = 图片像素 * baseScale，再乘 zoom 得到实际显示大小
        zoom: 1, tx: 0, ty: 0, baseScale: 1, userZoomed: false,
        brush: 40,
        hardness: 0.6,
        feather: 1,
        contrast: 0.4,
        deepClean: true,  // 清理与背景同色的残留（反光、投影）
        showCut: false,
        tracer: null
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
    const setStatus = (msg) => {
        const el = $('#mattingStatus');
        if (el) el.textContent = msg || '';
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
    const setupCanvases = (w, h) => {
        S.w = w; S.h = h;
        S.view = $('#mattingCanvas');
        S.view.width = w; S.view.height = h;
        S.vctx = S.view.getContext('2d');
        S.raw = document.createElement('canvas');
        S.raw.width = w; S.raw.height = h;
        S.rctx = S.raw.getContext('2d', { willReadFrequently: true });
        S.mask = document.createElement('canvas');
        S.mask.width = w; S.mask.height = h;
        S.mctx = S.mask.getContext('2d', { willReadFrequently: true });
        // 缓存原图 RGB，边缘精修时做引导图
        const g = document.createElement('canvas');
        g.width = w; g.height = h;
        const gc = g.getContext('2d', { willReadFrequently: true });
        gc.drawImage(S.src, 0, 0, w, h);
        S.rgb = gc.getImageData(0, 0, w, h);
    };

    const render = () => {
        if (!S.src) return;
        const ctx = S.vctx;
        ctx.clearRect(0, 0, S.w, S.h);
        ctx.globalCompositeOperation = 'source-over';
        // 正常预览用「去过底色」的前景图，避免边缘挂一圈背景色；显示删除区时用原图，方便对着改
        ctx.drawImage((S.hasMask && S.fg) ? S.fg : S.src, 0, 0, S.w, S.h);
        if (!S.hasMask) return;
        if (S.showCut) {
            // 显示删除区：不抠掉原图，只在「会被删掉」的区域蒙一层洋红，
            // 这样既能看清哪里会被删，又能看到底下的原图细节，方便对着画笔修
            const cut = document.createElement('canvas');
            cut.width = S.w; cut.height = S.h;
            const c = cut.getContext('2d');
            c.fillStyle = 'rgba(255,0,170,0.42)';
            c.fillRect(0, 0, S.w, S.h);
            c.globalCompositeOperation = 'destination-out';
            c.drawImage(S.mask, 0, 0, S.w, S.h);
            ctx.drawImage(cut, 0, 0, S.w, S.h);
            return;
        }
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(S.mask, 0, 0, S.w, S.h);
        ctx.globalCompositeOperation = 'source-over';
    };

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
        st.style.height = Math.max(220, Math.min(640, h)) + 'px';
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
    };

    // 按容器大小重新算出「刚好铺满」的布局，居中显示
    const fitView = (keepZoom) => {
        const st = $('#mattingStage'), cv = $('#mattingCanvas');
        if (!st || !cv || !S.w || !S.h) return;
        sizeStage();
        const vw = st.clientWidth, vh = st.clientHeight;
        if (!vw || !vh) return;
        S.baseScale = Math.min(vw / S.w, vh / S.h, 1);
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
        const nb = Math.min(vw / S.w, vh / S.h, 1);
        S.baseScale = nb;
        cv.style.width = Math.round(S.w * nb) + 'px';
        cv.style.height = Math.round(S.h * nb) + 'px';
        if (oldBase) S.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, S.zoom * oldBase / nb));
        applyView();
    };

    const updateCursor = () => {
        const cv = $('#mattingCanvas');
        if (!cv) return;
        cv.style.cursor = wantPan() ? 'grab' : 'crosshair';
    };
    const wantPan = () => S.mode === 'pan' || S.spaceDown;

    /* ---------------- 蒙版历史（只存单通道灰度，省内存） ---------------- */
    const snapshot = () => {
        const d = S.rctx.getImageData(0, 0, S.w, S.h).data;
        const g = new Uint8Array(S.w * S.h);
        for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = d[i + 3];
        return g;
    };
    const applySnapshot = (g) => {
        const im = S.rctx.createImageData(S.w, S.h);
        const d = im.data;
        for (let i = 0, j = 0; j < g.length; i += 4, j++) {
            d[i] = d[i + 1] = d[i + 2] = 255;
            d[i + 3] = g[j];
        }
        S.rctx.putImageData(im, 0, 0);
        postProcess({ refine: false, feather: S.feather, contrast: S.contrast });
    };
    const pushHistory = () => {
        if (!S.hasMask) return;
        S.undo.push(snapshot());
        if (S.undo.length > 10) S.undo.shift();
        S.redo.length = 0;
        syncHistoryButtons();
    };
    const syncHistoryButtons = () => {
        const u = $('#mattingUndo'), r = $('#mattingRedo');
        if (u) u.disabled = !S.undo.length;
        if (r) r.disabled = !S.redo.length;
    };
    const undo = () => {
        if (!S.undo.length) return;
        S.redo.push(snapshot());
        applySnapshot(S.undo.pop());
        syncHistoryButtons();
        render();
    };
    const redo = () => {
        if (!S.redo.length) return;
        S.undo.push(snapshot());
        applySnapshot(S.redo.pop());
        syncHistoryButtons();
        render();
    };

    /* ---------------- 画笔 ---------------- */
    const paintDot = (x, y) => {
        const ctx = S.rctx;
        const r = S.brush;
        const keep = S.mode === 'restore';
        const inner = Math.max(0.02, Math.min(0.98, S.hardness));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        if (keep) {
            g.addColorStop(0, 'rgba(255,255,255,1)');
            g.addColorStop(inner, 'rgba(255,255,255,1)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
        } else {
            g.addColorStop(0, 'rgba(0,0,0,1)');
            g.addColorStop(inner, 'rgba(0,0,0,1)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
        }
        // 恢复=叠加白色提高 alpha；擦除=destination-out 减少 alpha
        const gco = keep ? 'source-over' : 'destination-out';
        ctx.globalCompositeOperation = gco;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';   // 一定要还原，否则下次写入蒙版会被当成擦除
    };
    const paintTo = (x, y) => {
        const from = S.last || { x, y };
        const dx = x - from.x, dy = y - from.y;
        const dist = Math.hypot(dx, dy);
        const step = Math.max(1, S.brush / 6);
        const n = Math.max(1, Math.ceil(dist / step));
        for (let i = 1; i <= n; i++) paintDot(from.x + dx * (i / n), from.y + dy * (i / n));
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
        if (opts.feather > 0) m = boxBlurGray(m, w, h, Math.round(opts.feather), 2);
        if (opts.contrast > 0) {
            const k = 1 + opts.contrast * 3;
            for (let j = 0; j < n; j++) {
                const v = (m[j] - 0.5) * k + 0.5;
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
        let best = -1;
        st.forEach((s, i) => { if (!s.err && (best < 0 || s.got > st[best].got)) best = i; });
        if (best >= 0) urls.forEach((_, i) => { if (i !== best) { try { ctrls[i].abort(); } catch (e) { } } });
        // 领先者继续跑；它若中途挂了，其余还在跑的源会自动顶上
        let reported = 0;
        while (!st.some(s => s.done && s.buf) && st.some(s => !s.err)) {
            let lead = -1;
            st.forEach((s, i) => { if (!s.err && s.got && (lead < 0 || s.got > st[lead].got)) lead = i; });
            if (lead >= 0 && st[lead].got > reported) { if (onBytes) onBytes(st[lead].got - reported); reported = st[lead].got; }
            await sleep(250);
        }
        const win = st.find(s => s.done && s.buf);
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
            setStatus('正在下载' + spec.label + '模型 ' + (got / 1048576).toFixed(1) + ' / ' + (spec.bytes / 1048576).toFixed(1) + ' MB（' + (got / 1048576 / sec).toFixed(1) + ' MB/s）');
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
        if (prefetching || S.session || S.busy) return;
        const sec = $('section[data-view="matting"]');
        if (!sec || !sec.offsetParent) return;
        prefetching = true;
        setStatus('正在后台准备抠图模型，先传图也不影响...');
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

    const ensureSession = async () => {
        const spec = MODELS[S.model] || MODELS.fast;
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
        setStatus('正在初始化推理引擎...');
        if (wasmBuf) ort.env.wasm.wasmBinary = wasmBuf;   // 跳过引擎内部的二次下载
        S.session = await withTimeout(ort.InferenceSession.create(new Uint8Array(buf), {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        }), 120000, '推理引擎初始化超时，请刷新页面重试');
        S.sessionKey = spec.key;
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

    const infer = async () => {
        const session = await ensureSession();
        const spec = MODELS[S.model] || MODELS.fast;
        const N = spec.size;
        setStatus('正在识别主体区域...');
        const t = document.createElement('canvas');
        t.width = N; t.height = N;
        const tc = t.getContext('2d', { willReadFrequently: true });
        tc.imageSmoothingEnabled = true;
        tc.imageSmoothingQuality = 'high';
        tc.drawImage(S.src, 0, 0, N, N);
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
        S.rctx.drawImage(m, 0, 0, S.w, S.h);
        S.hasMask = true;                      // 清理函数会读这个标志
        S.debug = { speckles: despeckle(), bg: 0 };
        if (S.deepClean) S.debug.bg = cleanBgFlood();
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
        S.src = bmp;
        S.fg = null;
        S.bgColor = undefined;      // 换图要重新估背景色
        S.name = file.name || '图片';
        setupCanvases(Math.max(1, Math.round(bmp.width * scale)), Math.max(1, Math.round(bmp.height * scale)));
        S.hasMask = false;
        S.undo = []; S.redo = [];
        syncHistoryButtons();
        const stage = $('#mattingStage');
        if (stage) stage.classList.remove('is-empty');
        const empty = $('#mattingEmpty');
        if (empty) empty.style.display = 'none';
        $$('.matting-need-img').forEach(el => el.style.display = '');
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
        if (!S.hasMask) return toast('请先完成去背景');
        setStatus('正在导出透明 PNG...');
        const c = document.createElement('canvas');
        c.width = S.w; c.height = S.h;
        const x = c.getContext('2d');
        x.drawImage(S.fg || S.src, 0, 0, S.w, S.h);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(S.mask, 0, 0, S.w, S.h);
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

    /* ---------------- 主流程 ---------------- */
    const autoRemove = async () => {
        if (!S.src) return toast('请先上传图片');
        if (S.busy) return;
        S.busy = true;
        const btn = $('#mattingAutoBtn');
        if (btn) { btn.disabled = true; btn.textContent = '正在识别...'; }
        const t0 = performance.now();
        try {
            render();
            await withTimeout(infer(), 240000, '模型准备超时（网络较慢），请检查网络后再试');
            if (!$('#mattingRefine') || $('#mattingRefine').checked) bakeRefine();
            postProcess({ refine: false, feather: S.feather, contrast: S.contrast });
            pushHistory();
            render();
            const sec = ((performance.now() - t0) / 1000).toFixed(1);
            setStatus('去背景完成 · 用时 ' + sec + ' 秒，可用画笔继续修补'
                + (S.model === 'fast' ? '；想要更干净的细节边缘，可切到「精细模型」再跑一次' : ''));
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
            if (btn) { btn.disabled = false; btn.textContent = '✨ 一键去背景'; }
        }
    };

    // 恢复到刚上传的样子：不重新选文件，清掉蒙版与历史即可
    const restoreOriginal = () => {
        if (!S.src) return toast('请先上传图片');
        S.hasMask = false;
        S.fg = null;
        S.undo = []; S.redo = [];
        if (S.rctx) { S.rctx.globalCompositeOperation = 'source-over'; S.rctx.clearRect(0, 0, S.w, S.h); }
        if (S.mctx) S.mctx.clearRect(0, 0, S.w, S.h);
        syncHistoryButtons();
        render();
        setStatus('已恢复到刚上传的原图，可以重新点「一键去背景」，或直接用画笔涂');
        toast('已恢复原图');
    };

    const reset = () => {
        S.src = null; S.hasMask = false; S.fg = null; S.bgColor = undefined; S.undo = []; S.redo = [];
        S.userZoomed = false; S.zoom = 1; S.tx = 0; S.ty = 0;
        const stage = $('#mattingStage');
        if (stage) { stage.classList.add('is-empty'); stage.style.height = ''; }
        const cv = $('#mattingCanvas');
        if (cv) { cv.style.transform = ''; cv.style.width = ''; cv.style.height = ''; }
        const lab = $('#mattingZoomVal');
        if (lab) lab.textContent = '100%';
        const empty = $('#mattingEmpty');
        if (empty) empty.style.display = '';
        $$('.matting-need-img').forEach(el => el.style.display = 'none');
        if (S.vctx && S.w) S.vctx.clearRect(0, 0, S.w, S.h);
        const fi = $('#mattingFile');
        if (fi) fi.value = '';
        setStatus('');
        const pv = $('#mattingVecPreview');
        if (pv) { pv.innerHTML = ''; pv.style.display = 'none'; }
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
                S.painting = false; S.last = null; scheduleFg();
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
                if (e.target !== cv && !wantPan()) {          // 点在图片外面：直接当拖动
                    endPaint();
                    panFrom = { x: e.clientX, y: e.clientY };
                    cv.style.cursor = 'grabbing';
                    e.preventDefault();
                    return;
                }
                if (!S.hasMask) return toast('请先点「一键去背景」，再用画笔修补');
                if (e.button !== 0) { fingers.delete(e.pointerId); return; }
                S.painting = true;
                pushHistory();
                const p = toCanvasXY(e);
                S.last = p;
                paintDot(p.x, p.y);
                refresh();
            });

            stage.addEventListener('pointermove', (e) => {
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
                if (!S.painting) return;
                paintTo(toCanvasXY(e).x, toCanvasXY(e).y);
                refresh();
            });

            const release = (e) => {
                if (e) fingers.delete(e.pointerId);
                if (fingers.size < 2) pinchPrev = null;
                if (panFrom) { panFrom = null; updateCursor(); }
                endPaint();
            };
            stage.addEventListener('pointerup', release);
            stage.addEventListener('pointercancel', release);
            stage.addEventListener('pointerleave', release);

            // 滚轮缩放（触控板捏合表现为 ctrl+wheel，同一套处理）
            stage.addEventListener('wheel', (e) => {
                if (!S.src) return;
                e.preventDefault();
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
            if (v === 'pan') setStatus('可拖动画面：把要修的地方移到眼前；滚轮或 ➕➖ 可缩放');
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
            if (!st) return;
            st.classList.remove('tp-white', 'tp-black', 'tp-gray');
            if (v !== 'checker') st.classList.add('tp-' + v);
        });

        const rng = (id, key, fmt, map) => {
            const el = $(id);
            const out = $(id + 'Val');
            if (!el) return;
            const sync = () => {
                const raw = Number(el.value);
                S[key] = map ? map(raw) : raw;
                if (out) out.textContent = fmt(raw);
            };
            el.oninput = sync;
            el.onchange = () => { sync(); if (S.hasMask) refresh(); };
            sync();
        };
        rng('#mattingBrush', 'brush', v => v + ' px');
        rng('#mattingHard', 'hardness', v => v + '%', v => v / 100);     // 0-100 → 0-1
        rng('#mattingFeather', 'feather', v => v + ' px');
        rng('#mattingContrast', 'contrast', v => v + '%', v => v / 100); // 0-100 → 0-1

        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
        on('#mattingAutoBtn', autoRemove);
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
        on('#mattingShowCut', () => {
            S.showCut = !S.showCut;
            const b = $('#mattingShowCut');
            if (b) b.textContent = S.showCut ? '👁 隐藏删除区' : '👁 显示删除区';
            render();
        });

        $$('.matting-need-img').forEach(el => el.style.display = 'none');

        // 精细模型如果已经缓存过，就默认用它（不用再等下载，效果明显更好）
        const boot = () => { prefetch(); setInterval(prefetch, 1500); };
        let hasPref = false;
        try { hasPref = !!localStorage.getItem('mattingModel'); } catch (e) { }
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
        state: S, autoRemove, exportPNG, exportSVG,
        fitView, zoomCenter, zoomAt, centerOn,
        view: () => ({ zoom: S.zoom, tx: S.tx, ty: S.ty, baseScale: S.baseScale, mode: S.mode })
    };
})();
