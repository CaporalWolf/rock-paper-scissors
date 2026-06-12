const Explosion = (() => {
  const DRAW_LIMIT = 5;
  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "explosion-overlay hidden";
    overlay.innerHTML = `
      <div class="explosion-flash"></div>
      <div class="explosion-particles" aria-hidden="true"></div>
      <p class="explosion-text">EXPLOSION !</p>
      <p class="explosion-sub">5 égalités d'affilée… le jeu n'a pas tenu.</p>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function spawnParticles(container) {
    const symbols = ["💥", "🔥", "✊", "✋", "✌️", "💣", "⚡"];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement("span");
      p.className = "explosion-particle";
      p.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 280;
      p.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
      p.style.setProperty("--ty", `${Math.sin(angle) * dist}px`);
      p.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
      p.style.animationDelay = `${Math.random() * 0.3}s`;
      container.appendChild(p);
    }
  }

  function trigger(onComplete) {
    const el = ensureOverlay();
    const particles = el.querySelector(".explosion-particles");
    particles.innerHTML = "";
    spawnParticles(particles);

    document.body.classList.add("screen-shake");
    el.classList.remove("hidden");
    el.classList.add("active");

    setTimeout(() => document.body.classList.remove("screen-shake"), 800);

    setTimeout(() => {
      el.classList.remove("active");
      el.classList.add("hidden");
      particles.innerHTML = "";
      if (typeof onComplete === "function") onComplete();
    }, 3200);
  }

  return { DRAW_LIMIT, trigger };
})();
