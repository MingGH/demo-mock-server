import asyncio
from playwright.async_api import async_playwright

PROD_URL = "https://numfeel.996.ninja/pages/cascade-failure/"

async def run_test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        
        print(f"[TEST] Opening {PROD_URL}")
        await page.goto(PROD_URL, wait_until="networkidle", timeout=30000)
        
        # 1. Check page title
        title = await page.title()
        print(f"[TEST] Page title: {title}")
        assert "级联" in title or "故障" in title or "越修越崩" in title or "数字直觉" in title, f"Unexpected title: {title}"
        
        # 2. Check canvas exists
        canvas = await page.query_selector("#networkCanvas")
        assert canvas is not None, "Canvas not found"
        print("[TEST] Canvas found")
        
        # 3. Wait for global stats to load (not stuck at '加载中...')
        print("[TEST] Checking global stats...")
        await page.wait_for_timeout(3000)
        global_stats = await page.inner_text("#globalStats")
        print(f"[TEST] Global stats text: {global_stats[:80]}")
        assert "加载中" not in global_stats, f"Global stats still loading: {global_stats}"
        
        # 4. Check leaderboard (not stuck at '加载中...')
        print("[TEST] Checking leaderboard...")
        lb_text = await page.inner_text("#lbList")
        print(f"[TEST] Leaderboard text: {lb_text[:80]}")
        assert "加载中" not in lb_text, f"Leaderboard still loading: {lb_text}"
        
        # 5. Click random trigger and wait for result
        print("[TEST] Clicking random trigger...")
        await page.click("button:has-text('随机引爆')")
        await page.wait_for_timeout(4000)
        
        result_panel = await page.query_selector("#resultPanel")
        classes = await result_panel.get_attribute("class")
        assert "hidden" not in classes, "Result panel not shown after trigger"
        
        survival = await page.inner_text("#res-survival")
        print(f"[TEST] Survival rate: {survival}")
        assert "%" in survival, f"Unexpected survival format: {survival}"
        
        # 6. Re-check global stats after submit
        await page.wait_for_timeout(2000)
        global_stats2 = await page.inner_text("#globalStats")
        print(f"[TEST] Global stats after submit: {global_stats2[:80]}")
        assert "加载中" not in global_stats2, f"Global stats stuck after submit: {global_stats2}"
        
        await browser.close()
        print("[PASS] All tests passed!")
        return True

if __name__ == "__main__":
    ok = asyncio.run(run_test())
    exit(0 if ok else 1)
