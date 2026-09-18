import { describe, expect, it, vi } from "vitest";
import { AUDIT_REPORT_LOGO_PATH, auditPdfSafeText, createAuditReportPdf } from "./auditReportPdf";

describe("audit PDF text", () => {
  it("replaces glyphs unsupported by the built-in PDF font", () => {
    expect(auditPdfSafeText("₱1,250.00 · Aug 2 — complete…"))
      .toBe("PHP 1,250.00 / Aug 2 - complete...");
  });

  it("uses the visible white wordmark on the dark report header", () => {
    expect(AUDIT_REPORT_LOGO_PATH).toContain("perk-wordmark-dark-transparent.png");
  });

  it("wraps long record values into taller rows instead of truncating them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("logo unavailable in unit test")));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const base = {
      title: "Activity Log",
      description: "Complete activity details",
      generatedAt: "2026-08-02T00:00:00.000Z",
      summary: [{ label: "Recorded events", value: "12" }],
      filters: [],
      columns: ["Date", "Record", "Actor"],
      columnWeights: [1, 1, 1],
      filename: "test.pdf",
    };
    const short = await createAuditReportPdf({
      ...base,
      rows: Array.from({ length: 24 }, () => ["Aug 2", "Store / short-id", "auditor@perk.test"]),
    });
    const long = await createAuditReportPdf({
      ...base,
      rows: Array.from({ length: 24 }, (_, index) => [
        "Aug 2, 2026, 12:30 AM",
        `Store / 12345678-1234-1234-1234-1234567890${String(index).padStart(2, "0")} ${"with complete record context ".repeat(6)}`,
        "a-very-long-auditor-email-address@operations.perktoday.example.com",
      ]),
    });

    expect(long.getNumberOfPages()).toBeGreaterThan(short.getNumberOfPages());
    warning.mockRestore();
    vi.unstubAllGlobals();
  });
});
