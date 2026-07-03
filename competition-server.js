const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { RANKS, getRankById } = require("./ranks");

const COMPETITIONS_FILE = path.join(__dirname, "competitions.json");

const BANNER_THEMES = [
  { id: "purple", gradient: "linear-gradient(135deg, #7c6cff 0%, #4f46e5 100%)" },
  { id: "gold", gradient: "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)" },
  { id: "emerald", gradient: "linear-gradient(135deg, #4ade80 0%, #059669 100%)" },
  { id: "rose", gradient: "linear-gradient(135deg, #f472b6 0%, #db2777 100%)" },
  { id: "cyan", gradient: "linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)" },
];

function readCompetitions() {
  try {
    const raw = fs.readFileSync(COMPETITIONS_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeCompetitions(list) {
  fs.writeFileSync(COMPETITIONS_FILE, JSON.stringify(list, null, 2), "utf8");
}

function seedDefaultCompetitions() {
  const existing = readCompetitions();
  if (existing.some((c) => c.isOfficial)) return;

  const now = new Date();
  const inOneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const inThreeWeeks = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

  const defaults = [
    {
      id: crypto.randomUUID(),
      title: "Coupe des Débutants",
      description: "Tournoi ouvert aux joueurs Non classés et Incompétants.",
      bannerTheme: "purple",
      requiredRankId: "unranked",
      roundsToWin: 3,
      startDate: now.toISOString(),
      endDate: inOneWeek.toISOString(),
      isOfficial: true,
      createdBy: "undermageio",
      createdAt: now.toISOString(),
    },
    {
      id: crypto.randomUUID(),
      title: "Championnat Compétant",
      description: "Réservé aux Compétants et au-dessus. Premier à 5 manches.",
      bannerTheme: "gold",
      requiredRankId: "competent",
      roundsToWin: 5,
      startDate: now.toISOString(),
      endDate: inTwoWeeks.toISOString(),
      isOfficial: true,
      createdBy: "undermageio",
      createdAt: now.toISOString(),
    },
    {
      id: crypto.randomUUID(),
      title: "Grand Tournoi Socrate",
      description: "La compétition ultime pour les Connaisseurs et Socrates.",
      bannerTheme: "emerald",
      requiredRankId: "connoisseur",
      roundsToWin: 7,
      startDate: now.toISOString(),
      endDate: inThreeWeeks.toISOString(),
      isOfficial: true,
      createdBy: "undermageio",
      createdAt: now.toISOString(),
    },
  ];

  writeCompetitions(defaults);
}

function publicCompetition(c) {
  const rank = getRankById(c.requiredRankId);
  const theme = BANNER_THEMES.find((t) => t.id === c.bannerTheme) || BANNER_THEMES[0];
  const now = Date.now();
  const start = new Date(c.startDate).getTime();
  const end = new Date(c.endDate).getTime();
  let status = "upcoming";
  if (now >= start && now <= end) status = "active";
  else if (now > end) status = "ended";

  return {
    id: c.id,
    title: c.title,
    description: c.description,
    bannerTheme: c.bannerTheme,
    bannerGradient: theme.gradient,
    requiredRankId: c.requiredRankId,
    requiredRankName: rank.name,
    roundsToWin: c.roundsToWin,
    startDate: c.startDate,
    endDate: c.endDate,
    isOfficial: !!c.isOfficial,
    createdBy: c.createdBy,
    createdAt: c.createdAt,
    status,
  };
}

function validateCompetitionBody(body, isAdmin) {
  const title = String(body.title || "").trim().slice(0, 60);
  const description = String(body.description || "").trim().slice(0, 200);
  const requiredRankId = body.requiredRankId;
  const roundsToWin = parseInt(body.roundsToWin, 10);
  const startDate = body.startDate;
  const endDate = body.endDate;
  const bannerTheme = body.bannerTheme || "purple";
  const isOfficial = !!body.isOfficial && isAdmin;

  if (!title) return { error: "Titre requis" };
  if (!RANKS.some((r) => r.id === requiredRankId)) return { error: "Rang requis invalide" };
  if (!Number.isInteger(roundsToWin) || roundsToWin < 1 || roundsToWin > 15) {
    return { error: "Nombre de manches : entre 1 et 15" };
  }
  if (!startDate || !endDate) return { error: "Dates requises" };
  if (new Date(startDate) >= new Date(endDate)) {
    return { error: "La date de fin doit être après le début" };
  }
  if (!BANNER_THEMES.some((t) => t.id === bannerTheme)) {
    return { error: "Thème de bannière invalide" };
  }

  return {
    title,
    description,
    requiredRankId,
    roundsToWin,
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate).toISOString(),
    bannerTheme,
    isOfficial,
  };
}

function setupCompetitions(app, requireAuth) {
  seedDefaultCompetitions();

  app.get("/api/competitions", (_req, res) => {
    const list = readCompetitions().map(publicCompetition);
    list.sort((a, b) => {
      if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
      return new Date(a.startDate) - new Date(b.startDate);
    });
    res.json(list);
  });

  app.get("/api/competitions/:id", (req, res) => {
    const c = readCompetitions().find((x) => x.id === req.params.id);
    if (!c) return res.status(404).json({ error: "Compétition introuvable" });
    res.json(publicCompetition(c));
  });

  app.post("/api/competitions", requireAuth, (req, res) => {
    const validated = validateCompetitionBody(req.body, req.auth.isAdmin);
    if (validated.error) return res.status(400).json({ error: validated.error });

    if (validated.isOfficial && !req.auth.isAdmin) {
      return res.status(403).json({ error: "Seul l'administrateur peut créer des compétitions officielles" });
    }

    const competition = {
      id: crypto.randomUUID(),
      ...validated,
      createdBy: req.auth.username,
      createdAt: new Date().toISOString(),
    };

    const list = readCompetitions();
    list.push(competition);
    writeCompetitions(list);
    res.status(201).json(publicCompetition(competition));
  });

  app.delete("/api/competitions/:id", requireAuth, (req, res) => {
    const list = readCompetitions();
    const idx = list.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Compétition introuvable" });

    const c = list[idx];
    if (c.isOfficial && !req.auth.isAdmin) {
      return res.status(403).json({ error: "Seul l'administrateur peut supprimer une compétition officielle" });
    }
    if (!c.isOfficial && c.createdBy !== req.auth.username && !req.auth.isAdmin) {
      return res.status(403).json({ error: "Non autorisé" });
    }

    list.splice(idx, 1);
    writeCompetitions(list);
    res.json({ ok: true });
  });
}

function getCompetitionById(id) {
  const c = readCompetitions().find((x) => x.id === id);
  return c ? publicCompetition(c) : null;
}

module.exports = {
  setupCompetitions,
  getCompetitionById,
  getRankById,
  BANNER_THEMES,
  RANKS,
};
