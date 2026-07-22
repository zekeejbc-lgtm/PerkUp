export type SubscriptionInvoicePdfData = {
  invoice: {
    id: string;
    status: string;
    createdAt: string;
    dueAt: string;
    periodStart: string;
    periodEnd: string;
    amountCentavos: number;
    currency: string;
    paymentUrl: string | null;
    referenceNumber: string | null;
    livemode: boolean;
    paidAt: string | null;
    paymentMethod: string | null;
    paymentId: string | null;
    grossAmountCentavos: number | null;
  };
  subscription: {
    planId: string | null;
    billingEmail: string | null;
    intervalDays: number | null;
    gracePeriodDays: number | null;
  };
  business: {
    name: string;
    address: string | null;
    contact: string | null;
  };
};

const BRAND = {
  ink: [23, 27, 31] as const,
  teal: [27, 86, 96] as const,
  gold: [236, 171, 58] as const,
  paleGold: [255, 248, 229] as const,
  paleTeal: [235, 246, 246] as const,
  gray: [102, 112, 122] as const,
  line: [222, 226, 230] as const,
  white: [255, 255, 255] as const,
};

const invoiceNumber = (id: string) => `PU-${id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;

const formatPdfDate = (value: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatPdfMoney = (centavos: number, currency = "PHP") => {
  const amount = Number.isFinite(centavos) ? centavos / 100 : 0;
  return `${currency.toUpperCase()} ${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const titleCase = (value: string | null) => value
  ? value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
  : "Not available";

const imageAsDataUrl = async (path: string) => {
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Could not load invoice logo (${response.status})`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read invoice logo"));
    reader.readAsDataURL(blob);
  });
};

export async function downloadSubscriptionInvoicePdf(data: SubscriptionInvoicePdfData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { invoice, subscription, business } = data;
  const documentNumber = invoiceNumber(invoice.id);
  const isPaid = invoice.status === "paid";
  const totalCentavos = isPaid && invoice.grossAmountCentavos
    ? invoice.grossAmountCentavos
    : invoice.amountCentavos;
  const planName = subscription.planId
    ? `${titleCase(subscription.planId)} subscription`
    : "PerkUp subscription";

  doc.setProperties({
    title: `PerkUp ${isPaid ? "Receipt" : "Invoice"} ${documentNumber}`,
    subject: `${planName} for ${business.name}`,
    author: "PerkUp",
    creator: "PerkUp Billing",
  });

  // Branded document header.
  doc.setFillColor(...BRAND.ink);
  doc.rect(0, 0, 210, 43, "F");
  doc.setFillColor(...BRAND.gold);
  doc.rect(0, 40.5, 210, 2.5, "F");
  doc.setFillColor(...BRAND.white);
  doc.roundedRect(14, 8, 27, 27, 4, 4, "F");
  try {
    const logo = await imageAsDataUrl("/icons/icon-192.png");
    doc.addImage(logo, "PNG", 17, 11, 21, 21);
  } catch (error) {
    console.warn("Invoice logo could not be embedded", error);
    doc.setTextColor(...BRAND.teal);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("P", 22.5, 25.5);
  }
  doc.setTextColor(...BRAND.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("SUBSCRIPTION BILLING", 47, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("PerkUp merchant services", 47, 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(isPaid ? "PAYMENT RECEIPT" : "SUBSCRIPTION INVOICE", 196, 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(documentNumber, 196, 25, { align: "right" });

  // Status and document metadata.
  const statusText = isPaid ? "PAID" : "PAYMENT DUE";
  const statusBackground = isPaid ? BRAND.paleTeal : BRAND.paleGold;
  const statusForeground = isPaid ? BRAND.teal : BRAND.ink;
  doc.setFillColor(statusBackground[0], statusBackground[1], statusBackground[2]);
  doc.roundedRect(14, 50, 42, 9, 4.5, 4.5, "F");
  doc.setTextColor(statusForeground[0], statusForeground[1], statusForeground[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(statusText, 35, 55.8, { align: "center" });
  if (!invoice.livemode) {
    doc.setFillColor(255, 237, 190);
    doc.roundedRect(60, 50, 34, 9, 4.5, 4.5, "F");
    doc.setTextColor(142, 91, 0);
    doc.text("TEST MODE", 77, 55.8, { align: "center" });
  }
  doc.setTextColor(...BRAND.gray);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Issued: ${formatPdfDate(invoice.createdAt)}`, 196, 53, { align: "right" });
  doc.text(`Due: ${formatPdfDate(invoice.dueAt)}`, 196, 58, { align: "right" });

  // Merchant and customer details.
  doc.setTextColor(...BRAND.gray);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("FROM", 14, 70);
  doc.text("BILL TO", 109, 70);
  doc.setTextColor(...BRAND.ink);
  doc.setFontSize(11);
  doc.text("PerkUp", 14, 77);
  doc.text(business.name || "PerkUp merchant", 109, 77);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.gray);
  const merchantLines = [
    "Tagum City, Davao del Norte, Philippines",
    "perkup.shop@youthserviceph.org | 0962 232 8290",
    "www.perktoday.com",
  ];
  doc.text(merchantLines, 14, 83, { lineHeightFactor: 1.55 });
  const billToLines = [
    business.address || "Business address not provided",
    subscription.billingEmail || "Billing email not provided",
    business.contact ? `Contact: ${business.contact}` : "Contact number not provided",
  ];
  doc.text(billToLines.map((line) => doc.splitTextToSize(line, 87)).flat(), 109, 83, { lineHeightFactor: 1.45 });

  // Subscription line item table.
  const tableY = 105;
  doc.setFillColor(...BRAND.ink);
  doc.roundedRect(14, tableY, 182, 10, 2, 2, "F");
  doc.setTextColor(...BRAND.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DESCRIPTION", 18, tableY + 6.4);
  doc.text("QTY", 145, tableY + 6.4, { align: "center" });
  doc.text("AMOUNT", 192, tableY + 6.4, { align: "right" });
  doc.setTextColor(...BRAND.ink);
  doc.setFontSize(9.5);
  doc.text(planName, 18, tableY + 18);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...BRAND.gray);
  doc.setFontSize(8);
  const accessDays = subscription.intervalDays || 30;
  doc.text(`${accessDays}-day portal access and plan features`, 18, tableY + 24);
  doc.setTextColor(...BRAND.ink);
  doc.setFontSize(9);
  doc.text("1", 145, tableY + 20, { align: "center" });
  doc.text(formatPdfMoney(invoice.amountCentavos, invoice.currency), 192, tableY + 20, { align: "right" });
  doc.setDrawColor(...BRAND.line);
  doc.line(14, tableY + 30, 196, tableY + 30);

  const periodText = `${formatPdfDate(invoice.periodStart)} - ${formatPdfDate(invoice.periodEnd)}`;
  doc.setTextColor(...BRAND.gray);
  doc.setFontSize(8.5);
  doc.text("Billing period", 18, tableY + 38);
  doc.setTextColor(...BRAND.ink);
  doc.text(periodText, 54, tableY + 38);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(isPaid ? "TOTAL PAID" : "TOTAL DUE", 145, tableY + 42, { align: "right" });
  doc.setTextColor(...BRAND.teal);
  doc.setFontSize(14);
  doc.text(formatPdfMoney(totalCentavos, invoice.currency), 192, tableY + 42, { align: "right" });

  // Payment and reference details.
  const detailsY = 166;
  doc.setFillColor(247, 249, 250);
  doc.roundedRect(14, detailsY, 182, 42, 3, 3, "F");
  doc.setTextColor(...BRAND.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Payment details", 19, detailsY + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.gray);
  doc.text("PayMongo reference", 19, detailsY + 17);
  doc.text("Payment method", 19, detailsY + 24);
  doc.text(isPaid ? "Paid on" : "Payment deadline", 19, detailsY + 31);
  doc.text("Payment ID", 109, detailsY + 17);
  doc.text("Invoice status", 109, detailsY + 24);
  doc.text("Grace period", 109, detailsY + 31);
  doc.setTextColor(...BRAND.ink);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.referenceNumber || "Pending", 56, detailsY + 17);
  doc.text(isPaid ? titleCase(invoice.paymentMethod) : "PayMongo payment link", 56, detailsY + 24);
  doc.text(formatPdfDate(isPaid ? invoice.paidAt : invoice.dueAt), 56, detailsY + 31);
  doc.text(invoice.paymentId || "Pending", 138, detailsY + 17);
  doc.text(titleCase(invoice.status), 138, detailsY + 24);
  doc.text(`${subscription.gracePeriodDays ?? 0} day(s)`, 138, detailsY + 31);

  // Payment instructions or receipt confirmation.
  const noteY = 216;
  doc.setFillColor(statusBackground[0], statusBackground[1], statusBackground[2]);
  doc.roundedRect(14, noteY, 182, 32, 3, 3, "F");
  doc.setTextColor(statusForeground[0], statusForeground[1], statusForeground[2]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(isPaid ? "Payment confirmed" : "How to pay", 19, noteY + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.3);
  const note = isPaid
    ? "PayMongo confirmed this payment for the exact invoice amount. Your PerkUp subscription access is updated automatically after confirmation. Keep this document for your records."
    : "Open the secure PayMongo payment page, confirm that the amount matches this invoice, and select an available method such as QR Ph. Access is updated automatically only after PayMongo confirms the exact payment amount.";
  doc.text(doc.splitTextToSize(note, 171), 19, noteY + 16, { lineHeightFactor: 1.45 });
  if (!isPaid && invoice.paymentUrl) {
    doc.setTextColor(...BRAND.teal);
    doc.setFont("helvetica", "bold");
    doc.textWithLink("Open secure PayMongo payment page", 19, noteY + 27.5, { url: invoice.paymentUrl });
  }

  if (!invoice.livemode) {
    doc.setFillColor(255, 244, 214);
    doc.rect(14, 253, 182, 11, "F");
    doc.setTextColor(142, 91, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.text("TEST MODE: No live charge was collected. This document is for testing only.", 105, 259.8, { align: "center" });
  }

  // Legal/support footer.
  doc.setDrawColor(...BRAND.line);
  doc.line(14, 271, 196, 271);
  doc.setTextColor(...BRAND.gray);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.3);
  const footer = "This system-generated billing statement records a PerkUp subscription charge or payment. It is not a VAT official receipt or tax invoice. For billing assistance or an official tax document, contact perkup.shop@youthserviceph.org.";
  doc.text(doc.splitTextToSize(footer, 155), 14, 277, { lineHeightFactor: 1.35 });
  doc.setFont("helvetica", "bold");
  doc.text("Page 1 of 1", 196, 277, { align: "right" });
  doc.text(documentNumber, 196, 282, { align: "right" });

  const filename = `PerkUp-${isPaid ? "Receipt" : "Invoice"}-${documentNumber}.pdf`;
  doc.save(filename);
}
