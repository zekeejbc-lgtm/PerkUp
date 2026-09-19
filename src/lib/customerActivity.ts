const toDate = (value: any) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};


export const buildScanActivity = (scans: any[]) =>
  scans
    .map((scan) => {
      const date = toDate(scan.issuedAt) || toDate(scan.timestamp) || toDate(scan.createdAt);
      const points = Number(scan.points || 0);
      return {
        id: scan.id,
        action: scan.type === "referral" ? "Referral points" : scan.promotionTitle ? `Earned stamp: ${scan.promotionTitle}` : "Earned points",
        details: {
          ticketNumber: scan.publicId || scan.ticketNumber || null,
          staffId: scan.staffId || null,
          staffName: scan.staffName || null,
          customerId: scan.customerId || null,
          storeId: scan.storeId || null,
          storeName: scan.storeName || null,
          promotionId: scan.promotionId || null,
          promotionTitle: scan.promotionTitle || null,
          status: scan.status || null,
          type: scan.type || null,
          referralCode: scan.referralCode || null,
          scannerLocation: scan.scannerLocation || null,
        },
        isSimulatedDemoScan: scan.isSimulatedDemoScan === true,
        points: points > 0 ? `+${points}` : `${points}`,
        posReferenceNumber: String(scan.posReferenceNumber || "").trim() || null,
        date: date?.toISOString() || null,
      };
    })
    .sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));

