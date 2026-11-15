/** A saved reference resolves only to the content of its family@version, so an entry of
 * test/content-fingerprints.json never changes once a commit has recorded it. npm test can only check that each
 * family matches its entry, and re-pinning a changed family under its old version would pass it. Compare the
 * record with an earlier commit instead: check.yml passes the pull request's base or the previous tip of main.
 * Usage: node scripts/check-content-versions.mjs [commit], which defaults to HEAD. */
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)), file = 'test/content-fingerprints.json';
const base = process.argv[2] || 'HEAD';
const git = (...args) => {
  const result = spawnSync('git', args, {cwd: root, encoding: 'utf8'});
  if (result.error) throw result.error;
  return result;
};
// A push that creates a branch has no previous tip.
if (/^0{40}$/.test(base)) {
  console.log('No earlier commit to compare with.');
  process.exit(0);
}
if (git('cat-file', '-e', `${base}^{commit}`).status !== 0) {
  console.error(`Commit ${base} is not in this checkout. Fetch the full history (fetch-depth: 0 in CI) and run again.`);
  process.exit(1);
}
const earlier = git('show', `${base}:${file}`);
if (earlier.status !== 0) {
  console.log(`${base} has no ${file}, so no entry was recorded before.`);
  process.exit(0);
}
const recorded = JSON.parse(earlier.stdout), current = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const changed = Object.entries(recorded).filter(([key, fingerprint]) => !Object.hasOwn(current, key) || current[key] !== fingerprint);
for (const [key, fingerprint] of changed) {
  console.error(`${key}: ${fingerprint} at ${base}, ${Object.hasOwn(current, key) ? current[key] : 'removed'} now.`);
}
if (changed.length) {
  console.error(`Restore these entries of ${file}. A family whose content changed needs a new version in both catalogs and its own entry.`);
  process.exit(1);
}
console.log(`All ${Object.keys(recorded).length} entries recorded at ${base} are unchanged.`);
