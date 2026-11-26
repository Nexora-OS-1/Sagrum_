'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;

function loadEnvFile() {
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

const SRC_DIR = path.join(ROOT, 'src');
const STYLE_DIR = path.join(ROOT, 'style');
const SCRIPT_DIR = path.join(ROOT, 'scripts');
const LOGO_DIR = path.join(ROOT, 'Logo');
// Hosts with persistent volumes can point these folders at that volume.
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(ROOT, 'uploads');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
for (const dir of [DATA_DIR, UPLOAD_DIR]) fs.mkdirSync(dir, { recursive: true });

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (!ADMIN_USERNAME || !ADMIN_PASSWORD || ADMIN_PASSWORD === 'CHANGE_THIS_TO_A_UNIQUE_PASSWORD_12_CHARS_MIN' || ADMIN_PASSWORD.length < 12) {
  console.error('\nChýbajú prihlasovacie údaje administrátora alebo je heslo príliš krátke.');
  console.error('Nastav ADMIN_USERNAME a ADMIN_PASSWORD (aspoň 12 znakov) v .env alebo v nastaveniach hostingu.\n');
  process.exit(1);
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error('PORT musí byť číslo od 1 do 65535.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.disable('etag');
// Render and similar Node hosts terminate HTTPS at one trusted reverse proxy.
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(express.json({ limit: '80kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

const DEFAULT_CONTENT = {
  heroText: '',
  portfolioText: '',
  clipsText: '',
  infoTitle: 'O mne',
  infoText: '',
  instagramUrl: '',
  tiktokUrl: '',
  discordUrl: '',
  bookingUrl: '',
  clips: []
};

function readContent() {
  try {
    const saved = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
    return { ...DEFAULT_CONTENT, ...saved, clips: Array.isArray(saved.clips) ? saved.clips : [] };
  } catch {
    return { ...DEFAULT_CONTENT, clips: [] };
  }
}

function writeContent(content) {
  const temporary = `${CONTENT_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(content, null, 2), 'utf8');
  fs.renameSync(temporary, CONTENT_FILE);
}

if (!fs.existsSync(CONTENT_FILE)) writeContent({ ...DEFAULT_CONTENT, clips: [] });

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, maxLength);
}

function cleanUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// Sessions are server-side; the browser receives only an HttpOnly cookie.
const sessions = new Map();
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key === name) return valueParts.join('=');
  }
  return '';
}

function getSession(req) {
  const token = getCookie(req, 'sagrum_admin');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_LIFETIME_MS;
  return { token, session };
}

function requireAdmin(req, res, next) {
  const found = getSession(req);
  if (!found) return res.status(401).json({ error: 'Prihlásenie vypršalo. Prihlás sa znova.' });
  req.adminSession = found;
  next();
}

function requestIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

app.get('/api/content', (_req, res) => {
  const { clips, ...publicContent } = readContent();
  res.json({
    ...publicContent,
    clips: clips.map(({ id, title, description, filename, createdAt }) => ({
      id,
      title,
      description,
      src: `/uploads/${encodeURIComponent(filename)}`,
      createdAt
    }))
  });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: Boolean(getSession(req)) });
});

app.post('/api/admin/login', (req, res) => {
  const ip = requestIp(req);
  const current = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + LOGIN_WINDOW_MS };
  if (current.resetAt < Date.now()) {
    current.count = 0;
    current.resetAt = Date.now() + LOGIN_WINDOW_MS;
  }
  if (current.count >= MAX_LOGIN_ATTEMPTS) {
    return res.status(429).json({ error: 'Príliš veľa pokusov. Skús to znova o 15 minút.' });
  }

  const username = cleanText(req.body?.username, 100) ?? '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const usernameBuffer = Buffer.from(username);
  const expectedUsername = Buffer.from(ADMIN_USERNAME);
  const passwordSalt = 'sagrum-admin-login-v1';
  const actualPasswordHash = crypto.scryptSync(password, passwordSalt, 64);
  const expectedPasswordHash = crypto.scryptSync(ADMIN_PASSWORD, passwordSalt, 64);
  const usernameMatches = usernameBuffer.length === expectedUsername.length && crypto.timingSafeEqual(
    usernameBuffer.length === expectedUsername.length ? usernameBuffer : Buffer.alloc(expectedUsername.length),
    expectedUsername
  );
  const passwordMatches = crypto.timingSafeEqual(actualPasswordHash, expectedPasswordHash);

  if (!usernameMatches || !passwordMatches) {
    current.count += 1;
    loginAttempts.set(ip, current);
    return res.status(401).json({ error: 'Nesprávne meno alebo heslo.' });
  }

  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + SESSION_LIFETIME_MS });
  const secure = IS_PRODUCTION ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sagrum_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_LIFETIME_MS / 1000}${secure}`);
  res.json({ ok: true });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  sessions.delete(req.adminSession.token);
  res.setHeader('Set-Cookie', 'sagrum_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

const editableTextFields = {
  heroText: 1200,
  portfolioText: 4000,
  clipsText: 1200,
  infoTitle: 100,
  infoText: 6000
};
const editableUrlFields = ['instagramUrl', 'tiktokUrl', 'discordUrl', 'bookingUrl'];

app.put('/api/admin/content', requireAdmin, (req, res) => {
  const current = readContent();
  const changes = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const errors = [];

  for (const [field, maxLength] of Object.entries(editableTextFields)) {
    if (!(field in changes)) continue;
    const value = cleanText(changes[field], maxLength);
    if (value === null) errors.push(`Pole ${field} musí byť text.`);
    else current[field] = value;
  }
  for (const field of editableUrlFields) {
    if (!(field in changes)) continue;
    const value = cleanUrl(changes[field]);
    if (value === null) errors.push(`Pole ${field} musí byť platný odkaz s http:// alebo https://.`);
    else current[field] = value;
  }

  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  writeContent(current);
  res.json({ ok: true, message: 'Zmeny boli uložené.' });
});

const allowedVideoTypes = new Map([
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov']
]);
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${allowedVideoTypes.get(file.mimetype) || '.video'}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedVideoTypes.has(file.mimetype)) return callback(new Error('Podporované sú iba MP4, WebM a MOV videá.'));
    callback(null, true);
  }
});

app.post('/api/admin/clips', requireAdmin, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Vyber video súbor.' });
  const title = cleanText(req.body?.title, 100);
  const description = cleanText(req.body?.description || '', 500);
  if (!title) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ error: 'Klip musí mať názov.' });
  }

  const content = readContent();
  const clip = {
    id: crypto.randomUUID(),
    title,
    description: description ?? '',
    filename: req.file.filename,
    createdAt: new Date().toISOString()
  };
  content.clips.unshift(clip);
  writeContent(content);
  res.status(201).json({ ok: true, clip: { ...clip, src: `/uploads/${encodeURIComponent(clip.filename)}` } });
});

app.delete('/api/admin/clips/:id', requireAdmin, (req, res) => {
  const content = readContent();
  const clipIndex = content.clips.findIndex((clip) => clip.id === req.params.id);
  if (clipIndex === -1) return res.status(404).json({ error: 'Klip sa nenašiel.' });
  const [clip] = content.clips.splice(clipIndex, 1);
  const safeFilename = path.basename(String(clip.filename || ''));
  if (safeFilename && safeFilename === clip.filename) fs.rmSync(path.join(UPLOAD_DIR, safeFilename), { force: true });
  writeContent(content);
  res.json({ ok: true });
});

// Only public asset folders are exposed. Server source and environment secrets stay private.
app.use('/style', express.static(STYLE_DIR, { fallthrough: false, maxAge: IS_PRODUCTION ? '1h' : 0 }));
app.use('/scripts', express.static(SCRIPT_DIR, { fallthrough: false, maxAge: IS_PRODUCTION ? '1h' : 0 }));
app.use('/Logo', express.static(LOGO_DIR, { fallthrough: false, maxAge: IS_PRODUCTION ? '1d' : 0 }));
app.use('/uploads', express.static(UPLOAD_DIR, { fallthrough: false, maxAge: IS_PRODUCTION ? '1h' : 0 }));

const pages = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/info': 'info.html',
  '/info.html': 'info.html',
  '/portfolio': 'portfolio.html',
  '/portfolio.html': 'portfolio.html',
  '/clips': 'clips.html',
  '/clips.html': 'clips.html',
  '/contact': 'contact.html',
  '/contact.html': 'contact.html',
  '/admin': 'admin.html',
  '/admin.html': 'admin.html'
};
for (const [route, filename] of Object.entries(pages)) {
  app.get(route, (_req, res) => res.sendFile(path.join(SRC_DIR, filename)));
}

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Video je príliš veľké. Maximum je 120 MB.' : 'Video sa nepodarilo nahrať.';
    return res.status(400).json({ error: message });
  }
  if (err && err.message && err.message.startsWith('Podporované sú iba')) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Na serveri nastala chyba.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Sagrum_ beží na porte ${PORT}`);
  console.log('Admin panel je dostupný na /admin');
});
