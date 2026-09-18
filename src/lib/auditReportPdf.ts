export type AuditReportSummary = {
  label: string;
  value: string;
  detail?: string;
};

export type AuditReportData = {
  title: string;
  description: string;
  generatedAt: string;
  summary: AuditReportSummary[];
  filters: string[];
  columns: string[];
  rows: string[][];
  columnWeights?: number[];
  filename: string;
};

const BRAND = {
  ink: [24, 24, 27] as const,
  violet: [124, 58, 237] as const,
  muted: [107, 114, 128] as const,
  line: [229, 231, 235] as const,
  soft: [249, 250, 251] as const,
  white: [255, 255, 255] as const,
};

// Despite the legacy filename, this is the white transparent wordmark. It is
// the correct high-contrast asset for the report's dark website-style header.
export const AUDIT_REPORT_LOGO_PATH = "/icons/perk-wordmark-dark-transparent.png?v=20260722-theme";

const imageAsDataUrl = async (path: string) => {
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Could not load report logo (${response.status})`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read report logo"));
    reader.readAsDataURL(blob);
  });
};

const formatReportDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

// jsPDF's built-in Helvetica font is not Unicode-complete. Keep exported
// reports readable without embedding a large font file in every download.
export const auditPdfSafeText = (value: unknown) => String(value ?? "")
  .replace(/₱/g, "PHP ")
  .replace(/[–—]/g, "-")
  .replace(/…/g, "...")
  .replace(/·/g, "/");

export async function createAuditReportPdf(data: AuditReportData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = width - (margin * 2);
  let logo: string | null = null;

  try {
    logo = await imageAsDataUrl(AUDIT_REPORT_LOGO_PATH);
  } catch (error) {
    console.warn("Audit report wordmark could not be embedded", error);
  }

  doc.setProperties({
    title: `Perk ${data.title}`,
    subject: data.description,
    author: "Perk",
    creator: "Perk Auditor",
  });

  const addHeader = (continued = false) => {
    doc.setFillColor(...BRAND.ink);
    doc.rect(0, 0, width, 29, "F");
    doc.setFillColor(...BRAND.violet);
    doc.rect(0, 28, width, 1.1, "F");
    if (logo) {
      doc.addImage(logo, "PNG", margin, 6.5, 31, 14, undefined, "FAST");
    } else {
      doc.setTextColor(...BRAND.white);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("perk.", margin, 17.5);
    }
    doc.setTextColor(...BRAND.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(auditPdfSafeText(`${data.title}${continued ? " / Continued" : ""}`), width - margin, 12.5, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text(auditPdfSafeText(`AUDITOR REPORT  /  ${formatReportDate(data.generatedAt)}`), width - margin, 19, { align: "right" });
  };

  const addFooter = (page: number, pageCount: number) => {
    doc.setDrawColor(...BRAND.line);
    doc.line(margin, height - 12, width - margin, height - 12);
    doc.setTextColor(...BRAND.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text("Perk  /  Confidential auditor record", margin, height - 7);
    doc.text(`Page ${page} of ${pageCount}`, width - margin, height - 7, { align: "right" });
  };

  addHeader();
  doc.setTextColor(...BRAND.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(doc.splitTextToSize(auditPdfSafeText(data.description), contentWidth), margin, 38);

  const summaries = data.summary.slice(0, 5);
  const cardGap = 3;
  const cardWidth = (contentWidth - cardGap * Math.max(0, summaries.length - 1)) / Math.max(1, summaries.length);
  const summaryText = summaries.map((item) => ({
    label: doc.splitTextToSize(auditPdfSafeText(item.label.toUpperCase()), cardWidth - 8) as string[],
    value: doc.splitTextToSize(auditPdfSafeText(item.value), cardWidth - 8) as string[],
    detail: item.detail
      ? doc.splitTextToSize(auditPdfSafeText(item.detail), cardWidth - 8) as string[]
      : [],
  }));
  const summaryHeight = Math.max(21, ...summaryText.map((item) =>
    16 + Math.max(0, item.label.length - 1) * 2.5
      + Math.max(0, item.value.length - 1) * 3.5
      + item.detail.length * 2.8));
  summaries.forEach((item, index) => {
    const x = margin + index * (cardWidth + cardGap);
    const wrapped = summaryText[index];
    doc.setFillColor(...BRAND.soft);
    doc.setDrawColor(...BRAND.line);
    doc.roundedRect(x, 46, cardWidth, summaryHeight, 2.5, 2.5, "FD");
    doc.setTextColor(...BRAND.muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.7);
    doc.text(wrapped.label, x + 4, 52.3, { lineHeightFactor: 1.15 });
    const valueY = 60.2 + Math.max(0, wrapped.label.length - 1) * 2.5;
    doc.setTextColor(...BRAND.ink);
    doc.setFontSize(11.5);
    doc.text(wrapped.value, x + 4, valueY, { lineHeightFactor: 1.1 });
    if (wrapped.detail.length) {
      doc.setTextColor(...BRAND.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.2);
      const detailY = valueY + 4.3 + Math.max(0, wrapped.value.length - 1) * 3.5;
      doc.text(wrapped.detail, x + 4, detailY, { lineHeightFactor: 1.15 });
    }
  });

  const filtersY = 53 + summaryHeight;
  doc.setTextColor(...BRAND.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const filterLines = doc.splitTextToSize(
    auditPdfSafeText(`Filters: ${data.filters.length ? data.filters.join("  /  ") : "None"}`),
    contentWidth,
  ) as string[];
  doc.text(filterLines, margin, filtersY, { lineHeightFactor: 1.2 });

  const tableTop = filtersY + 6 + Math.max(0, filterLines.length - 1) * 2.8;
  const tableBottom = height - 17;
  const minimumRowHeight = 8.5;
  const cellLineHeight = 3;
  const weights = data.columns.map((_, index) => Math.max(0.5, Number(data.columnWeights?.[index]) || 1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const columnWidths = weights.map((weight) => contentWidth * (weight / totalWeight));
  const columnX = columnWidths.reduce<number[]>((positions, columnWidth, index) => {
    positions.push(index === 0 ? margin : positions[index - 1] + columnWidths[index - 1]);
    return positions;
  }, []);
  const drawTableHeader = (y: number) => {
    doc.setFillColor(...BRAND.ink);
    doc.rect(margin, y, contentWidth, 8, "F");
    doc.setTextColor(...BRAND.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    data.columns.forEach((column, index) => doc.text(auditPdfSafeText(column.toUpperCase()), columnX[index] + 3, y + 5.2));
  };

  drawTableHeader(tableTop);
  let y = tableTop + 8;
  if (!data.rows.length) {
    doc.setFillColor(...BRAND.soft);
    doc.setDrawColor(...BRAND.line);
    doc.roundedRect(margin, y + 6, contentWidth, 34, 3, 3, "FD");
    doc.setTextColor(...BRAND.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("No records match this report", width / 2, y + 20, { align: "center" });
    doc.setTextColor(...BRAND.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("The report was generated successfully with the selected filters and current summary totals.", width / 2, y + 27, { align: "center" });
  } else {
    data.rows.forEach((row, rowIndex) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      const cellLines = data.columns.map((_, columnIndex) =>
        doc.splitTextToSize(auditPdfSafeText(row[columnIndex]), columnWidths[columnIndex] - 6) as string[]);
      const rowHeight = Math.max(
        minimumRowHeight,
        Math.max(...cellLines.map((lines) => Math.max(1, lines.length))) * cellLineHeight + 3.5,
      );
      if (y + rowHeight > tableBottom) {
        doc.addPage();
        addHeader(true);
        drawTableHeader(35);
        y = 43;
      }
      if (rowIndex % 2 === 0) {
        doc.setFillColor(...BRAND.soft);
        doc.rect(margin, y, contentWidth, rowHeight, "F");
      }
      doc.setTextColor(...BRAND.ink);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      data.columns.forEach((_, columnIndex) => {
        doc.text(cellLines[columnIndex], columnX[columnIndex] + 3, y + 5.2, { lineHeightFactor: 1.3 });
      });
      y += rowHeight;
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    addFooter(page, pageCount);
  }
  return doc;
}

export async function downloadAuditReportPdf(data: AuditReportData) {
  const doc = await createAuditReportPdf(data);
  doc.save(data.filename);
}
