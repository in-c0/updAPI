// Captures registry evidence for a change event, reproducibly:
//   node tools/bench/capture-registry-evidence.mjs <package> <version>
// Prints the fields an event's package_registry source is built from, stamped
// with retrieval time, so a reviewer can re-derive published_at and the
// runtime-floor evidence without trusting the event author.

const [pkg, version] = process.argv.slice(2);
if (!pkg || !version) {
  console.error('usage: node tools/bench/capture-registry-evidence.mjs <package> <version>');
  process.exit(2);
}

const enc = pkg.startsWith('@') ? pkg.replace('/', '%2f') : pkg;
const docUrl = `https://registry.npmjs.org/${enc}`;
const res = await fetch(docUrl);
if (!res.ok) {
  console.error(`registry returned ${res.status} for ${docUrl}`);
  process.exit(1);
}
const doc = await res.json();
const time = doc.time?.[version];
const manifest = doc.versions?.[version];
if (!time || !manifest) {
  console.error(`version ${version} not found for ${pkg} (known: ${Object.keys(doc.time ?? {}).filter((v) => /^\d/.test(v)).slice(-8).join(', ')})`);
  process.exit(1);
}
console.log(JSON.stringify({
  package: pkg,
  version,
  published_at: time,
  latest: doc['dist-tags']?.latest ?? null,
  engines: manifest.engines ?? null,
  types: manifest.types ?? manifest.typings ?? null,
  dist_integrity: manifest.dist?.integrity ?? null,
  registry_url: docUrl,
  retrieved_at: new Date().toISOString()
}, null, 2));
