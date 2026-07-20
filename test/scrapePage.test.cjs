const assert = require('assert');
const sinon = require('sinon');

// Sample implementation for scrapePage, or import from your module
const scrapePage = async (browser, url, apiName) => {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('body', { timeout: 10000 });
    const title = await page.title();
    const content = await page.content();
    return { apiName, url, title, content };
  } catch (err) {
    return null;
  } finally {
    await page.close();
  }
};

describe('Page Scraping', function() {
  it('should extract title and content from a page', async function() {
    // Create stubs for a fake page
    const fakePage = {
      goto: sinon.stub().resolves(),
      waitForSelector: sinon.stub().resolves(),
      title: sinon.stub().resolves('Fake Title'),
      content: sinon.stub().resolves('<html>Fake Content</html>'),
      close: sinon.stub().resolves(),
    };

    // Stub for the browser object
    const fakeBrowser = {
      newPage: sinon.stub().resolves(fakePage),
    };

    const result = await scrapePage(fakeBrowser, 'http://fakeurl.com', 'Fake API');
    assert.strictEqual(result.apiName, 'Fake API');
    assert.strictEqual(result.url, 'http://fakeurl.com');
    assert.strictEqual(result.title, 'Fake Title');
    assert.strictEqual(result.content, '<html>Fake Content</html>');

    // Verify that methods were called
    sinon.assert.calledOnce(fakePage.goto);
    sinon.assert.calledOnce(fakePage.close);
  });

  it('should return null if page fails to load', async function() {
    const fakePage = {
      goto: sinon.stub().rejects(new Error('Load error')),
      waitForSelector: sinon.stub().resolves(),
      title: sinon.stub().resolves('Title'),
      content: sinon.stub().resolves('Content'),
      close: sinon.stub().resolves(),
    };

    const fakeBrowser = {
      newPage: sinon.stub().resolves(fakePage),
    };

    const result = await scrapePage(fakeBrowser, 'http://fail.com', 'Fail API');
    assert.strictEqual(result, null);
    sinon.assert.calledOnce(fakePage.close);
  });
});
