"""
UrbanFlow AI - Automated High-Definition Screen Recorder
Records Scene 1 through Scene 4 using Playwright Chromium at 1920x1080 (60fps),
with human-like cursor movements and real-time backend/engine interactions.
Transcodes output to MP4 via imageio_ffmpeg.
"""

import os
import sys
import time
import shutil
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:5173"
OUT_DIR = Path("d:/bda project/recordings")
OUT_DIR.mkdir(parents=True, exist_ok=True)

try:
    import imageio_ffmpeg
    FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_EXE = "ffmpeg"


def human_move(page, target_x, target_y, steps=25):
    """Smooth, fluid mouse movement."""
    page.mouse.move(target_x, target_y, steps=steps)
    time.sleep(0.1)


def transcode_to_mp4(webm_path: Path, mp4_path: Path):
    """Converts Playwright webm to standard MP4 with H.264."""
    if not webm_path.exists():
        print(f"Warning: {webm_path} does not exist for conversion.")
        return
    print(f"Converting {webm_path.name} -> {mp4_path.name}...")
    cmd = [
        FFMPEG_EXE, "-y",
        "-i", str(webm_path),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        str(mp4_path)
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode == 0:
        print(f"Saved: {mp4_path} ({mp4_path.stat().st_size // 1024} KB)")
        try:
            webm_path.unlink()  # remove raw webm after successful mp4 creation
        except Exception:
            pass
    else:
        print(f"Transcode failed: {res.stderr.decode('utf-8', errors='ignore')[:300]}")


def record_scene_1(browser):
    """Scene 1: Live Dual Digital Twin Simulation (0:31 - 1:05, ~34s)"""
    print("\n--- Recording Scene 1: Live Dual Digital Twin Simulation ---")
    raw_dir = OUT_DIR / "raw_scene1"
    raw_dir.mkdir(exist_ok=True)
    
    context = browser.new_context(
        viewport={"width": 1920, "height": 1080},
        record_video_dir=str(raw_dir),
        record_video_size={"width": 1920, "height": 1080}
    )
    page = context.new_page()
    page.goto(f"{BASE_URL}/", wait_until="networkidle")
    time.sleep(2)  # Initial settle

    # Smooth mouse exploration
    # 1. Hover left side: Fixed-time baseline
    human_move(page, 450, 450, steps=30)
    time.sleep(4)
    human_move(page, 450, 600, steps=25)
    time.sleep(3)

    # 2. Hover right side: UrbanFlow Adaptive twin
    human_move(page, 1400, 450, steps=40)
    time.sleep(5)
    human_move(page, 1400, 620, steps=30)
    time.sleep(4)

    # 3. Hover top telemetry KPI cards
    human_move(page, 700, 110, steps=30)
    time.sleep(3)
    human_move(page, 950, 110, steps=25)
    time.sleep(3)
    human_move(page, 1200, 110, steps=25)
    time.sleep(4)

    # Observe traffic flows
    time.sleep(4)
    video_path_obj = page.video.path()
    page.close()
    context.close()

    raw_video = Path(video_path_obj)
    mp4_target = OUT_DIR / "clip1_scene1_digital_twin.mp4"
    transcode_to_mp4(raw_video, mp4_target)
    shutil.rmtree(raw_dir, ignore_errors=True)


def record_scene_2(browser):
    """Scene 2: Dynamic Ambulance Preemption & Kinematics (1:05 - 1:35, ~30s)"""
    print("\n--- Recording Scene 2: Dynamic Ambulance Preemption ---")
    raw_dir = OUT_DIR / "raw_scene2"
    raw_dir.mkdir(exist_ok=True)

    context = browser.new_context(
        viewport={"width": 1920, "height": 1080},
        record_video_dir=str(raw_dir),
        record_video_size={"width": 1920, "height": 1080}
    )
    page = context.new_page()
    page.goto(f"{BASE_URL}/", wait_until="networkidle")
    time.sleep(2)

    # Move cursor toward the Spawn Ambulance button in header
    btn = page.locator("#btn-spawn-ems")
    if btn.count() > 0:
        box = btn.bounding_box()
        if box:
            human_move(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=30)
            time.sleep(1)
            btn.click()
            print("Clicked #btn-spawn-ems!")
    else:
        # Fallback click on canvas or button
        page.click("button:has-text('EMS')", timeout=2000)

    # Watch ambulance spawn on EB-TR and move across intersection
    time.sleep(2)
    # Move cursor smoothly to EB approach lane to highlight ambulance
    human_move(page, 1180, 540, steps=30)
    time.sleep(5)

    # Follow vehicle heading into junction box
    human_move(page, 1380, 540, steps=40)
    time.sleep(5)

    # Follow across far-side exit box (-18m)
    human_move(page, 1600, 540, steps=35)
    time.sleep(6)

    # Highlight status banner
    human_move(page, 960, 160, steps=30)
    time.sleep(4)

    video_path_obj = page.video.path()
    page.close()
    context.close()

    raw_video = Path(video_path_obj)
    mp4_target = OUT_DIR / "clip2_scene2_ambulance_preemption.mp4"
    transcode_to_mp4(raw_video, mp4_target)
    shutil.rmtree(raw_dir, ignore_errors=True)


def record_scene_3(browser):
    """Scene 3: 4-Layer Architecture & Live Backend Execution (1:35 - 2:05, ~30s)"""
    print("\n--- Recording Scene 3: Architecture & Live Backend Execution ---")
    raw_dir = OUT_DIR / "raw_scene3"
    raw_dir.mkdir(exist_ok=True)

    context = browser.new_context(
        viewport={"width": 1920, "height": 1080},
        record_video_dir=str(raw_dir),
        record_video_size={"width": 1920, "height": 1080}
    )
    page = context.new_page()
    page.goto(f"{BASE_URL}/architecture.html", wait_until="networkidle")
    time.sleep(2)

    # 1. Smooth scroll through 4-layer architecture diagram
    human_move(page, 960, 400, steps=25)
    time.sleep(2)
    page.mouse.wheel(0, 300)
    time.sleep(2)

    # 2. Click Live Backend Console Buttons
    page.mouse.wheel(0, 450)
    time.sleep(1.5)

    # Button 1: Health Check
    health_btn = page.locator("button:has-text('Query Edge Health')")
    if health_btn.count() > 0:
        box = health_btn.bounding_box()
        if box:
            human_move(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=20)
            health_btn.click()
            print("Clicked Query Edge Health!")
    time.sleep(2.5)

    # Button 2: Test HMAC V2X Preemption
    evp_btn = page.locator("button:has-text('Test HMAC V2X')")
    if evp_btn.count() > 0:
        box = evp_btn.bounding_box()
        if box:
            human_move(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=20)
            evp_btn.click()
            print("Clicked Test HMAC V2X!")
    time.sleep(2.5)

    # Button 3: Test Meta AI Copilot Diagnosis
    copilot_btn = page.locator("button:has-text('Test Meta AI Copilot')")
    if copilot_btn.count() > 0:
        box = copilot_btn.bounding_box()
        if box:
            human_move(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=20)
            copilot_btn.click()
            print("Clicked Test Meta AI Copilot!")
    time.sleep(3)

    # 3. Switch to Components page
    comp_link = page.locator("nav.sys-nav a:has-text('Components'), nav a:has-text('Components')")
    if comp_link.count() > 0:
        comp_link.first.click()
    else:
        page.goto(f"{BASE_URL}/components.html", wait_until="networkidle")
    time.sleep(2)

    # Search kernel and click SafetyKernel card
    search_input = page.locator("input.sys-comp-search-input")
    if search_input.count() > 0:
        search_input.click()
        search_input.fill("safety")
        time.sleep(1.5)

    card = page.locator(".sys-comp-card:has-text('safety-kernel'), .sys-comp-card:has-text('Safety')").first
    if card.count() > 0:
        box = card.bounding_box()
        if box:
            human_move(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=20)
            card.click()
    time.sleep(4)

    video_path_obj = page.video.path()
    page.close()
    context.close()

    raw_video = Path(video_path_obj)
    mp4_target = OUT_DIR / "clip3_scene3_architecture_and_backend.mp4"
    transcode_to_mp4(raw_video, mp4_target)
    shutil.rmtree(raw_dir, ignore_errors=True)


def record_scene_4(browser):
    """Scene 4: Presentation, Rubric & Live Benchmark (2:05 - 2:30, ~25s)"""
    print("\n--- Recording Scene 4: Presentation & Live Benchmark ---")
    raw_dir = OUT_DIR / "raw_scene4"
    raw_dir.mkdir(exist_ok=True)

    context = browser.new_context(
        viewport={"width": 1920, "height": 1080},
        record_video_dir=str(raw_dir),
        record_video_size={"width": 1920, "height": 1080}
    )
    page = context.new_page()
    page.goto(f"{BASE_URL}/presentation.html", wait_until="networkidle")
    time.sleep(2)

    # 1. Hover Rubric alignment
    human_move(page, 960, 320, steps=25)
    time.sleep(3)

    # 2. Scroll to live engine & paired twin benchmark
    page.mouse.wheel(0, 500)
    time.sleep(2)

    # Click live core run button if present
    run_btn = page.locator("#sys-live-run")
    if run_btn.count() > 0:
        box = run_btn.bounding_box()
        if box:
            human_move(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=20)
            run_btn.click()
            print("Clicked #sys-live-run!")
    time.sleep(2)

    # Click inject ambulance button on live core
    ems_btn = page.locator("#sys-live-ems")
    if ems_btn.count() > 0:
        box = ems_btn.bounding_box()
        if box:
            human_move(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=20)
            ems_btn.click()
            print("Clicked #sys-live-ems!")
    time.sleep(4)

    # Hover live lane tracks and KPI numbers
    human_move(page, 960, 680, steps=30)
    time.sleep(4)

    # Scroll to footer / engineering highlights
    page.mouse.wheel(0, 400)
    time.sleep(3)

    video_path_obj = page.video.path()
    page.close()
    context.close()

    raw_video = Path(video_path_obj)
    mp4_target = OUT_DIR / "clip4_scene4_benchmarks_and_rubric.mp4"
    transcode_to_mp4(raw_video, mp4_target)
    shutil.rmtree(raw_dir, ignore_errors=True)


def main():
    print(f"Starting screen recorder at {BASE_URL}...")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--start-maximized",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--force-device-scale-factor=1",
            ]
        )
        try:
            record_scene_1(browser)
            record_scene_2(browser)
            record_scene_3(browser)
            record_scene_4(browser)
            print("\n=======================================================")
            print("All 4 Scenes recorded and converted successfully!")
            print(f"Directory: {OUT_DIR.resolve()}")
            print("Files:")
            for mp4 in sorted(OUT_DIR.glob("*.mp4")):
                print(f"  - {mp4.name} ({mp4.stat().st_size // 1024} KB)")
            print("=======================================================")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
