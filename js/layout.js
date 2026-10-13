/* Layout engine: turns wine rows into positioned page models.
   Every number here is measured from the print PDFs (pt, A4 = 595 × 842).
   Because every block has a fixed height, pagination is exact arithmetic — no DOM measuring. */
(function () {
  "use strict";

  const SPEC = {
    page: { w: 595, h: 842 },
    left: 10, right: 585,           // outer frame (rules run 10 → 585)
    rule: 0.5,                       // solid rule thickness
    gap: 4.5,                        // space between the two lines of a double rule
    headingH: 19.5,                  // space between rules around a heading
    rowH: 15,                        // table row pitch

    // Vertical borders: outer frame lines (full row height) …
    frameX: [10.0, 584.49],
    // … and column separators (short: row top +1.02 → +13.01)
    sepX: [113.81, 216.87, 247.76, 376.85, 537.43, 562.74],
    sepTop: 1.02, sepH: 11.99, lineW: 0.5,

    // Dotted underline per column (1pt dots on a 3pt pitch, row top +14 → +15)
    dotY: 14.5,
    dotSegs: [
      [12.04, 112.04], [116.01, 214.59], [219.01, 245.84], [250.03, 374.44],
      [379.48, 535.46], [539.87, 560.96], [564.94, 583.16],
    ],
    // Closing rule of a table sits inside the last row: row top +14.5
    closeY: 14.5,

    // Text (baseline offsets from row / heading top)
    cellBaseline: 10.54, cellSize: 9,
    headingBaseline: 13.75, headingSize: 11.25,
    cols: {
      region:       { x: 13.12, max: 113.81 - 1.5 },
      producer:     { x: 117.6, max: 216.87 - 1.5 },
      year:         { c: [217.37, 247.76] },
      name:         { x: 252.06, max: 376.85 - 1.5 },
      grape:        { x: 380.89, max: 537.43 - 1.5 },
      price_bottle: { c: [537.93, 562.74] },
      price_glass:  { c: [563.24, 584.49] },
    },
    volumeRight: 537.43 - 24.4,      // "0,375 l" right edge inside the grape column

    headingX: 13.49,                 // main heading origin
    dotted: { x: 14.45, bottomBelowBaseline: 0.1 },

    title: { x: 10, baseline: 28, size: 14 },
    icon: { x: 543.5, w: 35.58, h: 50.5, gapAboveRule: 4.5 },

    footer: { top: 795.5, textX: 14.12 },
  };

  const DEFAULTS = {
    title: "Wijn",
    footer: "Voor meer specials, neem een kijkje in de kluis",
    firstPageTop: 209,   // y of the first rule on page 1 (space above is the masthead)
    pageTop: 67,         // y of the first rule on the following pages
    bottomLimit: 811,    // nothing may extend below this y
    footerGap: 15,       // min space between the last table and the footer box
    minRowsAfterHeading: 2,
    minRowsAtPageTop: 2,
    targetPages: 4,
  };

  /** Group rows → [{category, sections:[{country, rows}]}] keeping first-appearance order */
  function group(rows) {
    const cats = [];
    const byCat = new Map();
    for (const r of rows) {
      const ck = r.category.trim().toUpperCase();
      let cat = byCat.get(ck);
      if (!cat) { cat = { category: r.category.trim(), sections: [], byCountry: new Map() }; byCat.set(ck, cat); cats.push(cat); }
      const co = (r.country || "").trim();
      let sec = cat.byCountry.get(co.toLowerCase());
      if (!sec) { sec = { country: co, rows: [] }; cat.byCountry.set(co.toLowerCase(), sec); cat.sections.push(sec); }
      sec.rows.push(r);
    }
    // A section without country goes first, directly under the main heading
    for (const c of cats) c.sections.sort((a, b) => (a.country ? 1 : 0) - (b.country ? 1 : 0));
    return cats;
  }

  /** Flatten into "tables": each table has the headings that precede it. */
  function toTables(cats) {
    const tables = [];
    for (const cat of cats) {
      cat.sections.forEach((sec, i) => {
        const headings = [];
        if (i === 0) headings.push({ kind: "main", text: cat.category });
        if (sec.country) headings.push({ kind: "sub", text: sec.country, category: cat.category });
        tables.push({ headings, rows: sec.rows });
      });
    }
    return tables;
  }

  /**
   * Paginate. limits(pageIndex) → bottom y allowed on that page.
   * Returns pages: [{ items: [...] }]
   */
  function paginate(tables, opt, limitFor) {
    const S = SPEC;
    const pages = [];
    let page, y;

    const newPage = () => {
      page = { index: pages.length, items: [], top: pages.length === 0 ? opt.firstPageTop : opt.pageTop };
      pages.push(page);
      // Every page opens with a rule; it plays the role of the previous table's closing rule.
      page.items.push({ t: "rule", y: page.top });
      y = page.top + S.rule;
    };
    const limit = () => limitFor(page.index);

    newPage();
    for (const tbl of tables) {
      const headH = tbl.headings.length ? (S.gap + S.rule) + tbl.headings.length * (S.headingH + S.rule) : 0;
      const openH = S.gap + S.rule;
      const keep = Math.min(tbl.rows.length, opt.minRowsAfterHeading);
      // Keep headings with their first rows
      if (y + headH + openH + keep * S.rowH > limit() && page.items.length > 1) newPage();

      if (tbl.headings.length) {
        y += S.gap; page.items.push({ t: "rule", y }); y += S.rule;
        for (const h of tbl.headings) {
          page.items.push({ t: "heading", y, ...h });
          y += S.headingH; page.items.push({ t: "rule", y }); y += S.rule;
        }
      }
      y += S.gap; page.items.push({ t: "rule", y }); y += S.rule;

      let i = 0;
      while (i < tbl.rows.length) {
        const remaining = tbl.rows.length - i;
        let fit = Math.floor((limit() - y) / S.rowH);
        if (fit >= remaining) fit = remaining;
        else if (remaining - fit < opt.minRowsAtPageTop && fit > opt.minRowsAtPageTop) {
          fit -= opt.minRowsAtPageTop - (remaining - fit);        // avoid a lonely row on the next page
        }
        if (fit <= 0) {                                           // nothing fits: continue on next page
          newPage(); y += S.gap; page.items.push({ t: "rule", y }); y += S.rule;
          continue;
        }
        for (let k = 0; k < fit; k++) {
          page.items.push({ t: "row", y, row: tbl.rows[i + k], last: k === fit - 1 });
          y += S.rowH;
        }
        i += fit;
        if (i < tbl.rows.length) {                                // table continues on the next page
          newPage(); y += S.gap; page.items.push({ t: "rule", y }); y += S.rule;
        }
      }
      page.contentBottom = y;
    }
    return pages;
  }

  function layout(rows, options) {
    const opt = Object.assign({}, DEFAULTS, options || {});
    const tables = toTables(group(rows));
    const footerOn = !!(opt.footer && opt.footer.trim());
    const footerLimit = SPEC.footer.top - opt.footerGap;

    // Pass 1 uses normal limits. If a footer is set, the last page must leave room for it:
    // re-run with a lower limit from that page on, until the last page is stable.
    let pages = paginate(tables, opt, () => opt.bottomLimit);
    if (footerOn) {
      let lp = pages.length - 1;
      for (let pass = 0; pass < 6; pass++) {
        const fromPage = lp;
        pages = paginate(tables, opt, (i) => (i >= fromPage ? footerLimit : opt.bottomLimit));
        if (pages.length - 1 === lp) break;
        lp = pages.length - 1;
      }
    }
    if (footerOn) pages[pages.length - 1].footer = opt.footer;
    if (opt.title) pages[0].title = opt.title;
    return { pages, options: opt, spec: SPEC };
  }

  window.MenuLayout = { SPEC, DEFAULTS, layout, group };
})();
