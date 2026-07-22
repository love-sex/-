/* ============================================
   待办事项管理 - 纯前端localStorage版本
   ============================================ */

const DB_KEY = 'todoApp_users';
const TOKEN_KEY = 'todoApp_token';
const USER_KEY = 'todoApp_currentUser';
const IDX_DB_NAME = 'todoApp_media';
const IDX_STORE = 'videos';

// ==================== IndexedDB 视频存储 ====================
function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDX_DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDX_STORE)) {
                db.createObjectStore(IDX_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveVideoToIndexedDB(id, data) {
    try {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDX_STORE, 'readwrite');
            tx.objectStore(IDX_STORE).put(data, id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        return false;
    }
}

async function getVideoFromIndexedDB(id) {
    try {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDX_STORE, 'readonly');
            const req = tx.objectStore(IDX_STORE).get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null;
    }
}

async function deleteVideoFromIndexedDB(id) {
    try {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDX_STORE, 'readwrite');
            tx.objectStore(IDX_STORE).delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        return false;
    }
}

// ==================== 工具函数 ====================
function hashPassword(password) {
    let hash = 0;
    const salted = password + '_todo_salt_2024';
    for (let i = 0; i < salted.length; i++) {
        const char = salted.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36) + '_' + salted.length;
}

function createToken(username) {
    const data = {
        username,
        exp: Date.now() + 24 * 60 * 60 * 1000
    };
    return btoa(encodeURIComponent(JSON.stringify(data)));
}

function verifyToken(token) {
    if (!token) return null;
    try {
        const payload = JSON.parse(decodeURIComponent(atob(token)));
        if (payload.exp < Date.now()) return null;
        return payload.username;
    } catch {
        return null;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getUsers() {
    try {
        return JSON.parse(localStorage.getItem(DB_KEY)) || {};
    } catch { return {}; }
}

// 数据迁移：清除旧格式数据（兼容旧版本token编码）
function migrateData() {
    const version = localStorage.getItem('todoApp_version');
    if (version !== '2.0') {
        // 清除旧数据，让用户重新注册
        const keys = Object.keys(localStorage).filter(k => k.startsWith('todoApp_'));
        keys.forEach(k => localStorage.removeItem(k));
        localStorage.setItem('todoApp_version', '2.0');
    }
}

function saveUsers(users) {
    localStorage.setItem(DB_KEY, JSON.stringify(users));
}

// ==================== 启动时数据迁移 ====================
migrateData();

// ==================== 主题设置管理器 ====================
const DEFAULT_THEME = {
    primaryColor: '#8b5cf6',
    bgColor: '#0f172a',
    headerFrom: '#6366f1',
    headerTo: '#a855f7',
    bgImage: '',
    bgVideoId: '',
    bgOpacity: 15,
    bgBlur: 5,
    glassEffect: false,
    shadowEffect: true,
    animationEffect: true,
    fontSize: 100,
    mode: 'default'
};

const PRESET_THEMES = {
    default: { primaryColor: '#8b5cf6', bgColor: '#0f172a', headerFrom: '#6366f1', headerTo: '#8b5cf6', mode: 'default' },
    ocean:   { primaryColor: '#a855f7', bgColor: '#0f172a', headerFrom: '#8b5cf6', headerTo: '#a855f7', mode: 'ocean' },
    forest:  { primaryColor: '#c084fc', bgColor: '#0f172a', headerFrom: '#a855f7', headerTo: '#c084fc', mode: 'forest' },
    sunset:  { primaryColor: '#7c3aed', bgColor: '#1e1b4b', headerFrom: '#6366f1', headerTo: '#a855f7', mode: 'sunset' },
    sakura:  { primaryColor: '#ec4899', bgColor: '#0f172a', headerFrom: '#8b5cf6', headerTo: '#ec4899', mode: 'sakura' },
    night:   { primaryColor: '#7c3aed', bgColor: '#020617', headerFrom: '#4c1d95', headerTo: '#7c3aed', mode: 'night' },
    purple:  { primaryColor: '#6366f1', bgColor: '#0f172a', headerFrom: '#6366f1', headerTo: '#c084fc', mode: 'purple' },
    mint:    { primaryColor: '#a78bfa', bgColor: '#0f172a', headerFrom: '#a78bfa', headerTo: '#e879f9', mode: 'mint' },
    rose:    { primaryColor: '#d946ef', bgColor: '#0f172a', headerFrom: '#d946ef', headerTo: '#f0abfc', mode: 'rose' },
    sky:     { primaryColor: '#818cf8', bgColor: '#0f172a', headerFrom: '#818cf8', headerTo: '#a5b4fc', mode: 'sky' }
};

class ThemeManager {
    constructor() {
        this.settings = this.loadSettings();
        this.applySettings();
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('todoApp_theme');
            return saved ? { ...DEFAULT_THEME, ...JSON.parse(saved) } : { ...DEFAULT_THEME };
        } catch { return { ...DEFAULT_THEME }; }
    }

    saveSettings() {
        localStorage.setItem('todoApp_theme', JSON.stringify(this.settings));
    }

    resetSettings() {
        this.settings = { ...DEFAULT_THEME };
        this.saveSettings();
        this.applySettings();
    }

    applySettings() {
        const s = this.settings;
        const root = document.documentElement;

        // 应用主色调到CSS变量
        root.style.setProperty('--primary-500', s.primaryColor);
        root.style.setProperty('--primary-600', this.darkenColor(s.primaryColor, 10));
        root.style.setProperty('--primary-700', this.darkenColor(s.primaryColor, 20));
        root.style.setProperty('--primary-400', this.lightenColor(s.primaryColor, 15));
        root.style.setProperty('--primary-300', this.lightenColor(s.primaryColor, 30));
        root.style.setProperty('--primary-100', this.lightenColor(s.primaryColor, 40) + '22');

        // 预设主题只影响头部 header 渐变
        const header = document.querySelector('header');
        if (header) {
            header.style.background = `linear-gradient(135deg, ${s.headerFrom || '#667eea'}, ${s.headerTo || '#764ba2'})`;
        }

        // 清理所有背景元素
        ['custom-bg-image', 'custom-bg-video', 'custom-bg-overlay'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (id === 'custom-bg-video') { el.pause(); el.src = ''; }
                el.remove();
            }
        });

        // 动态背景控制
        const canvas = document.getElementById('dynamicBgCanvas');
        if (canvas) {
            canvas.style.display = (s.bgImage || s.bgVideoId) ? 'none' : 'block';
        }

        // 视频背景
        if (s.bgVideoId) {
            getVideoFromIndexedDB(s.bgVideoId).then(data => {
                if (data) {
                    const video = document.createElement('video');
                    video.id = 'custom-bg-video';
                    video.autoplay = true;
                    video.loop = true;
                    video.muted = false;
                    video.playsInline = true;
                    video.preload = 'auto';
                    video.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:cover;opacity:${s.bgOpacity/100};filter:blur(${s.bgBlur}px);pointer-events:none;z-index:-2;`;
                    document.body.insertBefore(video, document.body.firstChild);
                    video.src = data;
                    video.play().catch(() => { video.muted = true; video.play(); });
                }
            });
        }

        // 图片背景
        if (s.bgImage && !s.bgVideoId) {
            const bg = document.createElement('div');
            bg.id = 'custom-bg-image';
            bg.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;background-image:url('${s.bgImage}');background-size:cover;background-position:center;opacity:${s.bgOpacity/100};filter:blur(${s.bgBlur}px);pointer-events:none;z-index:-1;`;
            document.body.insertBefore(bg, document.body.firstChild);

            const overlay = document.createElement('div');
            overlay.id = 'custom-bg-overlay';
            overlay.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(255,255,255,0.82);pointer-events:none;z-index:-1;`;
            document.body.insertBefore(overlay, document.body.firstChild);
        }

        // 效果
        document.body.classList.toggle('glass-effect', s.glassEffect);
        document.body.classList.toggle('no-shadow', !s.shadowEffect);
        document.body.classList.toggle('no-animation', !s.animationEffect);

        // 字体大小
        root.style.fontSize = s.fontSize + '%';
    }

    darkenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
        const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
        const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
        return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    lightenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, (num >> 16) + Math.round(255 * percent / 100));
        const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * percent / 100));
        const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * percent / 100));
        return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    setPrimaryColor(color) {
        this.settings.primaryColor = color;
        this.applySettings();
        this.saveSettings();
    }

    setBgImage(base64) {
        this.settings.bgImage = base64;
        this.applySettings();
        this.saveSettings();
    }

    setBgColor(color) {
        this.settings.bgColor = color;
        this.applySettings();
        this.saveSettings();
    }

    removeBgImage() {
        this.settings.bgImage = '';
        this.settings.bgVideoId = '';
        this.applySettings();
        this.saveSettings();
    }

    setPreset(themeName) {
        // 先检查预设主题
        const preset = PRESET_THEMES[themeName];
        if (preset) {
            this.settings = { ...this.settings, ...preset };
            this.applySettings();
            this.saveSettings();
            return;
        }
        // 检查自定义主题
        const customThemes = this.getCustomThemes();
        const custom = customThemes[themeName];
        if (custom) {
            this.settings = { ...this.settings, ...custom, mode: themeName };
            this.applySettings();
            this.saveSettings();
        }
    }

    getCustomThemes() {
        try {
            return JSON.parse(localStorage.getItem('todoApp_customThemes')) || {};
        } catch { return {}; }
    }

    saveCustomTheme(name, colorFrom, colorTo) {
        const customs = this.getCustomThemes();
        customs[name] = {
            primaryColor: colorFrom,
            headerFrom: colorFrom,
            headerTo: colorTo,
            mode: name
        };
        localStorage.setItem('todoApp_customThemes', JSON.stringify(customs));
    }

    deleteCustomTheme(name) {
        const customs = this.getCustomThemes();
        delete customs[name];
        localStorage.setItem('todoApp_customThemes', JSON.stringify(customs));
    }

    renderCustomThemes() {
        const container = document.getElementById('themePresets');
        if (!container) return;
        // 移除旧的自定义主题
        container.querySelectorAll('.theme-preset.custom').forEach(el => el.remove());

        const customs = this.getCustomThemes();
        Object.entries(customs).forEach(([name, theme]) => {
            const div = document.createElement('div');
            div.className = 'theme-preset custom';
            div.dataset.theme = name;
            div.style.background = `linear-gradient(135deg, ${theme.headerFrom}, ${theme.headerTo})`;
            div.innerHTML = `
                <span>${name}</span>
                <span class="delete-theme-btn" data-theme="${name}">✕</span>
            `;
            container.appendChild(div);
        });
    }
}

// ==================== 认证管理器 ====================
class AuthManager {
    constructor() {
        this.token = localStorage.getItem(TOKEN_KEY);
        this.username = localStorage.getItem(USER_KEY);
    }

    isLoggedIn() {
        return !!this.token && !!this.username;
    }

    async register(username, password, email) {
        const users = getUsers();
        if (users[username]) {
            throw new Error('用户名已存在');
        }

        users[username] = {
            password: hashPassword(password),
            email: email || '',
            createdAt: new Date().toISOString(),
            tasks: [],
            categories: ['默认']
        };
        saveUsers(users);

        this.token = createToken(username);
        this.username = username;
        localStorage.setItem(TOKEN_KEY, this.token);
        localStorage.setItem(USER_KEY, username);

        return { username };
    }

    async login(username, password) {
        const users = getUsers();
        const user = users[username];

        if (!user || user.password !== hashPassword(password)) {
            throw new Error('用户名或密码错误');
        }

        this.token = createToken(username);
        this.username = username;
        localStorage.setItem(TOKEN_KEY, this.token);
        localStorage.setItem(USER_KEY, username);

        return { username };
    }

    logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        this.token = null;
        this.username = null;
        location.reload();
    }

    // 通过邮箱重置密码
    async resetPassword(username, email, newPassword) {
        const users = getUsers();
        const user = users[username];

        if (!user) {
            throw new Error('用户名不存在');
        }
        if (!user.email) {
            throw new Error('该账号未绑定邮箱，无法找回密码');
        }
        if (user.email.toLowerCase() !== email.toLowerCase()) {
            throw new Error('邮箱与绑定的邮箱不一致');
        }

        // 更新密码
        user.password = hashPassword(newPassword);
        saveUsers(users);

        return { message: '密码重置成功' };
    }
}

// ==================== 待办事项管理器 ====================
class TodoManager {
    constructor() {
        this.auth = new AuthManager();
        this.tasks = [];
        this.categories = ['默认'];
        this.currentFilter = 'all';
        this.currentCategory = 'all';
        this.currentSort = 'date';
        this.selectedTasks = new Set();
        this.nextId = 1;
        this.init();
    }

    async init() {
        this.setupAuthUI();

        if (this.auth.isLoggedIn()) {
            this.loadUserData();
            this.showMainApp();
        } else {
            this.showAuth();
        }
    }

    loadUserData() {
        const users = getUsers();
        const user = users[this.auth.username];
        if (user) {
            this.tasks = user.tasks || [];
            this.categories = user.categories && user.categories.length > 0 ? user.categories : ['默认'];
            this.calculateNextId();
        }
    }

    saveUserData() {
        const users = getUsers();
        if (users[this.auth.username]) {
            users[this.auth.username].tasks = this.tasks;
            users[this.auth.username].categories = this.categories;
            saveUsers(users);
        }
    }

    calculateNextId() {
        if (this.tasks.length > 0) {
            this.nextId = Math.max(...this.tasks.map(t => t.id)) + 1;
        } else {
            this.nextId = 1;
        }
    }

    // ==================== 认证UI ====================
    setupAuthUI() {
        // 切换到注册
        document.getElementById('showRegister')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('registerForm').classList.remove('hidden');
            document.getElementById('forgotForm').classList.add('hidden');
            this.clearAuthError();
        });

        // 切换到登录
        document.getElementById('showLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('registerForm').classList.add('hidden');
            document.getElementById('forgotForm').classList.add('hidden');
            document.getElementById('loginForm').classList.remove('hidden');
            this.clearAuthError();
        });

        // 切换到忘记密码
        document.getElementById('showForgot')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('registerForm').classList.add('hidden');
            document.getElementById('forgotForm').classList.remove('hidden');
            this.clearAuthError();
        });

        // 从忘记密码返回登录
        document.getElementById('showLoginFromForgot')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('forgotForm').classList.add('hidden');
            document.getElementById('registerForm').classList.add('hidden');
            document.getElementById('loginForm').classList.remove('hidden');
            this.clearAuthError();
        });

        document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            try {
                this.setAuthLoading(true);
                await this.auth.login(username, password);
                this.loadUserData();
                this.showMainApp();
                this.clearAuthError();
            } catch (err) {
                this.showAuthError(err.message);
            } finally {
                this.setAuthLoading(false);
            }
        });

        document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('regUsername').value.trim();
            const password = document.getElementById('regPassword').value;
            const confirm = document.getElementById('regPasswordConfirm').value;
            const email = document.getElementById('regEmail').value.trim();

            if (username.length < 2 || username.length > 20) {
                return this.showAuthError('用户名长度应为2-20个字符');
            }
            if (password.length < 6) {
                return this.showAuthError('密码长度至少6位');
            }
            if (password !== confirm) {
                return this.showAuthError('两次密码输入不一致');
            }
            // 验证邮箱格式（如果填写了）
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return this.showAuthError('邮箱格式不正确');
            }

            try {
                this.setAuthLoading(true);
                await this.auth.register(username, password, email);
                this.loadUserData();
                this.showMainApp();
                this.clearAuthError();
            } catch (err) {
                this.showAuthError(err.message);
            } finally {
                this.setAuthLoading(false);
            }
        });

        // 忘记密码表单提交
        document.getElementById('forgotForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('forgotUsername').value.trim();
            const email = document.getElementById('forgotEmail').value.trim();
            const newPassword = document.getElementById('forgotNewPassword').value;

            if (!username || !email) {
                return this.showAuthError('请填写用户名和邮箱');
            }
            if (newPassword.length < 6) {
                return this.showAuthError('新密码长度至少6位');
            }

            try {
                this.setAuthLoading(true);
                await this.auth.resetPassword(username, email, newPassword);
                this.clearAuthError();
                this.showAuthError('密码重置成功！请使用新密码登录');
                // 清空表单
                document.getElementById('forgotUsername').value = '';
                document.getElementById('forgotEmail').value = '';
                document.getElementById('forgotNewPassword').value = '';
                // 2秒后返回登录
                setTimeout(() => {
                    document.getElementById('forgotForm').classList.add('hidden');
                    document.getElementById('loginForm').classList.remove('hidden');
                }, 2000);
            } catch (err) {
                this.showAuthError(err.message);
            } finally {
                this.setAuthLoading(false);
            }
        });

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.auth.logout();
        });
    }

    showAuth() {
        document.getElementById('authContainer')?.classList.remove('hidden');
        const ws = document.getElementById('workspace');
        if (ws) ws.classList.add('hidden');
        const panel = document.getElementById('todoPanel');
        if (panel) panel.classList.add('hidden');
        this.initDynamicBackground();
    }

    showMainApp() {
        document.getElementById('authContainer')?.classList.add('hidden');
        const ws = document.getElementById('workspace');
        if (ws) ws.classList.remove('hidden');
        const el = document.getElementById('currentUsername');
        if (el) el.textContent = this.auth.username.charAt(0).toUpperCase();
        const heroEl = document.getElementById('heroUsername');
        if (heroEl) heroEl.textContent = this.auth.username;
        this.theme = new ThemeManager();
        this.setupEventListeners();
        this.renderCategories();
        this.updateUI();
        this.setupDragAndDrop();
        this.setupSettingsUI();
        this.updateTodoBadge();
        // 隐藏动态背景
        const canvas = document.getElementById('dynamicBgCanvas');
        if (canvas) canvas.style.display = 'none';
    }

    // ==================== 工具面板 ====================
    openTool(name) {
        const panel = document.getElementById('todoPanel');
        const workspace = document.getElementById('workspace');
        if (panel && workspace) {
            workspace.style.display = 'none';
            panel.classList.remove('hidden');
            this.renderTasks();
            this.renderCategories();
            this.updateUI();
        }
    }

    closeTool() {
        const panel = document.getElementById('todoPanel');
        const workspace = document.getElementById('workspace');
        if (panel && workspace) {
            panel.classList.add('hidden');
            workspace.style.display = 'block';
            this.updateTodoBadge();
        }
    }

    showComingSoon() {
        this.showNotification('该功能即将推出，敬请期待！', 'info');
    }

    updateTodoBadge() {
        const badge = document.getElementById('todoBadge');
        if (badge) {
            const count = this.tasks.filter(t => !t.completed).length;
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    // ==================== 动态背景 ====================
    initDynamicBackground() {
        const canvas = document.getElementById('dynamicBgCanvas');
        if (!canvas) return;
        if (this._bgAnimationId) cancelAnimationFrame(this._bgAnimationId);
        if (this._bgCleanup) this._bgCleanup();
        canvas.style.display = 'block';
        const ctx = canvas.getContext('2d');
        let animationId = null;
        let particles = [];
        let mouseX = -1000, mouseY = -1000;
        let seasonIndex = 0;
        let transitionProgress = 0;
        const SEASON_DURATION = 3 * 60 * 1000;
        const TRANSITION_DURATION = 2000;
        let seasonStartTime = Date.now();
        let nextParticles = [];
        const SEASONS = [
            { name:'Spring', colors:['#fce4ec','#f8bbd0','#f48fb1','#e1bee7'], bgTop:'#2d1b4e', bgBottom:'#1a1a2e', count:50 },
            { name:'Summer', colors:['#bbdefb','#90caf9','#64b5f6','#4fc3f7'], bgTop:'#0d2b4e', bgBottom:'#0a1929', count:40 },
            { name:'Autumn', colors:['#ffcc80','#ffb74d','#ffa726','#ff8a65'], bgTop:'#3e2723', bgBottom:'#1a1a1a', count:60 },
            { name:'Winter', colors:['#e3f2fd','#bbdefb','#90caf9','#f8fdff'], bgTop:'#1a237e', bgBottom:'#0d1b2a', count:70 }
        ];
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        resize();
        const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        const onMouseMove = (e) => { mouseX = e.clientX; mouseY = e.clientY; };
        window.addEventListener('resize', onResize);
        document.addEventListener('mousemove', onMouseMove);
        function createParticles(count, season) {
            const arr = [];
            for (let i = 0; i < count; i++) {
                arr.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, size:Math.random()*3+1.5, speedX:(Math.random()-0.5)*0.8, speedY:Math.random()*0.4+0.2, opacity:Math.random()*0.5+0.3, color:season.colors[Math.floor(Math.random()*season.colors.length)], rotation:Math.random()*6.28, rotSpeed:(Math.random()-0.5)*0.03, sway:Math.random()*6.28, swaySpeed:Math.random()*0.015+0.008 });
            }
            return arr;
        }
        function updateParticles(ps) {
            for (const p of ps) {
                if (seasonIndex === 0) { p.x += Math.sin(p.sway)*0.4+p.speedX*0.4; p.y += p.speedY+Math.cos(p.sway)*0.2; p.sway += p.swaySpeed; p.rotation += p.rotSpeed; }
                else if (seasonIndex === 1) { p.x += Math.sin(p.sway)*0.2; p.y -= p.speedY*0.6; p.sway += p.swaySpeed*2; p.opacity = 0.3+Math.sin(p.sway)*0.3; if(p.y<-10){p.y=canvas.height+10;p.x=Math.random()*canvas.width;} }
                else if (seasonIndex === 2) { p.x += p.speedX+Math.sin(p.sway)*0.6; p.y += p.speedY+Math.cos(p.sway)*0.3; p.sway += p.swaySpeed*2.5; p.rotation += p.rotSpeed*1.5; }
                else { p.x += Math.sin(p.sway)*0.4; p.y += p.speedY*0.5; p.sway += p.swaySpeed*1.5; p.rotation += p.rotSpeed*0.4; }
                if(seasonIndex!==1){if(p.y>canvas.height+10){p.y=-10;p.x=Math.random()*canvas.width;}if(p.x<-10)p.x=canvas.width+10;if(p.x>canvas.width+10)p.x=-10;}
                const dx=p.x-mouseX,dy=p.y-mouseY,dist=Math.sqrt(dx*dx+dy*dy);
                if(dist<100&&dist>0){const f=(100-dist)/100;p.x+=(dx/dist)*f;p.opacity=Math.min(p.opacity+f*0.2,0.9);}
            }
        }
        function drawPsects(ps, alpha) {
            ctx.globalAlpha = alpha;
            for (const p of ps) {
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation);
                if (seasonIndex === 3) { ctx.beginPath(); for(let i=0;i<6;i++){ctx.moveTo(0,0);ctx.lineTo(0,-p.size*2);ctx.rotate(Math.PI/3);} ctx.strokeStyle=p.color; ctx.lineWidth=0.7; ctx.globalAlpha=alpha*p.opacity; ctx.stroke(); }
                else if (seasonIndex === 0) { ctx.fillStyle=p.color; ctx.globalAlpha=alpha*p.opacity; ctx.beginPath(); ctx.ellipse(0,0,p.size*1.5,p.size,0,0,Math.PI*2); ctx.fill(); }
                else if (seasonIndex === 2) { ctx.fillStyle=p.color; ctx.globalAlpha=alpha*p.opacity; ctx.beginPath(); for(let i=0;i<5;i++){const a=(i*2*Math.PI/5)-Math.PI/2;const r=p.size*1.2;if(i===0)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);} ctx.closePath(); ctx.fill(); }
                else { const g=ctx.createRadialGradient(0,0,0,0,0,p.size*3); g.addColorStop(0,p.color); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.globalAlpha=alpha*p.opacity; ctx.beginPath(); ctx.arc(0,0,p.size*3,0,Math.PI*2); ctx.fill(); }
                ctx.restore();
            }
            ctx.globalAlpha = 1;
        }
        function drawScene() {
            const elapsed = Date.now() - seasonStartTime;
            if (elapsed >= SEASON_DURATION) { if (transitionProgress < 1) { transitionProgress += 16.67 / TRANSITION_DURATION; if (transitionProgress >= 1) { seasonIndex = (seasonIndex+1)%4; seasonStartTime = Date.now(); transitionProgress = 0; particles = nextParticles.length ? nextParticles : createParticles(SEASONS[seasonIndex].count, SEASONS[seasonIndex]); nextParticles = []; } } }
            if (elapsed > SEASON_DURATION - TRANSITION_DURATION && nextParticles.length === 0) { nextParticles = createParticles(SEASONS[(seasonIndex+1)%4].count, SEASONS[(seasonIndex+1)%4]); }
            ctx.clearRect(0,0,canvas.width,canvas.height);
            const grad = ctx.createLinearGradient(0,0,canvas.width,canvas.height); grad.addColorStop(0,SEASONS[seasonIndex].bgTop); grad.addColorStop(1,SEASONS[seasonIndex].bgBottom); ctx.fillStyle=grad; ctx.fillRect(0,0,canvas.width,canvas.height);
            drawPsects(particles, transitionProgress>0?1-transitionProgress:1);
            if(transitionProgress>0&&nextParticles.length>0) drawPsects(nextParticles, transitionProgress);
            updateParticles(particles); if(nextParticles.length>0) updateParticles(nextParticles);
            animationId = requestAnimationFrame(drawScene);
        }
        particles = createParticles(SEASONS[0].count, SEASONS[0]); drawScene();
        this._bgCleanup = () => { if (animationId) cancelAnimationFrame(animationId); window.removeEventListener('resize', onResize); document.removeEventListener('mousemove', onMouseMove); };
    }


    // ==================== 内容隐藏/显示 ====================
    setupToggleContent() {
        const container = document.getElementById('mainApp');
        const toggleBtn = document.getElementById('toggleContentBtn');

        // 创建恢复按钮
        let restoreBtn = document.getElementById('contentRestoreBtn');
        if (!restoreBtn) {
            restoreBtn = document.createElement('button');
            restoreBtn.id = 'contentRestoreBtn';
            restoreBtn.className = 'content-restore-hint';
            restoreBtn.innerHTML = '👁️';
            restoreBtn.title = '显示内容';
            document.body.appendChild(restoreBtn);
        }

        const toggleContent = () => {
            const isHidden = container.classList.contains('content-hidden');
            if (isHidden) {
                container.classList.remove('content-hidden');
                toggleBtn.innerHTML = '👁️';
            } else {
                container.classList.add('content-hidden');
                toggleBtn.innerHTML = '👁️‍🗨️';
            }
        };

        toggleBtn?.addEventListener('click', toggleContent);
        restoreBtn?.addEventListener('click', toggleContent);
    }

    // ==================== 设置面板 ====================
    setupSettingsUI() {
        // 打开/关闭设置面板
        document.getElementById('openSettingsBtn')?.addEventListener('click', () => {
            this.openSettings();
        });
        document.getElementById('closeSettingsBtn')?.addEventListener('click', () => {
            document.getElementById('settingsModal').classList.add('hidden');
        });

        // 点击模态框背景关闭
        document.getElementById('settingsModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') {
                document.getElementById('settingsModal').classList.add('hidden');
            }
        });

        // 预设主题点击
        document.getElementById('themePresets')?.addEventListener('click', (e) => {
            // 删除自定义主题
            const delBtn = e.target.closest('.delete-theme-btn');
            if (delBtn) {
                e.stopPropagation();
                const themeName = delBtn.dataset.theme;
                if (confirm(`确定要删除主题"${themeName}"吗？`)) {
                    this.theme.deleteCustomTheme(themeName);
                    this.theme.renderCustomThemes();
                    this.showNotification('主题已删除', 'info');
                }
                return;
            }

            const preset = e.target.closest('.theme-preset');
            if (preset) {
                document.querySelectorAll('.theme-preset').forEach(p => p.classList.remove('active'));
                preset.classList.add('active');
                this.theme.setPreset(preset.dataset.theme);
                this.syncSettingsUI();
                this.showNotification('主题已切换', 'success');
            }
        });

        // 添加自定义主题
        document.getElementById('addCustomThemeBtn')?.addEventListener('click', () => {
            document.getElementById('customThemeModal').classList.remove('hidden');
            this.updateCustomPreview();
        });

        // 关闭自定义主题模态框
        document.getElementById('closeCustomThemeBtn')?.addEventListener('click', () => {
            document.getElementById('customThemeModal').classList.add('hidden');
        });
        document.getElementById('cancelCustomThemeBtn')?.addEventListener('click', () => {
            document.getElementById('customThemeModal').classList.add('hidden');
        });
        document.getElementById('customThemeModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'customThemeModal') {
                document.getElementById('customThemeModal').classList.add('hidden');
            }
        });

        // 自定义主题颜色变化时更新预览
        document.getElementById('customColorFrom')?.addEventListener('input', () => this.updateCustomPreview());
        document.getElementById('customColorTo')?.addEventListener('input', () => this.updateCustomPreview());

        // 保存自定义主题
        document.getElementById('saveCustomThemeBtn')?.addEventListener('click', () => {
            const name = document.getElementById('customThemeName').value.trim();
            const from = document.getElementById('customColorFrom').value;
            const to = document.getElementById('customColorTo').value;

            if (!name) return this.showAuthError('请输入主题名称');

            this.theme.saveCustomTheme(name, from, to);
            this.theme.renderCustomThemes();
            document.getElementById('customThemeModal').classList.add('hidden');
            document.getElementById('customThemeName').value = '';
            this.showNotification(`主题"${name}"已创建`, 'success');
        });

        // 主色调选择
        document.getElementById('primaryColorPicker')?.addEventListener('input', (e) => {
            this.theme.setPrimaryColor(e.target.value);
            document.getElementById('primaryColorValue').textContent = e.target.value;
        });

        // 背景色选择
        document.getElementById('bgColorPicker')?.addEventListener('input', (e) => {
            this.theme.setBgColor(e.target.value);
            const overlay = document.getElementById('custom-bg-overlay');
            if (overlay) {
                overlay.style.background = e.target.value + 'd9';
            }
            document.getElementById('bgColorValue').textContent = e.target.value;
        });

        // 背景图片上传
        document.getElementById('uploadBgBtn')?.addEventListener('click', () => {
            document.getElementById('bgImageInput')?.click();
        });

        document.getElementById('bgImageInput')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const isVideo = file.type.startsWith('video/');
            const fileType = file.type;

            if (isVideo) {
                // 视频：使用 Data URL 存储到 IndexedDB
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const videoId = 'bg_' + Date.now();
                    // 存储为 Data URL 字符串
                    await saveVideoToIndexedDB(videoId, ev.target.result);
                    this.theme.settings.bgVideoId = videoId;
                    this.theme.settings.bgImage = '';
                    this.theme.applySettings();
                    this.theme.saveSettings();
                    // 显示预览
                    const preview = document.getElementById('bgVideoPreview');
                    if (preview) {
                        preview.classList.remove('hidden');
                        preview.src = ev.target.result;
                    }
                    const imgPreview = document.getElementById('bgImagePreview');
                    if (imgPreview) imgPreview.style.display = 'none';
                    document.getElementById('removeBgBtn')?.classList.remove('hidden');
                    this.showNotification('背景视频已设置，声音已开启', 'success');
                };
                reader.readAsDataURL(file);
            } else {
                // 图片直接存localStorage
                const reader = new FileReader();
                reader.onload = (ev) => {
                    this.theme.settings.bgVideoId = '';
                    this.theme.setBgImage(ev.target.result);
                    this.updateBgPreview(ev.target.result);
                    document.getElementById('bgVideoPreview')?.classList.add('hidden');
                    document.getElementById('removeBgBtn')?.classList.remove('hidden');
                    this.showNotification('背景图片已设置', 'success');
                };
                reader.readAsDataURL(file);
            }
            e.target.value = '';
        });

        // 移除背景图片/视频 - 彻底停止并清理
        document.getElementById('removeBgBtn')?.addEventListener('click', async () => {
            // 先停止并移除视频元素（这是停止声音的关键）
            const bgVideo = document.getElementById('custom-bg-video');
            if (bgVideo) {
                bgVideo.pause();
                bgVideo.removeAttribute('src');
                bgVideo.src = '';
                bgVideo.load();
                bgVideo.remove();
            }
            // 删除IndexedDB中的视频
            if (this.theme.settings.bgVideoId) {
                await deleteVideoFromIndexedDB(this.theme.settings.bgVideoId);
            }
            this.theme.settings.bgVideoId = '';
            this.theme.removeBgImage();
            // 清理预览
            const imgPreview = document.getElementById('bgImagePreview');
            if (imgPreview) { imgPreview.style.backgroundImage = ''; imgPreview.style.display = 'none'; }
            const vidPreview = document.getElementById('bgVideoPreview');
            if (vidPreview) { vidPreview.classList.add('hidden'); vidPreview.src = ''; }
            const removeBtn = document.getElementById('removeBgBtn');
            if (removeBtn) removeBtn.classList.add('hidden');
            // 显示动态背景
            const canvas = document.getElementById('dynamicBgCanvas');
            if (canvas) canvas.style.display = 'block';
            this.showNotification('背景已移除，声音已停止', 'info');
        });

        // 背景透明度
        document.getElementById('bgOpacity')?.addEventListener('input', (e) => {
            this.theme.settings.bgOpacity = parseInt(e.target.value);
            document.getElementById('bgOpacityValue').textContent = e.target.value + '%';
            this.theme.applySettings();
            this.theme.saveSettings();
        });

        // 背景模糊度
        document.getElementById('bgBlur')?.addEventListener('input', (e) => {
            this.theme.settings.bgBlur = parseInt(e.target.value);
            document.getElementById('bgBlurValue').textContent = e.target.value + 'px';
            this.theme.applySettings();
            this.theme.saveSettings();
        });

        // 效果选项
        document.getElementById('glassEffect')?.addEventListener('change', (e) => {
            this.theme.settings.glassEffect = e.target.checked;
            this.theme.applySettings();
            this.theme.saveSettings();
        });
        document.getElementById('shadowEffect')?.addEventListener('change', (e) => {
            this.theme.settings.shadowEffect = e.target.checked;
            this.theme.applySettings();
            this.theme.saveSettings();
        });
        document.getElementById('animationEffect')?.addEventListener('change', (e) => {
            this.theme.settings.animationEffect = e.target.checked;
            this.theme.applySettings();
            this.theme.saveSettings();
        });

        // 字体大小
        document.getElementById('fontSize')?.addEventListener('input', (e) => {
            this.theme.settings.fontSize = parseInt(e.target.value);
            document.getElementById('fontSizeValue').textContent = e.target.value + '%';
            this.theme.applySettings();
            this.theme.saveSettings();
        });

        // 保存/重置
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
            this.theme.saveSettings();
            document.getElementById('settingsModal').classList.add('hidden');
            this.showNotification('设置已保存', 'success');
        });
        document.getElementById('resetSettingsBtn')?.addEventListener('click', () => {
            this.theme.resetSettings();
            this.syncSettingsUI();
            this.showNotification('已恢复默认设置', 'info');
        });
    }

    openSettings() {
        this.theme.renderCustomThemes();
        this.syncSettingsUI();
        document.getElementById('settingsModal').classList.remove('hidden');
    }

    updateCustomPreview() {
        const from = document.getElementById('customColorFrom')?.value || '#667eea';
        const to = document.getElementById('customColorTo')?.value || '#764ba2';
        const preview = document.getElementById('customThemePreview');
        if (preview) {
            preview.style.background = `linear-gradient(135deg, ${from}, ${to})`;
        }
    }

    syncSettingsUI() {
        const s = this.theme.settings;
        // 同步颜色选择器
        const primaryPicker = document.getElementById('primaryColorPicker');
        if (primaryPicker) primaryPicker.value = s.primaryColor;
        const primaryValue = document.getElementById('primaryColorValue');
        if (primaryValue) primaryValue.textContent = s.primaryColor;

        const bgPicker = document.getElementById('bgColorPicker');
        if (bgPicker) bgPicker.value = s.bgColor || '#0f172a';
        const bgValue = document.getElementById('bgColorValue');
        if (bgValue) bgValue.textContent = s.bgColor || '#0f172a';

        // 同步预设主题选中
        document.querySelectorAll('.theme-preset').forEach(p => {
            p.classList.toggle('active', p.dataset.theme === s.mode);
        });

        // 同步背景预览
        if (s.bgVideoId) {
            document.getElementById('bgVideoPreview').classList.remove('hidden');
            document.getElementById('bgImagePreview').style.display = 'none';
            document.getElementById('removeBgBtn').classList.remove('hidden');
            getVideoFromIndexedDB(s.bgVideoId).then(data => {
                if (data) {
                    document.getElementById('bgVideoPreview').src = data;
                }
            });
        } else if (s.bgImage) {
            this.updateBgPreview(s.bgImage);
            document.getElementById('bgVideoPreview').classList.add('hidden');
            document.getElementById('removeBgBtn').classList.remove('hidden');
        }

        // 同步滑块
        const bgOpacity = document.getElementById('bgOpacity');
        if (bgOpacity) { bgOpacity.value = s.bgOpacity; document.getElementById('bgOpacityValue').textContent = s.bgOpacity + '%'; }
        const bgBlur = document.getElementById('bgBlur');
        if (bgBlur) { bgBlur.value = s.bgBlur; document.getElementById('bgBlurValue').textContent = s.bgBlur + 'px'; }
        const fontSize = document.getElementById('fontSize');
        if (fontSize) { fontSize.value = s.fontSize; document.getElementById('fontSizeValue').textContent = s.fontSize + '%'; }

        // 同步复选框
        const glass = document.getElementById('glassEffect');
        if (glass) glass.checked = s.glassEffect;
        const shadow = document.getElementById('shadowEffect');
        if (shadow) shadow.checked = s.shadowEffect;
        const anim = document.getElementById('animationEffect');
        if (anim) anim.checked = s.animationEffect;
    }

    updateBgPreview(imageData) {
        const preview = document.getElementById('bgImagePreview');
        if (preview) {
            preview.style.display = 'block';
            preview.style.backgroundImage = `url('${imageData}')`;
        }
    }

    showAuthError(msg) {
        const el = document.getElementById('authError');
        if (el) {
            el.textContent = msg;
            el.classList.add('show');
        }
    }

    clearAuthError() {
        const el = document.getElementById('authError');
        if (el) {
            el.textContent = '';
            el.classList.remove('show');
        }
    }

    setAuthLoading(loading) {
        document.querySelectorAll('.auth-btn').forEach(btn => {
            btn.disabled = loading;
            btn.textContent = loading ? '处理中...' : (btn.classList.contains('login-btn') ? '登录' : '注册');
        });
    }

    // ==================== 事件监听 ====================
    setupEventListeners() {
        document.getElementById('addTaskBtn')?.addEventListener('click', () => this.addTask());
        document.getElementById('taskInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTask();
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.renderTasks();
            });
        });

        document.getElementById('filterCategory')?.addEventListener('change', (e) => {
            this.currentCategory = e.target.value;
            this.renderCategories();
            this.renderTasks();
            this.updateActionButtons();
        });

        document.getElementById('sortSelect')?.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.renderTasks();
        });

        document.getElementById('addCategoryBtn')?.addEventListener('click', () => this.addCategory());
        document.getElementById('categoryInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addCategory();
        });

        document.getElementById('selectAllBtn')?.addEventListener('click', () => this.toggleSelectAll());
        document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
        document.getElementById('clearCompletedBtn')?.addEventListener('click', () => this.clearCompleted());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportData());
        document.getElementById('exportImageBtn')?.addEventListener('click', () => this.exportImage());
        document.getElementById('importBtn')?.addEventListener('click', () => {
            document.getElementById('fileInput')?.click();
        });
        document.getElementById('fileInput')?.addEventListener('change', (e) => this.importData(e));

        document.getElementById('categoryList')?.addEventListener('click', (e) => {
            const tag = e.target.closest('.category-tag');
            if (tag) {
                this.currentCategory = tag.dataset.category;
                this.renderCategories();
                this.renderTasks();
                this.updateActionButtons();
            }
            const delBtn = e.target.closest('.delete-btn');
            if (delBtn) {
                e.stopPropagation();
                const cat = delBtn.closest('.category-tag').dataset.category;
                if (cat && cat !== '全部') this.deleteCategory(cat);
            }
        });

        // AI功能事件监听
        document.getElementById('breakDownBtn')?.addEventListener('click', () => this.showBreakdownModal());
        document.getElementById('generateReportBtn')?.addEventListener('click', () => this.showDailyReport());

        // 初始化AI建议
        this.updateAISuggestions();
    }

    // 显示任务分解模态框
    async showBreakdownModal() {
        const title = document.getElementById('taskInput')?.value.trim();
        if (!title) {
            this.showNotification('请先输入任务标题', 'warning');
            return;
        }

        let modal = document.getElementById('breakdownModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'breakdownModal';
            modal.className = 'modal';
            modal.innerHTML = '<div class="modal-content"><div class="modal-header"><h3>🔨 AI任务分解</h3><button class="modal-close-btn" onclick="document.getElementById(\'breakdownModal\').classList.add(\'hidden\')">✕</button></div><div class="modal-body"><div class="breakdown-steps" id="breakdownSteps"></div></div><div class="modal-footer"><button class="modal-cancel-btn" onclick="document.getElementById(\'breakdownModal\').classList.add(\'hidden\')">关闭</button><button class="modal-save-btn" id="addBreakdownTasks">添加为子任务</button></div></div>';
            document.body.appendChild(modal);
        }

        modal.classList.remove('hidden');
        const stepsContainer = document.getElementById('breakdownSteps');
        stepsContainer.innerHTML = '<p style="color:#94a3b8;">🤖 AI正在分析...</p>';

        const steps = await this.breakTaskDown(title);
        const times = await Promise.all(steps.map(() => this.estimateTaskTime(title, 'medium')));

        stepsContainer.innerHTML = steps.map((step, i) => '<div class="breakdown-step"><div class="step-number">' + (i + 1) + '</div><div class="step-text">' + step + '</div><div class="step-time">' + (times[i] || '30分钟') + '</div></div>').join('');

        document.getElementById('addBreakdownTasks').onclick = () => {
            steps.forEach((step) => {
                this.tasks.push({ id: this.nextId++, title: step, content: '', priority: 'medium', category: '默认', completed: false, createdAt: new Date().toISOString() });
            });
            this.saveUserData();
            this.updateUI();
            modal.classList.add('hidden');
            this.showNotification('已添加 ' + steps.length + ' 个子任务', 'success');
        };
    }

    // 显示日报模态框
    showDailyReport() {
        let modal = document.getElementById('reportModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'reportModal';
            modal.className = 'modal';
            modal.innerHTML = '<div class="modal-content"><div class="modal-header"><h3>📋 AI日报</h3><button class="modal-close-btn" onclick="document.getElementById(\'reportModal\').classList.add(\'hidden\')">✕</button></div><div class="modal-body"><div class="report-content" id="reportContent"></div><div class="report-actions"><button class="copy-report-btn" id="copyReportBtn">📋 复制日报</button><button class="close-report-btn" onclick="document.getElementById(\'reportModal\').classList.add(\'hidden\')">关闭</button></div></div></div>';
            document.body.appendChild(modal);
            document.getElementById('copyReportBtn').onclick = () => {
                const content = document.getElementById('reportContent').textContent;
                navigator.clipboard.writeText(content).then(() => this.showNotification('日报已复制', 'success'));
            };
        }
        modal.classList.remove('hidden');
        document.getElementById('reportContent').textContent = this.generateDailyReport();
    }

    // 更新AI建议
    updateAISuggestions() {
        const container = document.getElementById('aiSuggestions');
        if (!container) return;
        const suggestions = this.getAISuggestions();
        container.innerHTML = suggestions.map(s => '<div class="ai-suggestion-item">' + s + '</div>').join('');
    }

    // ==================== 拖拽功能 ====================
    setupDragAndDrop() {
        const taskList = document.getElementById('taskList');
        if (!taskList) return;
        let draggedItem = null;

        taskList.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('task-item')) {
                draggedItem = e.target;
                e.target.style.opacity = '0.5';
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        taskList.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('task-item')) {
                e.target.style.opacity = '';
                e.target.classList.remove('dragging');
            }
            draggedItem = null;
        });

        taskList.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        taskList.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedItem) {
                const afterElement = this.getDragAfterElement(taskList, e.clientY);
                if (afterElement == null) {
                    taskList.appendChild(draggedItem);
                } else {
                    taskList.insertBefore(draggedItem, afterElement);
                }
                const newOrderIds = Array.from(taskList.querySelectorAll('.task-item')).map(el => parseInt(el.dataset.id));
                this.tasks.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));
                this.saveUserData();
                this.updateUI();
            }
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            }
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // ==================== 任务操作 ====================
    async addTask() {
        const taskInput = document.getElementById('taskInput');
        const prioritySelect = document.getElementById('prioritySelect');
        const dueDateInput = document.getElementById('dueDateInput');
        const categorySelect = document.getElementById('categorySelect');

        const title = taskInput.value.trim();
        if (!title) {
            this.showNotification('请输入任务标题', 'error');
            return;
        }

        this.showNotification('🤖 AI正在分析任务...', 'info');
        const addBtn = document.getElementById('addTaskBtn');
        const originalText = addBtn.textContent;
        addBtn.textContent = '⏳ 分析中...';
        addBtn.disabled = true;

        let aiResult = null;
        try {
            aiResult = await this.analyzeTaskWithAI(title);
        } catch (err) {
            console.log('AI分析失败，使用规则分析:', err.message);
            aiResult = this.analyzeTaskWithRules(title);
        }

        if (aiResult) {
            if (aiResult.category) categorySelect.value = aiResult.category;
            if (aiResult.priority) prioritySelect.value = aiResult.priority;
        }

        const task = {
            id: this.nextId++,
            title,
            content: '',
            priority: prioritySelect.value,
            dueDate: dueDateInput.value,
            category: categorySelect.value || '默认',
            completed: false,
            createdAt: new Date().toISOString()
        };

        this.tasks.push(task);
        if (!this.categories.includes(task.category)) {
            this.categories.push(task.category);
        }

        this.saveUserData();
        this.updateUI();

        taskInput.value = '';
        dueDateInput.value = '';
        addBtn.textContent = originalText;
        addBtn.disabled = false;

        if (aiResult) {
            this.showNotification('✅ AI建议: ' + aiResult.category + ' - ' + this.getPriorityText(aiResult.priority), 'success');
        } else {
            this.showNotification('任务添加成功！', 'success');
        }
    }

    async analyzeTaskWithAI(title) {
        const API_KEY = localStorage.getItem('ai_api_key');
        if (!API_KEY || API_KEY === '') {
            return this.analyzeTaskWithRules(title);
        }

        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + API_KEY
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: '你是一个任务管理助手。分析用户输入的任务标题，返回JSON格式的分类和优先级。分类选项：工作、学习、生活、购物、健康、娱乐、社交、其他。优先级选项：high、medium、low。只返回JSON，不要其他文字。格式：{"category":"xxx","priority":"xxx"}' },
                        { role: 'user', content: title }
                    ],
                    temperature: 0.3,
                    max_tokens: 100
                })
            });

            if (!response.ok) throw new Error('API请求失败');
            const data = await response.json();
            const content = data.choices[0]?.message?.content?.trim();
            if (content) {
                const jsonMatch = content.match(/\{[^}]+\}/);
                if (jsonMatch) return JSON.parse(jsonMatch[0]);
            }
        } catch (err) {
            throw new Error(err.message);
        }
        return null;
    }

    analyzeTaskWithRules(title) {
        const t = title.toLowerCase();
        const categoryRules = {
            '工作': ['会议', '报告', '项目', '客户', '邮件', '办公', '加班', 'deadline', '截止日期', 'ppt', 'excel', '文档'],
            '学习': ['学习', '课程', '考试', '读书', '笔记', '作业', '论文', '研究', '培训', '上课', '背单词', '复习'],
            '生活': ['买菜', '做饭', '打扫', '洗衣', '整理', '缴费', '水电', '物业', '维修', '搬家'],
            '购物': ['买', '购物', '下单', '快递', '淘宝', '京东', '拼多多', '外卖', '商品'],
            '健康': ['运动', '跑步', '健身', '锻炼', '吃药', '医院', '体检', '睡觉', '早起', '减肥'],
            '娱乐': ['电影', '游戏', '音乐', '视频', '旅行', '聚会', '逛街', '唱歌', '打球'],
            '社交': ['聚会', '约会', '朋友', '亲戚', '拜访', '聚餐', '婚礼', '生日', '节日']
        };

        let category = '其他';
        let priority = 'medium';

        for (const [cat, keywords] of Object.entries(categoryRules)) {
            if (keywords.some(kw => t.includes(kw))) {
                category = cat;
                break;
            }
        }

        if (['紧急', '重要', '必须', '立即', '马上', 'deadline', '截止', '明天', '今天'].some(kw => t.includes(kw))) {
            priority = 'high';
        } else if (['有空', '随便', '不急', '以后', '有空时', '休闲', '娱乐'].some(kw => t.includes(kw))) {
            priority = 'low';
        }

        return { category, priority };
    }

    getPriorityText(priority) {
        const map = { high: '高优先级', medium: '中优先级', low: '低优先级' };
        return map[priority] || '中优先级';
    }

    // ==================== AI扩展功能 ====================

    // 1. AI任务分解 - 将大任务拆分为小步骤
    async breakTaskDown(title) {
        const API_KEY = localStorage.getItem('ai_api_key');
        if (!API_KEY || API_KEY === '') {
            return this.breakTaskDownWithRules(title);
        }

        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: '你是一个任务管理助手。用户输入一个大任务，你将其拆分为3-5个具体可执行的小步骤。返回JSON数组格式：["步骤1","步骤2","步骤3"]。只返回JSON，不要其他文字。' },
                        { role: 'user', content: title }
                    ],
                    temperature: 0.5,
                    max_tokens: 500
                })
            });

            if (!response.ok) throw new Error('API请求失败');
            const data = await response.json();
            const content = data.choices[0]?.message?.content?.trim();
            if (content) {
                const jsonMatch = content.match(/\[[\s\S]*\]/);
                if (jsonMatch) return JSON.parse(jsonMatch[0]);
            }
        } catch (err) {
            console.log('AI分解失败:', err.message);
        }
        return this.breakTaskDownWithRules(title);
    }

    breakTaskDownWithRules(title) {
        return ['准备：收集必要资料和资源', '规划：制定详细计划和时间表', '执行：按计划逐步完成任务', '检查：验证完成情况和质量', '总结：记录经验教训'].slice(0, 3 + Math.floor(Math.random() * 3));
    }

    // 2. AI时间估算 - 估算任务所需时间
    async estimateTaskTime(title, priority) {
        const API_KEY = localStorage.getItem('ai_api_key');
        if (!API_KEY || API_KEY === '') {
            return this.estimateTimeWithRules(title, priority);
        }

        try {
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: '你是一个时间管理助手。根据任务标题和优先级，估算完成时间。返回JSON格式：{"hours":数字,"minutes":数字}。只返回JSON，不要其他文字。' },
                        { role: 'user', content: '任务：' + title + '，优先级：' + priority }
                    ],
                    temperature: 0.3,
                    max_tokens: 100
                })
            });

            if (!response.ok) throw new Error('API请求失败');
            const data = await response.json();
            const content = data.choices[0]?.message?.content?.trim();
            if (content) {
                const jsonMatch = content.match(/\{[^}]+\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    return result.hours + '小时' + (result.minutes ? result.minutes + '分钟' : '');
                }
            }
        } catch (err) {
            console.log('AI估算失败:', err.message);
        }
        return this.estimateTimeWithRules(title, priority);
    }

    estimateTimeWithRules(title, priority) {
        const timeMap = { high: '2-4小时', medium: '1-2小时', low: '30分钟-1小时' };
        return timeMap[priority] || '1小时';
    }

    // 3. AI日报生成 - 根据完成任务生成日报
    generateDailyReport() {
        const today = new Date().toLocaleDateString('zh-CN');
        const completedToday = this.tasks.filter(t => {
            if (!t.completed || !t.completedAt) return false;
            return new Date(t.completedAt).toLocaleDateString('zh-CN') === today;
        });
        const pendingCount = this.tasks.filter(t => !t.completed).length;
        const totalCount = this.tasks.length;
        const completionRate = totalCount > 0 ? Math.round((completedToday.length / totalCount) * 100) : 0;

        let report = '📋 ' + today + ' 日报\n\n';
        report += '✅ 今日完成: ' + completedToday.length + ' 个任务\n';
        report += '⏳ 待完成: ' + pendingCount + ' 个任务\n';
        report += '📊 完成率: ' + completionRate + '%\n\n';

        if (completedToday.length > 0) {
            report += '🎉 今日成就:\n';
            completedToday.forEach((t, i) => {
                report += '  ' + (i + 1) + '. ' + t.title + '\n';
            });
            report += '\n';
        }

        report += '💡 明日建议:\n';
        if (completionRate >= 80) {
            report += '  太棒了！保持这个节奏，继续保持高效！\n';
        } else if (completionRate >= 50) {
            report += '  不错！明天可以尝试完成更多任务。\n';
        } else {
            report += '  明天加油！建议先完成高优先级任务。\n';
        }

        return report;
    }

    // 4. AI建议 - 根据历史数据建议最佳工作时间
    getAISuggestions() {
        const completedTasks = this.tasks.filter(t => t.completed && t.completedAt);
        const highPriorityCompleted = completedTasks.filter(t => t.priority === 'high');
        const totalCompleted = completedTasks.length;
        const totalPending = this.tasks.filter(t => !t.completed).length;
        const highPriorityPending = this.tasks.filter(t => !t.completed && t.priority === 'high').length;

        let suggestions = [];

        if (highPriorityPending > 0) {
            suggestions.push('🔴 有 ' + highPriorityPending + ' 个高优先级任务待完成，建议优先处理');
        }

        if (totalPending > 10) {
            suggestions.push('📋 待办任务较多（' + totalPending + '个），建议分解大任务逐步完成');
        } else if (totalPending === 0) {
            suggestions.push('🎉 所有任务都已完成！休息一下或添加新任务吧');
        }

        if (totalCompleted > 0) {
            suggestions.push('📈 已完成 ' + totalCompleted + ' 个任务，继续保持！');
        }

        const total = this.tasks.length;
        const rate = total > 0 ? Math.round((totalCompleted / total) * 100) : 0;
        if (rate >= 80) {
            suggestions.push('🌟 完成率 ' + rate + '%，效率很高！');
        } else if (rate < 50) {
            suggestions.push('💪 完成率 ' + rate + '%，建议专注完成高优先级任务');
        }

        return suggestions.length > 0 ? suggestions : ['💡 添加任务开始使用AI建议功能'];
    }

    deleteTask(id) {
        if (confirm('确定要删除这个任务吗？')) {
            this.tasks = this.tasks.filter(task => task.id !== id);
            this.selectedTasks.delete(id);
            this.saveUserData();
            this.updateUI();
            this.showNotification('任务已删除', 'info');
        }
    }

    toggleTaskSelection(id, event) {
        const checkbox = event ? event.target : window.event?.target;
        if (checkbox?.checked) {
            this.selectedTasks.add(id);
        } else {
            this.selectedTasks.delete(id);
        }
        this.updateUI();
    }

    toggleSelectAll() {
        const taskList = document.getElementById('taskList');
        const checkboxes = taskList?.querySelectorAll('.task-checkbox');

        if (this.selectedTasks.size === this.getFilteredTasks().length) {
            this.selectedTasks.clear();
            checkboxes?.forEach(cb => { cb.checked = false; });
        } else {
            this.getFilteredTasks().forEach(task => {
                this.selectedTasks.add(task.id);
            });
            checkboxes?.forEach(cb => { cb.checked = true; });
        }
        this.updateUI();
    }

    deleteSelected() {
        if (this.selectedTasks.size === 0) {
            this.showNotification('请先选择要删除的任务', 'warning');
            return;
        }

        if (confirm(`确定要删除选中的 ${this.selectedTasks.size} 个任务吗？`)) {
            const selectedCount = this.selectedTasks.size;
            this.tasks = this.tasks.filter(task => !this.selectedTasks.has(task.id));
            this.selectedTasks.clear();
            this.saveUserData();
            this.updateUI();
            this.showNotification(`已删除 ${selectedCount} 个任务`, 'info');
        }
    }

    toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            if (task.completed) {
                task.completedAt = new Date().toISOString();
                if (gameManager) {
                    const result = gameManager.completeTask(task);
                    if (result.leveledUp) this.showLevelUpEffect();
                    this.showExpGainEffect(result.amount, task.title);
                    this.updateGameUI();
                }
            }
            this.saveUserData();
            this.updateUI();
        }
    }

    showExpGainEffect(amount, taskTitle) {
        const el = document.createElement('div');
        el.className = 'completion-effect';
        el.innerHTML = '<span style="color:#10b981;font-weight:700;">+' + amount + ' EXP</span>';
        el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;animation:floatUp 1.5s ease-out forwards;pointer-events:none;';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    }

    showLevelUpEffect() {
        const el = document.createElement('div');
        el.className = 'combo-display show';
        el.textContent = 'LEVEL UP!';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2000);
    }

    updateGameUI() {
        if (!gameManager) return;
        const levelInfo = gameManager.getLevelInfo(gameManager.data.level);
        const levelBadge = document.getElementById('levelBadge');
        const expFill = document.getElementById('expFill');
        const expText = document.getElementById('expText');
        if (levelBadge) levelBadge.textContent = 'Lv.' + gameManager.data.level + ' ' + levelInfo.name;
        if (expFill) expFill.style.width = gameManager.getLevelProgress() + '%';
        if (expText) expText.textContent = gameManager.data.exp + ' / ' + gameManager.getExpForNextLevel() + ' EXP';
    }

    clearCompleted() {
        if (confirm('确定要清空所有已完成的任务吗？')) {
            const completedCount = this.tasks.filter(task => task.completed).length;
            if (completedCount === 0) {
                return this.showNotification('没有已完成的任务', 'info');
            }
            this.tasks = this.tasks.filter(task => !task.completed);
            this.selectedTasks.clear();
            this.saveUserData();
            this.updateUI();
            this.showNotification(`已清空 ${completedCount} 个已完成任务`, 'info');
        }
    }

    // ==================== 编辑任务 ====================
    editTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>✏️ 编辑任务</h3>
                </div>
                <div class="modal-body">
                    <input type="text" id="editTitle" class="modal-input" value="${escapeHtml(task.title)}" placeholder="任务标题 *">
                    <textarea id="editContent" class="modal-textarea" placeholder="任务详细内容（支持多行）..." rows="4">${escapeHtml(task.content || '')}</textarea>
                    <select id="editPriority" class="modal-input">
                        <option value="low" ${task.priority === 'low' ? 'selected' : ''}>🔽 低优先级</option>
                        <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>⚪ 中优先级</option>
                        <option value="high" ${task.priority === 'high' ? 'selected' : ''}>🔺 高优先级</option>
                    </select>
                    <input type="date" id="editDueDate" class="modal-input" value="${task.dueDate || ''}">
                    <select id="editCategory" class="modal-input">
                        ${this.categories.map(cat => `<option value="${escapeHtml(cat)}" ${task.category === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
                    </select>
                </div>
                <div class="modal-footer">
                    <button class="modal-cancel-btn" id="cancelEdit">取消</button>
                    <button class="modal-save-btn" id="saveEdit">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelector('#cancelEdit')?.addEventListener('click', () => modal.remove());

        modal.querySelector('#saveEdit')?.addEventListener('click', () => {
            const title = modal.querySelector('#editTitle').value.trim();
            if (!title) {
                this.showNotification('任务标题不能为空', 'error');
                return;
            }

            task.title = title;
            task.content = modal.querySelector('#editContent').value;
            task.priority = modal.querySelector('#editPriority').value;
            task.dueDate = modal.querySelector('#editDueDate').value;
            task.category = modal.querySelector('#editCategory').value;

            if (!this.categories.includes(task.category)) {
                this.categories.push(task.category);
            }

            this.saveUserData();
            this.updateUI();
            this.renderCategories();
            this.showNotification('任务已更新', 'success');
            modal.remove();
        });
    }

    // ==================== 任务详情 ====================
    openTaskDetail(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content task-detail-modal">
                <div class="modal-header">
                    <h3>📋 任务详情</h3>
                    <button class="modal-close-btn" onclick="this.closest('.modal').remove()">✕</button>
                </div>
                <div class="modal-body">
                    <div class="detail-row"><label>标题</label><h2 class="detail-title">${escapeHtml(task.title)}</h2></div>
                    ${task.content ? `<div class="detail-row"><label class="content-label">详细内容</label><div class="detail-content">${escapeHtml(task.content).replace(/\n/g, '<br>')}</div></div>` : '<div class="detail-row no-content">📝 暂无详细内容</div>'}
                    <div class="detail-meta-bar">
                        <span class="detail-priority ${task.priority}">${{high:'🔺高', medium:'⚪中', low:'🔽低'}[task.priority||'medium']}优先级</span>
                        <span class="detail-category">📁 ${escapeHtml(task.category)}</span>
                        <span class="detail-date">📅 ${task.dueDate || '无截止日期'}</span>
                        <span class="detail-status ${task.completed?'completed':'pending'}">${task.completed?'✅已完成':'⏳进行中'}</span>
                    </div>
                    <div class="detail-time">创建于: ${new Date(task.createdAt).toLocaleString('zh-CN')}</div>
                </div>
                <div class="modal-footer">
                    <button class="modal-cancel-btn" id="editFromDetail">✏️ 编辑</button>
                    <button class="modal-save-btn" id="closeDetail">关闭</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        modal.querySelector('#closeDetail')?.addEventListener('click', () => modal.remove());
        modal.querySelector('#editFromDetail')?.addEventListener('click', () => { modal.remove(); this.editTask(id); });
    }

    // ==================== 分类操作 ====================
    addCategory() {
        const input = document.getElementById('categoryInput');
        const name = input.value.trim();
        if (!name) return this.showNotification('请输入分类名称', 'error');
        if (this.categories.includes(name)) return this.showNotification('该分类已存在', 'error');

        this.categories.push(name);
        this.saveUserData();
        this.renderCategories();
        input.value = '';
        this.showNotification(`分类"${name}"添加成功！`, 'success');
    }

    deleteCategory(name) {
        if (confirm(`确定要删除分类"${name}"吗？该分类下的任务将移动到"默认"分类。`)) {
            this.categories = this.categories.filter(c => c !== name);
            this.tasks.forEach(task => {
                if (task.category === name) task.category = '默认';
            });
            if (this.currentCategory === name) this.currentCategory = 'all';
            this.saveUserData();
            this.updateUI();
            this.renderCategories();
            this.showNotification('分类已删除', 'info');
        }
    }

    // ==================== 渲染 ====================
    renderTasks() {
        const taskList = document.getElementById('taskList');
        const emptyState = document.getElementById('emptyState');
        if (!taskList || !emptyState) return;

        let filteredTasks = this.getFilteredTasks();
        filteredTasks = this.sortTasks(filteredTasks);

        taskList.innerHTML = '';

        if (filteredTasks.length === 0) {
            emptyState.style.display = 'block';
            this.updateActionButtons();
            return;
        }

        emptyState.style.display = 'none';

        filteredTasks.forEach(task => {
            const taskItem = this.createTaskElement(task);
            taskList.appendChild(taskItem);
        });

        this.updateActionButtons();
    }

    createTaskElement(task) {
        const taskItem = document.createElement('div');
        taskItem.className = `task-item ${task.completed ? 'completed' : ''} ${task.priority || 'medium'}-priority ${this.selectedTasks.has(task.id) ? 'selected' : ''}`;
        taskItem.draggable = true;
        taskItem.dataset.id = task.id;

        const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completed;
        const dueDateStr = task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-CN') : '无';
        const isSelected = this.selectedTasks.has(task.id);

        const priorityLabels = { high: '高', medium: '中', low: '低' };
        const priorityClass = task.priority || 'medium';

        const contentPreview = task.content ? (task.content.substring(0, 50) + (task.content.length > 50 ? '...' : '')) : '';

        taskItem.innerHTML = `
            <input type="checkbox" class="task-checkbox" ${isSelected ? 'checked' : ''} onchange="window.app.toggleTaskSelection(${task.id}, event)" title="选择任务" />
            <div class="task-content" onclick="window.app.openTaskDetail(${task.id})" style="cursor:pointer" title="点击查看详情">
                <div class="task-title">${escapeHtml(task.title)}</div>
                ${contentPreview ? `<div class="task-content-preview">${escapeHtml(contentPreview)}</div>` : ''}
                <div class="task-meta">
                    <span class="task-priority ${priorityClass}">${priorityLabels[priorityClass]}优先级</span>
                    <span class="task-category">📁 ${escapeHtml(task.category)}</span>
                    <span class="task-due-date ${isOverdue ? 'overdue' : ''}">📅 ${dueDateStr}</span>
                </div>
            </div>
            <div class="task-actions">
                <button class="task-action-btn complete-btn" onclick="event.stopPropagation();window.app.toggleTask(${task.id})" title="${task.completed ? '取消完成' : '标记完成'}">
                    ${task.completed ? '↶' : '✓'}
                </button>
                <button class="task-action-btn edit-btn" onclick="event.stopPropagation();window.app.editTask(${task.id})" title="编辑">✏️</button>
                <button class="task-action-btn delete-btn" onclick="event.stopPropagation();window.app.deleteTask(${task.id})" title="删除">🗑️</button>
            </div>
        `;

        return taskItem;
    }

    renderCategories() {
        const categoryList = document.getElementById('categoryList');
        const filterCategory = document.getElementById('filterCategory');
        const categorySelect = document.getElementById('categorySelect');
        if (!categoryList) return;

        const currentFilter = this.currentCategory || 'all';
        const currentSelectValue = categorySelect ? categorySelect.value : '默认';

        categoryList.innerHTML = `<span class="category-tag ${currentFilter === 'all' || currentFilter === '全部' ? 'active' : ''}" data-category="全部">全部</span>`;
        filterCategory.innerHTML = '<option value="all">所有分类</option>';
        categorySelect.innerHTML = '';

        this.categories.forEach(cat => {
            const tag = document.createElement('span');
            tag.className = `category-tag ${currentFilter === cat ? 'active' : ''}`;
            tag.dataset.category = cat;
            tag.innerHTML = `${escapeHtml(cat)} <span class="delete-btn" title="删除">✕</span>`;
            categoryList.appendChild(tag);

            const filterOpt = document.createElement('option');
            filterOpt.value = cat;
            filterOpt.textContent = cat;
            filterCategory.appendChild(filterOpt);

            const selectOpt = document.createElement('option');
            selectOpt.value = cat;
            selectOpt.textContent = cat;
            if (cat === currentSelectValue) selectOpt.selected = true;
            categorySelect.appendChild(selectOpt);
        });

        filterCategory.value = currentFilter;
    }

    // ==================== 筛选/排序 ====================
    getFilteredTasks() {
        let filtered = [...this.tasks];

        if (this.currentFilter === 'pending') {
            filtered = filtered.filter(task => !task.completed);
        } else if (this.currentFilter === 'completed') {
            filtered = filtered.filter(task => task.completed);
        }

        if (this.currentCategory && this.currentCategory !== 'all' && this.currentCategory !== '全部' && this.currentCategory !== '') {
            filtered = filtered.filter(task => task.category === this.currentCategory);
        }

        return filtered;
    }

    sortTasks(tasks) {
        const sorted = [...tasks];
        switch (this.currentSort) {
            case 'date':
                sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'priority': {
                const order = { high: 3, medium: 2, low: 1 };
                sorted.sort((a, b) => order[b.priority || 'medium'] - order[a.priority || 'medium']);
                break;
            }
            case 'name':
                sorted.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
                break;
        }
        return sorted;
    }

    // ==================== 统计 ====================
    updateStats() {
        const totalTasks = this.tasks.length;
        const pendingTasks = this.tasks.filter(task => !task.completed).length;
        const completedTasks = totalTasks - pendingTasks;
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        this.animateNumber('totalTasks', totalTasks);
        this.animateNumber('pendingTasks', pendingTasks);
        this.animateNumber('completedTasks', completedTasks);
        const rateEl = document.getElementById('completionRate');
        if (rateEl) rateEl.textContent = completionRate + '%';
    }

    animateNumber(elementId, targetValue) {
        const element = document.getElementById(elementId);
        if (!element) return;
        const startValue = parseInt(element.textContent) || 0;
        const duration = 300;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const currentValue = Math.round(startValue + (targetValue - startValue) * easeProgress);
            element.textContent = currentValue;
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    updateActionButtons() {
        const deleteBtn = document.getElementById('deleteSelectedBtn');
        const selectAllBtn = document.getElementById('selectAllBtn');
        if (!deleteBtn || !selectAllBtn) return;

        if (this.selectedTasks.size > 0) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = `删除选中 (${this.selectedTasks.size})`;
        } else {
            deleteBtn.disabled = true;
            deleteBtn.textContent = '删除选中';
        }

        const filteredTasks = this.getFilteredTasks();
        selectAllBtn.textContent = (this.selectedTasks.size === filteredTasks.length && filteredTasks.length > 0)
            ? '取消全选' : '全选';
    }

    updateUI() {
        this.renderTasks();
        this.updateStats();
        this.updateActionButtons();
    }

    // ==================== 导入/导出 ====================
    exportData() {
        const data = {
            tasks: this.tasks,
            categories: this.categories,
            exportDate: new Date().toISOString(),
            username: this.auth.username
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `todo-${this.auth.username}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification('数据已导出', 'success');
    }

    async exportImage() {
        if (typeof html2canvas === 'undefined') {
            this.showNotification('图片库未加载，请刷新页面重试', 'error');
            return;
        }

        if (this.tasks.length === 0) {
            this.showNotification('没有任务可以导出', 'warning');
            return;
        }

        this.showNotification('正在生成图片，请稍候...', 'info');

        // 创建一个临时容器用于截图
        const container = document.createElement('div');
        container.id = 'export-container';
        container.style.cssText = `
            position: fixed; left: -9999px; top: 0; width: 600px;
            background: white; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // 标题
        const header = document.createElement('div');
        header.style.cssText = 'text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #6366f1;';
        header.innerHTML = `
            <h1 style="font-size:24px;color:#1e293b;margin:0;">📋 待办事项</h1>
            <p style="color:#64748b;margin:8px 0 0;">用户: ${escapeHtml(this.auth.username)} | ${new Date().toLocaleDateString('zh-CN')}</p>
        `;
        container.appendChild(header);

        // 统计
        const total = this.tasks.length;
        const completed = this.tasks.filter(t => t.completed).length;
        const pending = total - completed;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

        const stats = document.createElement('div');
        stats.style.cssText = 'display:flex;justify-content:space-around;margin-bottom:20px;padding:12px;background:#f8fafc;border-radius:12px;';
        stats.innerHTML = `
            <div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:#6366f1;">${total}</div><div style="font-size:12px;color:#64748b;">总任务</div></div>
            <div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:#f59e0b;">${pending}</div><div style="font-size:12px;color:#64748b;">待完成</div></div>
            <div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:#10b981;">${completed}</div><div style="font-size:12px;color:#64748b;">已完成</div></div>
            <div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:#6366f1;">${rate}%</div><div style="font-size:12px;color:#64748b;">完成率</div></div>
        `;
        container.appendChild(stats);

        // 任务列表
        const list = document.createElement('div');
        const filteredTasks = this.sortTasks(this.getFilteredTasks());
        filteredTasks.forEach(task => {
            const priorityLabels = { high: '高', medium: '中', low: '低' };
            const priorityColors = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
            const item = document.createElement('div');
            item.style.cssText = `
                display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:8px;
                border:1px solid #e2e8f0;border-radius:12px;
                ${task.completed ? 'opacity:0.6;background:#f8fafc;' : 'background:white;'}
            `;
            item.innerHTML = `
                <div style="width:24px;height:24px;border-radius:50%;border:2px solid ${task.completed ? '#10b981' : '#cbd5e1'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    ${task.completed ? '<span style="color:#10b981;font-size:14px;">✓</span>' : ''}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:14px;font-weight:600;color:#1e293b;${task.completed ? 'text-decoration:line-through;' : ''}">${escapeHtml(task.title)}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:4px;">
                        <span style="color:${priorityColors[task.priority || 'medium']};font-weight:600;">${priorityLabels[task.priority || 'medium']}优先级</span>
                        &nbsp;|&nbsp; 📁 ${escapeHtml(task.category)}
                        ${task.dueDate ? `&nbsp;|&nbsp; 📅 ${task.dueDate}` : ''}
                    </div>
                </div>
            `;
            list.appendChild(item);
        });
        container.appendChild(list);

        document.body.appendChild(container);

        // 等待一下确保DOM渲染完成
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const canvas = await html2canvas(container, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                logging: false
            });

            const dataUrl = canvas.toDataURL('image/png');

            // 检测是否为手机
            const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

            if (isMobile) {
                // 手机上直接显示图片页面，用户可以长按保存
                const w = window.open('', '_blank');
                if (w) {
                    w.document.write(`
                        <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>长按图片保存到相册</title>
                        <body style="margin:0;background:#1e293b;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;">
                        <p style="color:#fff;padding:16px;text-align:center;font-size:16px;">
                        👇 <b>长按下方图片</b> → 选择<b>"保存到相册"</b></p>
                        <img src="${dataUrl}" style="max-width:100%;height:auto;"></body></html>
                    `);
                    this.showNotification('请在弹出的页面长按图片保存', 'info');
                } else {
                    // 弹窗被拦截，直接下载
                    this.downloadImage(dataUrl);
                }
            } else {
                // 电脑直接下载
                this.downloadImage(dataUrl);
                this.showNotification('图片导出成功！', 'success');
            }
        } catch (err) {
            console.error('Export image error:', err);
            this.showNotification('图片导出失败: ' + err.message, 'error');
        } finally {
            if (container.parentNode) {
                document.body.removeChild(container);
            }
        } }

    downloadImage(dataUrl) {
        const link = document.createElement('a');
        link.download = `todo-${this.auth.username}-${Date.now()}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (Array.isArray(data.tasks)) {
                    this.tasks = data.tasks.map(t => ({
                        ...t,
                        id: t.id || this.nextId++
                    }));
                    this.calculateNextId();

                    if (Array.isArray(data.categories)) {
                        data.categories.forEach(cat => {
                            if (!this.categories.includes(cat)) this.categories.push(cat);
                        });
                    }

                    this.saveUserData();
                    this.updateUI();
                    this.renderCategories();
                    this.showNotification(`成功导入 ${this.tasks.length} 个任务`, 'success');
                } else {
                    this.showNotification('数据格式不正确', 'error');
                }
            } catch (err) {
                this.showNotification('导入失败: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    // ==================== 工具函数 ====================
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        notification.textContent = message;
        notification.className = `notification ${type}`;
        void notification.offsetWidth;
        notification.classList.add('show');

        if (this._notificationTimer) clearTimeout(this._notificationTimer);
        this._notificationTimer = setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
}

// ==================== 初始化 ====================
let todoManager;
document.addEventListener('DOMContentLoaded', () => {
    todoManager = new TodoManager();
    window.app = todoManager;
});
