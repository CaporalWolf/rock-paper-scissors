const RANKS = [
  { id: "unranked", name: "Non classé", min: 0 },
  { id: "incompetent", name: "Incompétant", min: 100 },
  { id: "competent", name: "Compétant", min: 250 },
  { id: "connoisseur", name: "Connaisseur", min: 500 },
  { id: "socrates", name: "Socrate", min: 800 },
];

function getRankFromRating(rating) {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (rating >= rank.min) current = rank;
  }
  return current;
}

function getRankById(rankId) {
  return RANKS.find((r) => r.id === rankId) || RANKS[0];
}

function meetsRankRequirement(playerRankId, requiredRankId) {
  const playerRank = getRankById(playerRankId);
  const requiredRank = getRankById(requiredRankId);
  return playerRank.min >= requiredRank.min;
}

module.exports = { RANKS, getRankFromRating, getRankById, meetsRankRequirement };
