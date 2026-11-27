const fs = require('fs');
const { parse } = require('csv-parse');
const { chromium } = require('playwright');

// Function to parse CSV into JSON
const parseCSV = async (filePath) => {
    return new Promise((resolve, reject) => {
        const records = [];
        fs.createReadStream(filePath)
            .pipe(parse({ columns: true }))
            .on('data', (data) => records.push(data))
            .on('end', () => resolve(records))
            .on('error', (error) => reject(error));
    });
};

// Function to check `robots.txt`
const canScrape = async (url) => {
    try {
        const robotsUrl = new URL('/robots.txt', url).href;
        const response = await fetch(robotsUrl);
        if (!response.ok) {
            console.warn(`Could not fetch robots.txt for ${url}. Defaulting to allow.`);
            return true; // Default to allow if robots.txt is not reachable
        }
        const robotsText = await response.text();
        return !robotsText.includes('Disallow: /'); // Check for broad disallow
    } catch (err) {
        console.error(`Error checking robots.txt for ${url}: ${err.message}`);
        return false;
    }
};

// Function to scrape a single page
const scrapePage = async (browser, url, apiName) => {
    const page = await browser.newPage();
    try {
        console.log(`Scraping: ${url}`);
        await page.goto(url, { waitUntil: 'load', timeout: 60000 });

        // Wait for dynamic content (adjust selector as needed for your pages)
        await page.waitForSelector('body', { timeout: 10000 });

        // Extract page content
        const title = await page.title();
        const content = await page.content();

        // Save scraped data
        return {
            apiName,
            url,
            title,
            content,
        };
    } catch (err) {
        console.error(`Failed to scrape ${url}: ${err.message}`);
        return null;
    } finally {
        await page.close();
    }
};

// Main scraper function
const scrapeDocs = async () => {
    // Load API URLs from CSV
    const apis = await parseCSV('./api_urls.csv');
    console.log(`Loaded ${apis.length} API URLs.`);

    // Initialize Playwright
    const browser = await chromium.launch();

    const scrapedData = [];

    for (const api of apis) {
        const { API_Name, Official_Documentation_URL } = api;

        // Check robots.txt
        if (!(await canScrape(Official_Documentation_URL))) {
            console.warn(`Skipping ${Official_Documentation_URL}: Not allowed by robots.txt`);
            continue;
        }

        // Scrape the page
        const data = await scrapePage(browser, Official_Documentation_URL, API_Name);
        if (data) {
            scrapedData.push(data);
        }
    }

    // Close the browser
    await browser.close();

    // Save data to JSON
    fs.writeFileSync('scraped_data.json', JSON.stringify(scrapedData, null, 2));
    console.log('Scraping completed. Data saved to scraped_data.json');
};

// Run the scraper
scrapeDocs().catch((err) => {
    console.error(`Error running scraper: ${err.message}`);
});
