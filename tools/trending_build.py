#!/usr/bin/env python3
"""
GitHub 每日/每周/每月热门 → 全中文数据构建脚本
抓取 GitHub 高分项目（三个周期）→ 16 大行业分类 → 免费翻译（Google→MyMemory）→ 写 trend/data.json
仅用标准库，无需任何 API 密钥；翻译源全部不可用时降级为英文简介。
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

PERIODS = {
    "daily": {"days": 1, "min_stars": 10, "limit": 30, "label": "今日"},
    "weekly": {"days": 7, "min_stars": 50, "limit": 40, "label": "本周"},
    "monthly": {"days": 30, "min_stars": 100, "limit": 40, "label": "本月"},
}
LANGUAGES = ["", "python", "javascript", "typescript", "go", "rust",
             "java", "cpp", "swift", "kotlin", "ruby", "php"]

LANG_CN = {
    "python": "Python", "javascript": "JavaScript", "typescript": "TypeScript",
    "go": "Go", "rust": "Rust", "java": "Java", "cpp": "C++", "c": "C",
    "swift": "Swift", "kotlin": "Kotlin", "ruby": "Ruby", "php": "PHP",
    "c#": "C#", "html": "HTML", "css": "CSS", "shell": "Shell", "vue": "Vue",
    "dart": "Dart", "jupyter notebook": "Jupyter", "zig": "Zig", "lua": "Lua",
}

# 16 大行业：名称 → 关键词（匹配 name+topics+description 小写）。顺序即优先级，特异词在前。
INDUSTRIES = [
    ("AI · 大模型", ["llm", "gpt", "openai", "claude", "gemini", "agent framework", "ai agent",
                 "rag", "diffusion", "stable-diffusion", "transformer", "fine-tun", "prompt",
                 "chatbot", "mcp", "inference", "embedding", "vector database", "text-to-",
                 "speech", "voice", "ocr", "copilot", "chatgpt", "deepseek", "machine-learning"]),
    ("浏览器 · 插件", ["browser extension", "chrome extension", "userscript", "tampermonkey",
                  "油猴", "greasemonkey", "bookmarklet"]),
    ("游戏", ["game engine", "godot", "unity", "unreal", "emulator", "minecraft", "roguelike",
            "game", "gaming", "chess", "mahjong", "rpg"]),
    ("多媒体 · 影音", ["video", "player", "ffmpeg", "subtitle", "music", "audio", "spotify",
                "youtube", "bilibili", "streaming", "podcast", "downloader", "photo",
                "image editor", "blender", "3d ", "render", "animation", "wallpaper"]),
    ("安全", ["security", "pentest", "hacking", "exploit", "malware", "vulnerability",
            "cve", "scanner", "password manager", "encrypt", "osint", "firewall", "waf",
            "red team", "reverse engineer"]),
    ("区块链 · 金融", ["bitcoin", "crypto", "blockchain", "web3", "solana", "ethereum", "defi",
               "trading", "quant", "stock", "fintech", "payment", "invoice", "ledger"]),
    ("物联网 · 硬件", ["iot", "arduino", "raspberry", "esp32", "home assistant", "smart home",
               "firmware", "embedded", "rtos", "3d printer", "drone", "robot", "sensor"]),
    ("数据 · 数据库", ["database", "sql", "postgres", "mysql", "sqlite", "redis", "mongodb",
               "clickhouse", "duckdb", "etl", "spark", "flink", "data engineering",
               "analytics", "timeseries", "lakehouse", "dataviz", "visualization", "chart"]),
    ("运维 · 云原生", ["kubernetes", "k8s", "docker", "devops", "terraform", "ansible",
               "self-hosted", "homelab", "proxy", "tunnel", "vpn", "reverse proxy",
               "monitoring", "observability", "ci/cd", "deployment", "serverless",
               "nginx", "dotfiles"]),
    ("前端 · 网页", ["react", "vue", "svelte", "next.js", "nuxt", "tailwind", "css", "ui kit",
              "component library", "web app", "frontend", "landing", "website", "portfolio",
              "electron", "tauri", "webgl", "canvas"]),
    ("移动端", ["android", "ios app", "flutter", "react native", "swiftui", "jetpack compose",
             "mobile app", "miniapp", "app store", "apk"]),
    ("学习 · 资源", ["awesome", "tutorial", "roadmap", "interview", "algorithm", "leetcode",
              "course", "cheatsheet", "system-design", "computer science", "papers",
              "textbook", "exam", "study"]),
    ("效率 · 办公", ["note", "productivity", "rss", "wiki", "todo", "calendar", "markdown editor",
              "knowledge base", "backup", "download manager", "tracker", "expense",
              "finance tracker", "habit", "resume"]),
    ("后端 · 服务", ["api", "microservice", "grpc", "graphql", "web framework", "backend",
              "rest", "websocket", "gateway", "queue", "cron", "scheduler", "auth",
              "oauth", "ssr", "template"]),
    ("科学 · 计算", ["physics", "simulation", "scientific", "numerical", "math", "genome",
              "bioinformatic", "chemistry", "astronomy", "gis", "map "]),
    ("其他 · 综合", []),
]


def classify(name, desc, topics):
    # topics 权重最高（作者自己标的领域），其次仓库名，最后描述
    t = (" ".join(topics) + " " + name + " " + (desc or "")).lower()
    for tag, kws in INDUSTRIES:
        for kw in kws:
            if kw in t:
                return tag
    return "其他 · 综合"


def http_json(url, headers, timeout=25):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def gh_fetch(period, cfg, token):
    """按周期抓取：新晋爆红 + 活跃高分（排除 20 万星常青树防霸榜），多语言补充多样性"""
    since = (datetime.now(timezone.utc) - timedelta(days=cfg["days"])).strftime("%Y-%m-%d")
    created = (datetime.now(timezone.utc) - timedelta(days=max(cfg["days"] * 2, 60))).strftime("%Y-%m-%d")
    ms = cfg["min_stars"]
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ccgcct-trending/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    seen, pool = set(), []
    queries = [f"created:>={created} stars:{ms}..200000",
               f"pushed:>={since} stars:{ms}..200000"]
    for lang in LANGUAGES[1:]:
        queries.append(f"pushed:>={since} stars:{ms}..200000 language:{lang}")

    for q in queries:
        if len(pool) >= cfg["limit"] * 3:
            break
        params = urllib.parse.urlencode({"q": q, "sort": "stars", "order": "desc", "per_page": 25})
        try:
            items = http_json(f"https://api.github.com/search/repositories?{params}", headers).get("items", [])
        except Exception as e:
            print(f"[WARN] {q[:44]}… -> {e}", file=sys.stderr)
            continue
        for it in items:
            fn = it.get("full_name")
            if fn and fn not in seen:
                seen.add(fn)
                pool.append(it)
        time.sleep(6)  # 无 token 限额 10 次/分钟，保守等待

    pool.sort(key=lambda r: r.get("stargazers_count", 0), reverse=True)
    return pool[:cfg["limit"]]


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


def build_period(period, cfg, token):
    repos = gh_fetch(period, cfg, token)
    if not repos:
        return {"label": cfg["label"], "count": 0, "items": []}
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
    # 汉化
    ok = 0
    for it in items:
        zh = translate_one(it["descEn"]) if it["descEn"] else ""
        if zh:
            it["desc"] = zh
            ok += 1
        else:
            it["desc"] = it["descEn"]
        time.sleep(0.3)
    print(f"[INFO] {cfg['label']}榜：{len(items)} 个项目，汉化 {ok}", file=sys.stderr)
    return {"label": cfg["label"], "count": len(items), "items": items}


def main():
    token = os.environ.get("GITHUB_TOKEN", "")
    out_path = sys.argv[1] if len(sys.argv) > 1 else "trend/data.json"

    tz = timezone(timedelta(hours=8))
    now = datetime.now(tz)
    data = {
        "date": now.strftime("%Y-%m-%d"),
        "generatedAt": now.strftime("%Y-%m-%d %H:%M"),
        "periods": {},
    }
    for period, cfg in PERIODS.items():
        print(f"[INFO] 抓取 GitHub {cfg['label']}热门…", file=sys.stderr)
        data["periods"][period] = build_period(period, cfg, token)

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    total = sum(p["count"] for p in data["periods"].values())
    print(f"[INFO] 已写入 {out_path}（{data['date']}，共 {total} 个项目）", file=sys.stderr)


if __name__ == "__main__":
    main()
