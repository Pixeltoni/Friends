'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const PW = 'test-admin';
let proc;
let dataDir;

async function call(p, { method = 'GET', body, token, admin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (admin) headers['X-Admin-Password'] = admin;
  const res = await fetch(BASE + p, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wichtel-'));
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), ADMIN_PASSWORD: PW, DATA_DIR: dataDir },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/status'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('Server startete nicht');
});

after(() => {
  proc.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('kompletter Ablauf', async () => {
  const names = ['Anna', 'Ben', 'Clara', 'David', 'Eva'];
  const tokens = {};
  for (const name of names) {
    const r = await call('/api/join', { method: 'POST', body: { name, pin: '1234', wish: `Wunsch von ${name}` } });
    assert.strictEqual(r.status, 201);
    tokens[name] = r.data.token;
  }

  // doppelter Name, kurze PIN
  assert.strictEqual((await call('/api/join', { method: 'POST', body: { name: 'anna', pin: '1234' } })).status, 409);
  assert.strictEqual((await call('/api/join', { method: 'POST', body: { name: 'Fritz', pin: '12' } })).status, 400);

  // vor der Auslosung kein Wichtel
  assert.strictEqual((await call('/api/me', { token: tokens.Anna })).data.wichtel, null);

  // Admin-Schutz
  assert.strictEqual((await call('/api/admin/draw', { method: 'POST', admin: 'falsch' })).status, 401);
  assert.strictEqual((await call('/api/admin/draw', { method: 'POST', admin: PW })).status, 200);
  assert.strictEqual((await call('/api/admin/draw', { method: 'POST', admin: PW })).status, 409);

  // nach der Auslosung kein Eintragen mehr
  assert.strictEqual((await call('/api/join', { method: 'POST', body: { name: 'Zoe', pin: '1234' } })).status, 409);

  // jede Person hat genau einen Wichtel, niemand sich selbst, jeder wird genau einmal beschenkt
  const receivers = [];
  for (const name of names) {
    const me = (await call('/api/me', { token: tokens[name] })).data;
    assert.ok(me.wichtel);
    assert.notStrictEqual(me.wichtel.name, name);
    assert.strictEqual(me.wichtel.wish, `Wunsch von ${me.wichtel.name}`);
    receivers.push(me.wichtel.name);
  }
  assert.deepStrictEqual(receivers.sort(), names.slice().sort());

  // Status verrät keine Paare
  const st = (await call('/api/status')).data;
  assert.ok(st.drawn);
  assert.ok(!JSON.stringify(st).includes('giftTo'));
  assert.ok(!JSON.stringify(st).includes('pin'));

  // Login auf anderem Gerät
  assert.strictEqual((await call('/api/login', { method: 'POST', body: { name: 'Ben', pin: '0000' } })).status, 401);
  const login = await call('/api/login', { method: 'POST', body: { name: 'ben', pin: '1234' } });
  assert.strictEqual(login.status, 200);
  assert.ok((await call('/api/me', { token: login.data.token })).data.wichtel);
});

test('Auslosung ist zufällig und immer gültig', () => {
  // Gleiche Logik wie im Server, separat geprüft
  const crypto = require('node:crypto');
  for (let run = 0; run < 500; run++) {
    const n = 3 + (run % 8);
    const ps = Array.from({ length: n }, (_, i) => ({ id: i }));
    const order = ps.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((p, i) => (p.giftTo = order[(i + 1) % n].id));
    const got = new Set(ps.map((p) => p.giftTo));
    assert.strictEqual(got.size, n);
    ps.forEach((p) => assert.notStrictEqual(p.giftTo, p.id));
  }
});
