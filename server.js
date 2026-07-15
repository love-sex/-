const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'db.json');

// ==================== 数据库操作 ====================
function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            return data;
        }
    } catch (e) {
        console.error('数据库加载失败:', e.message);
    }
    return { users: [], tasks: {} };
}

function saveDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('数据库保存失败:', e.message);
        return false;
    }
}

// ==================== Token操作 ====================
function createToken(username) {
    const payload = {
        username,
        exp: Date.now() + 24 * 60 * 60 * 1000
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function verifyToken(token) {
    if (!token) return null;
    try {
        const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
        if (payload.exp < Date.now()) return null;
        return payload.username;
    } catch {
        return null;
    }
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password + 'todo_salt_2024').digest('hex');
}

function getAuthUser(req) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.substring(7);
    return verifyToken(token);
}

// ==================== HTTP工具函数 ====================
function sendJSON(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    });
    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

function serveFile(res, filename) {
    const filePath = path.join(__dirname, filename);
    const extname = path.extname(filePath);
    const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
    };
    const contentType = mimeTypes[extname] || 'text/plain';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
}

// ==================== API路由 ====================
async function handleAPI(req, res, pathname) {
    // 注册
    if (pathname === '/api/register' && req.method === 'POST') {
        try {
            const { username, password } = await readBody(req);

            if (!username || !password) {
                return sendJSON(res, 400, { error: '用户名和密码不能为空' });
            }
            if (username.length < 2 || username.length > 20) {
                return sendJSON(res, 400, { error: '用户名长度应为2-20个字符' });
            }
            if (password.length < 6) {
                return sendJSON(res, 400, { error: '密码长度至少6位' });
            }

            const db = loadDB();
            if (db.users.find(u => u.username === username)) {
                return sendJSON(res, 400, { error: '用户名已存在' });
            }

            db.users.push({
                username,
                password: hashPassword(password),
                createdAt: new Date().toISOString()
            });
            db.tasks[username] = [];

            if (saveDB(db)) {
                const token = createToken(username);
                sendJSON(res, 200, {
                    message: '注册成功',
                    token,
                    user: { username }
                });
            } else {
                sendJSON(res, 500, { error: '注册失败，请重试' });
            }
        } catch (e) {
            sendJSON(res, 400, { error: '请求格式错误' });
        }
        return;
    }

    // 登录
    if (pathname === '/api/login' && req.method === 'POST') {
        try {
            const { username, password } = await readBody(req);

            if (!username || !password) {
                return sendJSON(res, 400, { error: '用户名和密码不能为空' });
            }

            const db = loadDB();
            const user = db.users.find(u => u.username === username);

            if (!user || user.password !== hashPassword(password)) {
                return sendJSON(res, 400, { error: '用户名或密码错误' });
            }

            const token = createToken(username);
            sendJSON(res, 200, {
                message: '登录成功',
                token,
                user: { username }
            });
        } catch (e) {
            sendJSON(res, 400, { error: '请求格式错误' });
        }
        return;
    }

    // 获取当前用户信息
    if (pathname === '/api/me' && req.method === 'GET') {
        const username = getAuthUser(req);
        if (!username) return sendJSON(res, 401, { error: '未登录' });
        sendJSON(res, 200, { user: { username } });
        return;
    }

    // 获取任务列表
    if (pathname === '/api/tasks' && req.method === 'GET') {
        const username = getAuthUser(req);
        if (!username) return sendJSON(res, 401, { error: '未登录' });

        const db = loadDB();
        const userTasks = db.tasks[username] || [];
        sendJSON(res, 200, { tasks: userTasks });
        return;
    }

    // 保存任务列表
    if (pathname === '/api/tasks' && req.method === 'POST') {
        const username = getAuthUser(req);
        if (!username) return sendJSON(res, 401, { error: '未登录' });

        try {
            const { tasks } = await readBody(req);
            const db = loadDB();
            db.tasks[username] = tasks || [];
            if (saveDB(db)) {
                sendJSON(res, 200, { message: '保存成功' });
            } else {
                sendJSON(res, 500, { error: '保存失败' });
            }
        } catch (e) {
            sendJSON(res, 400, { error: '请求格式错误' });
        }
        return;
    }

    // 登出（前端清除token即可，后端无需处理）
    if (pathname === '/api/logout' && req.method === 'POST') {
        sendJSON(res, 200, { message: '登出成功' });
        return;
    }

    sendJSON(res, 404, { error: 'API不存在' });
}

// ==================== 服务器 ====================
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // CORS预检
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization'
        });
        res.end();
        return;
    }

    // API路由
    if (pathname.startsWith('/api/')) {
        handleAPI(req, res, pathname);
        return;
    }

    // 静态文件
    if (pathname === '/' || pathname === '') {
        serveFile(res, 'index.html');
        return;
    }

    const filePath = pathname.substring(1);
    serveFile(res, filePath);
});

server.listen(PORT, () => {
    console.log(`✅ 服务器运行在 http://localhost:${PORT}/`);
    console.log(`📁 数据库文件: ${DB_FILE}`);
});
