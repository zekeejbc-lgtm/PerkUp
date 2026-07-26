export type BillingParty = {
  name: string;
  company?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type BillingLineItem = {
  description: string;
  detail?: string | null;
  quantity?: number;
  amountCentavos: number;
};

export type UniversalBillingDocumentData = {
  document: {
    kind: "invoice" | "receipt";
    number: string;
    status: string;
    issuedAt: string;
    dueAt?: string | null;
    paidAt?: string | null;
    currency: string;
    livemode?: boolean;
  };
  from: BillingParty;
  billTo: BillingParty;
  items: BillingLineItem[];
  totals: {
    subtotalCentavos: number;
    taxCentavos?: number;
    discountCentavos?: number;
    totalCentavos: number;
  };
  payment?: {
    referenceNumber?: string | null;
    method?: string | null;
    paymentId?: string | null;
    paymentUrl?: string | null;
  };
  notes?: string[];
  details?: Array<{ label: string; value: string }>;
  disclaimer?: string;
  filename?: string;
};

export type SubscriptionInvoicePdfData = {
  invoice: {
    id: string;
    publicId?: string | null;
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
    subscriberName?: string | null;
    address: string | null;
    contact: string | null;
  };
};

const BRAND = {
  ink: [27, 27, 27] as const,
  muted: [105, 105, 105] as const,
  line: [226, 226, 226] as const,
  soft: [247, 247, 247] as const,
  white: [255, 255, 255] as const,
  warning: [255, 246, 218] as const,
};

const invoiceNumber = (id: string) => `PU-${id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;

const formatPdfDate = (value?: string | null, includeTime = false) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
};

const formatPdfMoney = (centavos: number, currency = "PHP") => {
  const amount = Number.isFinite(centavos) ? centavos / 100 : 0;
  return `${currency.toUpperCase()} ${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const titleCase = (value?: string | null) => value
  ? value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
  : "Not available";

const imageAsDataUrl = async (path: string) => {
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Could not load billing logo (${response.status})`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read billing logo"));
    reader.readAsDataURL(blob);
  });
};

const partyLines = (party: BillingParty) => [
  party.company,
  party.address,
  party.email,
  party.phone,
  party.website,
].filter((line): line is string => Boolean(line?.trim()));

/**
 * The single PerkUp invoice/receipt renderer. Other billing features should
 * normalize their data into this shape instead of creating a separate design.
 */
export async function downloadBillingDocumentPdf(data: UniversalBillingDocumentData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const { document, from, billTo, items, totals, payment } = data;
  const isReceipt = document.kind === "receipt";
  const currency = document.currency || "PHP";
  const title = isReceipt ? "RECEIPT" : "INVOICE";

  doc.setProperties({
    title: `PerkUp ${titleCase(document.kind)} ${document.number}`,
    subject: `${titleCase(document.status)} billing document for ${billTo.name}`,
    author: "PerkUp",
    creator: "PerkUp Billing",
  });

  // Header: deliberately mirrors the current black-and-white web app.
  try {
    const wordmark = await imageAsDataUrl("/icons/perkup-wordmark-light-transparent.png?v=20260722-theme");
    doc.addImage(wordmark, "PNG", 14, 13, 33, 15, undefined, "FAST");
  } catch (error) {
    console.warn("Billing wordmark could not be embedded", error);
    doc.setTextColor(...BRAND.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("perk.", 14, 24);
  }
  doc.setTextColor(...BRAND.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(title, 196, 21, { align: "right" });
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.muted);
  doc.text(document.number, 196, 27, { align: "right" });
  doc.setDrawColor(...BRAND.ink);
  doc.setLineWidth(0.8);
  doc.line(14, 34, 196, 34);

  // Sender and document metadata.
  doc.setTextColor(...BRAND.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(from.name, 14, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.1);
  doc.setTextColor(...BRAND.muted);
  doc.text(partyLines(from), 14, 50, { lineHeightFactor: 1.5 });

  const metadata = [
    ["DATE", formatPdfDate(document.issuedAt)],
    [isReceipt ? "RECEIPT #" : "INVOICE #", document.number],
    [isReceipt ? "PAID" : "DUE DATE", formatPdfDate(isReceipt ? document.paidAt : document.dueAt)],
  ];
  let metadataY = 42;
  metadata.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.muted);
    doc.text(label, 143, metadataY, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BRAND.ink);
    doc.text(value, 196, metadataY, { align: "right" });
    metadataY += 7;
  });

  // Bill-to block and status.
  doc.setFillColor(...BRAND.ink);
  doc.roundedRect(14, 75, 88, 9, 1.5, 1.5, "F");
  doc.setTextColor(...BRAND.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("BILL TO", 18, 80.8);
  doc.setTextColor(...BRAND.ink);
  doc.setFontSize(10.5);
  doc.text(billTo.name, 18, 91);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(...BRAND.muted);
  doc.text(partyLines(billTo), 18, 97, { lineHeightFactor: 1.5 });

  const status = titleCase(document.status).toUpperCase();
  doc.setFillColor(...BRAND.soft);
  doc.roundedRect(155, 75, 41, 10, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.setTextColor(...BRAND.ink);
  doc.text(status, 175.5, 81.3, { align: "center" });
  // Universal line-item table.
  const tableY = 119;
  doc.setFillColor(...BRAND.ink);
  doc.rect(14, tableY, 182, 10, "F");
  doc.setTextColor(...BRAND.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DESCRIPTION", 18, tableY + 6.4);
  doc.text("QTY", 147, tableY + 6.4, { align: "center" });
  doc.text("AMOUNT", 192, tableY + 6.4, { align: "right" });

  const visibleItems = items.length > 5
    ? [
        ...items.slice(0, 4),
        {
          description: `Additional items (${items.length - 4})`,
          detail: "Combined on this document",
          quantity: items.slice(4).reduce((sum, item) => sum + (item.quantity ?? 1), 0),
          amountCentavos: items.slice(4).reduce((sum, item) => sum + item.amountCentavos, 0),
        },
      ]
    : items;
  let rowY = tableY + 10;
  visibleItems.forEach((item, index) => {
    const rowHeight = 12;
    if (index % 2 === 0) {
      doc.setFillColor(...BRAND.soft);
      doc.rect(14, rowY, 182, rowHeight, "F");
    }
    doc.setTextColor(...BRAND.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(item.description, 112)[0], 18, rowY + 5.2);
    if (item.detail) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.muted);
      doc.text(doc.splitTextToSize(item.detail, 112)[0], 18, rowY + 9.3);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.ink);
    doc.text(String(item.quantity ?? 1), 147, rowY + 7.2, { align: "center" });
    doc.text(formatPdfMoney(item.amountCentavos, currency), 192, rowY + 7.2, { align: "right" });
    rowY += rowHeight;
  });
  const tableBottom = Math.max(rowY, 174);
  doc.setDrawColor(...BRAND.line);
  doc.rect(14, tableY, 182, tableBottom - tableY);
  doc.line(137, tableY, 137, tableBottom);
  doc.line(157, tableY, 157, tableBottom);

  // Notes and totals use the same hierarchy for invoices and receipts.
  const summaryY = tableBottom + 9;
  doc.setTextColor(...BRAND.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(isReceipt ? "PAYMENT NOTE" : "NOTES", 14, summaryY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  const notes = data.notes?.length
    ? data.notes
    : [isReceipt ? "Thank you. Your payment has been recorded." : "Please include the document number with your payment."];
  doc.text(doc.splitTextToSize(notes.map((note, index) => `${index + 1}. ${note}`).join("\n"), 105), 14, summaryY + 6, {
    lineHeightFactor: 1.45,
  });

  const totalRows: Array<[string, number]> = [
    ["Subtotal", totals.subtotalCentavos],
    ...(totals.discountCentavos ? [["Discount", -totals.discountCentavos] as [string, number]] : []),
    ...(totals.taxCentavos ? [["Tax", totals.taxCentavos] as [string, number]] : []),
  ];
  let totalY = summaryY;
  totalRows.forEach(([label, amount]) => {
    doc.setTextColor(...BRAND.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.text(label, 157, totalY, { align: "right" });
    doc.setTextColor(...BRAND.ink);
    doc.text(formatPdfMoney(amount, currency), 196, totalY, { align: "right" });
    totalY += 7;
  });
  doc.setDrawColor(...BRAND.ink);
  doc.setLineWidth(0.5);
  doc.line(127, totalY - 2, 196, totalY - 2);
  doc.setFillColor(...BRAND.ink);
  doc.roundedRect(127, totalY, 69, 13, 2, 2, "F");
  doc.setTextColor(...BRAND.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(isReceipt ? "TOTAL PAID" : "TOTAL DUE", 132, totalY + 8.4);
  doc.text(formatPdfMoney(totals.totalCentavos, currency), 192, totalY + 8.4, { align: "right" });

  // Compact payment/reference area.
  const detailsY = Math.max(summaryY + 35, totalY + 21);
  doc.setFillColor(...BRAND.soft);
  doc.roundedRect(14, detailsY, 182, 29, 3, 3, "F");
  const details = [
    { label: "Payment reference", value: payment?.referenceNumber || "Pending" },
    { label: "Payment method", value: isReceipt ? titleCase(payment?.method) : "Secure PayMongo link" },
    ...(data.details || []),
  ].slice(0, 4);
  details.forEach((detail, index) => {
    const columnX = index % 2 === 0 ? 19 : 109;
    const detailY = detailsY + 9 + Math.floor(index / 2) * 11;
    doc.setTextColor(...BRAND.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(detail.label.toUpperCase(), columnX, detailY);
    doc.setTextColor(...BRAND.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.text(doc.splitTextToSize(detail.value, 78)[0], columnX, detailY + 4.5);
  });

  if (!isReceipt && payment?.paymentUrl) {
    doc.setTextColor(...BRAND.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.textWithLink("PAY SECURELY WITH PAYMONGO  →", 14, detailsY + 38, { url: payment.paymentUrl });
  }

  const footerY = 274;
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.3);
  doc.line(14, footerY, 196, footerY);
  doc.setTextColor(...BRAND.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  const disclaimer = data.disclaimer ||
    "This system-generated billing statement records a PerkUp charge or payment. It is not a VAT official receipt or tax invoice. For billing assistance or an official tax document, contact perkup.shop@youthserviceph.org.";
  doc.text(doc.splitTextToSize(disclaimer, 150), 14, footerY + 5, { lineHeightFactor: 1.35 });
  doc.setFont("helvetica", "bold");
  doc.text("www.perktoday.com", 196, footerY + 5, { align: "right" });
  doc.text(document.number, 196, footerY + 10, { align: "right" });

  const filename = data.filename || `PerkUp-${titleCase(document.kind)}-${document.number}.pdf`;
  doc.save(filename);
}

export async function downloadSubscriptionInvoicePdf(data: SubscriptionInvoicePdfData) {
  const { invoice, subscription, business } = data;
  const isPaid = invoice.status === "paid";
  const isManualPayment = String(invoice.paymentMethod || "").startsWith("manual_") ||
    invoice.paymentMethod === "admin_confirmed";
  const documentNumber = invoice.publicId || invoiceNumber(invoice.id);
  const planName = subscription.planId
    ? `${titleCase(subscription.planId)} subscription`
    : "PerkUp subscription";
  const totalCentavos = isPaid && invoice.grossAmountCentavos
    ? invoice.grossAmountCentavos
    : invoice.amountCentavos;

  return downloadBillingDocumentPdf({
    document: {
      kind: isPaid ? "receipt" : "invoice",
      number: documentNumber,
      status: isPaid ? "paid" : "payment due",
      issuedAt: invoice.createdAt,
      dueAt: invoice.dueAt,
      paidAt: invoice.paidAt,
      currency: invoice.currency,
      livemode: isManualPayment ? undefined : invoice.livemode,
    },
    from: {
      name: "PerkUp",
      address: "Tagum City, Davao del Norte, Philippines",
      email: "perkup.shop@youthserviceph.org",
      phone: "0962 232 8290",
      website: "www.perktoday.com",
    },
    billTo: {
      name: business.subscriberName || business.name || "PerkUp merchant",
      company: business.subscriberName ? business.name : null,
      address: business.address || "Business address not provided",
      email: subscription.billingEmail || "Billing email not provided",
      phone: business.contact || "Contact number not provided",
    },
    items: [{
      description: planName,
      detail: `${subscription.intervalDays || 30}-day portal access and plan features`,
      quantity: 1,
      amountCentavos: invoice.amountCentavos,
    }],
    totals: {
      subtotalCentavos: invoice.amountCentavos,
      totalCentavos,
    },
    payment: {
      referenceNumber: invoice.referenceNumber,
      method: invoice.paymentMethod,
      paymentId: invoice.paymentId,
      paymentUrl: invoice.paymentUrl,
    },
    notes: isPaid
      ? [
        isManualPayment
          ? "A PerkUp administrator recorded this payment from the paid date and reference shown."
          : "PayMongo confirmed this payment and subscription access updated automatically.",
        "Keep this receipt for your records.",
      ]
      : ["Pay through the secure PayMongo page before the due date.", "Access updates after PayMongo confirms the exact amount."],
    details: [
      {
        label: "Subscription plan",
        value: planName,
      },
      {
        label: "Billing period",
        value: `${formatPdfDate(invoice.periodStart)} – ${formatPdfDate(invoice.periodEnd)}`,
      },
      {
        label: isPaid ? "Paid on" : "Grace period",
        value: isPaid ? formatPdfDate(invoice.paidAt, true) : `${subscription.gracePeriodDays ?? 0} day(s)`,
      },
    ],
    filename: `PerkUp-${isPaid ? "Receipt" : "Invoice"}-${documentNumber}.pdf`,
  });
}
