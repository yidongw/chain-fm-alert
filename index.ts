import { chromium } from 'playwright';
import type { Page } from 'playwright';
import * as readline from 'readline';

const CHECK_INTERVAL = 10000; // 10 seconds
const BEEP = '\x07'; // Terminal bell character
const NET_ADDRS_THRESHOLD_FOR_5M = 9;
const NET_ADDRS_THRESHOLD_FOR_1H = 15;

// Add at the top of the file with other constants
const ACKNOWLEDGMENT_TIMEOUT = 3 * 60 * 60 * 1000; // 3 hours in milliseconds

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

async function checkNetAddrs(page: Page, thresholdNumber: number) {
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
  }, thresholdNumber);
  
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


      // Wait for and click the time interval button
      async function waitForTimeButton(timeText: string) {
        while (true) {
          try {
            // Wait for 5 seconds max for the button to appear
            await page.waitForSelector(`button:text("${timeText}")`, { timeout: 5000 });
            await page.click(`button:text("${timeText}")`);
            return true;
          } catch {
            console.log(`Button "${timeText}" not found, refreshing page...`);
            await page.reload();
            // Wait a bit after refresh
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      // Alternate between 5m and 1h buttons
      const NET_ADDRS_THRESHOLD = isFirstClick ? NET_ADDRS_THRESHOLD_FOR_5M : NET_ADDRS_THRESHOLD_FOR_1H;
      if (isFirstClick) {
        await waitForTimeButton("5m");
      } else {
        await waitForTimeButton("1h");
      }

      const results = await checkNetAddrs(
        page,
        NET_ADDRS_THRESHOLD
      );
      
      const currentTime = new Date().toLocaleTimeString();

      console.log(`[${currentTime}] Found ${results.length} tickers with Net Addrs >= ${NET_ADDRS_THRESHOLD}`);

      // Log all results
      results.forEach(({ netAddrs, ticker }) => {
        console.log(`[${currentTime}] Current Net Addrs: ${netAddrs} for ${ticker}`);
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