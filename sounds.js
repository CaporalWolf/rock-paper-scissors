const Sounds = (() => {
  const clips = {
    win: new Audio("sounds/win sound.mp3"),
    lose: new Audio("sounds/lose sound.mp3"),
  };

  clips.win.preload = "auto";
  clips.lose.preload = "auto";

  function applyVolume() {
    const vol = typeof Settings !== "undefined" ? Settings.getSfxVolume() : 0.65;
    clips.win.volume = vol;
    clips.lose.volume = vol;
  }

  function play(name) {
    applyVolume();
    const clip = clips[name];
    if (!clip) return;
    clip.currentTime = 0;
    clip.play().catch(() => {});
  }

  function playForResult(winner) {
    if (winner === "player") play("win");
    else if (winner === "ai") play("lose");
  }

  applyVolume();

  return { play, playForResult, applyVolume };
})();
