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

    const MODEL = {
        url: 'assets/matting/models/isnet_quint8.onnx',
        size: 1024,
        mean: [0.485, 0.456, 0.406],
        std: [0.229, 0.224, 0.225]
    };
    const ORT_BASE = new URL('assets/matting/ort/', location.href).href;
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
        hasMask: false,
        busy: false,
        session: null,
        ort: null,
        undo: [], redo: [],
        last: null,
        painting: false,
        mode: 'erase',    // erase | restore
        brush: 40,
        hardness: 0.6,
        feather: 1,
        contrast: 0,
        showCut: true,
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
        ctx.drawImage(S.src, 0, 0, S.w, S.h);
        if (S.hasMask) {
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(S.mask, 0, 0, S.w, S.h);
            ctx.globalCompositeOperation = 'source-over';
            if (S.showCut) {
                // 被删除的区域盖一层洋红，方便看清抠掉了什么（可关）
                const cut = document.createElement('canvas');
                cut.width = S.w; cut.height = S.h;
                const c = cut.getContext('2d');
                c.fillStyle = 'rgba(255,0,170,0.34)';
                c.fillRect(0, 0, S.w, S.h);
                c.globalCompositeOperation = 'destination-out';
                c.drawImage(S.mask, 0, 0, S.w, S.h);
                ctx.drawImage(cut, 0, 0, S.w, S.h);
            }
        }
    };

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
        ctx.globalCompositeOperation = keep ? 'source-over' : 'destination-out';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
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
    const postProcess = (opts) => {
        const w = S.w, h = S.h, n = w * h;
        // 蒙版以 alpha 通道存储（destination-in 只认 alpha，不认灰度）
        const src = S.rctx.getImageData(0, 0, w, h).data;
        const out = S.mctx.createImageData(w, h);
        const d = out.data;
        let m = new Float32Array(n);
        for (let i = 0, j = 0; j < n; i += 4, j++) m[j] = src[i + 3] / 255;

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
    };

    /* ---------------- 模型加载 + 推理 ---------------- */
    const fetchWithProgress = async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error('模型下载失败（' + res.status + '）');
        const total = Number(res.headers.get('content-length') || 0);
        if (!res.body || !res.body.getReader) return await res.blob();
        const reader = res.body.getReader();
        const chunks = [];
        let got = 0;
        for (; ;) {
            const r = await reader.read();
            if (r.done) break;
            chunks.push(r.value);
            got += r.value.length;
            if (total) setProgress(got / total);
            setStatus('正在下载抠图模型 ' + (got / 1048576).toFixed(1) + ' / ' + (total / 1048576).toFixed(1) + ' MB');
        }
        return new Blob(chunks);
    };

    const ensureSession = async () => {
        if (S.session) return S.session;
        setProgress(0.01);
        setStatus('正在准备抠图模型...');
        let buf = await idbGet('isnet');
        if (!buf) {
            const blob = await fetchWithProgress(new URL(MODEL.url, location.href).href);
            buf = await blob.arrayBuffer();
            await idbPut('isnet', buf);
            setStatus('模型已缓存，下次使用秒开');
        } else {
            setStatus('使用已缓存的抠图模型');
        }
        setProgress(0.98);
        setStatus('正在加载推理引擎...');
        if (!S.ort) S.ort = await import(ORT_BASE + 'ort.wasm.min.mjs');
        S.ort.env.wasm.wasmPaths = ORT_BASE;
        S.session = await S.ort.InferenceSession.create(new Uint8Array(buf), {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });
        setProgress(null);
        return S.session;
    };

    const infer = async () => {
        const session = await ensureSession();
        const N = MODEL.size;
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
            input[o] = (px[i] / 255 - MODEL.mean[0]) / MODEL.std[0];
            input[plane + o] = (px[i + 1] / 255 - MODEL.mean[1]) / MODEL.std[1];
            input[plane * 2 + o] = (px[i + 2] / 255 - MODEL.mean[2]) / MODEL.std[2];
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
        const span = mx - mn || 1;
        const m = document.createElement('canvas');
        m.width = N; m.height = N;
        const mc = m.getContext('2d', { willReadFrequently: true });
        const im = mc.createImageData(N, N);
        for (let i = 0, o = 0; o < plane; i += 4, o++) {
            let v = (raw[o * stride + chOff] - mn) / span;
            v = v < 0 ? 0 : v > 1 ? 1 : v;
            const g = v * 255;
            im.data[i] = im.data[i + 1] = im.data[i + 2] = 255;
            im.data[i + 3] = g;
        }
        mc.putImageData(im, 0, 0);
        // 缩放回工作分辨率，写入权威蒙版
        S.rctx.clearRect(0, 0, S.w, S.h);
        S.rctx.imageSmoothingEnabled = true;
        S.rctx.imageSmoothingQuality = 'high';
        S.rctx.drawImage(m, 0, 0, S.w, S.h);
        S.hasMask = true;
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
        x.drawImage(S.src, 0, 0, S.w, S.h);
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
        const c = document.createElement('canvas');
        c.width = S.w; c.height = S.h;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(S.src, 0, 0, S.w, S.h);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(S.mask, 0, 0, S.w, S.h);
        const imgd = x.getImageData(0, 0, S.w, S.h);
        const colors = Number(($('#mattingVecColors') || {}).value || 24);
        const detail = Number(($('#mattingVecDetail') || {}).value || 60);
        const lt = Math.max(0.2, 2.4 - detail / 60);
        try {
            const svg = tracer.imagedataToSVG(imgd, {
                colorsampling: 1,
                numberofcolors: colors,
                ltres: lt,
                qtres: Math.max(0.2, lt * 0.9),
                pathomit: 6,
                strokewidth: 0,
                linefilter: false,
                scale: 1,
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
            await infer();
            postProcess({
                refine: !$('#mattingRefine') || $('#mattingRefine').checked,
                feather: S.feather,
                contrast: S.contrast
            });
            pushHistory();
            render();
            const sec = ((performance.now() - t0) / 1000).toFixed(1);
            setStatus('去背景完成 · 用时 ' + sec + ' 秒，可用画笔继续修补');
            toast('背景已去除');
        } catch (e) {
            console.error(e);
            setStatus('处理失败：' + e.message);
            toast('处理失败：' + e.message);
        } finally {
            setProgress(null);
            S.busy = false;
            if (btn) { btn.disabled = false; btn.textContent = '✨ 一键去背景'; }
        }
    };

    const reset = () => {
        S.src = null; S.hasMask = false; S.undo = []; S.redo = [];
        const stage = $('#mattingStage');
        if (stage) stage.classList.add('is-empty');
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

        // 画笔
        const cv = $('#mattingCanvas');
        if (cv) {
            cv.addEventListener('pointerdown', (e) => {
                if (!S.hasMask) return toast('请先点「一键去背景」，再用画笔修补');
                cv.setPointerCapture(e.pointerId);
                S.painting = true;
                pushHistory();
                const p = toCanvasXY(e);
                S.last = p;
                paintDot(p.x, p.y);
                refresh();
            });
            cv.addEventListener('pointermove', (e) => {
                if (!S.painting) return;
                paintTo(toCanvasXY(e).x, toCanvasXY(e).y);
                refresh();
            });
            const stop = () => { if (S.painting) { S.painting = false; S.last = null; } };
            cv.addEventListener('pointerup', stop);
            cv.addEventListener('pointercancel', stop);
            cv.addEventListener('pointerleave', stop);
        }

        // 工具条
        const seg = (wrap, onPick) => {
            $$(wrap + ' button').forEach(b => b.onclick = () => {
                $$(wrap + ' button').forEach(x => x.classList.remove('on'));
                b.classList.add('on');
                onPick(b.dataset.val);
            });
        };
        seg('#mattingMode', (v) => { S.mode = v; });
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
        on('#mattingReset', reset);
        on('#mattingExportPng', exportPNG);
        on('#mattingExportSvg', exportSVG);
        on('#mattingKeepAll', () => {
            if (!S.hasMask) return toast('请先完成去背景');
            pushHistory();
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
            postProcess({ refine: true, feather: S.feather, contrast: S.contrast });
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
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();

    window.__matting = { state: S, autoRemove, exportPNG, exportSVG };
})();
