import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import {createApp} from '../src/server.js';

test('resource catalog API uses stored metadata and validates filters', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/resources`;
  try {
    let response = await fetch(base + '?limit=1');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.schemaVersion, 1);
    assert.equal(data.items.length, 1);
    assert.equal(Object.hasOwn(data, 'sourceCache'), false);
    assert.equal(Object.hasOwn(data, 'token'), false);
    assert.equal(data.items[0].url.startsWith('https://github.com/'), true);
    for (const query of ['limit=0','limit=201','limit=1.5','category=missing','token=secret']) {
      response = await fetch(base + '?' + query);
      assert.equal(response.status, 400, query);
    }
    response = await fetch(base, {method:'POST'});
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('rejected resource uploads close unfinished request connections', {timeout:2000}, async t => {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {server.closeAllConnections();server.close(resolve);}));
  const response = await new Promise((resolve,reject) => {
    const request = http.request(`http://127.0.0.1:${server.address().port}/api/resources`,
      {method:'POST',headers:{'Content-Length':'99999999'}}, response => {
        response.resume();
        response.on('end', () => resolve({status:response.statusCode,connection:response.headers.connection}));
      });
    request.on('error',reject);
    t.after(() => request.destroy());
    request.write('{');
  });
  assert.equal(response.status,405);
  assert.equal(response.connection,'close');
});
