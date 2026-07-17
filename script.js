/* ============================================
   待办事项管理 - 纯前端localStorage版本
   ============================================ */

const DB_KEY = 'todoApp_users';
const TOKEN_KEY = 'todoApp_token';
const USER_KEY = 'todoApp_currentUser';

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
    primaryColor: '#6366f1',
    bgColor: '#f8fafc',
    bgImage: '',
    bgOpacity: 15,
    bgBlur: 5,
    glassEffect: false,
    shadowEffect: true,
    animationEffect: true,
    fontSize: 100,
    mode: 'default'
};

const PRESET_THEMES = {
    default: { primaryColor: '#6366f1', bgColor: '#f8fafc', mode: 'default' },
    ocean:   { primaryColor: '#0891b2', bgColor: '#ecfeff', mode: 'ocean' },
    forest:  { primaryColor: '#059669', bgColor: '#f0fdf4', mode: 'forest' },
    sunset:  { primaryColor: '#ea580c', bgColor: '#fff7ed', mode: 'sunset' },
    dark:    { primaryColor: '#818cf8', bgColor: '#1e293b', mode: 'dark' },
    sakura:  { primaryColor: '#db2777', bgColor: '#fdf2f8', mode: 'sakura' }
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

        // 应用颜色变量
        root.style.setProperty('--primary-500', s.primaryColor);
        root.style.setProperty('--primary-600', this.darkenColor(s.primaryColor, 10));
        root.style.setProperty('--primary-700', this.darkenColor(s.primaryColor, 20));
        root.style.setProperty('--primary-400', this.lightenColor(s.primaryColor, 15));
        root.style.setProperty('--primary-300', this.lightenColor(s.primaryColor, 30));

        // 深色模式
        if (s.mode === 'dark') {
            root.style.setProperty('--gray-50', '#0f172a');
            root.style.setProperty('--gray-100', '#1e293b');
            root.style.setProperty('--gray-800', '#f1f5f9');
            root.style.setProperty('--gray-900', '#f8fafc');
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        // 背景图片
        const existingBg = document.getElementById('custom-bg-image');
        if (s.bgImage) {
            if (!existingBg) {
                const bgDiv = document.createElement('div');
                bgDiv.id = 'custom-bg-image';
                bgDiv.style.cssText = `
                    position: fixed; inset: 0; z-index: -1;
                    background-image: url('${s.bgImage}');
                    background-size: cover; background-position: center;
                    opacity: ${s.bgOpacity / 100};
                    filter: blur(${s.bgBlur}px);
                    pointer-events: none;
                `;
                document.body.insertBefore(bgDiv, document.body.firstChild);
            } else {
                existingBg.style.backgroundImage = `url('${s.bgImage}')`;
                existingBg.style.opacity = s.bgOpacity / 100;
                existingBg.style.filter = `blur(${s.bgBlur}px)`;
            }
        } else if (existingBg) {
            existingBg.remove();
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

    removeBgImage() {
        this.settings.bgImage = '';
        this.applySettings();
        this.saveSettings();
    }

    setPreset(themeName) {
        const preset = PRESET_THEMES[themeName];
        if (preset) {
            this.settings = { ...this.settings, ...preset };
            this.applySettings();
            this.saveSettings();
        }
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
        document.getElementById('mainApp')?.classList.add('hidden');
    }

    showMainApp() {
        document.getElementById('authContainer')?.classList.add('hidden');
        document.getElementById('mainApp')?.classList.remove('hidden');
        const el = document.getElementById('currentUsername');
        if (el) el.textContent = this.auth.username;
        this.theme = new ThemeManager();
        this.setupEventListeners();
        this.renderCategories();
        this.updateUI();
        this.setupDragAndDrop();
        this.setupSettingsUI();
        this.showNotification(`欢迎回来，${this.auth.username}！`, 'success');
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

        // 预设主题
        document.getElementById('themePresets')?.addEventListener('click', (e) => {
            const preset = e.target.closest('.theme-preset');
            if (preset) {
                document.querySelectorAll('.theme-preset').forEach(p => p.classList.remove('active'));
                preset.classList.add('active');
                this.theme.setPreset(preset.dataset.theme);
                this.syncSettingsUI();
                this.showNotification('主题已切换', 'success');
            }
        });

        // 主色调选择
        document.getElementById('primaryColorPicker')?.addEventListener('input', (e) => {
            this.theme.setPrimaryColor(e.target.value);
            document.getElementById('primaryColorValue').textContent = e.target.value;
        });

        // 背景色选择
        document.getElementById('bgColorPicker')?.addEventListener('input', (e) => {
            this.theme.settings.bgColor = e.target.value;
            document.getElementById('bgColorValue').textContent = e.target.value;
            this.theme.applySettings();
            this.theme.saveSettings();
        });

        // 背景图片上传
        document.getElementById('uploadBgBtn')?.addEventListener('click', () => {
            document.getElementById('bgImageInput')?.click();
        });

        document.getElementById('bgImageInput')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                return this.showNotification('图片大小不能超过5MB', 'error');
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                this.theme.setBgImage(ev.target.result);
                this.updateBgPreview(ev.target.result);
                document.getElementById('removeBgBtn').classList.remove('hidden');
                this.showNotification('背景图片已设置', 'success');
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });

        // 移除背景图片
        document.getElementById('removeBgBtn')?.addEventListener('click', () => {
            this.theme.removeBgImage();
            document.getElementById('bgImagePreview').style.backgroundImage = '';
            document.getElementById('bgImagePreview').style.display = 'none';
            document.getElementById('removeBgBtn').classList.add('hidden');
            this.showNotification('背景图片已移除', 'info');
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
        this.syncSettingsUI();
        document.getElementById('settingsModal').classList.remove('hidden');
    }

    syncSettingsUI() {
        const s = this.theme.settings;
        // 同步颜色选择器
        const primaryPicker = document.getElementById('primaryColorPicker');
        if (primaryPicker) primaryPicker.value = s.primaryColor;
        const primaryValue = document.getElementById('primaryColorValue');
        if (primaryValue) primaryValue.textContent = s.primaryColor;

        const bgPicker = document.getElementById('bgColorPicker');
        if (bgPicker) bgPicker.value = s.bgColor;
        const bgValue = document.getElementById('bgColorValue');
        if (bgValue) bgValue.textContent = s.bgColor;

        // 同步预设主题选中
        document.querySelectorAll('.theme-preset').forEach(p => {
            p.classList.toggle('active', p.dataset.theme === s.mode);
        });

        // 同步背景预览
        if (s.bgImage) {
            this.updateBgPreview(s.bgImage);
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
    addTask() {
        const taskInput = document.getElementById('taskInput');
        const prioritySelect = document.getElementById('prioritySelect');
        const dueDateInput = document.getElementById('dueDateInput');
        const categorySelect = document.getElementById('categorySelect');

        const title = taskInput.value.trim();
        if (!title) {
            this.showNotification('请输入任务标题', 'error');
            return;
        }

        const task = {
            id: this.nextId++,
            title,
            priority: prioritySelect.value,
            dueDate: dueDateInput.value,
            category: categorySelect.value || '默认',
            completed: false,
            createdAt: new Date().toISOString(),
            progress: 0
        };

        this.tasks.push(task);
        if (!this.categories.includes(task.category)) {
            this.categories.push(task.category);
        }

        this.saveUserData();
        this.updateUI();

        taskInput.value = '';
        dueDateInput.value = '';
        this.showNotification('任务添加成功！', 'success');
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
            this.saveUserData();
            this.updateUI();
        }
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
                    <input type="text" id="editTitle" class="modal-input" value="${escapeHtml(task.title)}" placeholder="任务标题">
                    <select id="editPriority" class="modal-input">
                        <option value="low" ${task.priority === 'low' ? 'selected' : ''}>🔽 低优先级</option>
                        <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>⚪ 中优先级</option>
                        <option value="high" ${task.priority === 'high' ? 'selected' : ''}>🔺 高优先级</option>
                    </select>
                    <input type="date" id="editDueDate" class="modal-input" value="${task.dueDate || ''}">
                    <select id="editCategory" class="modal-input">
                        ${this.categories.map(cat => `<option value="${escapeHtml(cat)}" ${task.category === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
                    </select>
                    <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
                        <label style="font-size:0.9rem;color:#374151;">进度:</label>
                        <input type="range" id="editProgress" min="0" max="100" value="${task.progress}" style="flex:1;">
                        <span id="progressValue" style="min-width:40px;font-weight:600;">${task.progress}%</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="modal-cancel-btn" id="cancelEdit">取消</button>
                    <button class="modal-save-btn" id="saveEdit">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const progressInput = modal.querySelector('#editProgress');
        const progressValue = modal.querySelector('#progressValue');
        progressInput?.addEventListener('input', () => {
            progressValue.textContent = progressInput.value + '%';
        });

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
            task.priority = modal.querySelector('#editPriority').value;
            task.dueDate = modal.querySelector('#editDueDate').value;
            task.category = modal.querySelector('#editCategory').value;
            task.progress = parseInt(modal.querySelector('#editProgress').value) || 0;

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

        taskItem.innerHTML = `
            <input type="checkbox" class="task-checkbox" ${isSelected ? 'checked' : ''} onchange="window.todoManager.toggleTaskSelection(${task.id}, event)" title="选择任务" />
            <div class="task-content">
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-meta">
                    <span class="task-priority ${priorityClass}">${priorityLabels[priorityClass]}优先级</span>
                    <span class="task-category">📁 ${escapeHtml(task.category)}</span>
                    <span class="task-due-date ${isOverdue ? 'overdue' : ''}">📅 ${dueDateStr}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${task.progress || 0}%"></div>
                </div>
            </div>
            <div class="task-actions">
                <button class="task-action-btn complete-btn" onclick="window.todoManager.toggleTask(${task.id})" title="${task.completed ? '取消完成' : '标记完成'}">
                    ${task.completed ? '↶' : '✓'}
                </button>
                <button class="task-action-btn edit-btn" onclick="window.todoManager.editTask(${task.id})" title="编辑">✏️</button>
                <button class="task-action-btn delete-btn" onclick="window.todoManager.deleteTask(${task.id})" title="删除">🗑️</button>
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
    window.todoManager = todoManager;
});
