const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const nock = require('nock');

// Assuming scrapeDocs is exported from scrapers/accurate-scraper.js
const { scrapeDocs } = require('../scrapers/accurate-scraper');

// Create a temporary CSV fixture in your test folder
const tempCsvPath = './test/test_api_urls.csv';
const tempOutputPath = './test/scraped_data_test.json';

describe('Integration: scrapeDocs Workflow', function() {
  before(function() {
    // Write a simple CSV with a test API URL that we will intercept with nock
    const csvContent = 'API_Name,Official_Documentation_URL\nTestAPI,http://testapi.com\n';
    fs.writeFileSync(tempCsvPath, csvContent);

    // Stub the CSV file path in your scraper if needed,
    // Or temporarily override parseCSV to use your tempCsvPath.
    // For example, if parseCSV reads './api_urls.csv', you might override it during the test.
    // Alternatively, copy tempCsvPath to the expected location.
    fs.copyFileSync(tempCsvPath, './api_urls.csv');

    // Intercept the page request
    nock('http://testapi.com')
      .get('/')
      .reply(200, '<html><body>Test Content</body></html>');

    // Also intercept the robots.txt request to allow scraping
    nock('http://testapi.com')
      .get('/robots.txt')
      .reply(200, 'User-agent: *\nAllow: /');
  });

  after(function() {
    // Clean up CSV and output files
    if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
    if (fs.existsSync('./api_urls.csv')) fs.unlinkSync('./api_urls.csv');
    if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
  });

  it('should produce a JSON output for the CSV entry', async function() {
    // Run scrapeDocs (make sure scrapeDocs writes to a test-specific file or override the output path)
    // For demonstration, we assume scrapeDocs writes to "scraped_data.json"
    await scrapeDocs();

    // Check if the output file exists and contains the expected content
    const outputContent = fs.readFileSync('scraped_data.json', 'utf-8');
    const data = JSON.parse(outputContent);
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].apiName, 'TestAPI');
    assert.ok(data[0].title.length > 0);
    assert.ok(data[0].content.includes('Test Content'));
  });
});
