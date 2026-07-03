const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const sessions = new Map();

const ADMIN_USERNAME = "undermageio";
const ADMIN_PASSWORD = "Petitadunderio";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const attempt = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
}

function readAccounts() {
  try {
    const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeAccounts(data) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase()
    .slice(0, 24);
}

function validateUsername(username) {
  if (!username || username.length < 3) return "Identifiant : 3 caractères minimum";
  if (!/^[a-z0-9_]+$/.test(username)) {
    return "Identifiant : lettres minuscules, chiffres et _ uniquement";
  }
  return null;
}

function validatePassword(password) {
  if (!password || password.length < 4) return "Mot de passe : 4 caractères minimum";
  return null;
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function seedAdminAccount() {
  const accounts = readAccounts();
  if (accounts[ADMIN_USERNAME]) return;

  accounts[ADMIN_USERNAME] = {
    username: ADMIN_USERNAME,
    passwordHash: hashPassword(ADMIN_PASSWORD),
    playerId: crypto.randomUUID(),
    isAdmin: true,
    createdAt: new Date().toISOString(),
  };
  writeAccounts(accounts);
}

function createSession(username, playerId) {
  const token = createToken();
  sessions.set(token, {
    username,
    playerId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function destroySession(token) {
  if (token) sessions.delete(token);
}

function getAuthToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return req.headers["x-auth-token"] || null;
}

function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: "Non authentifié" });
  const accounts = readAccounts();
  const account = accounts[session.username];
  if (!account) return res.status(401).json({ error: "Compte introuvable" });
  req.auth = {
    token,
    username: session.username,
    playerId: session.playerId,
    isAdmin: !!account.isAdmin,
  };
  next();
}

function optionalAuth(req, _res, next) {
  const token = getAuthToken(req);
  const session = getSession(token);
  if (session) {
    const accounts = readAccounts();
    const account = accounts[session.username];
    if (account) {
      req.auth = {
        token,
        username: session.username,
        playerId: session.playerId,
        isAdmin: !!account.isAdmin,
      };
    }
  }
  next();
}

function registerAccount(username, password) {
  const normalized = normalizeUsername(username);
  const userErr = validateUsername(normalized);
  if (userErr) return { error: userErr };
  const passErr = validatePassword(password);
  if (passErr) return { error: passErr };

  const accounts = readAccounts();
  if (accounts[normalized]) return { error: "Cet identifiant est déjà pris" };

  const playerId = crypto.randomUUID();
  accounts[normalized] = {
    username: normalized,
    passwordHash: hashPassword(password),
    playerId,
    isAdmin: false,
    createdAt: new Date().toISOString(),
  };
  writeAccounts(accounts);

  const token = createSession(normalized, playerId);
  return {
    token,
    username: normalized,
    playerId,
    isAdmin: false,
  };
}

function loginAccount(username, password) {
  const normalized = normalizeUsername(username);
  const accounts = readAccounts();
  const account = accounts[normalized];
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return { error: "Identifiant ou mot de passe incorrect" };
  }

  const token = createSession(normalized, account.playerId);
  return {
    token,
    username: normalized,
    playerId: account.playerId,
    isAdmin: !!account.isAdmin,
  };
}

function setupAuth(app) {
  seedAdminAccount();

  app.post("/api/auth/register", (req, res) => {
    const { username, password } = req.body || {};
    const result = registerAccount(username, password);
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body || {};
    const result = loginAccount(username, password);
    if (result.error) return res.status(401).json({ error: result.error });
    res.json(result);
  });

  app.post("/api/auth/logout", (req, res) => {
    destroySession(getAuthToken(req));
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const token = getAuthToken(req);
    const session = getSession(token);
    if (!session) return res.status(401).json({ error: "Non authentifié" });
    const accounts = readAccounts();
    const account = accounts[session.username];
    if (!account) return res.status(401).json({ error: "Compte introuvable" });
    res.json({
      username: session.username,
      playerId: session.playerId,
      isAdmin: !!account.isAdmin,
    });
  });
}

module.exports = {
  setupAuth,
  requireAuth,
  optionalAuth,
  getAuthToken,
  getSession,
  normalizeUsername,
};
