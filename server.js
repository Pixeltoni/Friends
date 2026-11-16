// Wichtel-Auslosung – kleiner Server ohne externe Abhängigkeiten.
// Start: ADMIN_PASSWORD=geheim node server.js
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!ADMIN_PASSWORD) {
  console.error('Bitte ADMIN_PASSWORD als Umgebungsvariable setzen, z. B.:');
  console.error('  ADMIN_PASSWORD=meinGeheimnis node server.js');
  process.exit(1);
}

// ---------- Datenhaltung ----------

function emptyState() {
  return { title: 'Wichteln', drawnAt: null, participants: [] };
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return emptyState();
    throw err;
  }
}

let state = loadState();

function saveState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- Hilfsfunktionen ----------

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pin, salt, 32).toString('hex');
  return { salt, hash };
}

function checkPin(pin, p) {
  const { hash } = hashPin(pin, p.pinSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(p.pinHash, 'hex'));
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function normName(name) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');
}

function newToken() {
  return crypto.randomBytes(24).toString('base64url');
}

// Fisher-Yates mit kryptografischem Zufall
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Mischen und im Kreis verteilen: jede Person beschenkt die nächste.
// So zieht garantiert niemand sich selbst und alle bekommen genau einen Wichtel.
function draw(participants) {
  const order = shuffle(participants);
  order.forEach((p, i) => {
    p.giftTo = order[(i + 1) % order.length].id;
  });
}

function publicParticipant(p) {
  return { id: p.id, name: p.name, joinedAt: p.joinedAt };
}

function findByToken(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  return state.participants.find((p) => p.tokens.includes(token)) || null;
}

function isAdmin(req) {
  const pw = req.headers['x-admin-password'];
  return typeof pw === 'string' && safeEqual(pw, ADMIN_PASSWORD);
}

// ---------- HTTP ----------

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 20_000) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, urlPath) {
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/admin') urlPath = '/admin.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
}

async function handleApi(req, res, route) {
  const method = req.method;

  // Öffentlicher Status: Teilnehmende (nur Namen) und ob schon ausgelost wurde
  if (method === 'GET' && route === '/api/status') {
    return send(res, 200, {
      title: state.title,
      drawn: Boolean(state.drawnAt),
      drawnAt: state.drawnAt,
      participants: state.participants.map(publicParticipant),
    });
  }

  // Eintragen
  if (method === 'POST' && route === '/api/join') {
    const body = await readBody(req);
    const name = str(body.name, 40);
    const pin = str(body.pin, 64);
    const wish = str(body.wish, 500);
    if (state.drawnAt) return send(res, 409, { error: 'Es wurde bereits ausgelost – Eintragen ist nicht mehr möglich.' });
    if (name.length < 2) return send(res, 400, { error: 'Bitte gib einen Namen mit mindestens 2 Zeichen ein.' });
    if (pin.length < 4) return send(res, 400, { error: 'Die PIN muss mindestens 4 Zeichen lang sein.' });
    if (state.participants.some((p) => normName(p.name) === normName(name))) {
      return send(res, 409, { error: 'Dieser Name ist schon vergeben. Falls du das bist: melde dich an.' });
    }
    const { salt, hash } = hashPin(pin);
    const token = newToken();
    const p = {
      id: crypto.randomUUID(),
      name,
      wish,
      pinSalt: salt,
      pinHash: hash,
      tokens: [token],
      joinedAt: new Date().toISOString(),
      giftTo: null,
    };
    state.participants.push(p);
    saveState();
    return send(res, 201, { token });
  }

  // Anmelden mit Name + PIN (z. B. auf einem anderen Gerät)
  if (method === 'POST' && route === '/api/login') {
    const body = await readBody(req);
    const name = str(body.name, 40);
    const pin = str(body.pin, 64);
    const p = state.participants.find((x) => normName(x.name) === normName(name));
    if (!p || !checkPin(pin, p)) return send(res, 401, { error: 'Name oder PIN stimmt nicht.' });
    const token = newToken();
    p.tokens = [...p.tokens.slice(-9), token];
    saveState();
    return send(res, 200, { token });
  }

  // Eigene Daten + (nach der Auslosung) der eigene Wichtel
  if (method === 'GET' && route === '/api/me') {
    const p = findByToken(req);
    if (!p) return send(res, 401, { error: 'Nicht angemeldet.' });
    const target = p.giftTo ? state.participants.find((x) => x.id === p.giftTo) : null;
    return send(res, 200, {
      name: p.name,
      wish: p.wish,
      drawn: Boolean(state.drawnAt),
      wichtel: target ? { name: target.name, wish: target.wish } : null,
    });
  }

  // Wunschzettel ändern
  if (method === 'POST' && route === '/api/me/wish') {
    const p = findByToken(req);
    if (!p) return send(res, 401, { error: 'Nicht angemeldet.' });
    const body = await readBody(req);
    p.wish = str(body.wish, 500);
    saveState();
    return send(res, 200, { ok: true });
  }

  // ----- Admin -----
  if (route.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return send(res, 401, { error: 'Falsches Admin-Passwort.' });

    if (method === 'GET' && route === '/api/admin/check') {
      return send(res, 200, { ok: true });
    }

    if (method === 'POST' && route === '/api/admin/title') {
      const body = await readBody(req);
      const title = str(body.title, 60);
      if (!title) return send(res, 400, { error: 'Titel darf nicht leer sein.' });
      state.title = title;
      saveState();
      return send(res, 200, { ok: true });
    }

    if (method === 'POST' && route === '/api/admin/draw') {
      if (state.drawnAt) return send(res, 409, { error: 'Es wurde bereits ausgelost.' });
      if (state.participants.length < 3) {
        return send(res, 400, { error: 'Für eine Auslosung braucht ihr mindestens 3 Leute.' });
      }
      draw(state.participants);
      state.drawnAt = new Date().toISOString();
      saveState();
      return send(res, 200, { ok: true });
    }

    if (method === 'POST' && route === '/api/admin/reset-draw') {
      state.participants.forEach((p) => (p.giftTo = null));
      state.drawnAt = null;
      saveState();
      return send(res, 200, { ok: true });
    }

    if (method === 'POST' && route === '/api/admin/remove') {
      if (state.drawnAt) {
        return send(res, 409, { error: 'Nach der Auslosung kann niemand entfernt werden. Setze zuerst die Auslosung zurück.' });
      }
      const body = await readBody(req);
      const before = state.participants.length;
      state.participants = state.participants.filter((p) => p.id !== body.id);
      if (state.participants.length === before) return send(res, 404, { error: 'Person nicht gefunden.' });
      saveState();
      return send(res, 200, { ok: true });
    }

    if (method === 'POST' && route === '/api/admin/reset-all') {
      const title = state.title;
      state = emptyState();
      state.title = title;
      saveState();
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: 'Unbekannte Anfrage.' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, url.pathname);
    } else {
      res.writeHead(405).end();
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 400, { error: 'Ungültige Anfrage.' });
  }
});

server.listen(PORT, () => {
  console.log(`Wichtel-Server läuft auf http://localhost:${PORT}`);
  console.log(`Admin-Bereich:        http://localhost:${PORT}/admin`);
});
