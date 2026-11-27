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

// This detector regressed once: it originally keyed off rows having too few
// fields, but writing the CSV back out pads every row to the full column count,
// so after one --fix pass the structural signal was gone and the defect went
// unreported while it was still present. It is content-based for that reason.
describe('column misalignment', function () {
  it('flags a privacy policy sitting in the documentation column', function () {
    assert.strictEqual(
      mod.misalignedAs({
        Official_Documentation_URL: 'https://privacy.microsoft.com/en-us/privacystatement',
      }),
      'Privacy Policy'
    );
  });

  it('flags a community forum sitting in the documentation column', function () {
    assert.strictEqual(
      mod.misalignedAs({ Official_Documentation_URL: 'https://community.openai.com/' }),
      'Developer Community/Forum'
    );
  });

  it('flags a rate-limit page sitting in the documentation column', function () {
    assert.strictEqual(
      mod.misalignedAs({
        Official_Documentation_URL: 'https://learn.microsoft.com/en-us/graph/throttling',
      }),
      'Rate Limiting Policy'
    );
  });

  it('leaves a genuine documentation URL alone', function () {
    assert.strictEqual(
      mod.misalignedAs({ Official_Documentation_URL: 'https://docs.stripe.com/api' }),
      null
    );
    assert.strictEqual(
      mod.misalignedAs({ Official_Documentation_URL: 'https://platform.openai.com/docs/overview' }),
      null
    );
  });

  it('ignores an empty or missing cell', function () {
    assert.strictEqual(mod.misalignedAs({ Official_Documentation_URL: '' }), null);
    assert.strictEqual(mod.misalignedAs({}), null);
  });
});

describe('API-name-aware hints', function () {
  // "AWS Security Hub API" has `security` in its documentation URL because that
  // is what the product is called. Without discounting the API's own name, such
  // rows look permanently misfiled and no repair can drive the count to zero.
  it('does not flag a policy word that comes from the API name', function () {
    assert.strictEqual(
      mod.misalignedAs({
        API_Name: 'AWS Security Hub API',
        Official_Documentation_URL: 'https://docs.aws.amazon.com/securityhub/latest/userguide/',
      }),
      null
    );
  });

  it('still flags the same word when the name does not explain it', function () {
    assert.strictEqual(
      mod.misalignedAs({
        API_Name: 'Dropbox File Request API',
        Official_Documentation_URL: 'https://www.dropbox.com/security',
      }),
      'Security Policy'
    );
  });

  it('does not treat a vendor documentation host as a community link', function () {
    assert.strictEqual(mod.hintMatches('Developer Community/Forum', 'https://docs.slack.dev/reference/'), false);
    assert.strictEqual(mod.hintMatches('Developer Community/Forum', 'https://slackcommunity.com/'), true);
  });

  it('does not match "tos" inside an unrelated word', function () {
    assert.strictEqual(mod.hintMatches('Terms of Service', 'https://developers.google.com/photos'), false);
    assert.strictEqual(mod.hintMatches('Terms of Service', 'https://openai.com/policies/terms-of-use/'), true);
  });
});

describe('locale parameters', function () {
  // Google's docs redirect to whichever language they infer from the client, so
  // following redirects from CI turned /analytics into /analytics?hl=zh-cn and a
  // --fix pass baked that language into 160 rows of an English dataset.
  it('does not treat a language redirect as a move', function () {
    assert.strictEqual(
      mod.classify(
        200,
        'https://developers.google.com/analytics',
        'https://developers.google.com/analytics?hl=zh-cn'
      ),
      mod.OUTCOME.OK
    );
  });

  it('strips language parameters and keeps the rest of the query', function () {
    assert.strictEqual(
      mod.stripLocale('https://developers.google.com/analytics?hl=pt-br'),
      'https://developers.google.com/analytics'
    );
    assert.strictEqual(
      mod.stripLocale('https://example.com/a?hl=he&version=2'),
      'https://example.com/a?version=2'
    );
  });

  it('leaves a URL without language parameters untouched', function () {
    assert.strictEqual(
      mod.stripLocale('https://docs.stripe.com/api?v=2'),
      'https://docs.stripe.com/api?v=2'
    );
  });

  it('still sees a genuine move that also carries a locale', function () {
    assert.strictEqual(
      mod.classify(200, 'https://api.slack.com/scopes', 'https://docs.slack.dev/scopes?hl=en'),
      mod.OUTCOME.MOVED
    );
  });
});
