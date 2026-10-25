/* ============================================================
   作品集 / Portfolio — 可编辑内容与自动保存
   ============================================================ */
(() => {
    const page = document.getElementById('pfPage');
    if (!page) return;

    const editBtn = document.getElementById('pfEditBtn');
    const workbenchBtn = document.getElementById('pfWorkbenchBtn');
    const contactBtn = document.getElementById('pfContactBtn');
    const resetBtn = document.getElementById('pfResetBtn');
    const statusEl = document.getElementById('pfStatus');
    const fileInput = document.getElementById('pfFileInput');
    const textEls = Array.from(page.querySelectorAll('[data-pf-key]'));
    const mediaEls = Array.from(page.querySelectorAll('[data-pf-media]'));
    const images = Array.from(page.querySelectorAll('[data-pf-img]'));

    const storageKey = () => 'portfolio_v1:' + (localStorage.getItem('todoApp_currentUser') || 'guest');
    let state = { text: {}, images: {} };
    let editing = false;
    let activeImage = null;
    let saveTimer = 0;

    const setStatus = (text) => {
        if (statusEl) statusEl.textContent = text;
    };

    const readState = () => {
        try {
            const raw = localStorage.getItem(storageKey());
            if (!raw) return;
            const parsed = JSON.parse(raw);
            state = {
                text: parsed && typeof parsed.text === 'object' ? parsed.text : {},
                images: parsed && typeof parsed.images === 'object' ? parsed.images : {}
            };
        } catch (e) {
            console.warn('Portfolio load:', e);
        }
    };

    const collectText = () => {
        const next = {};
        textEls.forEach((el) => {
            next[el.dataset.pfKey] = el.innerText.replace(/\u00a0/g, ' ').trim();
        });
        state.text = next;
    };

    const save = () => {
        collectText();
        try {
            localStorage.setItem(storageKey(), JSON.stringify(state));
            setStatus('已保存');
        } catch (e) {
            console.warn('Portfolio save:', e);
            setStatus('保存失败：图片可能过大');
        }
    };

    const scheduleSave = () => {
        setStatus('保存中…');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 320);
    };

    const applySaved = () => {
        textEls.forEach((el) => {
            const value = state.text[el.dataset.pfKey];
            if (typeof value === 'string') el.textContent = value;
        });
        images.forEach((img) => {
            const value = state.images[img.dataset.pfImg];
            if (typeof value === 'string' && value) img.src = value;
        });
    };

    const resizeImage = (file) => new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            reject(new Error('不是图片文件'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('图片读取失败'));
            image.onload = () => {
                const maxSide = 1400;
                const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#0a0a0a';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.84));
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });

    const replaceImage = async (img, file) => {
        if (!img || !file) return;
        setStatus('处理图片中…');
        try {
            const data = await resizeImage(file);
            img.src = data;
            state.images[img.dataset.pfImg] = data;
            save();
            setStatus('图片已保存');
        } catch (e) {
            console.warn(e);
            setStatus('图片处理失败');
        }
    };

    const setEditing = (on) => {
        editing = on;
        page.classList.toggle('pf-editing', on);
        editBtn.classList.toggle('is-editing', on);
        editBtn.textContent = on ? '完成' : '编辑';
        textEls.forEach((el) => {
            el.contentEditable = on ? 'true' : 'false';
            el.spellcheck = false;
        });
        if (on) {
            setStatus('点击文字或图片即可修改');
        } else {
            save();
            const selection = window.getSelection();
            if (selection) selection.removeAllRanges();
        }
    };

    const open = () => {
        page.classList.add('pf-open');
        page.setAttribute('aria-hidden', 'false');
        document.body.classList.add('pf-lock');
        page.scrollTop = 0;
    };

    const close = () => {
        if (editing) setEditing(false);
        page.classList.remove('pf-open');
        page.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('pf-lock');
    };

    /* ---------- 事件 ---------- */
    editBtn?.addEventListener('click', () => setEditing(!editing));
    workbenchBtn?.addEventListener('click', close);

    contactBtn?.addEventListener('click', (e) => {
        if (editing) {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        document.getElementById('pfFooter')?.scrollIntoView({ behavior: 'smooth' });
    });

    textEls.forEach((el) => {
        el.addEventListener('input', scheduleSave);
        el.addEventListener('blur', () => {
            if (editing) save();
        });
    });

    mediaEls.forEach((media) => {
        media.addEventListener('click', (e) => {
            if (!editing) return;
            const img = media.querySelector('[data-pf-img]');
            if (!img) return;
            if (e.target.tagName === 'IMG' || e.target.closest('.pf-replace')) {
                e.preventDefault();
                activeImage = img;
                fileInput.value = '';
                fileInput.click();
            }
        });

        media.addEventListener('dragover', (e) => {
            if (!editing) return;
            e.preventDefault();
            media.classList.add('is-drop');
        });
        media.addEventListener('dragleave', () => media.classList.remove('is-drop'));
        media.addEventListener('drop', (e) => {
            if (!editing) return;
            e.preventDefault();
            media.classList.remove('is-drop');
            const img = media.querySelector('[data-pf-img]');
            const file = e.dataTransfer?.files?.[0];
            if (img && file) replaceImage(img, file);
        });
    });

    fileInput?.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file && activeImage) {
            replaceImage(activeImage, file).finally(() => {
                activeImage = null;
                fileInput.value = '';
            });
        }
    });

    resetBtn?.addEventListener('click', () => {
        if (!window.confirm('清空已保存的文字和图片，恢复默认作品集内容？')) return;
        localStorage.removeItem(storageKey());
        window.location.reload();
    });

    page.addEventListener('click', (e) => {
        if (!editing) return;
        if (e.target.closest('a[data-pf-key]')) e.preventDefault();
    }, true);

    document.addEventListener('keydown', (e) => {
        if (!page.classList.contains('pf-open')) return;
        if (e.key === 'Escape' && editing) setEditing(false);
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            save();
        }
    });

    window.addEventListener('beforeunload', () => {
        if (editing) save();
    });

    document.addEventListener('wb:main-app', open);
    document.addEventListener('wb:auth', close);

    document.getElementById('portfolioBtn')?.addEventListener('click', open);

    /* ---------- 初始化 ---------- */
    readState();
    applySaved();
    textEls.forEach((el) => {
        el.contentEditable = 'false';
        el.spellcheck = false;
    });

    // 登录状态直接打开作品集；未登录时保持隐藏
    if (localStorage.getItem('todoApp_token') && localStorage.getItem('todoApp_currentUser')) {
        open();
    }
})();
