import os
import time
import subprocess
from urllib.parse import urlparse
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

"""
Special gameplay visualization script.
Starts the dev servers with SKIP_CHARLESTON=1 so the game
enters real play immediately after all 4 players join.
This DOES NOT fast-forward the Charleston; it entirely removes it
for the session so tile counts remain as dealt.

Usage:
  python scripts/mahjong_no_charleston_gameplay_test.py
Requires chromedriver in project root (adjust CHROMEDRIVER_PATH if needed).
"""

CHROMEDRIVER_PATH = './chromedriver'
SERVER_START_WAIT = 6  # legacy fixed wait (kept for fallback)
MAX_STARTUP_TIMEOUT = 45  # max seconds to wait for each server
POLL_INTERVAL = 1.5
FRONTEND_URL = "http://localhost:5173"
WS_PORT = 8080


def kill_servers():
    print("Killing servers on ports 8080 and 5173...")
    subprocess.run("lsof -ti:8080 | xargs kill -9 2>/dev/null", shell=True)
    subprocess.run("lsof -ti:5173 | xargs kill -9 2>/dev/null", shell=True)


def start_servers_skip_charleston():
    print("Starting servers with SKIP_CHARLESTON=1 (no Charleston phase)...")
    env = os.environ.copy()
    env["SKIP_CHARLESTON"] = "1"
    # Start combined dev processes (WS + Vite)
    subprocess.Popen("npm run dev:all > server.log 2>&1", shell=True, env=env)
    print("Polling for frontend & websocket readiness...")
    wait_for_http(FRONTEND_URL, MAX_STARTUP_TIMEOUT)
    wait_for_tcp("localhost", WS_PORT, MAX_STARTUP_TIMEOUT)
    print("Servers ready.")


def wait_for_http(url: str, timeout: int):
    import urllib.request
    start = time.time()
    last_err = None
    while time.time() - start < timeout:
        try:
            # Try primary URL, then fallback to explicit index.html (Vite sometimes delays root hydration)
            for attempt_url in (url, url.rstrip('/') + '/index.html'):
                try:
                    with urllib.request.urlopen(attempt_url, timeout=3) as resp:
                        status = resp.status
                        # Treat any non-500 response as readiness; accept common dev 404 before assets build
                        if 200 <= status < 300:
                            print(f"HTTP OK: {attempt_url} ({status})")
                            return True
                        if status in (301, 302, 303, 307, 308, 404):
                            print(f"HTTP reachable (status {status}) treating as ready: {attempt_url}")
                            return True
                        print(f"HTTP status {status} not ready yet for {attempt_url}")
                except Exception as inner_e:
                    last_err = inner_e
        except Exception as e:
            last_err = e
        time.sleep(POLL_INTERVAL)
    print(f"ERROR: Frontend not reachable after {timeout}s: {last_err}")
    raise SystemExit(1)


def wait_for_tcp(host: str, port: int, timeout: int):
    import socket
    start = time.time()
    last_err = None
    while time.time() - start < timeout:
        s = socket.socket()
        s.settimeout(2)
        try:
            s.connect((host, port))
            s.close()
            print(f"TCP OK: {host}:{port}")
            return True
        except Exception as e:
            last_err = e
        finally:
            s.close()
        time.sleep(POLL_INTERVAL)
    print(f"ERROR: Port {port} not reachable after {timeout}s: {last_err}")
    raise SystemExit(1)


def open_player(invite_code=None, username=None, player_id=None):
    opts = Options()
    opts.add_argument("--incognito")
    service = Service(CHROMEDRIVER_PATH)
    driver = webdriver.Chrome(service=service, options=opts)

    # Window layout similar to other test scripts
    w, h = 420, 800
    if player_id is not None:
        if player_id == 0:  # Bottom middle
            driver.set_window_position(520, 380)
            driver.set_window_size(w, h - 260)
        elif player_id == 1:  # Right
            driver.set_window_position(1050, 0)
            driver.set_window_size(w, h)
        elif player_id == 2:  # Top middle
            driver.set_window_position(520, 0)
            driver.set_window_size(w, h - 260)
        elif player_id == 3:  # Left
            driver.set_window_position(0, 0)
            driver.set_window_size(w, h)
    else:
        driver.set_window_size(w, h)

    # Robust navigation with retry in case of very late dev server hydration
    for attempt in range(10):
        try:
            driver.get(FRONTEND_URL)
            break
        except Exception as e:
            print(f"Navigation attempt {attempt+1} failed: {e}")
            time.sleep(1.2)

    if invite_code and username:
        # Join existing table
        code_input = driver.find_element(By.CSS_SELECTOR, "input#inviteCode")
        code_input.clear()
        code_input.send_keys(invite_code)
        join_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Join Table')]")
        join_btn.click()
        time.sleep(0.8)
        name_input = driver.find_element(By.CSS_SELECTOR, "input[type='text'][placeholder='Your username']")
        name_input.clear()
        name_input.send_keys(username)
        cont_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Continue') or contains(text(), 'Save')]")
        cont_btn.click()
    return driver


def create_table(driver):
    wait = WebDriverWait(driver, 15)
    create_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Create Table')]")))
    create_btn.click()
    name_input = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='text'][placeholder='Your username']")))
    name_input.clear()
    name_input.send_keys("player 0")
    cont_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Continue') or contains(text(), 'Save')]") ))
    cont_btn.click()

    wait.until(EC.url_contains('/table/'))
    url = driver.current_url
    path = urlparse(url).path
    invite_code = path.split('/')[-1].strip().upper()
    print(f"Invite code: {invite_code}")
    return invite_code


def main():
    kill_servers()
    start_servers_skip_charleston()

    print("Launching first player and creating table (no Charleston)...")
    d0 = open_player(player_id=0)
    invite_code = create_table(d0)

    drivers = [d0]
    for pid in range(1, 4):
        drivers.append(open_player(invite_code, f"player {pid}", player_id=pid))
        time.sleep(0.6)

    print("All players joined. Game should start directly in play phase (Charleston skipped).")
    print("You can now observe real gameplay state in each window.")
    print("Press Enter to close all windows when finished.")
    input()

    for d in drivers:
        d.quit()


if __name__ == "__main__":
    main()
