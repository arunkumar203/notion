#!/usr/bin/env python3
import argparse
import asyncio
import os
import re
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from playwright.async_api import async_playwright, Page, TimeoutError as PlaywrightTimeoutError

DEFAULT_BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")
DEFAULT_NOTEBOOK = os.environ.get("NOTEBOOK_NAME", "dsa")
DEFAULT_SECTION = os.environ.get("SECTION_NAME", "problems")

# Reuse selectors compatible with current UI
SELECTORS = {
    "login_email": "input#email-address",
    "login_password": "input#password",
    "login_submit": "button[type=submit]",
    "menu_button": "header button[aria-label='Open hierarchy']",
}


def list_topic_dirs(root: Path) -> List[Path]:
    return [p for p in sorted(root.iterdir()) if p.is_dir() and not p.name.startswith('.')]


def list_cpp_files(dir_path: Path) -> List[Path]:
    files = [p for p in dir_path.iterdir() if p.is_file() and p.suffix == '.cpp']
    def sort_key(p: Path):
        m = re.match(r"^(\d+)", p.stem)
        if m:
            return (int(m.group(1)), p.stem)
        return (10**9, p.stem)
    return [p for p in sorted(files, key=sort_key)]


async def login(page: Page, base_url: str, email: str, password: str):
    print(f"➡️  Navigating to {base_url}/login")
    await page.goto(f"{base_url}/login", wait_until="domcontentloaded")
    await page.fill(SELECTORS["login_email"], email)
    await page.fill(SELECTORS["login_password"], password)
    print("🔐 Submitting login form…")
    await page.click(SELECTORS["login_submit"]) 
    await page.wait_for_url("**/notebooks", timeout=20000)
    print("✅ Logged in and on /notebooks")


async def ensure_overlay_open(page: Page):
    try:
        await page.wait_for_selector("div[aria-label='Hierarchy']", state="visible", timeout=2000)
        return
    except PlaywrightTimeoutError:
        pass
    print("🪟 Opening hierarchy overlay…")
    await page.click(SELECTORS["menu_button"])  # opens overlay
    await page.wait_for_selector("div[aria-label='Hierarchy']", state="visible", timeout=10000)
    print("✅ Overlay open")


async def select_in_panel(page: Page, panel_title: str, name: str):
    # Click a list item by text inside the hierarchy overlay; robust with retries and case-insensitive matching.
    overlay = page.locator("div[aria-label='Hierarchy']")
    await overlay.wait_for(state="visible")
    print(f"➡️  Selecting '{name}' in {panel_title}…")

    # Helper: case-insensitive text filter for list items
    def ci_filter(loc):
        return loc.filter(has_text=re.compile(rf"^\s*{re.escape(name)}\s*$", re.IGNORECASE))

    # Try a few times to avoid races while the list populates
    for attempt in range(3):
        try:
            # Prefer searching within the panel that has the matching title
            panel = overlay.locator(
                f"xpath=.//h3[normalize-space()='{panel_title}']/ancestor::div[contains(@class,'h-full') or contains(@class,'w-') or contains(@class,'border-r')][1]"
            )
            await panel.wait_for(state="visible")
            # Wait until the list region stabilizes (items or placeholder appears)
            # Then look for a matching li
            items = panel.locator("ul > li")
            # small grace sleep to let data arrive on first attempt
            try:
                await items.first.wait_for(timeout=1000)
            except Exception:
                # no items yet; fall through to overlay search
                pass
            candidate = ci_filter(items).first
            if await candidate.count() > 0:
                await candidate.click()
                print(f"✅ Selected {panel_title[:-1] if panel_title.endswith('s') else panel_title}: {name}")
                return
        except Exception:
            # ignore and try overlay-wide search
            pass

        # Fallback: search anywhere inside overlay
        overlay_items = overlay.locator("ul > li")
        candidate2 = ci_filter(overlay_items).first
        if await candidate2.count() > 0:
            await candidate2.click()
            print(f"✅ Selected {panel_title}: {name}")
            return

        # Not found; short backoff then retry
        if attempt < 2:
            await page.wait_for_timeout(600)

    # Final failure
    raise RuntimeError(f"'{name}' not found in {panel_title} panel; create it first or verify the name matches exactly")


async def create_or_select_topic(page: Page, topic_name: str):
    # Panel: Topics; click + if not present
    panel_header = page.locator("div[aria-label='Hierarchy']").locator("xpath=.//h3[normalize-space(text())='Topics']/ancestor::div[contains(@class,'border-b')][1]")
    panel_root = page.locator("div[aria-label='Hierarchy']").locator("xpath=.//h3[normalize-space(text())='Topics']/ancestor::div[contains(@class,'w-')][1]")
    await panel_root.wait_for(state="visible")
    existing = panel_root.get_by_text(topic_name, exact=True)
    if await existing.count() > 0:
        await existing.first.click()
        print(f"ℹ️  Topic already exists, selecting: {topic_name}")
        return
    # Click the plus button near Topics header
    print(f"➕ Creating topic: {topic_name}")
    await panel_header.locator("css=button[title*='Add']").click()
    # Input is the create box input in drawer
    input_box = page.locator("div[aria-label='Hierarchy'] input[aria-label^='Enter']").first
    await input_box.fill(topic_name)
    await page.keyboard.press("Enter")
    # Select the newly created topic
    await panel_root.get_by_text(topic_name, exact=True).first.click()
    print(f"✅ Topic created: {topic_name}")


async def create_or_select_section(page: Page, section_name: str):
    # Panel: Sections; create if missing
    overlay = page.locator("div[aria-label='Hierarchy']")
    await overlay.wait_for(state="visible")
    print(f"➡️  Ensuring section exists: {section_name}")
    panel_header = overlay.locator("xpath=.//h3[normalize-space(text())='Sections']/ancestor::div[contains(@class,'border-b')][1]")
    panel_root = overlay.locator("xpath=.//h3[normalize-space(text())='Sections']/ancestor::div[contains(@class,'w-')][1]")
    await panel_root.wait_for(state="visible")
    existing = panel_root.get_by_text(section_name, exact=True)
    if await existing.count() > 0:
        await existing.first.click()
        print(f"ℹ️  Section already exists, selecting: {section_name}")
        return
    # Create new section
    print(f"➕ Creating section: {section_name}")
    await panel_header.locator("css=button[title*='Add']").click()
    input_box = overlay.locator("input[aria-label^='Enter']").first
    await input_box.fill(section_name)
    await page.keyboard.press("Enter")
    await panel_root.get_by_text(section_name, exact=True).first.click()
    print(f"✅ Section created: {section_name}")


async def create_page_if_missing(page: Page, page_name: str):
    # Left Pages panel (outside overlay)
    pages_panel = page.locator("div.w-64").first
    # If exists, skip creation
    existing = pages_panel.get_by_text(page_name, exact=True)
    if await existing.count() > 0:
        print(f"⏭️  Page exists, skipping: {page_name}")
        # Ensure it's selected
        await existing.first.click()
        return
    # Click add and type
    print(f"📄 Creating page: {page_name}")
    add_btn = pages_panel.locator(".border-b button[title*='Add']")
    await add_btn.click()
    input_box = pages_panel.locator("input[aria-label^='Enter']").first
    await input_box.fill(page_name)
    await page.keyboard.press("Enter")
    # Click to ensure selection
    await pages_panel.get_by_text(page_name, exact=True).first.click()
    print(f"✅ Page created: {page_name}")


async def set_page_content_from_file(page: Page, file_path: Path):
    # Focus editor and insert content of the file, then wait for sync
    try:
        # Read file content once
        text = file_path.read_text(encoding='utf-8', errors='ignore')
        if not text.strip():
            print(f"ℹ️  File empty, skipping content insert: {file_path}")
            return

        editor = page.locator('.editor-container [contenteditable="true"]').first
        await editor.wait_for(state='visible', timeout=10000)

        # Copy to clipboard first (preferred path)
        try:
            await page.evaluate("async (txt) => { await navigator.clipboard.writeText(txt); }", text)
        except Exception:
            # Fallback: use a temporary textarea + execCommand('copy') without keystrokes
            await page.evaluate(
                "function(txt){\n"
                "  const ta = document.createElement('textarea');\n"
                "  ta.value = txt;\n"
                "  ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0';\n"
                "  ta.style.opacity = '0'; ta.setAttribute('readonly','');\n"
                "  document.body.appendChild(ta);\n"
                "  ta.select();\n"
                "  try { document.execCommand('copy'); } catch(e) {}\n"
                "  ta.remove();\n"
                "}",
                text,
            )

        # Focus editor, clear any existing content, and paste via Ctrl+V
        await editor.click()
        try:
            await page.keyboard.press('Control+A')
            await page.keyboard.press('Delete')
        except Exception:
            pass
        print(f"✍️  Pasting content into editor: {file_path.name}")
        pasted = True
        try:
            await page.keyboard.press('Control+V')
        except Exception:
            pasted = False
        if not pasted:
            # Fallback to direct text insertion
            await page.keyboard.insert_text(text)
        # Wait for Synced state (skip unnecessary waits if already synced)
        try:
            synced = page.get_by_text('Synced', exact=True)
            if not await synced.is_visible():
                await synced.wait_for(timeout=10000)
        except Exception:
            # Non-fatal: continue even if status text isn't found
            pass
        print("✅ Content saved (Synced)")
    except Exception as e:
        print(f"⚠️  Failed to set content: {e}")


async def run_flow(base_url: str, email: str, password: str, notebook: str, section: str, problems_dir: Path, headed: bool, trace: bool, videos_dir: str | None):
    async with async_playwright() as pw:
        print(f"🚀 Launching Chromium (headed={headed})…")
        browser = await pw.chromium.launch(headless=not headed)
        ctx_kwargs = {}
        if videos_dir:
            Path(videos_dir).mkdir(parents=True, exist_ok=True)
            ctx_kwargs["record_video_dir"] = videos_dir
            ctx_kwargs["record_video_size"] = {"width": 1280, "height": 720}
        ctx = await browser.new_context(**ctx_kwargs)
        # Grant clipboard permissions so we can simulate real paste reliably
        try:
            await ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=base_url)
        except Exception:
            pass
        if trace:
            print("🧵 Starting Playwright trace capture…")
            await ctx.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = await ctx.new_page()

        await login(page, base_url, email, password)
        await page.goto(f"{base_url}/notebooks")
        await page.wait_for_selector("header")

        # Prepare list of topics from filesystem
        topic_dirs = list_topic_dirs(problems_dir)
        for tdir in topic_dirs:
            topic_name = tdir.name
            cpp_files = list_cpp_files(tdir)
            if not cpp_files:
                continue

            # Open overlay and navigate to notebook/section (overlay may auto-close; always re-open per topic)
            await ensure_overlay_open(page)
            await select_in_panel(page, "Notebooks", notebook)
            # Ensure section exists (create if missing)
            await create_or_select_section(page, section)
            await create_or_select_topic(page, topic_name)
            # The drawer may auto-close; regardless, the Pages panel is visible

            # Create pages for each .cpp
            for f in cpp_files:
                page_base = f.stem  # keep as-is
                await create_page_if_missing(page, page_base)
                await set_page_content_from_file(page, f)

        if trace:
            out_path = str(Path.cwd() / "playwright-trace.zip")
            print(f"💾 Saving trace to {out_path}")
            await ctx.tracing.stop(path=out_path)
        await ctx.close()
        await browser.close()


def main():
    load_dotenv(Path(".env"))
    load_dotenv(Path("scripts/.env"))

    parser = argparse.ArgumentParser(description="Create Topics from problems/ folders and Pages from .cpp files via UI")
    parser.add_argument("--problems-dir", default="problems", help="Path to problems folder (default: problems)")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--email", default=os.environ.get("LOGIN_EMAIL", ""))
    parser.add_argument("--password", default=os.environ.get("LOGIN_PASSWORD", ""))
    parser.add_argument("--notebook", default=DEFAULT_NOTEBOOK)
    parser.add_argument("--section", default=DEFAULT_SECTION)
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--trace", action="store_true", help="Capture a Playwright trace (playwright-trace.zip)")
    parser.add_argument("--videos-dir", default=None, help="Directory to save context videos (optional)")

    args = parser.parse_args()

    if not args.email or not args.password:
        raise SystemExit("LOGIN_EMAIL and LOGIN_PASSWORD env vars or --email/--password are required")

    problems_path = Path(args.problems_dir)
    if not problems_path.exists() or not problems_path.is_dir():
        raise SystemExit(f"Problems directory not found: {problems_path}")

    asyncio.run(
        run_flow(
            base_url=args.base_url,
            email=args.email,
            password=args.password,
            notebook=args.notebook,
            section=args.section,
            problems_dir=problems_path,
            headed=args.headed,
            trace=args.trace,
            videos_dir=args.videos_dir,
        )
    )


if __name__ == "__main__":
    main()
