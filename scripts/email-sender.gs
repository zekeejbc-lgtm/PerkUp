var EMAIL_CONFIG = {
  systemName: "PerkUp",
  senderName: "PerkUp",
  websiteLink: "https://www.perktoday.com/",
  logoUrl: "https://www.perktoday.com/icons/perkup-wordmark-light-transparent.png?v=20260625-brand",
  contactEmail: "perkup.shop@youthserviceph.org",
  contactPhone: "0962 232 8290",
  contactPhoneLink: "+639622328290",
  contactAddress: "Tagum City, Davao del Norte, Philippines"
};

var EMAIL_OTP_TTL_SECONDS = 10 * 60;
var EMAIL_OTP_MAX_ATTEMPTS = 5;

function requestEmailOtp(recipientEmail, userName, purpose) {
  validateEmailInput_(recipientEmail, userName || "PerkUp user");

  var normalizedPurpose = normalizeEmailOtpPurpose_(purpose);
  var otpCode = generateOtpCode_();
  var otpToken = Utilities.getUuid();
  var cache = CacheService.getScriptCache();

  cache.put(
    getEmailOtpCacheKey_(otpToken),
    JSON.stringify({
      recipientEmail: normalizeEmail_(recipientEmail),
      purpose: normalizedPurpose,
      otpCode: otpCode,
      attempts: 0,
      createdAt: new Date().toISOString()
    }),
    EMAIL_OTP_TTL_SECONDS
  );

  var emailResult = sendOtpEmail(recipientEmail, userName || "PerkUp user", otpCode);

  return {
    otpToken: otpToken,
    expiresInSeconds: EMAIL_OTP_TTL_SECONDS,
    referenceId: emailResult.referenceId
  };
}

function verifyEmailOtp(otpToken, otpCode, recipientEmail, purpose) {
  if (!otpToken) throw new Error("otpToken is required.");
  if (!otpCode) throw new Error("otpCode is required.");

  var cache = CacheService.getScriptCache();
  var cacheKey = getEmailOtpCacheKey_(otpToken);
  var cachedValue = cache.get(cacheKey);

  if (!cachedValue) {
    throw new Error("OTP expired or invalid. Request a new code.");
  }

  var otpRecord = JSON.parse(cachedValue);
  var normalizedEmail = normalizeEmail_(recipientEmail);
  var normalizedPurpose = normalizeEmailOtpPurpose_(purpose);

  if (otpRecord.recipientEmail !== normalizedEmail || otpRecord.purpose !== normalizedPurpose) {
    throw new Error("OTP does not match this email request.");
  }

  if (otpRecord.attempts >= EMAIL_OTP_MAX_ATTEMPTS) {
    cache.remove(cacheKey);
    throw new Error("Too many OTP attempts. Request a new code.");
  }

  if (String(otpRecord.otpCode) !== String(otpCode).trim()) {
    otpRecord.attempts += 1;
    cache.put(cacheKey, JSON.stringify(otpRecord), EMAIL_OTP_TTL_SECONDS);
    throw new Error("Invalid OTP code.");
  }

  cache.remove(cacheKey);

  return {
    verified: true,
    recipientEmail: normalizedEmail,
    purpose: normalizedPurpose
  };
}

function sendOtpEmail(recipientEmail, userName, otpCode) {
  validateEmailInput_(recipientEmail, userName);

  if (!otpCode) {
    otpCode = generateOtpCode_();
  }

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: "Your PerkUp OTP Code",
    userName: userName,
    heading: "Hello " + userName + ",",
    introText: "Use the one-time password below to continue verifying your account.",
    secondaryText: "This code is time-sensitive. If you did not request it, you can safely ignore this email.",
    otpCode: otpCode,
    buttonText: "Open PerkUp",
    showButton: true,
    plainText: "Your PerkUp OTP code is: " + otpCode
  });
}

function sendConfirmationEmail(recipientEmail, userName, confirmationLink) {
  validateEmailInput_(recipientEmail, userName);

  if (!confirmationLink) {
    throw new Error("confirmationLink is required.");
  }

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: "Confirm your PerkUp email",
    userName: userName,
    heading: "Hello " + userName + ",",
    introText: "Please confirm your email address to finish setting up your PerkUp account.",
    secondaryText: "Confirming your email helps us keep your account secure and ready for rewards updates.",
    buttonText: "Confirm Email",
    buttonLink: confirmationLink,
    showButton: true,
    plainText: "Confirm your email by opening this link: " + confirmationLink
  });
}

function sendStoreCreatedEmail(recipientEmail, userName, store, loginLink, requirePasswordChange) {
  validateEmailInput_(recipientEmail, userName);
  store = store || {};

  var storeName = String(store.name || "").trim();
  if (!storeName) {
    throw new Error("store.name is required.");
  }

  var safeLoginLink = getStoreOwnerLoginLink_(loginLink);
  var initialPaymentRequired = store.initialPaymentRequired === true;
  var initialPaymentPaid = String(store.initialPaymentStatus || "") === "paid";
  var amountDue = Number(store.amountDue || 0);
  var formattedAmountDue = "PHP " + (amountDue > 0 ? amountDue : 0).toFixed(2);
  var passwordMessage = requirePasswordChange
    ? "This secure button can be used once. After signing you in, PerkUp will require you to create a private password before opening the store portal."
    : "This secure button can be used once to sign in. Afterward, use the regular store portal login with your account credentials.";

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: initialPaymentRequired ? "Payment required to activate " + storeName : storeName + " is ready on PerkUp",
    userName: userName,
    heading: initialPaymentRequired ? "Your store was created. Payment is now due." : "Your store is ready, " + userName + "!",
    introText: initialPaymentRequired
      ? "Your first subscription payment of " + formattedAmountDue + " must be paid through PayMongo before " + storeName + " can be accessed or shown publicly."
      : "Your PerkUp store account has been created successfully. Here are the details currently registered for your store.",
    secondaryText: initialPaymentRequired
      ? "Open the store portal to use the secure PayMongo payment link. Your " + String(Number(store.billingIntervalDays || 30)) + "-day subscription starts only after payment is confirmed. " + passwordMessage
      : (initialPaymentPaid ? "The initial payment was marked paid by a PerkUp administrator. A separate invoice receipt has also been sent. " : "") + passwordMessage,
    store: {
      name: storeName,
      location: String(store.location || "").trim(),
      subscriptionLevel: String(store.subscriptionLevel || "").trim(),
      paymentSchedule: String(store.paymentSchedule || "").trim(),
      subscriptionStart: formatPhilippineDateTime_(store.subscriptionStart),
      subscriptionEnd: formatPhilippineDateTime_(store.subscriptionEnd),
      logoUrl: String(store.logoUrl || "").trim()
    },
    buttonText: "Open Store Portal",
    buttonLink: safeLoginLink,
    showButton: true,
    plainText:
      storeName + " is ready on PerkUp.\n" +
      (store.location ? "Location: " + store.location + "\n" : "") +
      (store.subscriptionLevel ? "Subscription: " + store.subscriptionLevel + "\n" : "") +
      (initialPaymentRequired ? "PAYMENT DUE: " + formattedAmountDue + ". Store access and public listing remain disabled until payment is confirmed.\n" : "") +
      (initialPaymentPaid ? "Initial payment: Paid (a separate receipt was sent).\n" : "") +
      passwordMessage + "\nLog in: " + safeLoginLink
  });
}

function sendStaffCreatedEmail(recipientEmail, userName, storeName, loginLink, requirePasswordChange) {
  validateEmailInput_(recipientEmail, userName);

  var normalizedStoreName = String(storeName || "your store").trim();
  var safeLoginLink = getStaffLoginLink_(loginLink);
  var passwordMessage = requirePasswordChange
    ? "This secure button can be used once. After signing you in, PerkUp will require you to create a private password before opening the staff portal."
    : "This secure button can be used once to sign in. Afterward, use the regular staff portal login with your account credentials.";

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: "Your " + normalizedStoreName + " staff account is ready",
    userName: userName,
    heading: "Your staff account is ready, " + userName + "!",
    introText: "You now have PerkUp staff access for " + normalizedStoreName + ".",
    secondaryText: passwordMessage,
    buttonText: "Open Staff Portal",
    buttonLink: safeLoginLink,
    showButton: true,
    plainText:
      "Your PerkUp staff account for " + normalizedStoreName + " is ready.\n" +
      passwordMessage + "\nLog in: " + safeLoginLink
  });
}

function sendApplicationReceivedEmail(recipientEmail, userName, application) {
  validateEmailInput_(recipientEmail, userName);
  application = application || {};

  var trackingNumber = String(application.trackingNumber || "").trim();
  var businessName = String(application.businessName || "your business").trim();
  if (!trackingNumber) {
    throw new Error("application.trackingNumber is required.");
  }

  var trackingLink = EMAIL_CONFIG.websiteLink.replace(/\/+$/, "") + "/?track=true";
  var subscriptionLevel = String(application.subscriptionLevel || "").trim();

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: "We received your PerkUp partner application",
    userName: userName,
    heading: "Application received, " + userName + ".",
    introText: "Thanks for applying to add " + businessName + " as a PerkUp partner store. Keep this application code for status updates.",
    secondaryText: "We will review your application and contact you through this email when there is an update.",
    application: {
      trackingNumber: trackingNumber,
      businessName: businessName,
      subscriptionLevel: subscriptionLevel
    },
    buttonText: "Track Application",
    buttonLink: trackingLink,
    showButton: true,
    plainText:
      "We received your PerkUp partner application for " + businessName + ".\n" +
      "Application code: " + trackingNumber + "\n" +
      (subscriptionLevel ? "Subscription: " + subscriptionLevel + "\n" : "") +
      "Track your application: " + trackingLink
  });
}

function sendFeedbackReceivedEmail(recipientEmail, userName, feedback) {
  validateEmailInput_(recipientEmail, userName);
  feedback = feedback || {};

  var referenceNumber = String(feedback.referenceNumber || "").trim();
  if (!referenceNumber) {
    throw new Error("feedback.referenceNumber is required.");
  }

  var trackingLink = String(feedback.trackingLink || "").trim() ||
    EMAIL_CONFIG.websiteLink.replace(/\/+$/, "") + "/feedback?reference=" + encodeURIComponent(referenceNumber) + "#lookup";
  var category = String(feedback.category || "general").replace(/_/g, " ");

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: "We received your PerkUp feedback",
    userName: userName,
    heading: "Feedback received, " + userName + ".",
    introText: "Thank you for helping us improve PerkUp. Keep this reference number to follow our progress.",
    secondaryText: "You can use the feedback lookup tool at any time to see its current status and our public response.",
    feedback: {
      referenceNumber: referenceNumber,
      category: category,
      message: String(feedback.message || "").trim()
    },
    buttonText: "Track Feedback",
    buttonLink: trackingLink,
    showButton: true,
    plainText:
      "We received your PerkUp feedback.\n" +
      "Reference number: " + referenceNumber + "\n" +
      "Type: " + category + "\n" +
      "Track your feedback: " + trackingLink
  });
}

function sendSubscriptionPaymentDueEmail(recipientEmail, userName, invoice) {
  validateEmailInput_(recipientEmail, userName);
  invoice = invoice || {};

  var paymentLink = String(invoice.paymentLink || "").trim();
  var referenceNumber = String(invoice.referenceNumber || "").trim();
  var amountCentavos = Number(invoice.amountCentavos || 0);
  if (!/^https:\/\//i.test(paymentLink)) throw new Error("A secure paymentLink is required.");
  if (!referenceNumber) throw new Error("invoice.referenceNumber is required.");
  if (!isFinite(amountCentavos) || amountCentavos < 100) throw new Error("A valid invoice amount is required.");

  var currency = String(invoice.currency || "PHP").toUpperCase();
  var formattedAmount = currency + " " + (amountCentavos / 100).toFixed(2);
  var dueDate = formatPhilippineDateTime_(invoice.dueAt);
  var testMode = invoice.testMode === true;
  var initialPayment = invoice.initialPayment === true;
  var documentNumber = getSubscriptionDocumentNumber_(invoice);
  var invoiceDetails = {
    documentNumber: documentNumber,
    status: "Payment due",
    storeName: String(invoice.storeName || "Your store").trim(),
    planName: String(invoice.planName || "PerkUp subscription").trim(),
    amount: formattedAmount,
    dueDate: dueDate,
    referenceNumber: referenceNumber,
    testMode: testMode
  };

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: (testMode ? "[TEST] " : "") + "Your PerkUp payment link is ready",
    userName: userName,
    heading: "Your secure payment link is ready, " + userName + ".",
    introText: initialPayment
      ? "Your first subscription payment is due and must be paid before your PerkUp store can be accessed or shown publicly. Use the secure PayMongo page below to complete payment."
      : "A secure PayMongo payment page is ready for your next PerkUp subscription cycle. Open it and select QR Ph to complete payment.",
    secondaryText: testMode
      ? "This is a PayMongo test-mode link and cannot collect real funds. Live billing will remain disabled until the merchant account is fully verified."
      : initialPayment
      ? "Once PayMongo confirms payment, your " + String(Number(invoice.intervalDays || 30)) + "-day subscription begins and PerkUp automatically activates your portal access."
      : "Once PayMongo confirms payment, PerkUp automatically extends your portal access for another " + String(Number(invoice.intervalDays || 30)) + " days.",
    invoice: invoiceDetails,
    buttonText: testMode ? "Open Test Payment Page" : "Pay with PayMongo",
    buttonLink: paymentLink,
    showButton: true,
    plainText:
      (testMode ? "TEST MODE - no real payment will be collected.\n" : "") +
      "Your PerkUp subscription payment is due.\n" +
      "Store: " + String(invoice.storeName || "Your store") + "\n" +
      "Amount: " + formattedAmount + "\n" +
      "Due: " + dueDate + "\n" +
      "Reference: " + referenceNumber + "\n" +
      "Pay here: " + paymentLink,
    attachments: [createSubscriptionDocumentPdf_(invoiceDetails, "invoice")]
  });
}

function sendSubscriptionPaymentReminderEmail(recipientEmail, userName, invoice) {
  validateEmailInput_(recipientEmail, userName);
  invoice = invoice || {};
  var paymentLink = String(invoice.paymentLink || "").trim();
  var referenceNumber = String(invoice.referenceNumber || "").trim();
  var amountCentavos = Number(invoice.amountCentavos || 0);
  if (!/^https:\/\//i.test(paymentLink)) throw new Error("A secure paymentLink is required.");
  if (!referenceNumber) throw new Error("invoice.referenceNumber is required.");
  if (!isFinite(amountCentavos) || amountCentavos < 100) throw new Error("A valid invoice amount is required.");

  var currency = String(invoice.currency || "PHP").toUpperCase();
  var formattedAmount = currency + " " + (amountCentavos / 100).toFixed(2);
  var noticeType = String(invoice.noticeType || "payment_overdue");
  var initialReminder = noticeType === "initial_payment_reminder_3d" || noticeType === "initial_payment_reminder_5d" || noticeType === "initial_payment_deletion_warning";
  var frozen = noticeType === "access_frozen" || initialReminder;
  var deletionWarning = noticeType === "initial_payment_deletion_warning";
  var testMode = invoice.testMode === true;
  var invoiceDetails = {
    documentNumber: getSubscriptionDocumentNumber_(invoice),
    status: initialReminder ? "Activation pending - payment outstanding" : frozen ? "Access frozen - payment outstanding" : "Overdue - grace period active",
    storeName: String(invoice.storeName || "Your store").trim(),
    planName: String(invoice.planName || "PerkUp subscription").trim(),
    amount: formattedAmount,
    dueDate: formatPhilippineDateTime_(invoice.dueAt),
    graceEndsAt: formatPhilippineDateTime_(invoice.graceEndsAt),
    referenceNumber: referenceNumber,
    testMode: testMode
  };

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: (testMode ? "[TEST] " : "") + (deletionWarning ? "Final notice: pay to keep your PerkUp store" : initialReminder ? "Reminder: payment required to activate your PerkUp store" : frozen ? "PerkUp access frozen - payment required" : "PerkUp payment overdue - grace period active"),
    userName: userName,
    heading: frozen ? "Your PerkUp access is temporarily frozen." : "Your PerkUp payment is overdue.",
    introText: deletionWarning
      ? "Your store has not received its first subscription payment. Pay now to activate it; unpaid stores are automatically deleted 15 days after creation."
      : initialReminder
      ? "Your store is still frozen because its first subscription payment has not been paid. Pay now to activate access and public listing."
      : frozen
      ? "Your grace period has ended. Use the secure PayMongo page below to settle the outstanding subscription invoice."
      : "Your subscription is now in its grace period. Please settle the invoice before the grace period ends to avoid an interruption.",
    secondaryText: testMode
      ? "This is a test-mode notice. No real funds will be collected."
      : "PayMongo will notify PerkUp after a successful payment, and access will reactivate automatically.",
    invoice: invoiceDetails,
    buttonText: testMode ? "Open Test Payment Page" : "Pay and Restore Access",
    buttonLink: paymentLink,
    showButton: true,
    plainText:
      (testMode ? "TEST MODE - no real payment will be collected.\n" : "") +
      (frozen ? "Your PerkUp access is frozen.\n" : "Your PerkUp payment is overdue.\n") +
      "Store: " + invoiceDetails.storeName + "\n" +
      "Amount: " + formattedAmount + "\n" +
      "Due: " + invoiceDetails.dueDate + "\n" +
      "Reference: " + referenceNumber + "\n" +
      "Pay here: " + paymentLink,
    attachments: [createSubscriptionDocumentPdf_(invoiceDetails, "invoice")]
  });
}

function sendSubscriptionPaymentReceivedEmail(recipientEmail, userName, invoice) {
  validateEmailInput_(recipientEmail, userName);
  invoice = invoice || {};
  var amountCentavos = Number(invoice.grossAmountCentavos || invoice.amountCentavos || 0);
  if (!isFinite(amountCentavos) || amountCentavos < 100) throw new Error("A valid paid amount is required.");
  var currency = String(invoice.currency || "PHP").toUpperCase();
  var formattedAmount = currency + " " + (amountCentavos / 100).toFixed(2);
  var testMode = invoice.testMode === true;
  var adminConfirmed = invoice.adminConfirmed === true;
  var invoiceDetails = {
    documentNumber: getSubscriptionDocumentNumber_(invoice),
    status: "Paid",
    storeName: String(invoice.storeName || "Your store").trim(),
    planName: String(invoice.planName || "PerkUp subscription").trim(),
    amount: formattedAmount,
    dueDate: formatPhilippineDateTime_(invoice.dueAt),
    paidAt: formatPhilippineDateTime_(invoice.paidAt),
    renewedUntil: formatPhilippineDateTime_(invoice.renewedUntil),
    paymentMethod: String(invoice.paymentMethod || "PayMongo").replace(/_/g, " "),
    referenceNumber: String(invoice.referenceNumber || "").trim(),
    testMode: testMode
  };

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: (testMode ? "[TEST] " : "") + "PerkUp payment receipt - subscription active",
    userName: userName,
    heading: "Payment received. Your access is active.",
    introText: adminConfirmed
      ? "A PerkUp administrator confirmed your initial subscription payment. Your subscription is active from the paid date shown on the attached receipt."
      : "PayMongo confirmed your subscription payment and PerkUp automatically renewed your access.",
    secondaryText: "Keep the attached receipt for your records. You can also review payment history from your PerkUp subscription page.",
    invoice: invoiceDetails,
    buttonText: "Open PerkUp",
    buttonLink: EMAIL_CONFIG.websiteLink.replace(/\/+$/, "") + "/owner/subscription",
    showButton: true,
    plainText:
      (testMode ? "TEST MODE - no real funds were collected.\n" : "") +
      "Payment received and access restored.\n" +
      "Store: " + invoiceDetails.storeName + "\n" +
      "Amount: " + formattedAmount + "\n" +
      "Paid: " + invoiceDetails.paidAt + "\n" +
      "Reference: " + invoiceDetails.referenceNumber + "\n" +
      "Renewed until: " + invoiceDetails.renewedUntil,
    attachments: [createSubscriptionDocumentPdf_(invoiceDetails, "receipt")]
  });
}

function sendSubscriptionBillingFailureEmail(recipientEmail, userName, invoice) {
  validateEmailInput_(recipientEmail, userName);
  invoice = invoice || {};
  var invoiceDetails = {
    documentNumber: getSubscriptionDocumentNumber_(invoice),
    status: "Automation needs attention",
    storeName: String(invoice.storeName || "Unknown store").trim(),
    planName: String(invoice.planName || "PerkUp subscription").trim(),
    amount: String(invoice.currency || "PHP").toUpperCase() + " " + (Number(invoice.amountCentavos || 0) / 100).toFixed(2),
    dueDate: formatPhilippineDateTime_(invoice.dueAt),
    referenceNumber: String(invoice.referenceNumber || "Not yet created").trim(),
    testMode: invoice.testMode === true
  };
  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: "PerkUp billing automation requires attention",
    userName: userName,
    heading: "A subscription billing task repeatedly failed.",
    introText: "PerkUp could not complete a billing operation after several attempts. Review the invoice in the admin store subscription screen and use Retry after resolving the cause.",
    secondaryText: "Latest error: " + String(invoice.failureReason || "No error detail was recorded.").slice(0, 500),
    invoice: invoiceDetails,
    buttonText: "Open PerkUp Admin",
    buttonLink: EMAIL_CONFIG.websiteLink.replace(/\/+$/, "") + "/admin",
    showButton: true,
    plainText:
      "PerkUp billing automation requires attention.\n" +
      "Store: " + invoiceDetails.storeName + "\n" +
      "Invoice: " + invoiceDetails.documentNumber + "\n" +
      "Latest error: " + String(invoice.failureReason || "No error detail was recorded.").slice(0, 500)
  });
}

function getSubscriptionDocumentNumber_(invoice) {
  var rawId = String(invoice.invoiceId || invoice.referenceNumber || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return "PU-" + (rawId.substring(0, 12) || Utilities.getUuid().replace(/-/g, "").substring(0, 12).toUpperCase());
}

function createSubscriptionDocumentPdf_(invoice, documentType) {
  var isReceipt = documentType === "receipt";
  var title = isReceipt ? "Subscription Payment Receipt" : "Subscription Invoice";
  var rows = [
    ["Document number", invoice.documentNumber],
    ["Status", invoice.status],
    ["Business", invoice.storeName],
    ["Plan", invoice.planName],
    ["Amount", invoice.amount],
    ["Due", invoice.dueDate],
    ["Paid", invoice.paidAt],
    ["Payment method", invoice.paymentMethod],
    ["PayMongo reference", invoice.referenceNumber],
    ["Access renewed until", invoice.renewedUntil]
  ];
  var rowHtml = rows.filter(function(row) { return row[1]; }).map(function(row) {
    return "<tr><th>" + escapeHtml_(row[0]) + "</th><td>" + escapeHtml_(row[1]) + "</td></tr>";
  }).join("");
  var modeNotice = invoice.testMode ? "<div class='test'>TEST MODE - no real funds were collected.</div>" : "";
  var html = "<!doctype html><html><head><meta charset='UTF-8'><style>" +
    "body{font-family:Arial,sans-serif;color:#171717;padding:42px}h1{margin:0 0 8px;font-size:26px}" +
    ".brand{font-size:18px;font-weight:700;margin-bottom:30px}.meta{color:#666;margin-bottom:24px}" +
    "table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd}" +
    "th{width:38%;color:#555}.test{margin:20px 0;padding:12px;background:#fff3cd;border:1px solid #f0cc65}" +
    ".footer{margin-top:36px;color:#666;font-size:11px;line-height:1.5}</style></head><body>" +
    "<div class='brand'>PerkUp</div><h1>" + escapeHtml_(title) + "</h1>" +
    "<div class='meta'>Issued " + escapeHtml_(formatPhilippineDateTime_(new Date())) + "</div>" + modeNotice +
    "<table>" + rowHtml + "</table>" +
    "<div class='footer'>This system-generated document records a PerkUp subscription charge or payment. " +
    "It is not represented as a VAT official receipt or tax invoice. For questions, contact " + escapeHtml_(EMAIL_CONFIG.contactEmail) + ".</div>" +
    "</body></html>";
  var filename = (isReceipt ? "PerkUp-Receipt-" : "PerkUp-Invoice-") + invoice.documentNumber + ".pdf";
  return HtmlService.createHtmlOutput(html).getBlob().getAs(MimeType.PDF).setName(filename);
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendTestOtpEmail() {
  return sendOtpEmail("user@example.com", "John Doe", "123456");
}

function sendTestConfirmationEmail() {
  return sendConfirmationEmail(
    "user@example.com",
    "John Doe",
    EMAIL_CONFIG.websiteLink + "/confirm-email?token=sample-token"
  );
}

function sendTestStoreCreatedEmail() {
  return sendStoreCreatedEmail(
    "user@example.com",
    "John Doe",
    {
      name: "Downtown Coffee",
      location: "123 Main Street, Manila",
      subscriptionLevel: "Standard",
      paymentSchedule: "Every 30 days",
      subscriptionStart: "June 30, 2026",
      subscriptionEnd: "June 30, 2027",
      logoUrl: EMAIL_CONFIG.logoUrl
    },
    EMAIL_CONFIG.websiteLink,
    true
  );
}

function sendTestApplicationReceivedEmail() {
  return sendApplicationReceivedEmail(
    "user@example.com",
    "John Doe",
    {
      trackingNumber: "PKUP-DOWNT-1234-ABCD",
      businessName: "Downtown Coffee",
      subscriptionLevel: "Standard"
    }
  );
}

function sendSystemEmail_(emailData) {
  var referenceId = createEmailReferenceId_();
  var template = HtmlService.createTemplateFromFile("email");

  template.userName = emailData.userName;
  template.systemName = EMAIL_CONFIG.systemName;
  template.websiteLink = EMAIL_CONFIG.websiteLink;
  template.logoUrl = EMAIL_CONFIG.logoUrl;
  template.contactEmail = EMAIL_CONFIG.contactEmail;
  template.contactPhone = EMAIL_CONFIG.contactPhone;
  template.contactPhoneLink = EMAIL_CONFIG.contactPhoneLink;
  template.contactAddress = EMAIL_CONFIG.contactAddress;
  template.currentYear = new Date().getFullYear();
  template.referenceId = referenceId;
  template.heading = emailData.heading;
  template.introText = emailData.introText;
  template.secondaryText = emailData.secondaryText;
  template.otpCode = emailData.otpCode || "";
  template.store = emailData.store || null;
  template.application = emailData.application || null;
  template.feedback = emailData.feedback || null;
  template.invoice = emailData.invoice || null;
  template.buttonText = emailData.buttonText || "View Dashboard";
  template.buttonLink = emailData.buttonLink || EMAIL_CONFIG.websiteLink;
  template.showButton = emailData.showButton !== false;

  var htmlBody = template.evaluate().getContent();
  var plainText = emailData.plainText || "Please use an HTML-compatible email client to view this message.";

  // UPDATED: Swapped MailApp for GmailApp to bypass external spam filters
  GmailApp.sendEmail(emailData.recipientEmail, emailData.subject, plainText, {
    htmlBody: htmlBody,
    name: EMAIL_CONFIG.senderName,
    attachments: emailData.attachments || []
  });

  Logger.log("Email sent to " + emailData.recipientEmail + " with Ref ID: " + referenceId);

  return {
    recipientEmail: emailData.recipientEmail,
    subject: emailData.subject,
    referenceId: referenceId
  };
}

function validateEmailInput_(recipientEmail, userName) {
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail_(recipientEmail))) {
    throw new Error("A valid recipientEmail is required.");
  }

  if (!userName) {
    throw new Error("userName is required.");
  }
}

function generateOtpCode_() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createEmailReferenceId_() {
  return "SYS-" + Math.floor(100000 + Math.random() * 900000);
}

function normalizeEmail_(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeEmailOtpPurpose_(purpose) {
  var normalizedPurpose = String(purpose || "signup").trim().toLowerCase();
  if (normalizedPurpose !== "signup" && normalizedPurpose !== "email_change") {
    throw new Error("Invalid OTP purpose.");
  }
  return normalizedPurpose;
}

function getEmailOtpCacheKey_(otpToken) {
  return "email-otp:" + String(otpToken || "").trim();
}

function getStoreOwnerLoginLink_(loginLink) {
  var providedLink = String(loginLink || "").trim();
  if (providedLink) return providedLink;
  return EMAIL_CONFIG.websiteLink.replace(/\/+$/, "") + "/owner";
}

function getStaffLoginLink_(loginLink) {
  var providedLink = String(loginLink || "").trim();
  if (providedLink) return providedLink;
  return EMAIL_CONFIG.websiteLink.replace(/\/+$/, "") + "/staff";
}

function formatPhilippineDateTime_(value) {
  if (!value) return "";
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value).trim();
  return Utilities.formatDate(date, "Asia/Manila", "MMM d, yyyy, h:mm a") + " PHT";
}
