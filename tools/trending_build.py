#!/usr/bin/env python3
"""
GitHub 每日热门 → 全中文数据构建脚本
抓取 GitHub 近 24h 高分项目 → 行业分类 → DeepSeek 汉化简介 → 写 trend/data.json
仅用标准库；DEEPSEEK_API_KEY 缺失或失败时自动降级为英文简介（页面照常可用）。
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


def translate(items, key):
    """批量汉化简介：一次调用翻译全部；返回 {full_name: 中文简介}"""
    payload = [{"i": it["rank"], "t": f"{it['name']}: {it['descEn']}"} for it in items]
    body = json.dumps({
        "model": "deepseek-chat",
        "temperature": 0.3,
        "max_tokens": 4000,
        "messages": [
            {"role": "system", "content":
                "你是科技资讯编辑。把每个 GitHub 项目的英文简介翻译成简洁生动的简体中文（15-40字），"
                "专有名词保留英文（如 React、LLM）。只输出 JSON 数组：[{\"i\":序号,\"t\":\"中文简介\"}]，不要输出其他内容。"},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        "https://api.deepseek.com/chat/completions", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        text = json.loads(resp.read())["choices"][0]["message"]["content"]
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    out = {}
    for row in json.loads(text):
        out[row["i"]] = str(row["t"]).strip()
    return out


def main():
    token = os.environ.get("GITHUB_TOKEN", "")
    ds_key = os.environ.get("DEEPSEEK_API_KEY", "")
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

    if ds_key:
        print("[INFO] DeepSeek 汉化简介…", file=sys.stderr)
        try:
            zh = translate(items, ds_key)
            for it in items:
                it["desc"] = zh.get(it["rank"]) or it["descEn"]
            print(f"[INFO] 汉化完成 {len(zh)}/{len(items)}", file=sys.stderr)
        except Exception as e:
            print(f"[WARN] 汉化失败，降级英文简介: {e}", file=sys.stderr)
            for it in items:
                it["desc"] = it["descEn"]
    else:
        print("[WARN] 未设置 DEEPSEEK_API_KEY，简介保持英文", file=sys.stderr)
        for it in items:
            it["desc"] = it["descEn"]

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
