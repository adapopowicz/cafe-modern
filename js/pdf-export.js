/* Exact vector PDF export — no browser print dialog involved.
   Draws the same page models the preview shows (MenuLayout), using the same measurements (SPEC)
   and the same text-fitting decisions the preview made, with static Instrument Sans instances.
   Libraries and fonts are loaded only when "Download PDF" is clicked. */
(function () {
  "use strict";

  const INK = [15 / 255, 74 / 255, 46 / 255];
  const PAGE_W = 595, PAGE_H = 842;          // same page box as the original Figma PDFs
  const STRIKE_POS = 0.301, STRIKE_W = 0.5;  // Instrument Sans OS/2 strikeout position; CSS thickness

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
  }
  let ready;
  function loadLibs() {
    if (!ready) {
      ready = Promise.all([
        window.PDFLib ? 0 : loadScript("vendor/pdf-lib.min.js"),
        window.fontkit ? 0 : loadScript("vendor/fontkit.umd.min.js"),
        window.PDF_FONTS ? 0 : loadScript("fonts/pdf-fonts.js"),
      ]).catch((e) => { ready = null; throw e; });
    }
    return ready;
  }

  const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  /** Parse an SVG string into simple shapes in viewBox units. */
  function svgShapes(svgString) {
    const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
    const svg = doc.querySelector("svg");
    if (!svg) return { vb: [0, 0, 1, 1], shapes: [] };
    const vb = (svg.getAttribute("viewBox") || "0 0 1 1").trim().split(/[\s,]+/).map(Number);
    const n = (el, a, d = 0) => parseFloat(el.getAttribute(a) ?? d) || 0;
    const shapes = [];
    svg.querySelectorAll("circle, ellipse, rect, path, polygon").forEach((el) => {
      const fill = el.getAttribute("fill");
      if (fill === "none") return;
      const tag = el.tagName.toLowerCase();
      if (tag === "circle") shapes.push({ t: "ellipse", cx: n(el, "cx"), cy: n(el, "cy"), rx: n(el, "r"), ry: n(el, "r") });
      else if (tag === "ellipse") shapes.push({ t: "ellipse", cx: n(el, "cx"), cy: n(el, "cy"), rx: n(el, "rx"), ry: n(el, "ry") });
      else if (tag === "rect") shapes.push({ t: "rect", x: n(el, "x"), y: n(el, "y"), w: n(el, "width"), h: n(el, "height") });
      else if (tag === "path") shapes.push({ t: "path", d: el.getAttribute("d") || "" });
      else if (tag === "polygon") {
        const pts = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
        let d = ""; for (let i = 0; i + 1 < pts.length; i += 2) d += (i ? "L" : "M") + pts[i] + " " + pts[i + 1];
        shapes.push({ t: "path", d: d + "Z" });
      }
    });
    return { vb, shapes };
  }

  async function build(model, opts) {
    await loadLibs();
    const L = window.PDFLib;
    const { PDFDocument, rgb, LineCapStyle, setCharacterSpacing } = L;
    const S = model.spec;
    const color = rgb(...INK);
    const doc = await PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    doc.setTitle((model.options.title || "Wijnkaart") + " — Café Modern");
    doc.setCreator("Café Modern menu tool");

    const fontCache = {};
    async function font(weight, stretch) {
      const key = weight + "/" + stretch;
      if (!fontCache[key]) {
        const data = window.PDF_FONTS[key] || window.PDF_FONTS[weight + "/100"] || window.PDF_FONTS["400/100"];
        fontCache[key] = doc.embedFont(b64ToBytes(data), { subset: true });
      }
      return fontCache[key];
    }
    const svgCache = new Map();
    const shapesOf = (svg) => { if (!svgCache.has(svg)) svgCache.set(svg, svgShapes(svg)); return svgCache.get(svg); };

    /** Draws one A4 page model onto `pg`, shifted right by ox. */
    async function drawPage(pg, P, ox) {
      const Y = (y) => PAGE_H - y;
      const rect = (x, y, w, h) => pg.drawRectangle({ x: ox + x, y: Y(y + h), width: w, height: h, color });
      const rule = (y) => rect(S.left, y, S.right - S.left, S.rule);
      const vline = (x, y, h) => rect(x, y, S.lineW, h);

      /* Kerned text: pdf-lib's drawText ignores the font's kerning, so glyphs are placed with a TJ
         array built from fontkit's layout — the same shaping (kerning + ligatures) the browser uses. */
      async function text(str, size, baseline, pos, f = {}) {
        if (!str) return 0;
        const fnt = await font(f.weight || 400, f.stretch || 100);
        const fk = fnt.embedder.font;
        const run = fk.layout(str, fnt.embedder.fontFeatures);
        const upm = fk.unitsPerEm;
        const hex = fnt.encodeText(str).asString();
        const ls = f.spacing || 0;
        const tj = [];
        let adv = 0;
        run.glyphs.forEach((g, i) => {
          tj.push(L.PDFHexString.of(hex.substr(i * 4, 4)));
          const kern = run.positions[i].xAdvance - g.advanceWidth;
          if (kern) tj.push(-kern * 1000 / upm);
          adv += run.positions[i].xAdvance;
        });
        const w = adv / upm * size + ls * run.glyphs.length;
        let x = pos.x;
        if (pos.center) x = pos.center[0] + (pos.center[1] - pos.center[0] - w) / 2;
        if (pos.right != null) x = pos.right - w;
        const key = pg.node.newFontDictionary(fnt.name, fnt.ref);
        pg.pushOperators(
          L.pushGraphicsState(),
          L.beginText(),
          L.setFillingRgbColor(...INK),
          L.setFontAndSize(key, size),
          setCharacterSpacing(ls),
          L.moveText(ox + x, Y(baseline)),
          L.PDFOperator.of("TJ", [doc.context.obj(tj)]),
          L.endText(),
          L.popGraphicsState(),
        );
        if (f.opacity == null && f.strike) rect(x, baseline - STRIKE_POS * size - STRIKE_W / 2, w, STRIKE_W);
        return w;
      }

      function drawSvg(svg, left, top, height) {
        const { vb, shapes } = shapesOf(svg);
        const k = height / (vb[3] || 1);
        for (const s of shapes) {
          if (s.t === "ellipse") {
            pg.drawEllipse({ x: ox + left + (s.cx - vb[0]) * k, y: Y(top + (s.cy - vb[1]) * k), xScale: s.rx * k, yScale: s.ry * k, color });
          } else if (s.t === "rect") {
            rect(left + (s.x - vb[0]) * k, top + (s.y - vb[1]) * k, s.w * k, s.h * k);
          } else if (s.t === "path" && s.d) {
            pg.drawSvgPath(s.d, { x: ox + left - vb[0] * k, y: Y(top - vb[1] * k), scale: k, color });
          }
        }
      }

      if (P.title) await text(P.title.toUpperCase(), S.title.size, S.title.baseline, { x: S.title.x }, { weight: 600 });
      drawSvg(window.ICON_SVG, S.icon.x, P.top - S.icon.gapAboveRule - S.icon.h, S.icon.h);

      for (const it of P.items) {
        if (it.t === "rule") { rule(it.y); continue; }

        if (it.t === "heading") {
          const base = it.y + S.headingBaseline;
          if (it.kind === "main") {
            await text(it.text.toUpperCase(), S.headingSize, base, { x: S.headingX }, { weight: 500 });
          } else {
            const key = (it.category || "").trim().toUpperCase();
            const dw = (window.DOTTED_WORDS || {})[key];
            let x;
            if (dw) {
              drawSvg(dw.svg, S.dotted.x, base + S.dotted.bottomBelowBaseline - dw.height, dw.height);
              x = S.dotted.x + window.MenuRender.svgWidthAt(dw.svg, dw.height) + dw.gap;
            } else {
              // stand-in: the word in a light tint until its dotted SVG exists
              const fnt = await font(400, 100);
              pg.drawText(key, { x: ox + S.headingX, y: Y(base), size: S.headingSize, font: fnt, color, opacity: 0.35 });
              x = S.headingX + fnt.widthOfTextAtSize(key, S.headingSize) + 5.4;
            }
            await text(it.text, S.headingSize, base, { x }, { weight: 500 });
          }
          continue;
        }

        if (it.t === "row") {
          const y = it.y, r = it.row;
          vline(S.frameX[0], y, S.rowH);
          vline(S.frameX[1], y, S.rowH);
          for (const x of S.sepX) vline(x, y + S.sepTop, S.sepH);
          if (it.last) rule(y + S.closeY);
          else for (const [a, b] of S.dotSegs) {
            pg.drawLine({ start: { x: ox + a + 0.5, y: Y(y + S.dotY) }, end: { x: ox + b - 0.5, y: Y(y + S.dotY) },
              thickness: 1, color, dashArray: [0, 3], lineCap: LineCapStyle.Round });
          }
          const base = y + S.cellBaseline;
          for (const key of ["region", "producer", "year", "name", "grape", "price_bottle", "price_glass"]) {
            const v = r[key];
            if (!v) continue;
            const c = S.cols[key];
            const fit = (r._fit && r._fit[key]) || {};
            await text(v, S.cellSize, base, c.c ? { center: c.c } : { x: c.x },
              { stretch: fit.stretch || 100, spacing: fit.spacing || 0, strike: r.sold_out && !key.startsWith("price") });
          }
          if (r.volume) await text(r.volume, S.cellSize, base, { right: S.volumeRight }, { strike: r.sold_out });
        }
      }

      if (P.footer) {
        const F = S.footer;
        rule(F.top);
        vline(S.frameX[0], F.top + S.rule, S.rowH);
        vline(S.frameX[1], F.top + S.rule, S.rowH);
        rule(F.top + S.rule + S.closeY);
        await text(P.footer, S.cellSize, F.top + S.rule + S.cellBaseline, { x: F.textX });
      }
    }

    const pages = model.pages;
    if (opts && opts.imposition === "a3") {
      // Folded A3: sheet s front = [n-2s | 1+2s], back = [2+2s | n-1-2s]
      const n = Math.ceil(pages.length / 4) * 4;
      for (let s = 0; s < n / 4; s++) {
        for (const [l, r] of [[n - 2 * s, 1 + 2 * s], [2 + 2 * s, n - 1 - 2 * s]]) {
          const sheet = doc.addPage([PAGE_W * 2, PAGE_H]);
          if (pages[l - 1]) await drawPage(sheet, pages[l - 1], 0);
          if (pages[r - 1]) await drawPage(sheet, pages[r - 1], PAGE_W);
        }
      }
    } else {
      for (const P of pages) await drawPage(doc.addPage([PAGE_W, PAGE_H]), P, 0);
    }
    return doc.save();
  }

  window.MenuPDF = { build };
})();
