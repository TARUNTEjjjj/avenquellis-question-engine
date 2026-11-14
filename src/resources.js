import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readCatalog, queryCatalog} from '../scripts/resources/resource-catalog.mjs';

const configPath = new URL('../resources/sources.json', import.meta.url);
const snapshotPath = fileURLToPath(new URL('../resources/catalog.json', import.meta.url));

/** Public metadata only. Refresh is an offline/server job, never visitor-triggered. */
export async function handleResources(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/resources') return false;
  const send = (status, body, headers = {}) => {
    if (req.aborted || res.destroyed) return true;
    if (!req.complete) res.shouldKeepAlive = false;
    res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store', ...headers});
    res.end(JSON.stringify(body));
    return true;
  };
  if (req.method !== 'GET') return send(405, {error:'Use GET.'}, {'Allow':'GET'});
  if ([...url.searchParams.keys()].some(key => !['category','q','limit'].includes(key))) return send(400, {error:'Unknown resource filter.'});
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 || (url.searchParams.get('q') || '').length > 200) return send(400, {error:'Use a limit from 1 to 200 and a search of at most 200 characters.'});
  try {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    const category = url.searchParams.get('category') || undefined;
    if (category && !config.categories.some(item => item.id === category)) return send(400, {error:'Unknown resource category.'});
    const catalog = await readCatalog(config, {snapshotPath});
    return send(200, queryCatalog(catalog, {category, q:url.searchParams.get('q') || '', limit}));
  } catch {
    return send(503, {error:'The resource catalog is temporarily unavailable.'});
  }
}
