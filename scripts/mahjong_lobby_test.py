from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from urllib.parse import urlparse
import time
import subprocess
import os


# Change this to your actual path to chromedriver if needed
CHROMEDRIVER_PATH = './chromedriver'

# Helper to kill servers on ports 8080 and 5173
def kill_servers():
    print("Killing servers on ports 8080 and 5173...")
    subprocess.run("lsof -ti:8080 | xargs kill -9 2>/dev/null", shell=True)
    subprocess.run("lsof -ti:5173 | xargs kill -9 2>/dev/null", shell=True)
    # time.sleep(1)

# Helper to start both servers (WS and Vite)
def start_servers():
    print("Starting servers with 'npm run dev:all' ...")
    # Start servers in background
    # Use subprocess.Popen without setsid (which doesn't exist on macOS)
    subprocess.Popen("npm run dev:all > server.log 2>&1", shell=True)
    # Wait for servers to start - increased wait time
    sleepTime = 5
    print(f"Waiting for servers to start ({sleepTime} seconds)...")
    time.sleep(sleepTime)

# Main orchestration
def open_private_tab(invite_code=None, player_name=None):
    chrome_options = Options()
    chrome_options.add_argument("--incognito")
    chrome_options.add_argument("--window-size=800,600")
    service = Service(CHROMEDRIVER_PATH)
    driver = webdriver.Chrome(service=service, options=chrome_options)

    
    driver.get("http://localhost:5173")
    # time.sleep(2)
    if invite_code and player_name:
        # Enter invite code
        code_input = driver.find_element(By.CSS_SELECTOR, "input#inviteCode")
        code_input.clear()
        code_input.send_keys(invite_code)
        # Click join button
        join_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Join Table')]")
        join_btn.click()
        time.sleep(2)
        # Fill in username in modal
        username_input = driver.find_element(By.CSS_SELECTOR, "input[type='text'][placeholder='Your username']")
        username_input.clear()
        username_input.send_keys(player_name)
        continue_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Continue') or contains(text(), 'Save')]")
        continue_btn.click()
        # time.sleep(2)
    return driver

def main():
    kill_servers()
    start_servers()
    print("Servers restarted. Proceeding with browser automation...")

    # Step 1: Open first tab and create lobby
    driver0 = open_private_tab()
    # time.sleep(2)
    # Click create table button
    create_btn = driver0.find_element(By.XPATH, "//button[contains(text(), 'Create Table')]")
    create_btn.click()
    # time.sleep(2)
    # Fill in username in modal
    username_input = driver0.find_element(By.CSS_SELECTOR, "input[type='text'][placeholder='Your username']")
    username_input.clear()
    username_input.send_keys("player 0")
    continue_btn = driver0.find_element(By.XPATH, "//button[contains(text(), 'Continue') or contains(text(), 'Save')]")
    continue_btn.click()
    # Wait for navigation to the table page and extract code from URL
    deadline = time.time() + 10
    while time.time() < deadline:
        current = driver0.current_url
        if "/table/" in current:
            break
        time.sleep(0.25)
    current = driver0.current_url
    path = urlparse(current).path
    if "/table/" not in path:
        raise RuntimeError(f"Did not navigate to table page, current URL: {current}")
    invite_code = path.split('/')[-1].strip().upper()
    print(f"Invite code: {invite_code}")

    # Step 2: Open other tabs and join
    drivers = [driver0]
    for i in range(1, 4):
        drivers.append(open_private_tab(invite_code, f"player {i}"))
        # time.sleep(2)

    # Keep browsers open for manual inspection
    input("Press Enter to close all browsers...")
    for d in drivers:
        d.quit()

# Run main if script is executed
if __name__ == "__main__":
    main()