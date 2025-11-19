from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from urllib.parse import urlparse
import time
import subprocess
import os

# Path to chromedriver (adjust if needed)
CHROMEDRIVER_PATH = './chromedriver'

# Helper to kill servers on ports 8080 and 5173

def kill_servers():
    print("Killing servers on ports 8080 and 5173...")
    subprocess.run("lsof -ti:8080 | xargs kill -9 2>/dev/null", shell=True)
    subprocess.run("lsof -ti:5173 | xargs kill -9 2>/dev/null", shell=True)

# Helper to start both servers (WS and Vite) with blind-pass override enabled

def start_servers():
    print("Starting servers with 'npm run dev:all' and BLIND_PASS_ALL=1 ...")
    env = os.environ.copy()
    env["BLIND_PASS_ALL"] = "1"  # enable blind pass on every Charleston pass
    # Start servers in background and pipe logs
    subprocess.Popen("npm run dev:all > server.log 2>&1", shell=True, env=env)
    # Wait for servers to start
    sleepTime = 6
    print(f"Waiting for servers to start ({sleepTime} seconds)...")
    time.sleep(sleepTime)

def open_private_tab(invite_code=None, player_name=None, player_id=None):
    chrome_options = Options()
    chrome_options.add_argument("--incognito")
    service = Service(CHROMEDRIVER_PATH)
    driver = webdriver.Chrome(service=service, options=chrome_options)
    
    # Position windows based on player ID
    # Layout: player 3 (left), player 2 (top middle), player 1 (right), player 0 (bottom middle)
    window_width = 420
    window_height = 800
    
    if player_id is not None:
        if player_id == 0:  # Bottom middle
            driver.set_window_position(520, 350)
            driver.set_window_size(window_width, window_height-300)
        elif player_id == 1:  # Right
            driver.set_window_position(1050, 0)
            driver.set_window_size(window_width, window_height)
        elif player_id == 2:  # Top middle
            driver.set_window_position(520, 0)
            driver.set_window_size(window_width, window_height-300)
        elif player_id == 3:  # Left
            driver.set_window_position(0, 0)
            driver.set_window_size(window_width, window_height)
    else:
        # Default size if no player_id provided
        driver.set_window_size(window_width, window_height)
    
    driver.get("http://localhost:5173")
    time.sleep(1.5)
    if invite_code and player_name:
        # Enter invite code
        code_input = driver.find_element(By.CSS_SELECTOR, "input#inviteCode")
        code_input.clear()
        code_input.send_keys(invite_code)
        # Click join button
        join_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Join Table')]")
        join_btn.click()
        time.sleep(1.0)
        # Fill in username in modal
        username_input = driver.find_element(By.CSS_SELECTOR, "input[type='text'][placeholder='Your username']")
        username_input.clear()
        username_input.send_keys(player_name)
        continue_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Continue') or contains(text(), 'Save')]")
        continue_btn.click()
        time.sleep(1.0)
    return driver

# Main orchestration

def main():
    kill_servers()
    start_servers()
    print("Servers restarted. Proceeding with browser automation...")

    # Step 1: Open first tab and create lobby
    driver0 = open_private_tab(player_id=0)
    # Click create table button (wait until clickable)
    wait0 = WebDriverWait(driver0, 15)
    create_btn = wait0.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Create Table')]")))
    create_btn.click()
    
    # Fill in username in modal
    username_input = wait0.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='text'][placeholder='Your username']")))
    username_input.clear()
    username_input.send_keys("player 0")
    continue_btn = wait0.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Continue') or contains(text(), 'Save')]")))
    continue_btn.click()

    # Wait for navigation to the table page and extract code from URL
    wait0.until(EC.url_contains('/table/'))
    current = driver0.current_url
    path = urlparse(current).path
    if "/table/" not in path:
        raise RuntimeError(f"Did not navigate to table page, current URL: {current}")
    invite_code = path.split('/')[-1].strip().upper()
    print(f"Invite code: {invite_code}")

    # Step 2: Open other tabs and join
    drivers = [driver0]
    for i in range(1, 4):
        drivers.append(open_private_tab(invite_code, f"player {i}", player_id=i))
        time.sleep(0.5)

    print("Manual testing: BLIND_PASS_ALL=1 is enabled. Perform Charleston passes by hand in each window.")

    input("Press Enter to close all browsers...")
    for d in drivers:
        d.quit()

if __name__ == "__main__":
    main()
