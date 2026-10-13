/* CSV / TSV parsing + mapping to wine rows.
   Accepts comma, semicolon (Dutch Excel) and tab (paste from Google Sheets / Excel). */
(function () {
  "use strict";

  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length) || "";
    const counts = { ",": 0, ";": 0, "\t": 0 };
    let inQ = false;
    for (const ch of firstLine) {
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch in counts) counts[ch]++;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
      ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
      : ",";
  }

  function parse(text) {
    text = text.replace(/^﻿/, "");
    const d = detectDelimiter(text);
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === d) { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((f) => f.trim() !== ""));
  }

  // Column names (English + Dutch) → internal keys
  const ALIASES = {
    category: ["category", "categorie", "type", "soort", "kleur"],
    country: ["country", "land", "subcategory", "subcategorie"],
    region: ["region", "regio", "streek", "herkomst"],
    producer: ["producer", "producent", "domein", "wijnhuis", "maker"],
    year: ["year", "jaar", "jaartal", "vintage", "oogst"],
    name: ["name", "naam", "wijn", "cuvee", "cuvée", "wine"],
    grape: ["grape", "grapes", "druif", "druiven", "druivenras"],
    volume: ["volume", "inhoud", "fles inhoud", "note", "notitie"],
    price_bottle: ["price_bottle", "pricebottle", "bottle", "fles", "prijs_fles", "prijsfles", "prijs fles", "price"],
    price_glass: ["price_glass", "priceglass", "glass", "glas", "prijs_glas", "prijsglas", "prijs glas"],
    sold_out: ["sold_out", "soldout", "uitverkocht", "doorgestreept", "strike", "op"],
  };
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s_\-]+/g, "");
  const LOOKUP = {};
  for (const [key, names] of Object.entries(ALIASES)) for (const n of names) LOOKUP[norm(n)] = key;

  const TRUTHY = new Set(["ja", "j", "yes", "y", "x", "1", "true", "waar", "uitverkocht", "sold out"]);

  /** Returns { rows: [...], warnings: [...] } */
  function toWines(text) {
    const table = parse(text);
    const warnings = [];
    if (!table.length) return { rows: [], warnings: ["The file is empty."] };
    const header = table[0].map((h) => LOOKUP[norm(h)] || null);
    const unknown = table[0].filter((h, i) => !header[i] && h.trim());
    if (unknown.length) warnings.push("Ignored unknown columns: " + unknown.join(", "));
    if (!header.includes("category")) warnings.push('Column "category" is missing — all wines are placed under one heading.');
    const rows = [];
    table.slice(1).forEach((cells, i) => {
      const r = {};
      for (const key of Object.keys(ALIASES)) r[key] = "";
      header.forEach((key, c) => { if (key) r[key] = (cells[c] || "").trim(); });
      r.sold_out = TRUTHY.has(r.sold_out.toLowerCase());
      r.category = r.category || "WIJN";
      r._line = i + 2;
      if (!r.region && !r.producer && !r.name && !r.grape) {
        warnings.push(`Line ${r._line}: no region/producer/name — skipped.`);
        return;
      }
      rows.push(r);
    });
    return { rows, warnings };
  }

  function toCSV(rows) {
    const keys = Object.keys(ALIASES);
    const esc = (v) => {
      v = v === true ? "ja" : v === false ? "" : String(v ?? "");
      return /[",;\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    return "﻿" + [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\r\n") + "\r\n";
  }

  window.MenuCSV = { parse, toWines, toCSV, COLUMNS: Object.keys(ALIASES) };
})();
