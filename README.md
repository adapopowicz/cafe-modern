# Café Modern — menu tool (wine card, draft 1)

Open `index.html` in Chrome, Safari or Edge. It needs no installation, server or internet connection.

## Updating the wine list
1. Click **Download current CSV** and open it in Excel, Numbers or Google Sheets.
2. Edit, add or remove rows. Row order in the sheet is the order on the card.
3. Drop the saved CSV onto the tool, or copy the sheet and paste it in **…or paste from Excel / Google Sheets**.
4. Look at **Check**. It shows the page count (the card has 4 pages) and lists anything that doesn't fit.
5. Choose the layout under Settings, then click **Download PDF**:
   - *A4 pages*: a 4-page A4 PDF.
   - *A3 sheet, folded*: two A3 sheets, ready for duplex printing and folding (front 4|1, back 2|3).
   The tool writes the PDF itself, so it is exact and vector, with fonts embedded, whatever browser you use. Print that PDF or send it to the print shop.
   (**Print…** uses the browser's print dialog and is only a backup. If you use it, set Margins to *None* and Scale to *100%*.)

The last import is remembered in this browser.

## CSV columns
English and Dutch headers both work. Comma, semicolon and tab separators are all accepted.

| column | Dutch alternative | notes |
|---|---|---|
| category | categorie | MOUSSEREND, WIT, ORANJE, ROSÉ, ROOD … (main heading) |
| country | land | optional; adds a sub-heading such as "WIT Duitsland" |
| region | regio | |
| producer | producent | |
| year | jaar | nv, 2024 … |
| name | naam | |
| grape | druif | |
| volume | inhoud | optional small note, e.g. `0,375 l` |
| price_bottle | prijs fles | |
| price_glass | prijs glas | |
| sold_out | uitverkocht | `ja` / `x` strikes the wine through |

## How the layout works
- All measurements come from the print PDFs, in points (A4 = 595 × 842 pt). They are in `js/layout.js` → `SPEC`.
- Page flow: tables continue across pages row by row, and every page is filled down to the *bottom limit* (811 pt by default). Headings always stay with at least 2 rows, and a table never leaves a single row alone at the top of a page.
- Every page opens with a double rule. A table closes with a solid rule in place of its last dotted line.
- A name that is too long for its column is narrowed automatically (Instrument Sans width axis, then tighter letter spacing). If it still doesn't fit, it is highlighted in red in the preview.

## Dotted words
The dotted words live in `js/dotted-words.js`. WIT and ROOD were traced dot for dot from the PDFs. To add one, such as ORANJE:
1. In Figma, right-click the word and choose *Copy as → Copy as SVG*.
2. Paste it into `js/dotted-words.js` as a new entry, following the commented ORANJE example.

Circles, rects, ellipses, polygons and paths all work, both on screen and in the PDF. The SVG code is pasted into the JS file, not linked, because browsers block reading separate files when `index.html` is opened straight from disk. Until a word has an entry, it gets a stand-in.

## Files
- `index.html` — the tool
- `css/menu.css` — print design
- `css/app.css` — tool UI
- `js/csv.js` — import and export
- `js/layout.js` — measurements and page flow
- `js/render.js` — drawing
- `js/pdf-export.js` — exact PDF export (pdf-lib, fontkit)
- `js/app.js` — UI
- `js/dotted-words.js` — dotted heading words and the bottle/glass icon
- `vendor/` — pdf-lib and fontkit (MIT)
- `fonts/pdf-fonts.js` — static Instrument Sans instances for the PDF
- `data/wijnkaart.csv` — the current wine list
- `fonts/` — Instrument Sans (OFL)
