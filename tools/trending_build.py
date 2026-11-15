#!/usr/bin/env python3
"""
GitHub 每日热门 → 全中文数据构建脚本
抓取 GitHub 近 24h 高分项目 → 行业分类 → 免费翻译（Google→MyMemory）→ 写 trend/data.json
仅用标准库，无需任何 API 密钥；翻译源全部不可用时降级为英文简介。
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

LIMIT = 30
LANGUAGES = ["", "python", "javascript", "typescript", "go", "rust",
             "java", "cpp", "swift", "kotlin", "ruby", "php"]

LANG_CN = {
    "python": "Python", "javascript": "JavaScript", "typescript": "TypeScript",
    "go": "Go", "rust": "Rust", "java": "Java", "cpp": "C++", "c": "C",
    "swift": "Swift", "kotlin": "Kotlin", "ruby": "Ruby", "php": "PHP",
    "c#": "C#", "html": "HTML", "css": "CSS", "shell": "Shell", "vue": "Vue",
    "dart": "Dart", "jupyter notebook": "Jupyter", "zig": "Zig", "lua": "Lua",
}

# 行业分类：按 (关键词, 行业) 匹配 name+description+topics；顺序即优先级
INDUSTRIES = [
    ("AI · 大模型", ["ai", "llm", "gpt", "agent", "rag", "diffusion", "stable", "transformer",
                 "machine-learning", "deep-learning", "neural", "chatbot", "ml ", "claude",
                 "gemini", "openai", "mcp", "prompt", "inference", "fine-tune", "vision",
                 "ocr", "tts", "asr", "voice", "speech", "embedding", "vector-db", "moe"]),
    ("开发工具", ["cli", "terminal", "editor", "ide", "debugger", "vscode", "neovim", "git",
               "framework", "sdk", "compiler", "linter", "formatter", "snippet", "shell",
               "zsh", "dotfiles", "toolkit", "library", "binding", "runtime"]),
    ("前端 · 移动", ["react", "vue", "svelte", "next.js", "nuxt", "css", "tailwind", "ui ",
               "component", "web", "frontend", "android", "ios", "flutter", "swiftui",
               "compose", "miniapp", "mini-program", "electron", "tauri"]),
    ("数据 · 数据库", ["database", "sql", "postgres", "mysql", "sqlite", "redis", "mongodb",
                 "clickhouse", "duckdb", "data", "etl", "spark", "flink", "warehouse",
                 "analytics", "timeseries", "parquet", "lakehouse"]),
    ("运维 · 云", ["docker", "kubernetes", "k8s", "devops", "terraform", "ansible", "proxy",
               "tunnel", "vpn", "self-hosted", "homelab", "server", "nginx", "monitor",
               "deploy", "cloud", "container", "waf"]),
    ("安全", ["security", "pentest", "hacking", "exploit", "malware", "vulnerability",
            "scanner", "cve", "password", "encrypt", "auth", "firewall", "osint"]),
    ("游戏 · 多媒体", ["game", "unity", "godot", "unreal", "emulator", "minecraft", "roguelike",
                "video", "audio", "music", "player", "stream", "ffmpeg", "image", "photo",
                "3d", "blender", "renderer", "animation"]),
    ("区块链", ["bitcoin", "crypto", "blockchain", "web3", "solana", "ethereum", "defi",
             "nft", "trading-bot", "quant"]),
    ("学习 · 资源", ["awesome", "tutorial", "roadmap", "interview", "algorithm", "leetcode",
               "course", "learn", "book", "cheatsheet", "list ", "guide", "notes",
               "system-design", "cs ", "papers"]),
    ("效率 · 生活", ["note", "productivity", "rss", "automation", "finance", "money", "health",
               "fitness", "recipe", "home", "calendar", "todo", "wiki", "backup",
               "download", "youtube", "bilibili", "tracker"]),
]


def classify(name, desc, topics):
    text = (name + " " + (desc or "") + " " + " ".join(topics)).lower()
    for tag, kws in INDUSTRIES:
        for kw in kws:
            if kw in text:
                return tag
    return "其他 · 综合"


def http_json(url, headers, timeout=25):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def gh_fetch(token):
    """抓取每日热点：排除超巨常青树，混入新晋爆红项目，保证每天榜单有变化"""
    since = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    created = (datetime.now(timezone.utc) - timedelta(days=60)).strftime("%Y-%m-%d")
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ccgcct-trending/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    seen, pool = set(), []
    # 1) 新晋爆红：60 天内创建且已获 100+ 星（真正的每日热点）
    # 2) 近 24h 活跃的高分项目（排除 20 万星以上常青树，避免霸榜）
    queries = [f"created:>={created} stars:100..200000",
               f"pushed:>={since} stars:10..200000"]
    for lang in LANGUAGES[1:]:
        queries.append(f"pushed:>={since} stars:50..200000 language:{lang}")

    for q in queries:
        if len(pool) >= LIMIT * 3:
            break
        params = urllib.parse.urlencode({"q": q, "sort": "stars", "order": "desc", "per_page": 25})
        try:
            items = http_json(f"https://api.github.com/search/repositories?{params}", headers).get("items", [])
        except Exception as e:
            print(f"[WARN] {q[:40]}… -> {e}", file=sys.stderr)
            continue
        for it in items:
            fn = it.get("full_name")
            if fn and fn not in seen:
                seen.add(fn)
                pool.append(it)
        time.sleep(6)  # 无 token 限额 10 次/分钟，保守等待

    pool.sort(key=lambda r: r.get("stargazers_count", 0), reverse=True)
    return pool[:LIMIT]


def translate_google(text):
    """Google 翻译非官方接口（免费无密钥；Actions 服务器在美国可达）"""
    params = urllib.parse.urlencode({
        "client": "gtx", "sl": "en", "tl": "zh-CN", "dt": "t", "q": text[:1500],
    })
    url = f"https://translate.googleapis.com/translate_a/single?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())
    return "".join(seg[0] for seg in data[0] if seg and seg[0])


def translate_mymemory(text):
    """MyMemory 免费翻译 API（备用，无需密钥）"""
    params = urllib.parse.urlencode({
        "q": text[:480], "langpair": "en|zh-CN",
    })
    url = f"https://api.mymemory.translated.net/get?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())
    t = (data.get("responseData") or {}).get("translatedText", "")
    if "MYMEMORY WARNING" in t or "QUERY LENGTH LIMIT" in t.upper():
        return ""
    return t


def translate_one(text):
    """免费翻译链：Google → MyMemory → 原文"""
    for fn in (translate_google, translate_mymemory):
        try:
            t = fn(text).strip()
            if t:
                return t
        except Exception:
            continue
    return ""


def translate_all(items):
    """逐条汉化简介，返回成功条数"""
    ok = 0
    for it in items:
        zh = translate_one(it["descEn"])
        if zh:
            it["desc"] = zh
            ok += 1
        time.sleep(0.3)
    return ok


def main():
    token = os.environ.get("GITHUB_TOKEN", "")
    out_path = sys.argv[1] if len(sys.argv) > 1 else "trend/data.json"

    print("[INFO] 抓取 GitHub 每日热门…", file=sys.stderr)
    repos = gh_fetch(token)
    if not repos:
        print("[ERROR] 未抓到数据", file=sys.stderr)
        sys.exit(1)

    tz = timezone(timedelta(hours=8))
    now = datetime.now(tz)
    items = []
    for i, r in enumerate(repos, 1):
        topics = (r.get("topics") or [])[:4]
        desc = (r.get("description") or "").strip()
        items.append({
            "rank": i,
            "name": r["full_name"],
            "url": r["html_url"],
            "descEn": desc[:200],
            "stars": r.get("stargazers_count", 0),
            "forks": r.get("forks_count", 0),
            "language": r.get("language") or "",
            "langCN": LANG_CN.get((r.get("language") or "").lower(), r.get("language") or ""),
            "topics": topics,
            "industry": classify(r["full_name"], desc, topics),
            "avatar": f"https://github.com/{r['full_name'].split('/')[0]}.png?size=64",
        })

    print("[INFO] 免费汉化简介（Google → MyMemory 兜底）…", file=sys.stderr)
    ok = translate_all(items)
    if ok:
        print(f"[INFO] 汉化完成 {ok}/{len(items)}", file=sys.stderr)
    else:
        print("[WARN] 全部翻译源不可用，简介保持英文", file=sys.stderr)

    data = {
        "date": now.strftime("%Y-%m-%d"),
        "generatedAt": now.strftime("%Y-%m-%d %H:%M"),
        "count": len(items),
        "items": items,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"[INFO] 已写入 {out_path}（{data['date']}，{data['count']} 个项目）", file=sys.stderr)


if __name__ == "__main__":
    main()
