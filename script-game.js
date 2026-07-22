/* ============================================
   游戏化系统 - 经验值、等级、成就
   ============================================ */

class GamificationManager {
    constructor() {
        this.data = this.loadData();
        this.init();
    }

    loadData() {
        try {
            const saved = localStorage.getItem('todoApp_gamification');
            return saved ? JSON.parse(saved) : this.getDefaultData();
        } catch { return this.getDefaultData(); }
    }

    getDefaultData() {
        return {
            exp: 0,
            level: 1,
            combo: 0,
            maxCombo: 0,
            totalCompleted: 0,
            achievements: [],
            lastActiveDate: null,
            streak: 0,
            taskHistory: []
        };
    }

    saveData() {
        localStorage.setItem('todoApp_gamification', JSON.stringify(this.data));
    }

    init() {
        this.updateStreak();
        this.checkDailyBonus();
    }

    // 获取等级信息
    getLevelInfo(level) {
        const levels = [
            { level: 1, name: '新手', icon: '🌱', expRequired: 0 },
            { level: 2, name: '初学者', icon: '📝', expRequired: 100 },
            { level: 3, name: '勤奋者', icon: '💪', expRequired: 300 },
            { level: 4, name: '高效达人', icon: '⚡', expRequired: 600 },
            { level: 5, name: '任务大师', icon: '🏆', expRequired: 1000 },
            { level: 6, name: '效率之王', icon: '👑', expRequired: 1500 },
            { level: 7, name: '传奇', icon: '🌟', expRequired: 2100 },
            { level: 8, name: '神话', icon: '🔮', expRequired: 2800 },
            { level: 9, name: '超凡', icon: '🚀', expRequired: 3600 },
            { level: 10, name: '至高', icon: '💎', expRequired: 4500 }
        ];
        return levels.find(l => l.level === level) || levels[0];
    }

    // 获取升级所需经验
    getExpForNextLevel() {
        return this.getLevelInfo(this.data.level + 1).expRequired;
    }

    // 获取当前等级进度
    getLevelProgress() {
        const current = this.getLevelInfo(this.data.level);
        const next = this.getLevelInfo(this.data.level + 1);
        const currentExp = this.data.exp - current.expRequired;
        const neededExp = next.expRequired - current.expRequired;
        return Math.min(100, Math.round((currentExp / neededExp) * 100));
    }

    // 添加经验值
    addExp(amount, reason = '') {
        this.data.exp += amount;
        this.data.combo++;

        if (this.data.combo > this.data.maxCombo) {
            this.data.maxCombo = this.data.combo;
        }

        // 检查升级
        let leveledUp = false;
        while (this.data.exp >= this.getExpForNextLevel()) {
            this.data.level++;
            leveledUp = true;
        }

        this.saveData();
        return { leveledUp, amount, reason };
    }

    // 完成任务获得经验
    completeTask(task) {
        this.data.totalCompleted++;
        this.data.taskHistory.push({
            id: task.id,
            title: task.title,
            priority: task.priority,
            completedAt: Date.now()
        });

        // 基础经验
        let exp = 10;

        // 优先级加成
        if (task.priority === 'high') exp += 15;
        else if (task.priority === 'medium') exp += 10;
        else exp += 5;

        // 连击加成
        if (this.data.combo >= 5) exp += 20;
        else if (this.data.combo >= 3) exp += 10;

        const result = this.addExp(exp, `完成任务: ${task.title}`);

        // 检查成就
        this.checkAchievements();

        return result;
    }

    // 更新连续活跃天数
    updateStreak() {
        const today = new Date().toDateString();
        if (this.data.lastActiveDate !== today) {
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            if (this.data.lastActiveDate === yesterday) {
                this.data.streak++;
            } else if (this.data.lastActiveDate !== today) {
                this.data.streak = 1;
            }
            this.data.lastActiveDate = today;
            this.saveData();
        }
    }

    // 检查每日奖励
    checkDailyBonus() {
        if (this.data.streak >= 7) {
            this.addExp(50, '连续7天活跃奖励');
        } else if (this.data.streak >= 3) {
            this.addExp(20, '连续3天活跃奖励');
        }
    }

    // 检查成就
    checkAchievements() {
        const achievements = this.getAchievementDefs();
        const newAchievements = [];

        achievements.forEach(ach => {
            if (!this.data.achievements.includes(ach.id) && ach.condition(this.data)) {
                this.data.achievements.push(ach.id);
                newAchievements.push(ach);
            }
        });

        if (newAchievements.length > 0) {
            this.saveData();
        }

        return newAchievements;
    }

    // 成就定义
    getAchievementDefs() {
        return [
            { id: 'first_task', name: '初次尝试', desc: '完成第一个任务', icon: '🎯', condition: d => d.totalCompleted >= 1 },
            { id: 'ten_tasks', name: '小有成就', desc: '完成10个任务', icon: '📋', condition: d => d.totalCompleted >= 10 },
            { id: 'fifty_tasks', name: '任务达人', desc: '完成50个任务', icon: '🏆', condition: d => d.totalCompleted >= 50 },
            { id: 'hundred_tasks', name: '百战百胜', desc: '完成100个任务', icon: '💯', condition: d => d.totalCompleted >= 100 },
            { id: 'combo_3', name: '三连击', desc: '连续完成3个任务', icon: '⚡', condition: d => d.maxCombo >= 3 },
            { id: 'combo_5', name: '五连绝世', desc: '连续完成5个任务', icon: '🔥', condition: d => d.maxCombo >= 5 },
            { id: 'combo_10', name: '十连超凡', desc: '连续完成10个任务', icon: '🌟', condition: d => d.maxCombo >= 10 },
            { id: 'streak_3', name: '坚持三天', desc: '连续3天使用', icon: '📅', condition: d => d.streak >= 3 },
            { id: 'streak_7', name: '周冠军', desc: '连续7天使用', icon: '🏅', condition: d => d.streak >= 7 },
            { id: 'level_5', name: '中级玩家', desc: '达到5级', icon: '⭐', condition: d => d.level >= 5 },
            { id: 'level_10', name: '满级大佬', desc: '达到10级', icon: '💎', condition: d => d.level >= 10 }
        ];
    }

    // 获取已解锁成就
    getUnlockedAchievements() {
        const all = this.getAchievementDefs();
        return all.filter(a => this.data.achievements.includes(a.id));
    }

    // 获取未解锁成就
    getLockedAchievements() {
        const all = this.getAchievementDefs();
        return all.filter(a => !this.data.achievements.includes(a.id));
    }

    // 重置游戏数据
    reset() {
        this.data = this.getDefaultData();
        this.saveData();
    }
}

// ==================== AI机器人拖拽功能 ====================
function initDraggableAI() {
    const container = document.querySelector('.game-container');
    if (!container) return;

    let isDragging = false;
    let startX, startY;
    let startRight, startBottom;

    // 鼠标按下开始拖拽
    container.addEventListener('mousedown', (e) => {
        // 如果点击的是角色本身或经验条，才允许拖拽
        if (!e.target.closest('.assistant-character') && !e.target.closest('.exp-bar-container')) return;
        e.preventDefault();
        isDragging = true;
        container.classList.add('dragging');

        startX = e.clientX;
        startY = e.clientY;

        // 获取当前位置（从 computed style 获取 bottom/right）
        const style = window.getComputedStyle(container);
        startRight = parseInt(style.right) || 20;
        startBottom = parseInt(style.bottom) || 20;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // 触摸事件支持（移动端）
    container.addEventListener('touchstart', (e) => {
        if (!e.target.closest('.assistant-character') && !e.target.closest('.exp-bar-container')) return;
        isDragging = true;
        container.classList.add('dragging');

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;

        const style = window.getComputedStyle(container);
        startRight = parseInt(style.right) || 20;
        startBottom = parseInt(style.bottom) || 20;

        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
    }, { passive: true });

    function onMouseMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        moveTo(e.clientX, e.clientY);
    }

    function onTouchMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        moveTo(touch.clientX, touch.clientY);
    }

    function moveTo(clientX, clientY) {
        const deltaX = startX - clientX;
        const deltaY = startY - clientY;

        let newRight = startRight + deltaX;
        let newBottom = startBottom + deltaY;

        // 限制在窗口范围内
        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
        const maxRight = window.innerWidth - containerWidth;
        const maxBottom = window.innerHeight - containerHeight;

        newRight = Math.max(0, Math.min(newRight, maxRight));
        newBottom = Math.max(0, Math.min(newBottom, maxBottom));

        container.style.right = newRight + 'px';
        container.style.bottom = newBottom + 'px';
        container.style.left = 'auto';
        container.style.top = 'auto';
    }

    function onMouseUp() {
        endDrag();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    function onTouchEnd() {
        endDrag();
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
    }

    function endDrag() {
        isDragging = false;
        container.classList.remove('dragging');
    }
}

// ==================== 全局实例 ====================
let gameManager;

document.addEventListener('DOMContentLoaded', () => {
    gameManager = new GamificationManager();
    initDraggableAI();
});
