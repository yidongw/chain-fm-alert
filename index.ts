import { chromium } from 'playwright';
import type { Page } from 'playwright';
import * as readline from 'readline';

const CHECK_INTERVAL = 10000; // 10 seconds
const BEEP = '\x07'; // Terminal bell character
const NET_ADDRS_THRESHOLD = 9;
// Add at the top of the file with other constants
const ACKNOWLEDGMENT_TIMEOUT = 60 * 60 * 1000; // 1 hour in milliseconds

// Add before the monitorNetAddrs function
const acknowledgedTickers = new Map<string, number>();


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

async function checkNetAddrs(page: Page) {
  // Find the "Net Addrs." text element and navigate up to the table
  const netAddrsText = page.locator('p.chakra-text:text("Net Addrs.")').first();

  // Wait for 5 seconds
  await new Promise(resolve => setTimeout(resolve, 4000));

  // Wait for the button to be present (max 5 seconds)
  await page.waitForFunction(() => {
    const button = document.querySelector('button.chakra-button[aria-label="activity"]');
    return button !== null;
  }, { timeout: 2000 });

  // Use the table element directly to find the content row
  const result = await netAddrsText.evaluate((el, threshold) => {

    let tableElement = el;
    // Navigate up to table
    for (let i = 0; i < 5; i++) {
      tableElement = tableElement.parentElement!;
    }

    console.log(tableElement);

    return Array.from(tableElement.children)
      .slice(1) // Skip the header row
      .map(row => {
        const columns = row.querySelector('div > div');
        if (!columns) return null;

        const firstColumn = columns.children[0];
        const fourthColumn = columns.children[3];
        
        const tickerElement = firstColumn?.querySelector('p.chakra-text');
        const button = fourthColumn?.querySelector('button');
        
        const netAddrs = parseInt(button?.textContent || '0', 10);
        const ticker = tickerElement?.textContent || 'Unknown';
        
        return { netAddrs, ticker };
      })
      .filter((item): item is { netAddrs: number; ticker: string } => {
        return item !== null && item.netAddrs >= threshold;
      });
  }, NET_ADDRS_THRESHOLD);
  
  return result;
}


async function closeDialog(page: Page) {
  try {
    await page.click('button.chakra-modal__close-btn[aria-label="Close"]', {
      timeout: 1000 // 1 second timeout
    });
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

      const results = await checkNetAddrs(page);
      
      // Log all results
      results.forEach(({ netAddrs, ticker }) => {
        console.log(`Current Net Addrs: ${netAddrs} for ${ticker}`);
      });

      // Check each result for alerts
      for (const { netAddrs, ticker } of results) {
        const lastAcknowledged = acknowledgedTickers.get(ticker);
        const currentTime = Date.now();
        
        if (!lastAcknowledged || currentTime - lastAcknowledged > ACKNOWLEDGMENT_TIMEOUT) {
          console.log(`Alert: ${ticker} has Net Addrs of ${netAddrs} (threshold: ${NET_ADDRS_THRESHOLD})!`);
          // Beep until acknowledged
          const beepInterval = setInterval(() => process.stdout.write(BEEP), 1000);
          await waitForAcknowledgment();
          
          clearInterval(beepInterval);
          // Store the acknowledgment time
          acknowledgedTickers.set(ticker, currentTime);
        }
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