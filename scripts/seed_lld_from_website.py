#!/usr/bin/env python3
"""
Scrape Low Level Design content from codewitharyan.com and populate into the app.
Each dropdown becomes a Topic, each link inside becomes a Page.
"""
import argparse
import asyncio
import os
from pathlib import Path
from typing import List, Dict

from dotenv import load_dotenv
from playwright.async_api import async_playwright, Page, TimeoutError as PlaywrightTimeoutError

DEFAULT_BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")
DEFAULT_NOTEBOOK = "System design"
DEFAULT_SECTION = "LLD"
SOURCE_URL = "https://codewitharyan.com/system-design/low-level-design"

SELECTORS = {
    "login_email": "input#email-address",
    "login_password": "input#password",
    "login_submit": "button[type=submit]",
    "menu_button": "header button[aria-label='Open hierarchy']",
}


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
    await page.click(SELECTORS["menu_button"])
    await page.wait_for_selector("div[aria-label='Hierarchy']", state="visible", timeout=10000)
    print("✅ Overlay open")


async def select_in_panel(page: Page, panel_title: str, name: str):
    overlay = page.locator("div[aria-label='Hierarchy']")
    await overlay.wait_for(state="visible")
    print(f"➡️  Selecting '{name}' in {panel_title}…")

    import re
    def ci_filter(loc):
        return loc.filter(has_text=re.compile(rf"^\s*{re.escape(name)}\s*$", re.IGNORECASE))

    for attempt in range(3):
        try:
            panel = overlay.locator(
                f"xpath=.//h3[normalize-space()='{panel_title}']/ancestor::div[contains(@class,'h-full') or contains(@class,'w-') or contains(@class,'border-r')][1]"
            )
            await panel.wait_for(state="visible")
            items = panel.locator("ul > li")
            try:
                await items.first.wait_for(timeout=1000)
            except Exception:
                pass
            candidate = ci_filter(items).first
            if await candidate.count() > 0:
                await candidate.click()
                print(f"✅ Selected {panel_title}: {name}")
                return
        except Exception:
            pass

        overlay_items = overlay.locator("ul > li")
        candidate2 = ci_filter(overlay_items).first
        if await candidate2.count() > 0:
            await candidate2.click()
            print(f"✅ Selected {panel_title}: {name}")
            return

        if attempt < 2:
            await page.wait_for_timeout(600)

    raise RuntimeError(f"'{name}' not found in {panel_title} panel")


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


async def create_or_select_topic(page: Page, topic_name: str):
    # Panel: Topics; click + if not present
    overlay = page.locator("div[aria-label='Hierarchy']")
    await overlay.wait_for(state="visible")
    
    panel_header = overlay.locator("xpath=.//h3[normalize-space(text())='Topics']/ancestor::div[contains(@class,'border-b')][1]")
    panel_root = overlay.locator("xpath=.//h3[normalize-space(text())='Topics']/ancestor::div[contains(@class,'w-')][1]")
    await panel_root.wait_for(state="visible")
    
    existing = panel_root.get_by_text(topic_name, exact=True)
    if await existing.count() > 0:
        await existing.first.click()
        print(f"ℹ️  Topic already exists, selecting: {topic_name}")
        return
    
    # Click the plus button near Topics header
    print(f"➕ Creating topic: {topic_name}")
    await panel_header.locator("css=button[title*='Add']").click()
    await page.wait_for_timeout(300)
    
    # Input is the create box input in drawer
    input_box = overlay.locator("input[aria-label^='Enter']").first
    await input_box.fill(topic_name)
    await page.keyboard.press("Enter")
    
    # Topic gets auto-selected after creation, just wait for it to settle
    await page.wait_for_timeout(1000)
    print(f"✅ Topic created (auto-selected): {topic_name}")


async def create_page_if_missing(page: Page, page_name: str):
    # Left Pages panel (outside overlay)
    pages_panel = page.locator("div.w-64").first
    # If exists, skip creation
    existing = pages_panel.get_by_text(page_name, exact=True)
    if await existing.count() > 0:
        print(f"⏭️  Page exists, selecting: {page_name}")
        # Ensure it's selected
        await existing.first.click()
        # Wait a bit for page to load
        await page.wait_for_timeout(1000)
        return
    # Click add and type
    print(f"📄 Creating page: {page_name}")
    add_btn = pages_panel.locator(".border-b button[title*='Add']")
    await add_btn.click()
    await page.wait_for_timeout(300)
    input_box = pages_panel.locator("input[aria-label^='Enter']").first
    await input_box.fill(page_name)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(500)
    # Click to ensure selection
    await pages_panel.get_by_text(page_name, exact=True).first.click()
    await page.wait_for_timeout(1000)  # Wait for page to load
    print(f"✅ Page created: {page_name}")


async def scrape_page_all_data(source_page: Page, url: str) -> tuple[str, str, str, bool]:
    """
    Open URL once, extract heading, YouTube URL (with timestamp), tags, and copy content.
    Returns: (heading, youtube_url, tags_text, has_content)
    """
    print(f"  🌐 Opening: {url}")
    
    new_page = await source_page.context.new_page()
    heading = ""
    youtube_url = ""
    tags_text = ""
    has_content = False
    
    try:
        await new_page.goto(url, wait_until="networkidle")
        await new_page.wait_for_timeout(2000)
        
        # Step 1: Extract the actual H1 heading from the page
        try:
            h1_element = new_page.locator("h1").first
            if await h1_element.count() > 0:
                heading = await h1_element.inner_text()
                heading = heading.strip()
                print(f"  📝 Found heading: {heading}")
        except Exception as e:
            print(f"  ⚠️  Could not extract heading: {e}")
        
        # Step 2: Get YouTube URL from iframe (with current timestamp)
        try:
            iframe = new_page.locator("iframe[src*='youtube.com'], iframe[src*='youtu.be']").first
            if await iframe.count() > 0:
                src = await iframe.get_attribute("src")
                if src:
                    # Parse the embed URL to get video ID and start time
                    import re
                    video_id_match = re.search(r'/embed/([A-Za-z0-9_-]{11})', src)
                    if video_id_match:
                        video_id = video_id_match.group(1)
                        
                        # Look for start parameter
                        start_match = re.search(r'[?&]start=(\d+)', src)
                        youtube_url = f"https://www.youtube.com/watch?v={video_id}"
                        if start_match:
                            youtube_url += f"&t={start_match.group(1)}s"
                        
                        print(f"  🎥 Found YouTube: {youtube_url}")
        except Exception as e:
            print(f"  ⚠️  Could not extract YouTube: {e}")
        
        # Step 3: Extract tags
        try:
            # Look for tag links or elements
            tag_elements = await new_page.locator("a[href*='/tags/']").all()
            tags = []
            for tag_elem in tag_elements:
                tag_text = await tag_elem.inner_text()
                tag_text = tag_text.strip()
                if tag_text and len(tag_text) < 50 and tag_text not in tags:
                    tags.append(tag_text)
            
            if tags:
                tags_text = ", ".join(tags[:10])
                print(f"  🏷️  Found tags: {tags_text}")
        except Exception as e:
            print(f"  ⚠️  Could not extract tags: {e}")
        
        # Step 4: Select and copy content (excluding heading)
        main_selectors = ["article", "main", "[role='main']", ".content", ".post-content", "#content"]
        
        for selector in main_selectors:
            try:
                element = new_page.locator(selector).first
                if await element.count() > 0:
                    print(f"  📋 Copying content from {selector}...")
                    
                    await new_page.evaluate("window.scrollTo(0, 0)")
                    await new_page.wait_for_timeout(300)
                    
                    # Remove heading and select content
                    await new_page.evaluate(f"""
                        () => {{
                            const element = document.querySelector('{selector}');
                            if (element) {{
                                // Remove h1 to avoid duplication
                                const h1 = element.querySelector('h1');
                                if (h1) h1.remove();
                                
                                // Remove "Topic Tags:" label
                                const allElements = element.querySelectorAll('*');
                                allElements.forEach(el => {{
                                    const text = el.textContent.trim();
                                    if (text === 'Topic Tags:' || text === 'Topic Tags') {{
                                        el.remove();
                                    }}
                                }});
                                
                                // Select content
                                const range = document.createRange();
                                range.selectNodeContents(element);
                                const selection = window.getSelection();
                                selection.removeAllRanges();
                                selection.addRange(range);
                            }}
                        }}
                    """)
                    
                    await new_page.wait_for_timeout(500)
                    await new_page.keyboard.press("Control+C")
                    await new_page.wait_for_timeout(1000)
                    
                    # Verify
                    try:
                        text_preview = await element.inner_text()
                        if text_preview and len(text_preview) > 50:
                            print(f"  ✅ Content copied (~{len(text_preview)} chars)")
                            has_content = True
                            break
                    except Exception:
                        pass
            except Exception as e:
                print(f"  ⚠️  Failed with {selector}: {e}")
                continue
        
        # Fallback
        if not has_content:
            try:
                print(f"  🖱️  Fallback: Ctrl+A...")
                await new_page.evaluate("window.scrollTo(0, 0)")
                await new_page.wait_for_timeout(300)
                await new_page.keyboard.press("Control+A")
                await new_page.wait_for_timeout(300)
                await new_page.keyboard.press("Control+C")
                await new_page.wait_for_timeout(1000)
                has_content = True
                print(f"  ✅ Content copied (fallback)")
            except Exception as e:
                print(f"  ⚠️  Fallback failed: {e}")
        
    except Exception as e:
        print(f"  ⚠️  Error: {e}")
    finally:
        await new_page.close()
    
    return heading, youtube_url, tags_text, has_content


async def get_youtube_url_OLD(source_page: Page, url: str) -> str:
    """Open URL in new tab, extract YouTube URL, close tab. Don't copy content yet."""
    new_page = await source_page.context.new_page()
    youtube_url = ""
    
    try:
        await new_page.goto(url, wait_until="networkidle")
        await new_page.wait_for_timeout(2000)  # Wait longer for videos to load
        
        # Try multiple methods to find YouTube videos
        
        # Method 1: Look for iframes with YouTube embeds
        try:
            iframes = await new_page.locator("iframe").all()
            for iframe in iframes:
                src = await iframe.get_attribute("src")
                if src and ("youtube.com" in src or "youtu.be" in src):
                    youtube_url = src
                    if "/embed/" in youtube_url:
                        # Extract video ID and preserve start time if present
                        parts = youtube_url.split("/embed/")[1]
                        video_id = parts.split("?")[0].split("/")[0]
                        
                        # Check for start time parameter
                        start_param = ""
                        if "?" in parts:
                            query_string = parts.split("?")[1]
                            # Look for start parameter
                            import re
                            start_match = re.search(r'[?&]start=(\d+)', query_string)
                            if start_match:
                                start_param = f"&t={start_match.group(1)}s"
                        
                        youtube_url = f"https://www.youtube.com/watch?v={video_id}{start_param}"
                    print(f"  🎥 Found YouTube iframe: {youtube_url}")
                    break
        except Exception:
            pass
        
        # Method 2: Look for links to YouTube
        if not youtube_url:
            try:
                links = await new_page.locator("a[href*='youtube.com'], a[href*='youtu.be']").all()
                for link in links:
                    href = await link.get_attribute("href")
                    if href and ("watch?v=" in href or "youtu.be/" in href):
                        youtube_url = href
                        print(f"  🎥 Found YouTube link: {youtube_url}")
                        break
            except Exception:
                pass
        
        # Method 3: Search in page source for YouTube URLs (with timestamps)
        if not youtube_url:
            try:
                page_content = await new_page.content()
                import re
                # Look for complete YouTube URLs with timestamps
                patterns = [
                    r'youtube\.com/embed/([A-Za-z0-9_-]{11})(?:\?start=(\d+))?',
                    r'youtube\.com/watch\?v=([A-Za-z0-9_-]{11})(?:&t=(\d+)s?)?',
                    r'youtu\.be/([A-Za-z0-9_-]{11})(?:\?t=(\d+))?'
                ]
                for pattern in patterns:
                    match = re.search(pattern, page_content)
                    if match:
                        video_id = match.group(1)
                        timestamp = match.group(2) if len(match.groups()) > 1 and match.group(2) else None
                        
                        youtube_url = f"https://www.youtube.com/watch?v={video_id}"
                        if timestamp:
                            youtube_url += f"&t={timestamp}s"
                        
                        print(f"  🎥 Found YouTube in source: {youtube_url}")
                        break
            except Exception:
                pass
        
        if not youtube_url:
            print(f"  ℹ️  No YouTube video found")
            
    except Exception as e:
        print(f"  ⚠️  Error getting YouTube URL: {e}")
    finally:
        await new_page.close()
    
    return youtube_url


async def scrape_and_copy_content(source_page: Page, url: str) -> tuple[bool, str]:
    """
    Open URL in new tab, extract tags and copy content to clipboard, close tab.
    Returns: (success, tags_text)
    """
    print(f"  🌐 Opening for content: {url}")
    
    new_page = await source_page.context.new_page()
    success = False
    tags_text = ""
    
    try:
        await new_page.goto(url, wait_until="domcontentloaded")
        await new_page.wait_for_timeout(1500)
        
        # First, extract topic tags
        try:
            tags_elements = await new_page.locator("a[href*='/tags/'], .tag, .topic-tag, [class*='tag']").all()
            tags = []
            for tag_elem in tags_elements:
                tag_text = await tag_elem.inner_text()
                tag_text = tag_text.strip()
                if tag_text and len(tag_text) < 50 and tag_text not in tags:
                    tags.append(tag_text)
            
            if tags:
                tags_text = ", ".join(tags[:10])
                print(f"  🏷️  Found tags: {tags_text}")
        except Exception as e:
            print(f"  ⚠️  Could not extract tags: {e}")
        
        # Find and select ALL content - use JavaScript selection for reliability
        main_selectors = ["article", "main", "[role='main']", ".content", ".post-content", "#content"]
        copied = False
        
        for selector in main_selectors:
            try:
                element = new_page.locator(selector).first
                if await element.count() > 0:
                    print(f"  � Seleceting all content from {selector}...")
                    
                    # Scroll to top first
                    await new_page.evaluate("window.scrollTo(0, 0)")
                    await new_page.wait_for_timeout(300)
                    
                    # Remove heading and select content
                    await new_page.evaluate(f"""
                        () => {{
                            const element = document.querySelector('{selector}');
                            if (element) {{
                                // Remove the first h1 to avoid duplication
                                const h1 = element.querySelector('h1');
                                if (h1) h1.remove();
                                
                                // Select remaining content
                                const range = document.createRange();
                                range.selectNodeContents(element);
                                const selection = window.getSelection();
                                selection.removeAllRanges();
                                selection.addRange(range);
                            }}
                        }}
                    """)
                    
                    await new_page.wait_for_timeout(500)
                    
                    # Copy to clipboard using Ctrl+C
                    print(f"  📋 Copying selected content...")
                    await new_page.keyboard.press("Control+C")
                    await new_page.wait_for_timeout(1000)
                    
                    # Verify copy succeeded
                    try:
                        text_preview = await element.inner_text()
                        if text_preview and len(text_preview) > 100:
                            print(f"  ✅ Content copied (~{len(text_preview)} chars with images)")
                            copied = True
                            break
                    except Exception:
                        pass
            except Exception as e:
                print(f"  ⚠️  Failed with {selector}: {e}")
                continue
        
        # Fallback: Ctrl+A
        if not copied:
            try:
                print(f"  🖱️  Fallback: Ctrl+A...")
                await new_page.evaluate("window.scrollTo(0, 0)")
                await new_page.wait_for_timeout(300)
                await new_page.keyboard.press("Control+A")
                await new_page.wait_for_timeout(300)
                await new_page.keyboard.press("Control+C")
                await new_page.wait_for_timeout(1000)
                
                try:
                    text_preview = await new_page.locator("body").inner_text()
                    print(f"  ✅ Content copied (~{len(text_preview)} chars)")
                    copied = True
                except Exception:
                    copied = True
            except Exception as e:
                print(f"  ⚠️  Fallback failed: {e}")
        
        success = copied
        
    except Exception as e:
        print(f"  ⚠️  Error: {e}")
    finally:
        await new_page.close()
    
    return success, tags_text


async def paste_all_content(app_page: Page, heading: str, youtube_url: str, tags: str):
    """Paste heading, YouTube, tags, and content in order."""
    try:
        editor = app_page.locator('.editor-container [contenteditable="true"]').first
        await editor.wait_for(state='visible', timeout=15000)
        
        # Clear editor
        await editor.click()
        await app_page.keyboard.press('Control+A')
        await app_page.keyboard.press('Delete')
        await app_page.wait_for_timeout(300)
        
        # Paste heading (from page, not page name)
        if heading:
            print(f"  📝 Typing heading: {heading}")
            await app_page.keyboard.type(f"# {heading}")
            await app_page.keyboard.press('Enter')
            await app_page.keyboard.press('Enter')
            await app_page.wait_for_timeout(500)
        
        # Type YouTube URL (don't paste to preserve clipboard)
        if youtube_url:
            print(f"  🎥 Typing YouTube: {youtube_url}")
            await app_page.keyboard.type(youtube_url)
            await app_page.keyboard.press('Enter')
            await app_page.keyboard.press('Enter')
            await app_page.wait_for_timeout(2500)  # Wait for auto-embed
            print("  ✅ YouTube embedded")
        
        # Type tags (don't paste to preserve clipboard)
        if tags:
            print(f"  🏷️  Typing tags: {tags}")
            await app_page.keyboard.type(f"**Tags:** {tags}")
            await app_page.keyboard.press('Enter')
            await app_page.keyboard.press('Enter')
            await app_page.wait_for_timeout(300)
        
        # NOW paste content from clipboard (content is still there from scraping)
        print(f"  ✍️  Pasting content from clipboard...")
        await app_page.keyboard.press('Control+V')
        await app_page.wait_for_timeout(1500)
        print("  ✅ Content pasted")
        
        # Wait for sync
        try:
            synced = app_page.get_by_text('Synced', exact=True)
            if not await synced.is_visible():
                await synced.wait_for(timeout=10000)
        except Exception:
            pass
        print("  ✅ Saved")
    except Exception as e:
        print(f"  ⚠️  Error: {e}")


async def paste_tags_and_content(app_page: Page, tags: str):
    """Paste tags (if any) and content from clipboard (with images)."""
    try:
        # Paste tags first if we have them
        if tags:
            print(f"  🏷️  Pasting tags: {tags}")
            await app_page.keyboard.type(f"**Tags:** {tags}")
            await app_page.keyboard.press('Enter')
            await app_page.keyboard.press('Enter')
            await app_page.wait_for_timeout(300)
        
        # Paste content from clipboard
        print(f"  ✍️  Pasting content from clipboard...")
        await app_page.keyboard.press('Control+V')
        await app_page.wait_for_timeout(1500)
        print("  ✅ Content pasted")
        
        # Wait for sync
        try:
            synced = app_page.get_by_text('Synced', exact=True)
            if not await synced.is_visible():
                await synced.wait_for(timeout=10000)
        except Exception:
            pass
        print("  ✅ Saved")
    except Exception as e:
        print(f"  ⚠️  Error pasting: {e}")


async def run_flow(base_url: str, email: str, password: str, notebook: str, section: str, headed: bool, trace: bool):
    async with async_playwright() as pw:
        print(f"🚀 Launching Chromium (headed={headed})…")
        browser = await pw.chromium.launch(headless=not headed)
        ctx = await browser.new_context()
        
        # Grant clipboard permissions
        try:
            await ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=base_url)
        except Exception:
            pass
        
        if trace:
            print("🧵 Starting Playwright trace capture…")
            await ctx.tracing.start(screenshots=True, snapshots=True, sources=True)
        
        # Create two pages: one for app, one for source website
        app_page = await ctx.new_page()
        source_page = await ctx.new_page()
        
        # Login to app
        await login(app_page, base_url, email, password)
        await app_page.goto(f"{base_url}/notebooks")
        await app_page.wait_for_selector("header")
        
        # Process topics and pages in parallel - scrape and paste immediately
        print(f"🌐 Starting to scrape and process LLD content...")
        
        # Navigate to source page
        print(f"🌐 Navigating to {SOURCE_URL}")
        await source_page.goto(SOURCE_URL, wait_until="networkidle")
        await source_page.wait_for_timeout(3000)
        
        # Find all collapsible sections
        clickable_headers = await source_page.locator("div:has(> svg)").all()
        print(f"📋 Found {len(clickable_headers)} collapsible sections\n")
        
        # Process each section immediately
        for idx, section_elem in enumerate(clickable_headers):
            try:
                # Get topic name
                full_text = await section_elem.inner_text()
                lines = [l.strip() for l in full_text.split('\n') if l.strip()]
                topic_name = lines[0] if lines else ""
                
                if not topic_name or len(topic_name) < 3 or '/' in topic_name:
                    continue
                
                print(f"{'='*60}")
                print(f"📂 Topic {idx + 1}: {topic_name}")
                print(f"{'='*60}")
                
                # Expand the section
                try:
                    chevron = section_elem.locator("svg").first
                    await chevron.click()
                    await source_page.wait_for_timeout(1000)
                    print(f"  ✅ Expanded")
                except Exception:
                    try:
                        await section_elem.click()
                        await source_page.wait_for_timeout(1000)
                    except Exception:
                        continue
                
                # Find all links in this expanded section
                await source_page.wait_for_timeout(800)
                rows = await source_page.locator("tr").all()
                
                page_links = []
                for row in rows:
                    try:
                        if not await row.is_visible():
                            continue
                        
                        row_links = await row.locator("a[href]").all()
                        for link in row_links:
                            href = await link.get_attribute("href")
                            if not href or href.startswith("#") or "youtube" in href.lower():
                                continue
                            
                            title = await link.inner_text()
                            if not title or len(title) < 3:
                                parent_cell = link.locator("xpath=ancestor::td[1]")
                                title = await parent_cell.inner_text()
                            
                            title = title.strip()
                            
                            if (href and title and len(title) > 2 and len(title) < 200 and
                                not title.lower() in ['youtube', 'practice', 'status', 'problem']):
                                
                                if href.startswith("/"):
                                    href = f"https://codewitharyan.com{href}"
                                elif not href.startswith("http"):
                                    href = f"https://codewitharyan.com{href}"
                                
                                if not any(l["url"] == href for l in page_links):
                                    page_links.append({"title": title, "url": href})
                                    break
                    except Exception:
                        continue
                
                if not page_links:
                    print(f"  ⚠️  No links found, skipping topic")
                    # Close section
                    try:
                        chevron = section_elem.locator("svg").first
                        await chevron.click()
                        await source_page.wait_for_timeout(500)
                    except Exception:
                        pass
                    continue
                
                print(f"  📄 Found {len(page_links)} pages")
                
                # Create topic in app
                await ensure_overlay_open(app_page)
                await select_in_panel(app_page, "Notebooks", notebook)
                await create_or_select_section(app_page, section)
                await create_or_select_topic(app_page, topic_name)
                
                # Create a temp page to break loading cycles
                temp_page_name = f"_temp_{topic_name[:20]}"
                print(f"  🔧 Creating temp page: {temp_page_name}")
                await create_page_if_missing(app_page, temp_page_name)
                await app_page.wait_for_timeout(800)
                
                # Process each page immediately
                for page_data in page_links:
                    page_title = page_data["title"]
                    page_url = page_data["url"]
                    
                    print(f"\n    📄 {page_title}")
                    
                    # Create page in app
                    await create_page_if_missing(app_page, page_title)
                    
                    # Click temp page then back to break loading cycle
                    pages_panel = app_page.locator("div.w-64").first
                    await pages_panel.get_by_text(temp_page_name, exact=True).first.click()
                    await app_page.wait_for_timeout(300)
                    await pages_panel.get_by_text(page_title, exact=True).first.click()
                    await app_page.wait_for_timeout(800)
                    
                    # Make sure we're focused on the app page
                    await app_page.bring_to_front()
                    
                    # Open the page once and extract everything
                    heading, youtube_url, tags, has_content = await scrape_page_all_data(source_page, page_url)
                    
                    # Paste everything in order
                    if heading or youtube_url or has_content:
                        await app_page.bring_to_front()
                        await paste_all_content(app_page, heading, youtube_url, tags)
                    else:
                        print(f"    ⚠️  No content scraped")
                    
                    await app_page.wait_for_timeout(500)
                
                # Delete the temp page after processing all pages in this topic
                print(f"  🗑️  Deleting temp page: {temp_page_name}")
                try:
                    pages_panel = app_page.locator("div.w-64").first
                    temp_page_item = pages_panel.get_by_text(temp_page_name, exact=True).first
                    if await temp_page_item.count() > 0:
                        # Right-click to open context menu
                        await temp_page_item.click(button='right')
                        await app_page.wait_for_timeout(300)
                        # Click delete option
                        delete_btn = app_page.get_by_text('Delete', exact=True).first
                        if await delete_btn.count() > 0:
                            await delete_btn.click()
                            await app_page.wait_for_timeout(300)
                            # Confirm deletion if there's a confirm dialog
                            confirm_btn = app_page.get_by_text('Delete', exact=True).first
                            if await confirm_btn.count() > 0:
                                await confirm_btn.click()
                                await app_page.wait_for_timeout(500)
                        print(f"  ✅ Temp page deleted")
                except Exception as e:
                    print(f"  ⚠️  Could not delete temp page: {e}")
                
                # Close the section before moving to next
                try:
                    chevron = section_elem.locator("svg").first
                    await chevron.click()
                    await source_page.wait_for_timeout(500)
                    print(f"  🔽 Collapsed\n")
                except Exception:
                    pass
                    
            except Exception as e:
                print(f"  ⚠️  Error processing section: {e}")
                continue
        
        print(f"\n{'='*60}")
        print("✅ All topics and pages processed!")
        print(f"{'='*60}")
        
        if trace:
            out_path = str(Path.cwd() / "playwright-trace-lld.zip")
            print(f"💾 Saving trace to {out_path}")
            await ctx.tracing.stop(path=out_path)
        
        await ctx.close()
        await browser.close()


def main():
    load_dotenv(Path(".env"))
    load_dotenv(Path("scripts/.env"))

    parser = argparse.ArgumentParser(description="Scrape LLD content from codewitharyan.com and populate into app")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--email", default=os.environ.get("LOGIN_EMAIL", ""))
    parser.add_argument("--password", default=os.environ.get("LOGIN_PASSWORD", ""))
    parser.add_argument("--notebook", default=DEFAULT_NOTEBOOK)
    parser.add_argument("--section", default=DEFAULT_SECTION)
    parser.add_argument("--headed", action="store_true", help="Show browser window")
    parser.add_argument("--trace", action="store_true", help="Capture Playwright trace")

    args = parser.parse_args()

    if not args.email or not args.password:
        raise SystemExit("LOGIN_EMAIL and LOGIN_PASSWORD env vars or --email/--password are required")

    asyncio.run(
        run_flow(
            base_url=args.base_url,
            email=args.email,
            password=args.password,
            notebook=args.notebook,
            section=args.section,
            headed=args.headed,
            trace=args.trace,
        )
    )


if __name__ == "__main__":
    main()
