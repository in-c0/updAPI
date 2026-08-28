const assert = require('assert');

let realign;
before(async function () {
  realign = await import('../tools/realign-columns.mjs');
});

const COLUMNS = [
  'Official_Documentation_URL',
  'Privacy Policy',
  'Terms of Service',
  'Rate Limiting Policy',
  'Release Notes',
  'Security Policy',
  'Developer Community/Forum',
];

describe('column realignment', function () {
  // The old cleaner dropped broken URLs instead of blanking them, so a row that
  // lost its documentation URL came back with everything shifted one left. The
  // surviving values keep their relative order, which is what makes the damage
  // recoverable.
  it('reassigns a left-shifted row back to the right columns', function () {
    const urls = [
      'https://www.dropbox.com/privacy',
      'https://www.dropbox.com/terms',
      'https://www.dropbox.com/features/security',
      'https://community.dropbox.com/en',
    ];
    const { placement } = realign.bestAssignment(urls, COLUMNS, 'Dropbox File Request API');
    assert.deepStrictEqual(placement.map((i) => COLUMNS[i]), [
      'Privacy Policy',
      'Terms of Service',
      'Security Policy',
      'Developer Community/Forum',
    ]);
  });

  it('preserves order — a later URL never lands in an earlier column', function () {
    const urls = ['https://example.com/security', 'https://example.com/privacy'];
    const { placement } = realign.bestAssignment(urls, COLUMNS);
    assert.ok(placement[0] < placement[1], 'assignment must be monotonic');
  });

  it('leaves an already-correct row untouched', function () {
    const urls = [
      'https://docs.stripe.com/api',
      'https://stripe.com/privacy',
      'https://stripe.com/legal',
    ];
    const { placement } = realign.bestAssignment(urls, COLUMNS, 'Stripe API');
    assert.deepStrictEqual(placement, [0, 1, 2]);
  });

  it('refuses to assign more URLs than there are columns', function () {
    const urls = new Array(COLUMNS.length + 1).fill('https://example.com/x');
    assert.strictEqual(realign.bestAssignment(urls, COLUMNS).placement, null);
  });

  it('scores a contradicting placement negatively so it can be blanked', function () {
    assert.ok(realign.score('https://example.com/privacy', 'Rate Limiting Policy') < 0);
    assert.strictEqual(realign.score('https://example.com/privacy', 'Privacy Policy'), 4);
  });
});
