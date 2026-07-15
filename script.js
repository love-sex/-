/* ============================================
   待办事项管理 - 带用户认证
   ============================================ */

const API_BASE = '';  // 同域请求

// ==================== API工具 ====================
async function api(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers }
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || `请求失败: ${res.status}`);
    }
    return data;
}

// ==================== 认证管理器 ====================
class AuthManager {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.username = localStorage.getItem('authUser') || null;
    }

    isLoggedIn() {
        return !!this.token;
    }

    async login(username, password) {
        const data = await api('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        this.token = data.token;
        this.username = data.user.username;
        localStorage.setItem('authToken', this.token);
        localStorage.setItem('authUser', this.username);
        return data;
    }

    async register(username, password) {
        const data = await api('/api/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        this.token = data.token;
        this.username = data.user.username;
        localStorage.setItem('authToken', this.token);
        localStorage.setItem('authUser', this.username);
        return data;
    }

    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        this.token = null;
        this.username = null;
        location.reload();
    }
}

// ==================== 待办事项管理器 ====================
class TodoManager {
    constructor() {
        this.tasks = [];
        this.categories = ['默认'];
        this.currentFilter = 'all';
        this.currentCategory = 'all';
        this.currentSort = 'date';
        this.selectedTasks = new Set();
        this.nextId = 1;
        this.auth = new AuthManager();
        this.init();
    }

    // 初始化
    async init() {
        this.setupAuthUI();

        if (this.auth.isLoggedIn()) {
            try {
                await this.loadTasks();
                this.showMainApp();
            } catch (e) {
                // Token过期或无效
                this.auth.logout();
                return;
            }
        } else {
            this.showAuth();
        }
    }

    // ==================== 认证UI ====================
    setupAuthUI() {
        // 表单切换
        document.getElementById('showRegister')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('registerForm').classList.remove('hidden');
            this.clearAuthError();
        });

        document.getElementById('showLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('registerForm').classList.add('hidden');
            document.getElementById('loginForm').classList.remove('hidden');
            this.clearAuthError();
        });

        // 登录表单
        document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;

            try {
                this.setAuthLoading(true);
                await this.auth.login(username, password);
                await this.loadTasks();
                this.showMainApp();
                this.clearAuthError();
            } catch (err) {
                this.showAuthError(err.message);
            } finally {
                this.setAuthLoading(false);
            }
        });

        // 注册表单
        document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('regUsername').value.trim();
            const password = document.getElementById('regPassword').value;
            const confirm = document.getElementById('regPasswordConfirm').value;

            if (password !== confirm) {
                return this.showAuthError('两次密码输入不一致');
            }

            try {
                this.setAuthLoading(true);
                await this.auth.register(username, password);
                await this.loadTasks();
                this.showMainApp();
                this.clearAuthError();
            } catch (err) {
                this.showAuthError(err.message);
            } finally {
                this.setAuthLoading(false);
            }
        });

        // 退出登录
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.auth.logout();
        });
    }

    showAuth() {
        document.getElementById('authContainer').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
    }

    showMainApp() {
        document.getElementById('authContainer').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('currentUsername').textContent = this.auth.username;
        this.setupEventListeners();
        this.renderTasks();
        this.renderCategories();
        this.updateStats();
        this.updateActionButtons();
        this.setupDragAndDrop();
        this.showNotification(`欢迎回来，${this.auth.username}！`, 'success');
    }

    showAuthError(msg) {
        const el = document.getElementById('authError');
        el.textContent = msg;
        el.classList.add('show');
    }

    clearAuthError() {
        const el = document.getElementById('authError');
        el.textContent = '';
        el.classList.remove('show');
    }

    setAuthLoading(loading) {
        document.querySelectorAll('.auth-btn').forEach(btn => {
            btn.disabled = loading;
            btn.textContent = loading ? '处理中...' : (btn.classList.contains('login-btn') ? '登 录' : '注 册');
        });
    }

    // ==================== API操作 ====================
    async loadTasks() {
        try {
            const data = await api('/api/tasks');
            this.tasks = data.tasks || [];
            this.calculateNextId();
        } catch {
            this.tasks = [];
        }
    }

    async saveTasks() {
        try {
            await api('/api/tasks', {
                method: 'POST',
                body: JSON.stringify({ tasks: this.tasks })
            });
        } catch (err) {
            this.showNotification('保存失败: ' + err.message, 'error');
        }
    }

    calculateNextId() {
        if (this.tasks.length > 0) {
            this.nextId = Math.max(...this.tasks.map(t => t.id)) + 1;
        } else {
            this.nextId = 1;
        }
    }

    // ==================== 事件监听 ====================
    setupEventListeners() {
        // 添加任务
        const addTaskBtn = document.getElementById('addTaskBtn');
        const taskInput = document.getElementById('taskInput');

        addTaskBtn?.addEventListener('click', () => this.addTask());
        taskInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTask();
        });

        // 筛选器
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.renderTasks();
            });
        });

        // 分类筛选
        document.getElementById('filterCategory')?.addEventListener('change', (e) => {
            this.currentCategory = e.target.value;
            this.renderCategories();  // 同步标签激活状态
            this.renderTasks();
            this.updateActionButtons();
        });

        // 排序
        document.getElementById('sortSelect')?.addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.renderTasks();
        });

        // 分类管理
        document.getElementById('addCategoryBtn')?.addEventListener('click', () => this.addCategory());
        document.getElementById('categoryInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addCategory();
        });

        // 操作按钮
        document.getElementById('selectAllBtn')?.addEventListener('click', () => this.toggleSelectAll());
        document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => this.deleteSelected());
        document.getElementById('clearCompletedBtn')?.addEventListener('click', () => this.clearCompleted());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportData());
        document.getElementById('importBtn')?.addEventListener('click', () => {
            document.getElementById('fileInput')?.click();
        });
        document.getElementById('fileInput')?.addEventListener('change', (e) => this.importData(e));

        // 分类标签点击
        document.getElementById('categoryList')?.addEventListener('click', (e) => {
            const tag = e.target.closest('.category-tag');
            if (tag) {
                this.currentCategory = tag.dataset.category;
                this.renderCategories();  // 同步更新标签激活状态和下拉框
                this.renderTasks();
                this.updateActionButtons();
            }

            // 删除分类
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
                this.saveTasks();
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

        this.saveTasks();
        this.updateUI();

        taskInput.value = '';
        dueDateInput.value = '';
        this.showNotification('任务添加成功！', 'success');
    }

    deleteTask(id) {
        if (confirm('确定要删除这个任务吗？')) {
            this.tasks = this.tasks.filter(task => task.id !== id);
            this.selectedTasks.delete(id);
            this.saveTasks();
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
            this.saveTasks();
            this.updateUI();
            this.showNotification(`已删除 ${selectedCount} 个任务`, 'info');
        }
    }

    toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            this.saveTasks();
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
            this.saveTasks();
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
                    <input type="text" id="editTitle" class="modal-input" value="${this.escapeHtml(task.title)}" placeholder="任务标题">
                    <select id="editPriority" class="modal-input">
                        <option value="low" ${task.priority === 'low' ? 'selected' : ''}>🔽 低优先级</option>
                        <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>⚪ 中优先级</option>
                        <option value="high" ${task.priority === 'high' ? 'selected' : ''}>🔺 高优先级</option>
                    </select>
                    <input type="date" id="editDueDate" class="modal-input" value="${task.dueDate || ''}">
                    <select id="editCategory" class="modal-input">
                        ${this.categories.map(cat => `<option value="${this.escapeHtml(cat)}" ${task.category === cat ? 'selected' : ''}>${this.escapeHtml(cat)}</option>`).join('')}
                    </select>
                    <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
                        <label style="font-size:0.9rem;color:var(--gray-600);">进度:</label>
                        <input type="range" id="editProgress" min="0" max="100" value="${task.progress}" style="flex:1;">
                        <span id="progressValue" style="min-width:40px;font-weight:600;color:var(--primary-600);">${task.progress}%</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="modal-cancel-btn" id="cancelEdit">取消</button>
                    <button class="modal-save-btn" id="saveEdit">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 进度条实时显示
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

            this.saveTasks();
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
            this.saveTasks();
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
                <div class="task-title">${this.escapeHtml(task.title)}</div>
                <div class="task-meta">
                    <span class="task-priority ${priorityClass}">${priorityLabels[priorityClass]}优先级</span>
                    <span class="task-category">📁 ${this.escapeHtml(task.category)}</span>
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

        categoryList.innerHTML = `<span class="category-tag ${currentFilter === 'all' || currentFilter === '全部' ? 'active' : ''}" data-category="全部">全部</span>`;
        filterCategory.innerHTML = '<option value="all">所有分类</option>';
        categorySelect.innerHTML = '';

        this.categories.forEach(cat => {
            // 分类标签
            const tag = document.createElement('span');
            tag.className = `category-tag ${currentFilter === cat ? 'active' : ''}`;
            tag.dataset.category = cat;
            tag.innerHTML = `${this.escapeHtml(cat)} <span class="delete-btn" title="删除">✕</span>`;
            categoryList.appendChild(tag);

            // 筛选下拉
            const filterOpt = document.createElement('option');
            filterOpt.value = cat;
            filterOpt.textContent = cat;
            filterCategory.appendChild(filterOpt);

            // 创建任务下拉
            const selectOpt = document.createElement('option');
            selectOpt.value = cat;
            selectOpt.textContent = cat;
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

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
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

                    await this.saveTasks();
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
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

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
