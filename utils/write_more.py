import pyautogui
import time
import random


def automate_typing():
    """
    Automates typing and sending "write 10 more" repeatedly for api-docs-urls entry generation with ChatGPT -    Use it at your own risk as it may be against TOS; use OpenAI API where possible
    """
    print("Starting message automation...")
    while True:
        # Type the message
        pyautogui.write("write 10 more", interval=0.1)

        # Press Enter to send the message
        pyautogui.press('enter')

        # Wait a random interval before sending the next message
        delay = random.uniform(100, 200)  # Random delay between 20 and 60 seconds
        print(f"Message sent. Waiting for {delay:.2f} seconds...")
        time.sleep(delay)

if __name__ == "__main__":
    print("Please make sure the browser window is open and active.")
    input("Press Enter to start the script...")

    # Automate message sending
    automate_typing()
