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
    let pendingMedia = null;
    let saveTimer = 0;
    let suppressSave = false;

    /* ---------- 展台轮播 / 入场动效 ---------- */
    const stageFrame = page.querySelector('.pf-stage-frame');
    const slides = Array.from(page.querySelectorAll('[data-pf-slide]'));
    const dots = Array.from(page.querySelectorAll('[data-pf-goto]'));
    const revealTargets = [];
    const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const SLIDE_MS = 6800;
    let slideIndex = 0;
    let slideTimer = 0;
    let stageHovered = false;

    const showSlide = (next) => {
        if (!slides.length) return;
        slideIndex = ((next % slides.length) + slides.length) % slides.length;
        slides.forEach((slide, i) => slide.classList.toggle('is-active', i === slideIndex));
        dots.forEach((dot, i) => {
            const on = i === slideIndex;
            dot.classList.toggle('is-active', on);
            dot.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    };

    const stopSlides = () => {
        clearInterval(slideTimer);
        slideTimer = 0;
    };

    const startSlides = () => {
        stopSlides();
        if (reduceMotion || editing || stageHovered || document.hidden || slides.length < 2) return;
        slideTimer = setInterval(() => showSlide(slideIndex + 1), SLIDE_MS);
    };

    /* 帧内元素错峰入场 */
    const prepareSlideReveal = () => {
        const selector = [
            '.pf-slide-copy > *',
            '.pf-hero-title',
            '.pf-slide-pill',
            '.pf-vigil-left > *',
            '.pf-vigil-card',
            '.pf-guard-title',
            '.pf-guard-team',
            '.pf-guard-orb',
            '.pf-guard-desc'
        ].join(',');
        slides.forEach((slide) => {
            slide.querySelectorAll(selector).forEach((el) => el.setAttribute('data-reveal', ''));
        });
    };

    /* 版块滚动进入 */
    const prepareScrollReveal = () => {
        if (reduceMotion || !('IntersectionObserver' in window)) return;
        const selector = '.pf-display, .pf-intro-side, .pf-profile, .pf-card, .pf-footer-kicker, .pf-footer-title, .pf-footer-row';
        const targets = Array.from(page.querySelectorAll(selector));
        if (!targets.length) return;

        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-in');
                io.unobserve(entry.target);
            });
        }, { root: page, rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

        targets.forEach((el, i) => {
            el.classList.add('pf-reveal');
            el.style.transitionDelay = Math.min(i * 45, 260) + 'ms';
            revealTargets.push(el);
            io.observe(el);
        });
    };


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
            // 兼容旧版字段：主视觉从 hero.image 迁移到展台首屏 slide1.image
            if (state.images['hero.image'] && !state.images['slide1.image']) {
                state.images['slide1.image'] = state.images['hero.image'];
            }
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
        if (suppressSave) return;
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
        startSlides();
    };

    const open = () => {
        page.classList.add('pf-open');
        page.setAttribute('aria-hidden', 'false');
        document.body.classList.add('pf-lock');
        page.scrollTop = 0;
        showSlide(slideIndex);
        startSlides();
    };

    const close = () => {
        if (editing) setEditing(false);
        stopSlides();
        page.classList.remove('pf-open');
        page.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('pf-lock');
    };

    /* ---------- 事件 ---------- */
    editBtn?.addEventListener('click', () => setEditing(!editing));
    workbenchBtn?.addEventListener('click', close);

    dots.forEach((dot) => {
        dot.addEventListener('click', () => {
            showSlide(Number(dot.dataset.pfGoto) || 0);
            startSlides();
        });
    });

    stageFrame?.addEventListener('mouseenter', () => {
        stageHovered = true;
        stopSlides();
    });

    stageFrame?.addEventListener('mouseleave', () => {
        stageHovered = false;
        startSlides();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopSlides();
        else startSlides();
    });

    contactBtn?.addEventListener('click', (e) => {
        if (editing) {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        document.getElementById('pfFooter')?.scrollIntoView({ behavior: 'smooth' });
    });

    // 编辑态下所有锚点跳转都拦住，保证文字可以正常点选编辑
    page.addEventListener('click', (e) => {
        if (!editing) return;
        const link = e.target.closest?.('a[href]');
        if (link && link.getAttribute('href').startsWith('#')) e.preventDefault();
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
            // 容器本身、容器内的图片、以及「更换图片」按钮都算有效点击
            const onImage = e.target === img || e.target.tagName === 'IMG';
            const onReplace = !!e.target.closest?.('.pf-replace');
            if (onImage || onReplace || e.target === media) {
                e.preventDefault();
                activeImage = img;
                pendingMedia = media;
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
        if (!file) return;
        // 兜底：万一 activeImage 丢了，用最后一次点击的图片，不能「选了文件却没反应」
        const target = activeImage || pendingMedia?.querySelector('[data-pf-img]');
        if (!target) {
            setStatus('请先点击要更换的图片');
            fileInput.value = '';
            return;
        }
        replaceImage(target, file).finally(() => {
            activeImage = null;
            pendingMedia = null;
            fileInput.value = '';
        });
    });

    resetBtn?.addEventListener('click', () => {
        if (!window.confirm('清空已保存的文字和图片，恢复默认作品集内容？')) return;
        // 重置后立即刷新：必须阻止 beforeunload / 失焦的自动保存把旧内容写回
        suppressSave = true;
        clearTimeout(saveTimer);
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
        if (editing) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            const tag = (document.activeElement?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            showSlide(slideIndex + (e.key === 'ArrowRight' ? 1 : -1));
            startSlides();
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

    prepareSlideReveal();
    prepareScrollReveal();
    showSlide(0);

    // 登录状态直接打开作品集；未登录时保持隐藏
    if (localStorage.getItem('todoApp_token') && localStorage.getItem('todoApp_currentUser')) {
        open();
    }
})();
