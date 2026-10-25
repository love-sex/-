/* ============================================================
   登录界面 — 卡片入场动效 + 图片编辑
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

    const STORAGE_KEY = 'login_cards_v1';
    const defaults = {};
    images.forEach((img) => { defaults[img.dataset.loginImg] = img.getAttribute('src'); });
    let saved = {};
    let activeImage = null;

    const readSaved = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') saved = parsed;
        } catch (e) {
            console.warn('Login cards load:', e);
        }
    };

    const applySaved = () => {
        images.forEach((img) => {
            const value = saved[img.dataset.loginImg];
            if (typeof value === 'string' && value) img.src = value;
        });
    };

    const persist = () => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
            return true;
        } catch (e) {
            console.warn('Login cards save:', e);
            return false;
        }
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
            saved[img.dataset.loginImg] = data;
            if (!persist()) window.alert('图片保存失败：浏览器本地存储空间不足，请换一张更小的图片。');
        } catch (e) {
            console.warn(e);
            window.alert('图片处理失败，请换一张图片再试。');
        }
    };

    const setEditing = (on) => {
        auth.classList.toggle('login-editing', on);
        editBtn.textContent = on ? '完成' : '编辑图片';
        if (!on) activeImage = null;
    };

    editBtn?.addEventListener('click', () => setEditing(!auth.classList.contains('login-editing')));

    cards.forEach((card) => {
        const img = card.querySelector('[data-login-img]');

        card.addEventListener('click', (e) => {
            if (!auth.classList.contains('login-editing') || !img) return;
            if (e.target.tagName === 'IMG' || e.target.closest('.login-card-replace')) {
                e.preventDefault();
                activeImage = img;
                fileInput.value = '';
                fileInput.click();
            }
        });

        card.addEventListener('dragover', (e) => {
            if (!auth.classList.contains('login-editing')) return;
            e.preventDefault();
            card.classList.add('is-drop');
        });
        card.addEventListener('dragleave', () => card.classList.remove('is-drop'));
        card.addEventListener('drop', (e) => {
            if (!auth.classList.contains('login-editing')) return;
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

    resetBtn?.addEventListener('click', () => {
        if (!window.confirm('恢复登录页的默认卡片图片？已替换的图片会被清除。')) return;
        localStorage.removeItem(STORAGE_KEY);
        saved = {};
        images.forEach((img) => { img.src = defaults[img.dataset.loginImg]; });
        setEditing(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && auth.classList.contains('login-editing')) setEditing(false);
    });

    /* ---------- 登录/注册/找回密码标题 ---------- */
    const copy = {
        login: ['SIGN IN', '登录想想工作台 · 继续你的工作'],
        register: ['CREATE ACCOUNT', '注册想想工作台 · 开始使用'],
        forgot: ['RESET PASSWORD', '通过绑定邮箱重置密码']
    };

    const setAuthMode = (mode) => {
        const item = copy[mode] || copy.login;
        if (title) title.textContent = item[0];
        if (subtitle) subtitle.textContent = item[1];
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
            const direction = index % 2 === 0 ? -1 : 1;
            const startX = direction * width * (0.62 + index * 0.025);
            const startY = height * 0.78;

            card.animate([
                {
                    transform: `translate(${startX}px, ${startY}px) rotate(${rotation + 28}deg) scale(0.55)`,
                    opacity: 0
                },
                {
                    transform: `translate(${startX * 0.34}px, ${-height * 0.07}px) rotate(${rotation + 8}deg) scale(0.92)`,
                    opacity: 1,
                    offset: 0.38
                },
                {
                    transform: `translate(${startX * 0.035}px, -12px) rotate(${rotation - 1.5}deg) scale(1.03)`,
                    offset: 0.76
                },
                {
                    transform: `translate(0, 0) rotate(${rotation}deg) scale(1)`,
                    opacity: 1
                }
            ], {
                duration: 1700,
                delay: 120 + index * 85,
                easing: 'cubic-bezier(0.16, 0.84, 0.24, 1)',
                fill: 'both'
            });
        });
    };

    readSaved();
    applySaved();
    animateCards();
})();
