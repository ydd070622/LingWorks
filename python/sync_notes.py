"""小红书笔记同步脚本
由 LingWorks Electron 主进程 spawn 调用，输出 JSON 到 stdout。
用法: python sync_notes.py [--headless]
"""

import asyncio
import json
import sys
from pathlib import Path

# Ensure the script can be run from any CWD
sys.path.insert(0, str(Path(__file__).parent))

from scraper import XHSScraper


async def main():
    headless = "--headless" in sys.argv

    try:
        async with XHSScraper(headless=headless) as scraper:
            if not await scraper.ensure_login():
                print(json.dumps({
                    "success": False,
                    "notes": [],
                    "message": "登录超时，请重试并扫码"
                }, ensure_ascii=False))
                return

            notes_raw = await scraper.scrape_notes()
            account = await scraper.scrape_account()

            # Map to CRM-compatible format
            notes = []
            for n in notes_raw:
                notes.append({
                    "title": n.get("title", ""),
                    "publish_date": n.get("publish_date", ""),
                    "views": n.get("exposure", 0),
                    "likes": n.get("likes", 0),
                    "collects": n.get("collects", 0),
                    "comments": n.get("comments", 0),
                    "shares": n.get("shares", 0),
                })

            print(json.dumps({
                "success": True,
                "notes": notes,
                "account": account,
                "message": f"采集 {len(notes)} 条笔记，粉丝 {account.get('followers', 0)}"
            }, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "notes": [],
            "message": f"采集异常: {str(e)}"
        }, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
