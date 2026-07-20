const assert = require('assert');
const nock = require('nock');

// Re-create or import the function to test:
const canScrape = async (url) => {
  try {
    const robotsUrl = new URL('/robots.txt', url).href;
    const response = await fetch(robotsUrl);
    if (!response.ok) {
      return true;
    }
    const robotsText = await response.text();
    return !robotsText.includes('Disallow: /');
  } catch (err) {
    return false;
  }
};

describe('Robots.txt Checker', function() {
  // Use Node's fetch. If you don't have global fetch, use node-fetch.
  before(function() {
    global.fetch = require('node-fetch');
  });

  after(function() {
    delete global.fetch;
  });

  it('should allow scraping when robots.txt does not disallow all', async function() {
    const url = 'http://example.com';
    nock(url)
      .get('/robots.txt')
      .reply(200, 'User-agent: *\nAllow: /');

    const result = await canScrape(url);
    assert.strictEqual(result, true);
  });

  it('should not allow scraping when robots.txt disallows', async function() {
    const url = 'http://disallow.com';
    nock(url)
      .get('/robots.txt')
      .reply(200, 'User-agent: *\nDisallow: /');

    const result = await canScrape(url);
    assert.strictEqual(result, false);
  });

  it('should return false on network error', async function() {
    const url = 'http://error.com';
    nock(url)
      .get('/robots.txt')
      .replyWithError('Network error');

    const result = await canScrape(url);
    assert.strictEqual(result, false);
  });
});
