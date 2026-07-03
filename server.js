const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");
const { setupOnline } = require("./online-server");
const { setupAuth, requireAuth } = require("./auth-server");
const { setupCompetitions } = require("./competition-server");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "leaderboard.json");

app.use(express.json({ limit: "32kb" }));
app.use(express.static(__dirname));

function readRuns() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeRuns(runs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(runs, null, 2), "utf8");
}

function sortRuns(runs) {
  return [...runs].sort((a, b) => {
    if (b.streak !== a.streak) return b.streak - a.streak;
    return new Date(b.date) - new Date(a.date);
  });
}

const AMBIENT_DIR = path.join(__dirname, "sounds", "ambient");

app.get("/api/ambient-tracks", (_req, res) => {
  try {
    if (!fs.existsSync(AMBIENT_DIR)) return res.json([]);
    const files = fs
      .readdirSync(AMBIENT_DIR)
      .filter((name) => name.toLowerCase().endsWith(".mp3"));
    res.json(files);
  } catch {
    res.json([]);
  }
});

app.get("/api/runs", (_req, res) => {
  res.json(sortRuns(readRuns()));
});

app.post("/api/runs", (req, res) => {
  const { playerId, playerName, streak, difficulty } = req.body || {};

  if (!playerId || typeof playerId !== "string" || playerId.length > 64) {
    return res.status(400).json({ error: "playerId invalide" });
  }
  if (!playerName || typeof playerName !== "string" || playerName.trim().length === 0) {
    return res.status(400).json({ error: "playerName requis" });
  }
  if (!Number.isInteger(streak) || streak < 0 || streak > 99999) {
    return res.status(400).json({ error: "streak invalide" });
  }
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    return res.status(400).json({ error: "difficulty invalide" });
  }

  const run = {
    id: crypto.randomUUID(),
    playerId: playerId.slice(0, 64),
    playerName: playerName.trim().slice(0, 24),
    streak,
    difficulty,
    date: new Date().toISOString(),
  };

  const runs = readRuns();
  runs.push(run);
  writeRuns(runs);
  res.status(201).json(run);
});

setupAuth(app);
setupCompetitions(app, requireAuth);
setupOnline(io);

server.listen(PORT, () => {
  console.log(`Jeu disponible sur http://localhost:${PORT}`);
});
