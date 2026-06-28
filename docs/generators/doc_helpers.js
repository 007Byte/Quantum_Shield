/**
 * Quantum_Shield v2.0 — Document Generation Helpers
 * Professional formatting module for enterprise-grade .docx output
 *
 * Architecture: Shared across all 7 document generators
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak, TabStopType, TabStopPosition,
  PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader
} = require("docx");
const fs = require("fs");
const path = require("path");

// ═══════════════════════════════════════════════════════════════
//  BRAND & LAYOUT CONSTANTS
// ═══════════════════════════════════════════════════════════════

const BRAND = {
  PRIMARY:    "0D1B2A",   // Deep navy
  SECONDARY:  "1B3A5C",   // Steel blue
  ACCENT:     "2E75B6",   // Bright blue
  ACCENT_ALT: "1A6FB5",   // Alt accent
  LIGHT:      "D6E4F0",   // Light blue wash
  LIGHTER:    "E8F0F8",   // Very light blue
  HEADER_BG:  "0D1B2A",   // Header cell bg
  ROW_ALT:    "F5F8FB",   // Alternating row
  WHITE:      "FFFFFF",
  BLACK:      "000000",
  GRAY_DARK:  "333333",
  GRAY_MED:   "666666",
  GRAY_LIGHT: "999999",
  GRAY_RULE:  "CCCCCC",
  RED_WARN:   "C0392B",
  GREEN_OK:   "27AE60",
  ORANGE:     "E67E22",
};

const LAYOUT = {
  PAGE_W: 12240,           // US Letter width (DXA)
  PAGE_H: 15840,           // US Letter height (DXA)
  MARGIN_TOP: 1440,        // 1 inch
  MARGIN_BOTTOM: 1440,
  MARGIN_LEFT: 1440,
  MARGIN_RIGHT: 1440,
  CONTENT_W: 9360,         // 12240 - 2*1440
  FONT: "Arial",
  FONT_MONO: "Consolas",
  SIZE_BODY: 22,           // 11pt
  SIZE_SMALL: 18,          // 9pt
  SIZE_CAPTION: 20,        // 10pt
  SIZE_H1: 32,             // 16pt
  SIZE_H2: 26,             // 13pt
  SIZE_H3: 22,             // 11pt
};

const CELL_MARGINS = { top: 60, bottom: 60, left: 100, right: 100 };
const CELL_MARGINS_TIGHT = { top: 40, bottom: 40, left: 80, right: 80 };

function thinBorder(color) {
  const b = { style: BorderStyle.SINGLE, size: 1, color: color || BRAND.GRAY_RULE };
  return { top: b, bottom: b, left: b, right: b };
}

function noBorder() {
  const b = { style: BorderStyle.NONE, size: 0, color: BRAND.WHITE };
  return { top: b, bottom: b, left: b, right: b };
}

function thickBottom(color) {
  const thin = { style: BorderStyle.SINGLE, size: 1, color: BRAND.GRAY_RULE };
  const thick = { style: BorderStyle.SINGLE, size: 6, color: color || BRAND.ACCENT };
  return { top: thin, bottom: thick, left: thin, right: thin };
}

// ═══════════════════════════════════════════════════════════════
//  DOCUMENT STYLES
// ═══════════════════════════════════════════════════════════════

function getStyles() {
  return {
    default: {
      document: {
        run: { font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: BRAND.GRAY_DARK },
        paragraph: { spacing: { after: 120, line: 276 } }
      }
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: LAYOUT.SIZE_H1, bold: true, font: LAYOUT.FONT, color: BRAND.PRIMARY },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND.ACCENT, space: 4 } } }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: LAYOUT.SIZE_H2, bold: true, font: LAYOUT.FONT, color: BRAND.SECONDARY },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 1 }
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: LAYOUT.SIZE_H3, bold: true, font: LAYOUT.FONT, color: BRAND.ACCENT },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 }
      },
    ]
  };
}

function getNumbering() {
  return {
    config: [
      {
        reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
        ]
      },
      {
        reference: "numbers",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ]
      },
      {
        reference: "numbers2",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ]
      },
      {
        reference: "numbers3",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ]
      },
      {
        reference: "numbers4",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ]
      },
    ]
  };
}

// ═══════════════════════════════════════════════════════════════
//  SECTION & PAGE PROPERTIES
// ═══════════════════════════════════════════════════════════════

function pageProps() {
  return {
    page: {
      size: { width: LAYOUT.PAGE_W, height: LAYOUT.PAGE_H },
      margin: {
        top: LAYOUT.MARGIN_TOP, bottom: LAYOUT.MARGIN_BOTTOM,
        left: LAYOUT.MARGIN_LEFT, right: LAYOUT.MARGIN_RIGHT
      }
    }
  };
}

// ═══════════════════════════════════════════════════════════════
//  HEADERS & FOOTERS
// ═══════════════════════════════════════════════════════════════

function makeHeader(title, classification, docId) {
  const children = [];
  children.push(new Paragraph({
    spacing: { after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND.ACCENT, space: 6 } },
    children: [
      new TextRun({ text: title, font: LAYOUT.FONT, size: 16, color: BRAND.GRAY_MED }),
      new TextRun({ text: "\t", children: [] }),
      new TextRun({ children: [
        new PositionalTab({
          alignment: PositionalTabAlignment.RIGHT,
          relativeTo: PositionalTabRelativeTo.MARGIN,
          leader: PositionalTabLeader.NONE,
        }),
        classification || "",
      ], font: LAYOUT.FONT, size: 16, bold: true, color: BRAND.RED_WARN }),
    ],
  }));
  return new Header({ children });
}

function makeFooter(docId, version) {
  return new Footer({
    children: [
      new Paragraph({
        spacing: { before: 0 },
        border: { top: { style: BorderStyle.SINGLE, size: 2, color: BRAND.GRAY_RULE, space: 6 } },
        children: [
          new TextRun({ text: `${docId || "Quantum_Shield"}  |  v${version || "2.0"}`, font: LAYOUT.FONT, size: 14, color: BRAND.GRAY_LIGHT }),
          new TextRun({ children: [
            new PositionalTab({
              alignment: PositionalTabAlignment.CENTER,
              relativeTo: PositionalTabRelativeTo.MARGIN,
              leader: PositionalTabLeader.NONE,
            }),
            "\u00A9 2026 USBVault Inc.  |  CONFIDENTIAL",
          ], font: LAYOUT.FONT, size: 14, color: BRAND.GRAY_LIGHT }),
          new TextRun({ children: [
            new PositionalTab({
              alignment: PositionalTabAlignment.RIGHT,
              relativeTo: PositionalTabRelativeTo.MARGIN,
              leader: PositionalTabLeader.NONE,
            }),
            "Page ",
          ], font: LAYOUT.FONT, size: 14, color: BRAND.GRAY_LIGHT }),
          new TextRun({ children: [PageNumber.CURRENT], font: LAYOUT.FONT, size: 14, color: BRAND.GRAY_LIGHT }),
        ],
      }),
    ]
  });
}

// ═══════════════════════════════════════════════════════════════
//  TITLE / COVER PAGE
// ═══════════════════════════════════════════════════════════════

function coverPage(opts) {
  const { title, subtitle, docId, version, date, classification, audience, authors, reviewers } = opts;
  const els = [];

  // Top classification bar
  if (classification) {
    els.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 0, after: 600 },
      children: [new TextRun({ text: `\u2588\u2588  ${classification}  \u2588\u2588`, font: LAYOUT.FONT, size: 24, bold: true, color: BRAND.RED_WARN })]
    }));
  }

  // Spacer
  els.push(new Paragraph({ spacing: { before: 2400, after: 0 }, children: [] }));

  // Brand line
  els.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [new TextRun({ text: "Quantum_Shield Edition", font: LAYOUT.FONT, size: 28, color: BRAND.ACCENT, bold: true })]
  }));

  // Title
  els.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 100 },
    children: [new TextRun({ text: title, font: LAYOUT.FONT, size: 52, bold: true, color: BRAND.PRIMARY })]
  }));

  // Subtitle
  if (subtitle) {
    els.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 600 },
      children: [new TextRun({ text: subtitle, font: LAYOUT.FONT, size: 28, color: BRAND.GRAY_MED, italics: true })]
    }));
  }

  // Horizontal rule
  els.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 200, after: 400 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND.ACCENT, space: 1 } },
    children: []
  }));

  // Meta table — borderless, centered info
  const metaRows = [
    ["Document ID", docId],
    ["Version", version || "2.0"],
    ["Date", date || "March 15, 2026"],
    ["Classification", classification || "CONFIDENTIAL"],
    ["Audience", audience || ""],
  ];
  if (authors) metaRows.push(["Author(s)", authors]);
  if (reviewers) metaRows.push(["Reviewed By", reviewers]);

  const metaTable = new Table({
    width: { size: 5400, type: WidthType.DXA },
    columnWidths: [1800, 3600],
    rows: metaRows.map(([k, v]) => new TableRow({
      children: [
        new TableCell({
          borders: noBorder(), width: { size: 1800, type: WidthType.DXA },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 40 },
            children: [new TextRun({ text: k, font: LAYOUT.FONT, size: 18, bold: true, color: BRAND.GRAY_MED })] })]
        }),
        new TableCell({
          borders: noBorder(), width: { size: 3600, type: WidthType.DXA },
          children: [new Paragraph({ spacing: { after: 40 },
            children: [new TextRun({ text: v, font: LAYOUT.FONT, size: 18, color: BRAND.GRAY_DARK })] })]
        }),
      ]
    })),
  });

  els.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [] }));
  els.push(metaTable);

  // Bottom tagline
  els.push(new Paragraph({ spacing: { before: 1200 }, children: [] }));
  els.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 0 },
    children: [new TextRun({ text: "Intelligence-Grade Security for Everyone", font: LAYOUT.FONT, size: 20, italics: true, color: BRAND.ACCENT })]
  }));

  // Page break
  els.push(new Paragraph({ children: [new PageBreak()] }));

  return els;
}

// ═══════════════════════════════════════════════════════════════
//  DOCUMENT CONTROL PAGE
// ═══════════════════════════════════════════════════════════════

function documentControlPage(opts) {
  const { revisions, approvals, distribution } = opts;
  const els = [];

  els.push(h1("Document Control"));

  // Revision History
  els.push(h2("Revision History"));
  const revHeaders = ["Version", "Date", "Author", "Description"];
  const revWidths = [1000, 1600, 2000, 4760];
  const revData = revisions || [
    ["0.1", "2026-02-15", "Engineering", "Initial draft"],
    ["1.0", "2026-03-01", "Engineering", "Internal review release"],
    ["2.0", "2026-03-15", "Engineering", "Enterprise Edition v2.0 release"],
  ];
  els.push(makeTable(revHeaders, revData, revWidths));
  els.push(spacer(200));

  // Approval
  els.push(h2("Approval"));
  const approvalHeaders = ["Role", "Name", "Signature", "Date"];
  const approvalWidths = [2000, 2400, 2560, 2400];
  const approvalData = approvals || [
    ["Engineering Lead", "", "", ""],
    ["Security Officer", "", "", ""],
    ["Product Manager", "", "", ""],
    ["CTO", "", "", ""],
  ];
  els.push(makeTable(approvalHeaders, approvalData, approvalWidths));
  els.push(spacer(200));

  // Distribution
  els.push(h2("Distribution"));
  const distHeaders = ["Role / Group", "Access Level"];
  const distWidths = [5000, 4360];
  const distData = distribution || [
    ["Engineering Team", "Full Access"],
    ["Security Team", "Full Access"],
    ["Product Management", "Read Only"],
    ["Executive Leadership", "Read Only"],
  ];
  els.push(makeTable(distHeaders, distData, distWidths));
  els.push(pageBreak());

  return els;
}

// ═══════════════════════════════════════════════════════════════
//  TEXT HELPERS
// ═══════════════════════════════════════════════════════════════

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text })]
  });
}

function p(content, opts) {
  const { spacing, alignment, indent } = opts || {};
  if (typeof content === "string") {
    return new Paragraph({
      spacing: spacing || { after: 120, line: 276 },
      alignment: alignment || AlignmentType.LEFT,
      indent: indent,
      children: [new TextRun({ text: content, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: BRAND.GRAY_DARK })]
    });
  }
  // Array of TextRun-like objects
  return new Paragraph({
    spacing: spacing || { after: 120, line: 276 },
    alignment: alignment || AlignmentType.LEFT,
    indent: indent,
    children: Array.isArray(content) ? content : [content]
  });
}

function bold(text, color) {
  return new TextRun({ text, bold: true, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: color || BRAND.GRAY_DARK });
}

function italic(text, color) {
  return new TextRun({ text, italics: true, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: color || BRAND.GRAY_MED });
}

function run(text, opts) {
  return new TextRun({ text, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: BRAND.GRAY_DARK, ...opts });
}

function mono(text) {
  return new TextRun({ text, font: LAYOUT.FONT_MONO, size: 20, color: BRAND.SECONDARY });
}

function bullet(text, level) {
  if (typeof text === "string") {
    return new Paragraph({
      numbering: { reference: "bullets", level: level || 0 },
      spacing: { after: 80, line: 276 },
      children: [new TextRun({ text, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: BRAND.GRAY_DARK })]
    });
  }
  return new Paragraph({
    numbering: { reference: "bullets", level: level || 0 },
    spacing: { after: 80, line: 276 },
    children: Array.isArray(text) ? text : [text]
  });
}

function numbered(text, ref) {
  if (typeof text === "string") {
    return new Paragraph({
      numbering: { reference: ref || "numbers", level: 0 },
      spacing: { after: 80, line: 276 },
      children: [new TextRun({ text, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: BRAND.GRAY_DARK })]
    });
  }
  return new Paragraph({
    numbering: { reference: ref || "numbers", level: 0 },
    spacing: { after: 80, line: 276 },
    children: Array.isArray(text) ? text : [text]
  });
}

function spacer(before) {
  return new Paragraph({ spacing: { before: before || 200, after: 0 }, children: [] });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function caption(text) {
  return new Paragraph({
    spacing: { before: 60, after: 160 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, font: LAYOUT.FONT, size: LAYOUT.SIZE_CAPTION, italics: true, color: BRAND.GRAY_MED })]
  });
}

function note(text) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: 360, right: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 8, color: BRAND.ACCENT, space: 8 } },
    children: [
      new TextRun({ text: "Note: ", bold: true, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: BRAND.ACCENT }),
      new TextRun({ text, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: BRAND.GRAY_DARK }),
    ]
  });
}

function warning(text) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    indent: { left: 360, right: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 8, color: BRAND.RED_WARN, space: 8 } },
    children: [
      new TextRun({ text: "Warning: ", bold: true, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: BRAND.RED_WARN }),
      new TextRun({ text, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: BRAND.GRAY_DARK }),
    ]
  });
}

function importantBox(title, text) {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    indent: { left: 360, right: 360 },
    shading: { fill: BRAND.LIGHTER, type: ShadingType.CLEAR },
    border: { left: { style: BorderStyle.SINGLE, size: 10, color: BRAND.PRIMARY, space: 8 },
              top: { style: BorderStyle.SINGLE, size: 1, color: BRAND.LIGHT, space: 4 },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: BRAND.LIGHT, space: 4 },
              right: { style: BorderStyle.SINGLE, size: 1, color: BRAND.LIGHT, space: 4 } },
    children: [
      new TextRun({ text: title + "  ", bold: true, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: BRAND.PRIMARY }),
      new TextRun({ text, font: LAYOUT.FONT, size: LAYOUT.SIZE_BODY, color: BRAND.GRAY_DARK }),
    ]
  });
}

// ═══════════════════════════════════════════════════════════════
//  TABLE HELPERS
// ═══════════════════════════════════════════════════════════════

function makeTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  // Header row
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders: thinBorder(BRAND.GRAY_RULE),
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: BRAND.PRIMARY, type: ShadingType.CLEAR },
      margins: CELL_MARGINS,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        spacing: { after: 0 }, alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: h, font: LAYOUT.FONT, size: 20, bold: true, color: BRAND.WHITE })]
      })]
    }))
  });

  // Data rows
  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => {
      const cellContent = typeof cell === "string" ? cell : String(cell);
      return new TableCell({
        borders: thinBorder(BRAND.GRAY_RULE),
        width: { size: colWidths[ci], type: WidthType.DXA },
        shading: { fill: ri % 2 === 1 ? BRAND.ROW_ALT : BRAND.WHITE, type: ShadingType.CLEAR },
        margins: CELL_MARGINS,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          spacing: { after: 0 },
          children: [new TextRun({ text: cellContent, font: LAYOUT.FONT, size: 20, color: BRAND.GRAY_DARK })]
        })]
      });
    })
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
}

/** Table with first column bolded */
function makeTableBoldFirst(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders: thinBorder(BRAND.GRAY_RULE),
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: BRAND.PRIMARY, type: ShadingType.CLEAR },
      margins: CELL_MARGINS,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        spacing: { after: 0 },
        children: [new TextRun({ text: h, font: LAYOUT.FONT, size: 20, bold: true, color: BRAND.WHITE })]
      })]
    }))
  });

  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => {
      const cellContent = typeof cell === "string" ? cell : String(cell);
      return new TableCell({
        borders: thinBorder(BRAND.GRAY_RULE),
        width: { size: colWidths[ci], type: WidthType.DXA },
        shading: { fill: ri % 2 === 1 ? BRAND.ROW_ALT : BRAND.WHITE, type: ShadingType.CLEAR },
        margins: CELL_MARGINS,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          spacing: { after: 0 },
          children: [new TextRun({ text: cellContent, font: LAYOUT.FONT, size: 20, bold: ci === 0, color: ci === 0 ? BRAND.SECONDARY : BRAND.GRAY_DARK })]
        })]
      });
    })
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
}

/** Status table with colored status indicators */
function makeStatusTable(headers, rows, colWidths, statusCol) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const sCol = statusCol || 2; // which column has status

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders: thinBorder(BRAND.GRAY_RULE),
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: BRAND.PRIMARY, type: ShadingType.CLEAR },
      margins: CELL_MARGINS,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        spacing: { after: 0 },
        children: [new TextRun({ text: h, font: LAYOUT.FONT, size: 20, bold: true, color: BRAND.WHITE })]
      })]
    }))
  });

  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => {
      const cellContent = typeof cell === "string" ? cell : String(cell);
      let cellColor = BRAND.GRAY_DARK;
      if (ci === sCol) {
        if (/complete|delivered|clean|yes|passing|true/i.test(cellContent)) cellColor = BRAND.GREEN_OK;
        else if (/planned|partial|pending/i.test(cellContent)) cellColor = BRAND.ORANGE;
        else if (/failed|no|critical|high/i.test(cellContent)) cellColor = BRAND.RED_WARN;
      }
      return new TableCell({
        borders: thinBorder(BRAND.GRAY_RULE),
        width: { size: colWidths[ci], type: WidthType.DXA },
        shading: { fill: ri % 2 === 1 ? BRAND.ROW_ALT : BRAND.WHITE, type: ShadingType.CLEAR },
        margins: CELL_MARGINS,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          spacing: { after: 0 },
          children: [new TextRun({ text: cellContent, font: LAYOUT.FONT, size: 20,
            bold: ci === 0 || ci === sCol, color: cellColor })]
        })]
      });
    })
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
}

// ═══════════════════════════════════════════════════════════════
//  TOC
// ═══════════════════════════════════════════════════════════════

function toc() {
  return [
    h1("Table of Contents"),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
    new Paragraph({
      spacing: { before: 200, after: 0 },
      children: [new TextRun({ text: "Note: Update this table of contents after opening in Microsoft Word by right-clicking and selecting \u201CUpdate Field.\u201D",
        font: LAYOUT.FONT, size: 16, italics: true, color: BRAND.GRAY_LIGHT })]
    }),
    pageBreak(),
  ];
}

// ═══════════════════════════════════════════════════════════════
//  GLOSSARY HELPER
// ═══════════════════════════════════════════════════════════════

function glossarySection(terms) {
  const els = [h1("Glossary")];
  for (const [term, def] of terms) {
    els.push(p([bold(term + "  "), run(def)]));
  }
  els.push(pageBreak());
  return els;
}

// ═══════════════════════════════════════════════════════════════
//  SAVE HELPER
// ═══════════════════════════════════════════════════════════════

async function saveDoc(doc, filename, outDir) {
  const dir = outDir || __dirname;
  const filePath = path.join(dir, filename);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  console.log(`  \u2713 ${filename}  (${(buffer.length / 1024).toFixed(0)} KB)`);
  return filePath;
}

// ═══════════════════════════════════════════════════════════════
//  BUILD DOCUMENT HELPER
// ═══════════════════════════════════════════════════════════════

async function buildDoc(opts) {
  const { filename, headerTitle, headerClassification, footerDocId, footerVersion, children, outDir } = opts;
  const doc = new Document({
    styles: getStyles(),
    numbering: getNumbering(),
    creator: "USBVault Engineering",
    title: headerTitle,
    description: `Quantum_Shield v2.0 \u2014 ${headerTitle}`,
    sections: [{
      properties: pageProps(),
      headers: { default: makeHeader(headerTitle, headerClassification, footerDocId) },
      footers: { default: makeFooter(footerDocId, footerVersion) },
      children,
    }]
  });
  return saveDoc(doc, filename, outDir);
}

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  BRAND, LAYOUT, CELL_MARGINS, CELL_MARGINS_TIGHT,
  thinBorder, noBorder, thickBottom,
  getStyles, getNumbering, pageProps,
  makeHeader, makeFooter,
  coverPage, documentControlPage,
  h1, h2, h3, p, bold, italic, run, mono,
  bullet, numbered, spacer, pageBreak, caption, note, warning, importantBox,
  makeTable, makeTableBoldFirst, makeStatusTable,
  toc, glossarySection, saveDoc, buildDoc,
  // Re-export docx primitives callers need
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak,
};
