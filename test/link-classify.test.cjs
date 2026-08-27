const assert = require('assert');

// check-links.mjs is ESM; load it with a dynamic import so this suite can stay
// CommonJS like the rest of test/.
let mod;
before(async function () {
  mod = await import('../tools/check-links.mjs');
});

describe('link classification', function () {
  it('treats a 200 at the requested URL as ok', function () {
    const url = 'https://docs.stripe.com/api';
    assert.strictEqual(mod.classify(200, url, url), mod.OUTCOME.OK);
  });

  it('ignores a trailing slash difference', function () {
    assert.strictEqual(
      mod.classify(200, 'https://docs.stripe.com/api', 'https://docs.stripe.com/api/'),
      mod.OUTCOME.OK
    );
  });

  it('ignores a fragment on the final URL', function () {
    assert.strictEqual(
      mod.classify(200, 'https://example.com/docs', 'https://example.com/docs#intro'),
      mod.OUTCOME.OK
    );
  });

  it('flags a 200 reached at a different URL as moved', function () {
    assert.strictEqual(
      mod.classify(200, 'https://api.slack.com/scopes', 'https://docs.slack.dev/reference/scopes/'),
      mod.OUTCOME.MOVED
    );
  });

  it('treats 404 and 410 as dead', function () {
    const url = 'https://developers.hubspot.com/docs/api/email-marketing';
    assert.strictEqual(mod.classify(404, url, url), mod.OUTCOME.DEAD);
    assert.strictEqual(mod.classify(410, url, url), mod.OUTCOME.DEAD);
  });

  // The distinction that protects the dataset: being refused by a bot-detecting
  // CDN says nothing about whether the page exists, so it must not read as rot.
  it('treats 401, 403 and 429 as blocked rather than dead', function () {
    const url = 'https://example.com/docs';
    assert.strictEqual(mod.classify(401, url, url), mod.OUTCOME.BLOCKED);
    assert.strictEqual(mod.classify(403, url, url), mod.OUTCOME.BLOCKED);
    assert.strictEqual(mod.classify(429, url, url), mod.OUTCOME.BLOCKED);
  });

  it('files anything else under other', function () {
    const url = 'https://example.com/docs';
    assert.strictEqual(mod.classify(500, url, url), mod.OUTCOME.OTHER);
    assert.strictEqual(mod.classify(302, url, url), mod.OUTCOME.OTHER);
  });
});

describe('URL normalisation', function () {
  it('strips trailing slashes and fragments but keeps the query', function () {
    assert.strictEqual(
      mod.normalise('https://example.com/a/b/?v=1#frag'),
      'https://example.com/a/b?v=1'
    );
  });

  it('returns unparseable input unchanged', function () {
    assert.strictEqual(mod.normalise('not a url'), 'not a url');
  });
});

describe('probeable values', function () {
  it('accepts http and https', function () {
    assert.ok(mod.isProbeableUrl('https://example.com'));
    assert.ok(mod.isProbeableUrl('http://example.com'));
  });

  it('rejects blanks, prose and non-web schemes', function () {
    assert.ok(!mod.isProbeableUrl(''));
    assert.ok(!mod.isProbeableUrl('N/A'));
    assert.ok(!mod.isProbeableUrl('mailto:support@example.com'));
    assert.ok(!mod.isProbeableUrl(undefined));
  });
});
