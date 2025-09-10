(function () {
  const tilesWrap = document.getElementById("tiles");
  const isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const YEAR_EL = document.getElementById("year");
  if (YEAR_EL) YEAR_EL.textContent = new Date().getFullYear();

  function createTile({ title, desc, href, image, accent }) {
    const a = document.createElement("a");
    a.className = "tile";
    a.href = href;
    a.setAttribute("data-accent", accent);
    a.setAttribute("aria-label", `${title}. ${desc}`);

    const bg = document.createElement("div");
    bg.className = "tile__bg";
    bg.style.setProperty("--img", `url('${image}')`);

    const fog = document.createElement("div");
    fog.className = "tile__fog";

    const glow = document.createElement("div");
    glow.className = "tile__glow";

    const meta = document.createElement("div");
    meta.className = "tile__meta";
    meta.innerHTML = `
      <h3 class="tile__title">${title}</h3>
      <p class="tile__desc">${desc}</p>
    `;

    a.append(bg, fog, glow, meta);

    // Моб. поведение: первый тап — подсветка ~1с, затем переход
    let tapTimer = null;
    let primed = false;
    const go = () => { window.location.href = href; };

    a.addEventListener("click", (e) => {
      if (!isCoarse) return;             // десктоп — мгновенный переход
      if (!primed) {
        e.preventDefault();
        primed = true;
        a.classList.add("tile--active");
        const delay = parseInt(getComputedStyle(a).getPropertyValue("--tap-delay"), 10) || 950;
        tapTimer = setTimeout(go, delay);
      } else {
        if (tapTimer) clearTimeout(tapTimer);
        go();
      }
    }, { passive: false });

    a.addEventListener("mouseleave", () => {
      a.classList.remove("tile--active");
      primed = false;
      if (tapTimer) clearTimeout(tapTimer);
    });

    return a;
  }

  function mount() {
    const frag = document.createDocumentFragment();
    window.TILES.forEach((t) => frag.appendChild(createTile(t)));
    tilesWrap.appendChild(frag);
  }

  mount();
})();
