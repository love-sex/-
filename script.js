// 代办事项管理类
class TodoManager {
    constructor() {
        this.tasks = this.loadTasks();
        this.categories = this.loadCategories();
        this.currentFilter = 'all';
        this.currentCategory = 'all';
        this.currentSort = 'date';
        this.selectedTasks = new Set(); // 存储选中的任务ID
        this.nextId = this.tasks.length > 0 ? Math.max(...this.tasks.map(t => t.id)) + 1 : 1;
        this.init();
    }

    // 初始化
    init() {
        this.setupEventListeners();
        this.renderTasks();
        this.renderCategories();
        this.updateStats();
        this.setupDragAndDrop();
    }

    // 设置事件监听器
    setupEventListeners() {
        // 添加任务
        const addTaskBtn = document.getElementById('addTaskBtn');
        const taskInput = document.getElementById('taskInput');

        addTaskBtn.addEventListener('click', () => this.addTask());
        taskInput.addEventListener('keypress', (e) => {
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
        document.getElementById('filterCategory').addEventListener('change', (e) => {
            this.currentCategory = e.target.value;
            this.renderTasks();
            this.updateActionButtons();
        });

        // 排序
        document.getElementById('sortSelect').addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.renderTasks();
        });

        // 分类管理
        document.getElementById('addCategoryBtn').addEventListener('click', () => this.addCategory());
        document.getElementById('categoryInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addCategory();
        });

        // 操作按钮
        document.getElementById('selectAllBtn').addEventListener('click', () => this.toggleSelectAll());
        document.getElementById('deleteSelectedBtn').addEventListener('click', () => this.deleteSelected());
        document.getElementById('clearCompletedBtn').addEventListener('click', () => this.clearCompleted());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        document.getElementById('fileInput').addEventListener('change', (e) => this.importData(e));

        // 分类标签点击
        document.getElementById('categoryList').addEventListener('click', (e) => {
            if (e.target.classList.contains('category-tag')) {
                document.querySelectorAll('.category-tag').forEach(tag => tag.classList.remove('active'));
                e.target.classList.add('active');
                this.currentCategory = e.target.dataset.category;
                this.renderTasks();
            }
        });
    }

    // 设置拖拽功能
    setupDragAndDrop() {
        const taskList = document.getElementById('taskList');
        let draggedItem = null;

        taskList.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('task-item')) {
                draggedItem = e.target;
                e.target.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        taskList.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('task-item')) {
                e.target.style.opacity = '';
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
                // 根据DOM顺序重新排序tasks数组
                const newOrderIds = Array.from(taskList.querySelectorAll('.task-item')).map(el => parseInt(el.dataset.id));
                this.tasks.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));
                this.saveTasks();
                this.updateUI();
            }
        });
    }

    // 获取拖拽位置
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // 添加任务
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
            title: title,
            priority: prioritySelect.value,
            dueDate: dueDateInput.value,
            category: categorySelect.value || '默认',
            completed: false,
            createdAt: new Date().toISOString(),
            progress: 0
        };

        this.tasks.push(task);
        this.saveTasks();
        this.updateUI();

        // 清空输入
        taskInput.value = '';
        dueDateInput.value = '';

        this.showNotification('任务添加成功！', 'success');
    }

    // 删除任务
    deleteTask(id) {
        if (confirm('确定要删除这个任务吗？')) {
            this.tasks = this.tasks.filter(task => task.id !== id);
            this.selectedTasks.delete(id);
            this.saveTasks();
            this.updateUI();
            this.showNotification('任务已删除', 'info');
        }
    }

    // 统一UI更新方法（渲染+统计+按钮状态）
    updateUI() {
        this.renderTasks();
        this.updateStats();
        this.updateActionButtons();
    }

    // 切换任务选中状态
    toggleTaskSelection(id, event) {
        const checkbox = event ? event.target : window.event.target;
        if (checkbox.checked) {
            this.selectedTasks.add(id);
        } else {
            this.selectedTasks.delete(id);
        }
        this.updateUI();
    }

    // 切换全选/取消全选
    toggleSelectAll() {
        const taskList = document.getElementById('taskList');
        const checkboxes = taskList.querySelectorAll('.task-checkbox');
        const selectAllBtn = document.getElementById('selectAllBtn');

        if (this.selectedTasks.size === this.getFilteredTasks().length) {
            // 当前是全选状态，取消全选
            this.selectedTasks.clear();
            checkboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
            selectAllBtn.textContent = '全选';
        } else {
            // 当前不是全选状态，全选
            const filteredTasks = this.getFilteredTasks();
            filteredTasks.forEach(task => {
                this.selectedTasks.add(task.id);
            });
            checkboxes.forEach(checkbox => {
                checkbox.checked = true;
            });
            selectAllBtn.textContent = '取消全选';
        }
        this.updateUI();
    }

    // 更新操作按钮状态
    updateActionButtons() {
        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
        const selectAllBtn = document.getElementById('selectAllBtn');

        if (this.selectedTasks.size > 0) {
            deleteSelectedBtn.disabled = false;
            deleteSelectedBtn.textContent = `删除选中 (${this.selectedTasks.size})`;
        } else {
            deleteSelectedBtn.disabled = true;
            deleteSelectedBtn.textContent = '删除选中';
        }

        // 更新全选按钮状态
        const filteredTasks = this.getFilteredTasks();
        if (this.selectedTasks.size === filteredTasks.length && filteredTasks.length > 0) {
            selectAllBtn.textContent = '取消全选';
        } else {
            selectAllBtn.textContent = '全选';
        }
    }

    // 删除选中的任务
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

    // 切换任务完成状态
    toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            this.saveTasks();
            this.updateUI(); // 新增：更新按钮状态
        }
    }

    // 编辑任务
    editTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        const modal = this.createEditModal(task);
        document.body.appendChild(modal);
        modal.style.display = 'block';

        const closeModal = () => {
            modal.remove();
        };

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // 创建编辑模态框
    createEditModal(task) {
        const modal = document.createElement('div');
        modal.className = 'modal';

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>编辑任务</h3>
                </div>
                <div class="modal-body">
                    <input type="text" id="editTitle" class="modal-input" value="${task.title}" placeholder="任务标题">
                    <select id="editPriority" class="modal-input">
                        <option value="low" ${task.priority === 'low' ? 'selected' : ''}>低优先级</option>
                        <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>中优先级</option>
                        <option value="high" ${task.priority === 'high' ? 'selected' : ''}>高优先级</option>
                    </select>
                    <input type="date" id="editDueDate" class="modal-input" value="${task.dueDate || ''}">
                    <select id="editCategory" class="modal-input">
                        ${this.categories.map(cat => `<option value="${cat}" ${task.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                    </select>
                    <input type="number" id="editProgress" class="modal-input" value="${task.progress}" min="0" max="100" placeholder="进度 (0-100)">
                </div>
                <div class="modal-footer">
                    <button class="modal-btn secondary" onclick="this.closest('.modal').remove()">取消</button>
                    <button class="modal-btn primary" onclick="window.todoManager.saveEditedTask(${task.id}, this.closest('.modal'))">保存</button>
                </div>
            </div>
        `;

        return modal;
    }

    // 保存编辑的任务
    saveEditedTask(id, modal) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        task.title = document.getElementById('editTitle').value.trim();
        task.priority = document.getElementById('editPriority').value;
        task.dueDate = document.getElementById('editDueDate').value;
        task.category = document.getElementById('editCategory').value;
        task.progress = parseInt(document.getElementById('editProgress').value) || 0;

        if (!task.title) {
            this.showNotification('任务标题不能为空', 'error');
            return;
        }

        this.saveTasks();
        this.updateUI();
        this.showNotification('任务已更新', 'success');
        modal.remove();
    }

    // 添加分类
    addCategory() {
        const categoryInput = document.getElementById('categoryInput');
        const categoryName = categoryInput.value.trim();

        if (!categoryName) {
            this.showNotification('请输入分类名称', 'error');
            return;
        }

        if (this.categories.includes(categoryName)) {
            this.showNotification('该分类已存在', 'error');
            return;
        }

        this.categories.push(categoryName);
        this.saveCategories();
        this.renderCategories();
        // 自动选中新添加的分类
        const categorySelect = document.getElementById('categorySelect');
        if (categorySelect) categorySelect.value = categoryName;
        categoryInput.value = '';
        this.showNotification(`分类"${categoryName}"添加成功！`, 'success');
    }

    // 删除分类
    deleteCategory(categoryName) {
        if (confirm(`确定要删除分类"${categoryName}"吗？该分类下的任务将移动到"默认"分类。`)) {
            this.categories = this.categories.filter(cat => cat !== categoryName);

            // 将该分类的任务移动到默认分类
            this.tasks.forEach(task => {
                if (task.category === categoryName) {
                    task.category = '默认';
                }
            });

            this.saveCategories();
            this.saveTasks();
            this.renderCategories();
            this.updateUI();
            this.showNotification('分类已删除', 'info');
        }
    }

    // 清空已完成任务
    clearCompleted() {
        if (confirm('确定要清空所有已完成的任务吗？')) {
            const completedCount = this.tasks.filter(task => task.completed).length;
            this.tasks = this.tasks.filter(task => !task.completed);
            this.selectedTasks.clear();
            this.saveTasks();
            this.updateUI();
            this.showNotification(`已清空 ${completedCount} 个已完成任务`, 'info');
        }
    }

    // 导出数据
    exportData() {
        const data = {
            tasks: this.tasks,
            categories: this.categories,
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `todo-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.showNotification('数据已导出', 'success');
    }

    // 导入数据
    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.tasks && data.categories) {
                    this.tasks = data.tasks;
                    this.categories = data.categories;
                    this.saveTasks();
                    this.saveCategories();
                    this.updateUI();
                    this.renderCategories();
                    this.showNotification('数据导入成功！', 'success');
                } else {
                    this.showNotification('数据格式不正确', 'error');
                }
            } catch (error) {
                this.showNotification('导入失败：' + error.message, 'error');
            }
        };
        reader.readAsText(file);

        event.target.value = '';
    }

    // 渲染任务列表
    renderTasks() {
        const taskList = document.getElementById('taskList');
        const emptyState = document.getElementById('emptyState');

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

    // 获取筛选后的任务
    getFilteredTasks() {
        let filtered = [...this.tasks];

        // 按完成状态筛选
        if (this.currentFilter === 'pending') {
            filtered = filtered.filter(task => !task.completed);
        } else if (this.currentFilter === 'completed') {
            filtered = filtered.filter(task => task.completed);
        }

        // 按分类筛选
        if (this.currentCategory !== 'all') {
            filtered = filtered.filter(task => task.category === this.currentCategory);
        }

        return filtered;
    }

    // 排序任务
    sortTasks(tasks) {
        const sorted = [...tasks];

        switch (this.currentSort) {
            case 'date':
                sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'priority':
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                sorted.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
                break;
            case 'name':
                sorted.sort((a, b) => a.title.localeCompare(b.title));
                break;
        }

        return sorted;
    }

    // 创建任务元素
    createTaskElement(task) {
        const taskItem = document.createElement('div');
        taskItem.className = `task-item ${task.completed ? 'completed' : ''} ${task.priority}-priority ${this.selectedTasks.has(task.id) ? 'selected' : ''}`;
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

    // HTML转义防止XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 渲染分类
    renderCategories() {
        const categoryList = document.getElementById('categoryList');
        const filterCategory = document.getElementById('filterCategory');
        const categorySelect = document.getElementById('categorySelect');

        // 保存当前选中的值
        const currentFilter = this.currentCategory || 'all';
        const currentSelectValue = categorySelect ? categorySelect.value : '默认';

        categoryList.innerHTML = `<span class="category-tag ${currentFilter === 'all' ? 'active' : ''}" data-category="all">全部</span>`;
        filterCategory.innerHTML = '<option value="all">所有分类</option>';
        categorySelect.innerHTML = '';

        this.categories.forEach(category => {
            // 添加到分类标签
            const categoryTag = document.createElement('span');
            categoryTag.className = `category-tag ${currentFilter === category ? 'active' : ''}`;
            categoryTag.dataset.category = category;
            categoryTag.textContent = category;

            const deleteBtn = document.createElement('span');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '✕';
            deleteBtn.title = '删除分类';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.deleteCategory(category);
            };

            categoryTag.appendChild(deleteBtn);
            categoryList.appendChild(categoryTag);

            // 添加到筛选下拉框
            const filterOption = document.createElement('option');
            filterOption.value = category;
            filterOption.textContent = category;
            filterCategory.appendChild(filterOption);

            // 添加到任务创建分类选择框
            const selectOption = document.createElement('option');
            selectOption.value = category;
            selectOption.textContent = category;
            if (category === currentSelectValue) selectOption.selected = true;
            categorySelect.appendChild(selectOption);
        });

        // 恢复选中状态
        filterCategory.value = currentFilter;
    }

    // 更新统计信息
    updateStats() {
        const totalTasks = this.tasks.length;
        const pendingTasks = this.tasks.filter(task => !task.completed).length;
        const completedTasks = totalTasks - pendingTasks;
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        // 动画数字更新
        this.animateNumber('totalTasks', totalTasks);
        this.animateNumber('pendingTasks', pendingTasks);
        this.animateNumber('completedTasks', completedTasks);
        document.getElementById('completionRate').textContent = completionRate + '%';
    }

    // 数字滚动动画
    animateNumber(elementId, targetValue) {
        const element = document.getElementById(elementId);
        const startValue = parseInt(element.textContent) || 0;
        const duration = 300;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const currentValue = Math.round(startValue + (targetValue - startValue) * easeProgress);
            element.textContent = currentValue;

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }

    // 显示通知
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    // 保存和加载数据
    saveTasks() {
        localStorage.setItem('todoTasks', JSON.stringify({
            tasks: this.tasks,
            nextId: this.nextId
        }));
    }

    loadTasks() {
        const saved = localStorage.getItem('todoTasks');
        if (saved) {
            const data = JSON.parse(saved);
            if (data && data.tasks) {
                this.nextId = data.nextId || (data.tasks.length > 0 ? Math.max(...data.tasks.map(t => t.id)) + 1 : 1);
                return data.tasks;
            }
            return data || [];
        }
        return [];
    }

    saveCategories() {
        localStorage.setItem('todoCategories', JSON.stringify(this.categories));
    }

    loadCategories() {
        const saved = localStorage.getItem('todoCategories');
        return saved ? JSON.parse(saved) : ['工作', '学习', '生活', '购物'];
    }
}

// 初始化应用
window.todoManager = new TodoManager();