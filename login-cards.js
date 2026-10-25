/* ============================================================
   登录界面 — 卡片入场动效 + 文字/图片编辑
   ============================================================ */
(() => {
    const auth = document.getElementById('authContainer');
    if (!auth) return;

    const cards = Array.from(auth.querySelectorAll('.login-card'));
    const images = Array.from(auth.querySelectorAll('[data-login-img]'));
    const editBtn = document.getElementById('loginEditBtn');
    const resetBtn = document.getElementById('loginResetBtn');
    const fileInput = document.getElementById('loginFileInput');
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const grid = document.getElementById('loginCards');

    const IMAGE_KEY = 'login_cards_v1';
    const TEXT_KEY = 'login_text_v1';
    const defaults = {};
    images.forEach((img) => { defaults[img.dataset.loginImg] = img.getAttribute('src'); });

    /* ---------- 可编辑文字 ---------- */
    const textTargets = [
        ['brand', '.login-brand'],
        ['topNote', '.login-top-note'],
        ['headline1', '.login-headline .line1'],
        ['headline2', '.login-headline .line2'],
        ['footNote', '.login-foot span:first-child'],
        ['footCopy', '.login-foot span:last-child'],
        ['authLogo', '.auth-logo'],
        ['authTitle', '#authTitle'],
        ['authSubtitle', '#authSubtitle'],
        ['loginUserLabel', '#loginForm .form-group:nth-child(1) label'],
        ['loginPassLabel', '#loginForm .form-group:nth-child(2) label'],
        ['loginSubmit', '#loginForm .auth-btn'],
        ['forgotLink', '#showForgot'],
        ['registerLink', '#showRegister'],
        ['loginSwitch', '#loginForm .auth-switch span'],
        ['regUserLabel', '#registerForm .form-group:nth-child(1) label'],
        ['regPassLabel', '#registerForm .form-group:nth-child(2) label'],
        ['regConfirmLabel', '#registerForm .form-group:nth-child(3) label'],
        ['regEmailLabel', '#registerForm .form-group:nth-child(4) label'],
        ['regSubmit', '#registerForm .auth-btn'],
        ['loginLink', '#showLogin'],
        ['registerSwitch', '#registerForm .auth-switch span'],
        ['forgotTitle', '#forgotForm .forgot-info h3'],
        ['forgotDesc', '#forgotForm .forgot-info p'],
        ['forgotUserLabel', '#forgotForm .form-group:nth-child(1) label'],
        ['forgotEmailLabel', '#forgotForm .form-group:nth-child(2) label'],
        ['forgotPassLabel', '#forgotForm .form-group:nth-child(3) label'],
        ['forgotSubmit', '#forgotForm .auth-btn'],
        ['backLoginLink', '#showLoginFromForgot']
    ];

    const textEls = [];
    textTargets.forEach(([key, selector]) => {
        const el = auth.querySelector(selector);
        if (el) {
            el.dataset.loginText = key;
            textEls.push(el);
        }
    });

    const defaultText = {};
    textEls.forEach((el) => { defaultText[el.dataset.loginText] = el.innerText; });

    let savedImages = {};
    let savedText = {};
    let activeImage = null;
    let editing = false;
    let textTimer = 0;

    const readSaved = () => {
        try {
            const rawImages = localStorage.getItem(IMAGE_KEY);
            if (rawImages) {
                const parsed = JSON.parse(rawImages);
                if (parsed && typeof parsed === 'object') savedImages = parsed;
            }
        } catch (e) {
            console.warn('Login cards load:', e);
        }
        try {
            const rawText = localStorage.getItem(TEXT_KEY);
            if (rawText) {
                const parsed = JSON.parse(rawText);
                if (parsed && typeof parsed === 'object') savedText = parsed;
            }
        } catch (e) {
            console.warn('Login text load:', e);
        }
    };

    const applySaved = () => {
        images.forEach((img) => {
            const value = savedImages[img.dataset.loginImg];
            if (typeof value === 'string' && value) img.src = value;
        });
        textEls.forEach((el) => {
            const value = savedText[el.dataset.loginText];
            if (typeof value === 'string') el.textContent = value;
        });
    };

    const persistImages = () => {
        try {
            localStorage.setItem(IMAGE_KEY, JSON.stringify(savedImages));
            return true;
        } catch (e) {
            console.warn('Login cards save:', e);
            return false;
        }
    };

    const persistText = () => {
        try {
            localStorage.setItem(TEXT_KEY, JSON.stringify(savedText));
        } catch (e) {
            console.warn('Login text save:', e);
        }
    };

    const scheduleText = () => {
        clearTimeout(textTimer);
        textTimer = setTimeout(persistText, 260);
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
                ctx.fillStyle = '#d8d7de';
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
        try {
            const data = await resizeImage(file);
            img.src = data;
            savedImages[img.dataset.loginImg] = data;
            if (!persistImages()) window.alert('图片保存失败：浏览器本地存储空间不足，请换一张更小的图片。');
        } catch (e) {
            console.warn(e);
            window.alert('图片处理失败，请换一张图片再试。');
        }
    };

    const setEditing = (on) => {
        editing = on;
        auth.classList.toggle('login-editing', on);
        editBtn.textContent = on ? '完成' : '编辑内容';
        textEls.forEach((el) => {
            el.contentEditable = on ? 'true' : 'false';
            el.spellcheck = false;
        });
        if (!on) {
            persistText();
            activeImage = null;
        }
        if (grid) {
            grid.style.setProperty('--px', '0px');
            grid.style.setProperty('--py', '0px');
        }
    };

    editBtn?.addEventListener('click', () => setEditing(!editing));

    /* ---------- 图片替换 ---------- */
    cards.forEach((card) => {
        const img = card.querySelector('[data-login-img]');

        card.addEventListener('click', (e) => {
            if (!editing || !img) return;
            if (e.target.tagName === 'IMG' || e.target.closest('.login-card-replace')) {
                e.preventDefault();
                activeImage = img;
                fileInput.value = '';
                fileInput.click();
            }
        });

        card.addEventListener('dragover', (e) => {
            if (!editing) return;
            e.preventDefault();
            card.classList.add('is-drop');
        });
        card.addEventListener('dragleave', () => card.classList.remove('is-drop'));
        card.addEventListener('drop', (e) => {
            if (!editing) return;
            e.preventDefault();
            card.classList.remove('is-drop');
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

    /* ---------- 文字输入 ---------- */
    textEls.forEach((el) => {
        el.addEventListener('input', () => {
            savedText[el.dataset.loginText] = el.innerText.replace(/\u00a0/g, ' ').trim();
            scheduleText();
        });
        el.addEventListener('blur', () => {
            if (editing) persistText();
        });
    });

    auth.addEventListener('submit', (e) => {
        if (editing) e.preventDefault();
    }, true);

    auth.addEventListener('click', (e) => {
        if (!editing) return;
        const target = e.target.closest('[data-login-text]');
        if (target && (target.tagName === 'A' || target.tagName === 'BUTTON')) e.preventDefault();
    }, true);

    resetBtn?.addEventListener('click', () => {
        if (!window.confirm('恢复登录页的默认文字与图片？已修改的内容会被清除。')) return;
        localStorage.removeItem(IMAGE_KEY);
        localStorage.removeItem(TEXT_KEY);
        window.location.reload();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && editing) setEditing(false);
    });

    /* ---------- 登录/注册/找回密码标题 ---------- */
    const copy = {
        login: ['SIGN IN', '登录想想工作台 · 继续你的工作'],
        register: ['CREATE ACCOUNT', '注册想想工作台 · 开始使用'],
        forgot: ['RESET PASSWORD', '通过绑定邮箱重置密码']
    };

    const setAuthMode = (mode) => {
        const item = copy[mode] || copy.login;
        if (title && !savedText.authTitle) title.textContent = item[0];
        if (subtitle && !savedText.authSubtitle) subtitle.textContent = item[1];
    };

    document.getElementById('showRegister')?.addEventListener('click', () => setAuthMode('register'));
    document.getElementById('showLogin')?.addEventListener('click', () => setAuthMode('login'));
    document.getElementById('showForgot')?.addEventListener('click', () => setAuthMode('forgot'));
    document.getElementById('showLoginFromForgot')?.addEventListener('click', () => setAuthMode('login'));
    document.addEventListener('wb:auth', () => {
        setAuthMode('login');
        setEditing(false);
    });

    /* ---------- 卡片入场动效 ---------- */
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animateCards = () => {
        if (reduceMotion) return;
        const width = window.innerWidth;
        const height = window.innerHeight;

        cards.forEach((card, index) => {
            card.getAnimations().forEach((animation) => animation.cancel());
            const rotation = parseFloat(getComputedStyle(card).getPropertyValue('--rot')) || 0;
            const startX = width * (0.86 + index * 0.018);
            const startY = height * (0.16 + index * 0.055);

            card.animate([
                {
                    transform: `translate(${startX}px, ${startY}px) rotate(${rotation + 36}deg) scale(0.5)`,
                    opacity: 0
                },
                {
                    transform: `translate(${width * 0.33}px, ${height * (0.03 + index * 0.012)}px) rotate(${rotation + 14}deg) scale(0.86)`,
                    opacity: 1,
                    offset: 0.34
                },
                {
                    transform: `translate(${-width * 0.018}px, ${-height * 0.012}px) rotate(${rotation - 2}deg) scale(1.03)`,
                    offset: 0.72
                },
                {
                    transform: `translate(0, 0) rotate(${rotation}deg) scale(1)`,
                    opacity: 1
                }
            ], {
                duration: 2000,
                delay: 120 + index * 72,
                easing: 'cubic-bezier(0.16, 0.84, 0.24, 1)',
                fill: 'both'
            });
        });
    };

    /* ---------- 轻微鼠标视差 ---------- */
    let parallaxFrame = 0;
    auth.addEventListener('mousemove', (e) => {
        if (editing || window.innerWidth <= 900 || !grid) return;
        cancelAnimationFrame(parallaxFrame);
        parallaxFrame = requestAnimationFrame(() => {
            const x = (e.clientX / window.innerWidth - 0.5) * 16;
            const y = (e.clientY / window.innerHeight - 0.5) * 12;
            grid.style.setProperty('--px', `${x.toFixed(1)}px`);
            grid.style.setProperty('--py', `${y.toFixed(1)}px`);
        });
    });

    auth.addEventListener('mouseleave', () => {
        if (!grid) return;
        grid.style.setProperty('--px', '0px');
        grid.style.setProperty('--py', '0px');
    });

    /* ---------- 初始化 ---------- */
    readSaved();
    applySaved();
    setAuthMode('login');
    textEls.forEach((el) => {
        el.contentEditable = 'false';
        el.spellcheck = false;
    });
    animateCards();
})();
