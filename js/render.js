/* Renders page models (from MenuLayout.layout) into DOM pages. */
(function () {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  const ASC = 0.97;               // Instrument Sans ascender (em)
  const PX_PER_PT = 96 / 72;

  function el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Off-screen measuring span (unaffected by preview zoom)
  let meter;
  function measure(text, sizePt, stretch, spacingPt, weight) {
    if (!meter) {
      meter = el("span", "measure-probe", document.body);
      meter.style.cssText = "position:absolute;left:-99999px;top:0;white-space:nowrap;font-family:'Instrument Sans';line-height:1;font-kerning:normal;visibility:hidden";
    }
    meter.style.fontSize = sizePt + "pt";
    meter.style.fontStretch = stretch + "%";
    meter.style.letterSpacing = spacingPt + "pt";
    meter.style.fontWeight = weight || 400;
    meter.textContent = text;
    return meter.getBoundingClientRect().width / PX_PER_PT;
  }

  /** Squeeze text into `avail` pt: first condense (wdth 100→75), then tighten tracking. */
  function fit(text, size, avail) {
    if (measure(text, size, 100, 0) <= avail) return { stretch: 100, spacing: 0, ok: true };
    for (let s = 97.5; s >= 75; s -= 2.5) {
      if (measure(text, size, s, 0) <= avail) return { stretch: s, spacing: 0, ok: true };
    }
    for (let ls = -0.05; ls >= -0.4; ls -= 0.05) {
      if (measure(text, size, 75, ls) <= avail) return { stretch: 75, spacing: ls, ok: true };
    }
    return { stretch: 75, spacing: -0.4, ok: false };
  }

  /** Width/height ratio of an SVG string, from its viewBox */
  function svgRatio(svg) {
    const m = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg || "");
    return m ? parseFloat(m[1]) / parseFloat(m[2]) : 1;
  }
  const svgWidthAt = (svg, h) => svgRatio(svg) * h;

  /** Insert an SVG string, scaled to `heightPt`. */
  function inlineSvg(parent, svg, cls, heightPt) {
    const holder = document.createElement("div");
    holder.innerHTML = (svg || "").trim();
    const s = holder.querySelector("svg") || svgEl("svg", {});
    s.removeAttribute("width"); s.removeAttribute("height");
    s.setAttribute("class", cls);
    s.style.height = heightPt + "pt";
    s.style.width = svgWidthAt(svg, heightPt) + "pt";
    s.style.position = "absolute";
    s.style.overflow = "visible";
    parent.appendChild(s);
    return s;
  }

  function text(parent, cls, str, sizePt, baselineY, pos) {
    const t = el("div", "t " + cls, parent);
    t.textContent = str;
    t.style.top = (baselineY - ASC * sizePt).toFixed(3) + "pt";
    if (pos.center) {
      t.style.left = pos.center[0] + "pt";
      t.style.width = (pos.center[1] - pos.center[0]) + "pt";
    } else if (pos.right != null) {
      t.style.right = (595 - pos.right) + "pt";
    } else {
      t.style.left = pos.x + "pt";
    }
    return t;
  }

  function renderPages(model, container, ctx) {
    const { pages, spec: S } = model;
    const warnings = [];
    container.innerHTML = "";
    const dottedWords = window.DOTTED_WORDS || {};

    pages.forEach((pg, pi) => {
      const page = el("section", "page", container);
      page.dataset.page = pi + 1;
      const svg = svgEl("svg", { class: "lines", viewBox: `0 0 ${S.page.w} ${S.page.h}`, preserveAspectRatio: "none" }, page);
      const rule = (y) => svgEl("rect", { class: "solid", x: S.left, y, width: S.right - S.left, height: S.rule }, svg);
      const vline = (x, y, h) => svgEl("rect", { class: "solid", x, y, width: S.lineW, height: h }, svg);

      // Masthead title (page 1)
      if (pg.title) text(page, "title", pg.title, S.title.size, S.title.baseline, { x: S.title.x });

      // Bottle + glass icon above the first rule
      const icon = inlineSvg(page, window.ICON_SVG, "icon", S.icon.h);
      icon.style.left = S.icon.x + "pt";
      icon.style.top = (pg.top - S.icon.gapAboveRule - S.icon.h) + "pt";

      for (const it of pg.items) {
        if (it.t === "rule") { rule(it.y); continue; }

        if (it.t === "heading") {
          const base = it.y + S.headingBaseline;
          if (it.kind === "main") {
            text(page, "heading main", it.text, S.headingSize, base, { x: S.headingX });
          } else {
            const key = (it.category || "").trim().toUpperCase();
            const dw = dottedWords[key];
            let textX;
            if (dw) {
              const d = inlineSvg(page, dw.svg, "dotted", dw.height);
              d.setAttribute("aria-label", key);
              d.style.left = S.dotted.x + "pt";
              d.style.top = (base + S.dotted.bottomBelowBaseline - dw.height) + "pt";
              textX = S.dotted.x + svgWidthAt(dw.svg, dw.height) + dw.gap;
            } else {
              // Stand-in until the custom SVG exists: outline the word with a dotted stroke
              const w = measure(key, S.headingSize, 100, 0);
              const s = svgEl("svg", { class: "dotted", viewBox: `0 0 ${w + 1} 12`, width: (w + 1) + "pt", height: "12pt" }, page);
              s.style.left = (S.headingX - 0.5) + "pt";
              s.style.top = (base - 10) + "pt";
              const tx = svgEl("text", { x: 0.5, y: 10, "font-family": "Instrument Sans", "font-size": S.headingSize, fill: "none", stroke: "#0F4A2E", "stroke-width": 0.7, "stroke-linecap": "round", "stroke-dasharray": "0 1.4" }, s);
              tx.textContent = key;
              textX = S.headingX + w + 5.4;
              warnings.push(`No dotted SVG for "${key}" yet — using a stand-in (add it in js/dotted-words.js).`);
            }
            text(page, "heading sub", it.text, S.headingSize, base, { x: textX });
          }
          continue;
        }

        if (it.t === "row") {
          const y = it.y, r = it.row;
          vline(S.frameX[0], y, S.rowH);
          vline(S.frameX[1], y, S.rowH);
          for (const x of S.sepX) vline(x, y + S.sepTop, S.sepH);
          if (it.last) rule(y + S.closeY);
          else for (const [a, b] of S.dotSegs) svgEl("line", { class: "dots", x1: a + 0.5, x2: b - 0.5, y1: y + S.dotY, y2: y + S.dotY }, svg);

          const base = y + S.cellBaseline;
          const strike = r.sold_out ? " strike" : "";
          for (const key of ["region", "producer", "year", "name", "grape", "price_bottle", "price_glass"]) {
            const v = r[key];
            if (!v) continue;
            const c = S.cols[key];
            const isPrice = key.startsWith("price");
            const cls = "cell" + (c.c ? " center" : "") + (isPrice ? "" : strike);
            const t = text(page, cls, v, S.cellSize, base, c.c ? { center: c.c } : { x: c.x });
            let avail = c.c ? (c.c[1] - c.c[0] - 2) : (c.max - c.x);
            if (key === "grape" && r.volume) avail = S.volumeRight - 8 - c.x - measure(r.volume, S.cellSize, 100, 0);
            const f = fit(v, S.cellSize, avail);
            (r._fit || (r._fit = {}))[key] = f;   // the PDF export reuses this exact decision
            if (f.stretch !== 100) t.style.fontStretch = f.stretch + "%";
            if (f.spacing) t.style.letterSpacing = f.spacing.toFixed(2) + "pt";
            if (!f.ok) {
              t.classList.add("overflow");
              warnings.push(`Page ${pi + 1}: “${v}” is too long for its column (CSV line ${r._line}).`);
            }
          }
          if (r.volume) text(page, "cell volume" + strike, r.volume, S.cellSize, base, { right: S.volumeRight });
          continue;
        }
      }

      // Footer box on the last page
      if (pg.footer) {
        const F = S.footer;
        rule(F.top);
        vline(S.frameX[0], F.top + S.rule, S.rowH);
        vline(S.frameX[1], F.top + S.rule, S.rowH);
        rule(F.top + S.rule + S.closeY);
        text(page, "cell", pg.footer, S.cellSize, F.top + S.rule + S.cellBaseline, { x: F.textX });
      }
    });
    return warnings;
  }

  window.MenuRender = { renderPages, measure, fit, svgWidthAt, svgRatio };
})();
