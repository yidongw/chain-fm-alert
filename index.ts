import { chromium } from 'playwright';
import type { Page } from 'playwright';
import * as readline from 'readline';

const CHECK_INTERVAL = 10000; // 10 seconds
const BEEP = '\x07'; // Terminal bell character
const NET_ADDRS_THRESHOLD = 8;

async function waitForAcknowledgment() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise<void>((resolve) => {
    rl.question('Press Enter to acknowledge...', () => {
      rl.close();
      resolve();
    });
  });
}

async function checkNetAddrs(page: Page): Promise<number> {
  // Find the "Net Addrs." text element and navigate up to the table
  const netAddrsText = page.locator('p.chakra-text:text("Net Addrs.")').first();

  // Wait for 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Wait for the button to be present (max 5 seconds)
  await page.waitForFunction(() => {
    const button = document.querySelector('button.chakra-button[aria-label="activity"]');
    return button !== null;
  }, { timeout: 5000 });

  // Use the table element directly to find the content row
  const netAddrsValue = await netAddrsText.evaluate((el) => {

    let tableElement = el;
    // Navigate up to table
    for (let i = 0; i < 5; i++) {
      tableElement = tableElement.parentElement!;
    }

    console.log(tableElement);

    // Get the content row (second div)
    const contentRow = tableElement.children[1];

    console.log(contentRow);

    // Navigate to columns container
    const columns = contentRow.querySelector('div > div');
    console.log(columns);

    // Get the fourth column, then find its button
    const fourthColumn = columns?.children[3];
    console.log("fourthColumn", fourthColumn);

    // Wait for the button to appear (max 5 seconds)
    const button = fourthColumn?.querySelector('button');
    console.log("button", button);


    return button?.textContent || '0';
  });
  
  return parseInt(netAddrsValue, 10);
}


async function closeDialog(page: Page) {
  try {
    await page.click('button.chakra-modal__close-btn[aria-label="Close"]');
    return true;  // Dialog was found and closed
  } catch {
    return false;  // No dialog found or couldn't close
  }
}

async function monitorNetAddrs() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://chain.fm/trending');

    let isFirstClick = true;  // Track which button to click

    while (true) {
      await closeDialog(page);

      // Alternate between 5m and 1h buttons
      if (isFirstClick) {
        await page.click('button:text("5m")');
      } else {
        await page.click('button:text("1h")');
      }

      const netAddrs = await checkNetAddrs(page);
      console.log(`Current Net Addrs: ${netAddrs}`);

      if (netAddrs >= NET_ADDRS_THRESHOLD) {
        console.log(`Alert: Net Addrs is ${NET_ADDRS_THRESHOLD} or higher!`);
        // Beep until acknowledged
        const beepInterval = setInterval(() => process.stdout.write(BEEP), 1000);
        await waitForAcknowledgment();
        clearInterval(beepInterval);
      }

      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));

      isFirstClick = !isFirstClick;  // Toggle for next iteration

    }
  } catch (error) {
    console.error('An error occurred:', error);
    // await browser.close();
  }
}

// Start the monitoring
monitorNetAddrs().catch(console.error);