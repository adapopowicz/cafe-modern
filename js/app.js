/* App wiring: import → layout → render → print. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const KEY_CSV = "cafe-modern.wine.csv";
  const KEY_SRC = "cafe-modern.wine.source";
  const KEY_OPT = "cafe-modern.wine.options";

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  const state = {
    csv: store.get(KEY_CSV) || window.DEFAULT_WINE_CSV,
    source: store.get(KEY_SRC) || "Original wine list (built in)",
    options: Object.assign({}, window.MenuLayout.DEFAULTS, JSON.parse(store.get(KEY_OPT) || "{}")),
    print: "a4",
    rows: [],
    importWarnings: [],
  };

  // ---------- data ----------
  function loadCSV(text, sourceLabel) {
    const { rows, warnings } = window.MenuCSV.toWines(text);
    if (!rows.length) {
      alertBox(["No wines found in that file. " + warnings.join(" ")]);
      return;
    }
    state.csv = text; state.source = sourceLabel;
    store.set(KEY_CSV, text); store.set(KEY_SRC, sourceLabel);
    update();
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let text = reader.result;
      // Excel on Windows sometimes saves CSV as Windows-1252: retry if we see replacement chars
      if (text.includes("�")) {
        const r2 = new FileReader();
        r2.onload = () => loadCSV(r2.result, file.name + " · imported " + new Date().toLocaleString());
        r2.readAsText(file, "windows-1252");
        return;
      }
      loadCSV(text, file.name + " · imported " + new Date().toLocaleString());
    };
    reader.readAsText(file, "utf-8");
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- render ----------
  let raf = 0;
  function update() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  }

  function render() {
    const parsed = window.MenuCSV.toWines(state.csv);
    state.rows = parsed.rows;
    const model = window.MenuLayout.layout(state.rows, state.options);
    const renderWarnings = window.MenuRender.renderPages(model, $("pages"), {});
    state.model = model;

    // stats
    const n = model.pages.length, target = state.options.targetPages;
    const last = model.pages[n - 1];
    const lastFill = Math.round(((last.contentBottom || last.top) - last.top) / (state.options.bottomLimit - last.top) * 100);
    $("stats").innerHTML =
      stat(state.rows.length, "wines") +
      stat(n + " / " + target, "pages", n > target) +
      stat(lastFill + "%", "last page used");

    const all = [...parsed.warnings, ...new Set(renderWarnings)];
    if (n > target) all.unshift(`The list needs ${n} pages but the card has ${target}. Remove ${Math.ceil(overflowRows(model) )} or more wines, or lower “Page 1 starts at”.`);
    $("warnings").innerHTML = all.length
      ? all.map((w) => `<li>${escapeHtml(w)}</li>`).join("")
      : `<li class="ok">Everything fits — no warnings.</li>`;
    $("source").textContent = "Showing: " + state.source;
    $("pages").style.setProperty("--limit", state.options.bottomLimit + "pt");
  }

  function overflowRows(model) {
    let rows = 0;
    model.pages.slice(state.options.targetPages).forEach((p) => p.items.forEach((i) => { if (i.t === "row") rows++; }));
    return rows;
  }
  const stat = (v, l, bad) => `<div class="stat${bad ? " bad" : ""}"><b>${v}</b><span>${l}</span></div>`;
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function alertBox(msgs) { $("warnings").innerHTML = msgs.map((w) => `<li>${escapeHtml(w)}</li>`).join(""); }

  // ---------- print ----------
  function buildPrint() {
    const root = $("print-root");
    root.innerHTML = "";
    const pages = [...$("pages").querySelectorAll(".page")];
    const a3 = state.print === "a3";
    const W = a3 ? 1190 : 595, H = 842;
    $("page-size").textContent = (a3 ? "@page { size: 420mm 297mm; margin: 0; }" : "@page { size: A4 portrait; margin: 0; }");
    root.style.setProperty("--pw", W + "pt");
    root.style.setProperty("--ph", H + "pt");
    const wrap = (node) => { const pp = document.createElement("div"); pp.className = "pp"; pp.appendChild(node); root.appendChild(pp); };

    if (a3) {
      // Booklet imposition: sheet s front = [n-2s | 1+2s], back = [2+2s | n-1-2s]
      const n = Math.ceil(pages.length / 4) * 4;
      const get = (i) => (pages[i - 1] ? pages[i - 1].cloneNode(true) : Object.assign(document.createElement("div"), { className: "blank" }));
      for (let s = 0; s < n / 4; s++) {
        for (const [l, r] of [[n - 2 * s, 1 + 2 * s], [2 + 2 * s, n - 1 - 2 * s]]) {
          const sheet = document.createElement("div");
          sheet.className = "sheet";
          sheet.append(get(l), get(r));
          wrap(sheet);
        }
      }
    } else {
      pages.forEach((p) => wrap(p.cloneNode(true)));
    }
  }

  // ---------- UI ----------
  function bindOptions() {
    const map = { "opt-title": "title", "opt-footer": "footer", "opt-first": "firstPageTop", "opt-bottom": "bottomLimit" };
    for (const [id, key] of Object.entries(map)) {
      const input = $(id);
      input.value = state.options[key];
      input.addEventListener("input", () => {
        const v = input.type === "number" ? parseFloat(input.value) : input.value;
        if (input.type === "number" && !isFinite(v)) return;
        state.options[key] = v;
        store.set(KEY_OPT, JSON.stringify(pick(state.options, Object.values(map))));
        update();
      });
    }
    $("opt-print").addEventListener("change", (e) => { state.print = e.target.value; });
  }
  const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

  function bind() {
    const drop = $("drop");
    $("file").addEventListener("change", (e) => { if (e.target.files[0]) readFile(e.target.files[0]); e.target.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
    // Allow dropping anywhere on the page
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) readFile(f); });

    $("btn-paste").addEventListener("click", () => {
      const t = $("paste").value.trim();
      if (t) loadCSV(t, "Pasted data · " + new Date().toLocaleString());
    });
    $("btn-export").addEventListener("click", () => download("wijnkaart.csv", window.MenuCSV.toCSV(state.rows)));
    $("btn-template").addEventListener("click", () => download("wijnkaart-template.csv",
      "﻿" + window.MenuCSV.COLUMNS.join(",") + "\r\nWIT,Duitsland,mosel,producer name,2024,wine name,riesling,,45,\"7,5\",\r\n"));
    $("btn-reset").addEventListener("click", () => {
      if (!confirm("Replace the current list with the original wine list?")) return;
      store.del(KEY_CSV); store.del(KEY_SRC); store.del(KEY_OPT);
      state.csv = window.DEFAULT_WINE_CSV; state.source = "Original wine list (built in)";
      state.options = Object.assign({}, window.MenuLayout.DEFAULTS);
      bindOptionsValues();
      update();
    });
    $("btn-print").addEventListener("click", () => { buildPrint(); window.print(); });
    $("btn-pdf").addEventListener("click", async () => {
      const btn = $("btn-pdf"), label = btn.textContent;
      btn.disabled = true; btn.textContent = "Making PDF…";
      try {
        const bytes = await window.MenuPDF.build(state.model, { imposition: state.print });
        const stamp = new Date().toISOString().slice(0, 10);
        download(`wijnkaart-${state.print === "a3" ? "A3-gevouwen" : "A4"}-${stamp}.pdf`, bytes, "application/pdf");
      } catch (err) {
        console.error(err);
        alertBox(["Could not make the PDF: " + (err && err.message ? err.message : err)]);
      } finally {
        btn.disabled = false; btn.textContent = label;
      }
    });
    window.addEventListener("beforeprint", buildPrint);

    const zoom = $("zoom");
    const setZoom = () => $("pages").style.setProperty("--zoom", zoom.value);
    zoom.addEventListener("input", setZoom); setZoom();
    $("show-grid").addEventListener("change", (e) => $("pages").classList.toggle("grid", e.target.checked));
  }
  function bindOptionsValues() {
    $("opt-title").value = state.options.title;
    $("opt-footer").value = state.options.footer;
    $("opt-first").value = state.options.firstPageTop;
    $("opt-bottom").value = state.options.bottomLimit;
  }

  bindOptions();
  bind();
  Promise.all([document.fonts.load("9pt 'Instrument Sans'"), document.fonts.load("500 11.25pt 'Instrument Sans'")])
    .then(() => document.fonts.ready)
    .then(render, render);
})();
