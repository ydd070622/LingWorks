"""小红书创作者中心数据采集模块

策略：
1. route 拦截 API（获取粉丝数等账号数据）
2. 在 SPA 中点击「笔记管理」加载笔记列表
3. 从 DOM 提取笔记数据+指标
"""

import asyncio
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright, Page, Route

try:
    from database import save_notes, save_account_snapshot
except ImportError:
    save_notes = None
    save_account_snapshot = None

SESSION_DIR = Path(__file__).parent / "session"
DEBUG_DIR = SESSION_DIR / "debug"
CREATOR_URL = "https://creator.xiaohongshu.com"
SCAN_TIMEOUT = 120_000


class XHSScraper:
    def __init__(self, headless: bool = False):
        self.headless = headless
        self.playwright = None
        self.context = None
        self.page: Optional[Page] = None
        self.api_data: dict[str, dict] = {}

    async def __aenter__(self):
        SESSION_DIR.mkdir(parents=True, exist_ok=True)
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        self.playwright = await async_playwright().start()
        self.context = await self.playwright.chromium.launch_persistent_context(
            user_data_dir=str(SESSION_DIR / "browser_data"),
            headless=self.headless,
            viewport={"width": 1280, "height": 900},
            locale="zh-CN",
            timezone_id="Asia/Shanghai",
            device_scale_factor=2,
            args=["--disable-blink-features=AutomationControlled"],
        )
        self.page = self.context.pages[0] if self.context.pages else await self.context.new_page()
        await self._inject_stealth()
        return self

    async def __aexit__(self, *args):
        if self.context:
            await self.context.close()
        if self.playwright:
            await self.playwright.stop()

    async def _inject_stealth(self):
        await self.page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] });
        """)

    # ---- API 拦截 ----

    async def _setup_api_intercept(self):
        self.api_data = {}
        async def handler(route: Route):
            url = route.request.url
            try:
                response = await route.fetch()
                body = await response.json()
                for key in ["latest_note_data", "account/base", "note_detail_new",
                            "personal_info", "user/info"]:
                    if key in url:
                        self.api_data[key] = body
                        break
                await route.fulfill(response=response)
            except Exception:
                await route.continue_()
        await self.page.route("**/api/galaxy/**", handler)

    def _get_api_data(self, key: str) -> dict:
        body = self.api_data.get(key)
        if not body:
            return {}
        return body.get("data") or body.get("result") or body

    # ---- 登录 ----

    async def ensure_login(self) -> bool:
        await self._setup_api_intercept()
        await self.page.goto(CREATOR_URL, wait_until="domcontentloaded", timeout=30000)
        await self.page.wait_for_timeout(3000)

        if "login" in self.page.url.lower() or "passport" in self.page.url.lower():
            print("=" * 50)
            print("需要登录小红书创作者中心")
            print("请扫码登录...（2 分钟超时）")
            print("=" * 50)
            try:
                await self.page.wait_for_function(
                    "() => !window.location.href.toLowerCase().includes('login') && "
                    "!window.location.href.toLowerCase().includes('passport')",
                    timeout=SCAN_TIMEOUT,
                )
                await self.page.wait_for_timeout(3000)
            except Exception:
                return False

        await self.page.wait_for_load_state("networkidle")
        return True

    # ---- 采集账号数据 ----

    async def scrape_account(self) -> dict:
        data = {"followers": 0, "following": 0, "notes_count": 0}
        d = self._get_api_data("personal_info")
        if d:
            data["followers"] = int(d.get("fans_count") or 0)
            data["following"] = int(d.get("follow_count") or 0)
            data["notes_count"] = int(d.get("note_count") or 0)
        print(f"  粉丝: {data['followers']}, 关注: {data['following']}, 笔记: {data['notes_count']}")
        return data

    # ---- 采集笔记数据（关键改进）----

    async def scrape_notes(self) -> list[dict]:
        print("\n--- 采集笔记数据 ---")
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")

        # 在侧边栏找到「笔记管理」并点击
        print("  侧边栏点击「笔记管理」...")
        try:
            await self._click_sidebar("笔记管理")
        except Exception as e:
            print(f"  点击失败: {e}，尝试直接导航")
            await self.page.goto(f"{CREATOR_URL}/publish/note", wait_until="domcontentloaded", timeout=30000)
            await self.page.wait_for_timeout(5000)

        await self.page.wait_for_timeout(4000)
        try:
            await self.page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass

        # 保存调试
        await self.page.screenshot(path=str(DEBUG_DIR / f"publish_{ts}.png"))
        (DEBUG_DIR / f"publish_{ts}.html").write_text(
            await self.page.content(), encoding="utf-8", errors="replace"
        )

        # === 从页面文本提取笔记 ===
        page_text = await self.page.evaluate("() => document.body.innerText")
        lines = [l.strip() for l in page_text.split("\n") if l.strip()]

        print(f"  页面共 {len(lines)} 行文本")

        # 打印文本行（包含日期或数字的行），跳过太长的文本
        print("  文本内容（行号:内容预览）:")
        for i, l in enumerate(lines):
            if any(c.isdigit() for c in l) and len(l) < 80:
                print(f"    [{i}] {l[:100]}")
            elif i < 25:  # 前25行也打印
                print(f"    [{i}] {l[:100]}")

        # 解析笔记
        notes = self._parse_notes(lines)
        if notes:
            print(f"\n  提取到 {len(notes)} 条笔记:")
            for n in notes:
                print(f"    [{n['publish_date']}] {n['title'][:40]} | 曝:{n['exposure']} 赞:{n['likes']} 收:{n['collects']} 评:{n['comments']} 分:{n['shares']}")
        else:
            print("\n  未提取到笔记，可能在另一个 tab 下")
            # 尝试点击「全部」或「已发布」tab
            await self._click_if_exists("全部")
            await self.page.wait_for_timeout(3000)
            page_text2 = await self.page.evaluate("() => document.body.innerText")
            lines2 = [l.strip() for l in page_text2.split("\n") if l.strip()]
            notes = self._parse_notes(lines2)
            if notes:
                print(f"  点击「全部」后提取到 {len(notes)} 条")
                for n in notes:
                    print(f"    [{n['publish_date']}] {n['title'][:40]} | 曝:{n['exposure']} 赞:{n['likes']} 收:{n['collects']} 评:{n['comments']} 分:{n['shares']}")

        return notes

    async def _click_sidebar(self, text: str):
        """点击侧边栏包含指定文本的菜单项"""
        await self.page.evaluate(f"""
            () => {{
                const items = document.querySelectorAll('a, span, div, li');
                for (const el of items) {{
                    if (el.innerText.trim() === '{text}' && el.offsetParent !== null) {{
                        el.click();
                        return;
                    }}
                }}
                throw new Error('未找到: {text}');
            }}
        """)

    async def _click_if_exists(self, text: str):
        """如果存在则点击"""
        try:
            await self._click_sidebar(text)
        except Exception:
            pass

    def _parse_notes(self, lines: list[str]) -> list[dict]:
        """从文本行中解析笔记列表"""
        notes = []
        date_pattern = re.compile(r"(\d{4}[-/]\d{1,2}[-/]\d{1,2})\s*(\d{1,2}:\d{2})?")

        i = 0
        while i < len(lines):
            line = lines[i]
            m = date_pattern.search(line)
            if m and i > 0:
                title = lines[i - 1]
                # 标题不能太长或太短
                if len(title) > 80 or len(title) < 2:
                    i += 1
                    continue
                # 标题不能是侧边栏/导航项
                if title in ("笔记管理", "数据中心", "账号概览", "数据分析", "粉丝分析",
                             "活动活动", "笔记模版", "创作学院", "创作百科", "创作灵感",
                             "首页", "退出登录", "全部", "已发布", "草稿", "未通过",
                             "笔记类型", "图文笔记", "视频笔记"):
                    i += 1
                    continue

                date = m.group(1)
                if m.group(2):
                    date += " " + m.group(2)

                # 收集后续数字指标（最多6个）
                metrics = []
                j = i + 1
                while j < len(lines) and len(metrics) < 6:
                    try:
                        val = int(lines[j].replace(",", ""))
                        metrics.append(val)
                        j += 1
                    except ValueError:
                        break

                if len(metrics) >= 3:
                    notes.append({
                        "note_id": f"note_{len(notes) + 1}",
                        "title": title,
                        "type": "",
                        "publish_date": date,
                        "exposure": metrics[0],
                        "reads": 0,
                        "likes": metrics[1] if len(metrics) > 1 else 0,
                        "collects": metrics[2] if len(metrics) > 2 else 0,
                        "comments": metrics[3] if len(metrics) > 3 else 0,
                        "shares": metrics[4] if len(metrics) > 4 else 0,
                    })
                    i = j
                    continue
            i += 1

        return notes

    # ---- 主流程 ----

    async def run(self) -> dict:
        result = {"success": False, "notes_saved": 0, "message": ""}

        try:
            if not await self.ensure_login():
                result["message"] = "登录超时"
                return result

            notes = await self.scrape_notes()
            account = await self.scrape_account()

            if notes and save_notes:
                n = save_notes(notes)
                result["notes_saved"] = n
                result["message"] += f"保存 {n} 条笔记; "

            if save_account_snapshot:
                save_account_snapshot(account)
            result["message"] += f"粉丝 {account['followers']}"
            result["success"] = True

        except Exception as e:
            result["message"] = f"采集异常: {str(e)}"
            try:
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                await self.page.screenshot(path=str(DEBUG_DIR / f"error_{ts}.png"))
            except Exception:
                pass

        return result


async def run_scrape(headless: bool = False) -> dict:
    async with XHSScraper(headless=headless) as scraper:
        return await scraper.run()


if __name__ == "__main__":
    asyncio.run(run_scrape(headless=False))
