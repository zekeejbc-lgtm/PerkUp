var EMAIL_CONFIG = {
  systemName: "PerkUp",
  senderName: "PerkUp",
  websiteLink: "https://www.perktoday.com/",
  // The opaque badge stays readable when Gmail force-converts the email to dark mode.
  logoUrl: "https://www.perktoday.com/icons/perkup-wordmark-email-safe.png?v=20260726-email-theme",
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
  var initialPayment = invoice.initialPayment === true;
  var documentNumber = getSubscriptionDocumentNumber_(invoice);
  var invoiceDetails = {
    documentNumber: documentNumber,
    status: "Payment due",
    subscriberName: String(invoice.subscriberName || userName || "Store owner").trim(),
    storeName: String(invoice.storeName || "Your store").trim(),
    planName: String(invoice.planName || "PerkUp subscription").trim(),
    amount: formattedAmount,
    dueDate: dueDate,
    referenceNumber: referenceNumber
  };

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: "Your PerkUp payment link is ready",
    userName: userName,
    heading: "Your secure payment link is ready, " + userName + ".",
    introText: initialPayment
      ? "Your first subscription payment is due and must be paid before your PerkUp store can be accessed or shown publicly. Use the secure PayMongo page below to complete payment."
      : "A secure PayMongo payment page is ready for your next PerkUp subscription cycle. Open it and select QR Ph to complete payment.",
    secondaryText: initialPayment
      ? "Once PayMongo confirms payment, your " + String(Number(invoice.intervalDays || 30)) + "-day subscription begins and PerkUp automatically activates your portal access."
      : "Once PayMongo confirms payment, PerkUp automatically extends your portal access for another " + String(Number(invoice.intervalDays || 30)) + " days.",
    invoice: invoiceDetails,
    buttonText: "Pay with PayMongo",
    buttonLink: paymentLink,
    showButton: true,
    plainText:
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
  var invoiceDetails = {
    documentNumber: getSubscriptionDocumentNumber_(invoice),
    status: initialReminder ? "Activation pending - payment outstanding" : frozen ? "Access frozen - payment outstanding" : "Overdue - grace period active",
    subscriberName: String(invoice.subscriberName || userName || "Store owner").trim(),
    storeName: String(invoice.storeName || "Your store").trim(),
    planName: String(invoice.planName || "PerkUp subscription").trim(),
    amount: formattedAmount,
    dueDate: formatPhilippineDateTime_(invoice.dueAt),
    graceEndsAt: formatPhilippineDateTime_(invoice.graceEndsAt),
    referenceNumber: referenceNumber
  };

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: deletionWarning ? "Final notice: pay to keep your PerkUp store" : initialReminder ? "Reminder: payment required to activate your PerkUp store" : frozen ? "PerkUp access frozen - payment required" : "PerkUp payment overdue - grace period active",
    userName: userName,
    heading: frozen ? "Your PerkUp access is temporarily frozen." : "Your PerkUp payment is overdue.",
    introText: deletionWarning
      ? "Your store has not received its first subscription payment. Pay now to activate it; unpaid stores are automatically deleted 15 days after creation."
      : initialReminder
      ? "Your store is still frozen because its first subscription payment has not been paid. Pay now to activate access and public listing."
      : frozen
      ? "Your grace period has ended. Use the secure PayMongo page below to settle the outstanding subscription invoice."
      : "Your subscription is now in its grace period. Please settle the invoice before the grace period ends to avoid an interruption.",
    secondaryText: "PayMongo will notify PerkUp after a successful payment, and access will reactivate automatically.",
    invoice: invoiceDetails,
    buttonText: "Pay and Restore Access",
    buttonLink: paymentLink,
    showButton: true,
    plainText:
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
  var adminConfirmed = invoice.adminConfirmed === true;
  var invoiceDetails = {
    documentNumber: getSubscriptionDocumentNumber_(invoice),
    status: "Paid",
    subscriberName: String(invoice.subscriberName || userName || "Store owner").trim(),
    storeName: String(invoice.storeName || "Your store").trim(),
    planName: String(invoice.planName || "PerkUp subscription").trim(),
    amount: formattedAmount,
    dueDate: formatPhilippineDateTime_(invoice.dueAt),
    paidAt: formatPhilippineDateTime_(invoice.paidAt),
    renewedUntil: formatPhilippineDateTime_(invoice.renewedUntil),
    paymentMethod: String(invoice.paymentMethod || "PayMongo").replace(/_/g, " "),
    referenceNumber: String(invoice.referenceNumber || "").trim()
  };

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: "PerkUp payment receipt - subscription active",
    userName: userName,
    heading: "Payment received. Your access is active.",
    introText: adminConfirmed
      ? "A PerkUp administrator confirmed your subscription payment. Your subscription is active from the paid date shown on the attached receipt."
      : "PayMongo confirmed your subscription payment and PerkUp automatically renewed your access.",
    secondaryText: "Keep the attached receipt for your records. You can also review payment history from your PerkUp subscription page.",
    invoice: invoiceDetails,
    buttonText: "Open PerkUp",
    buttonLink: EMAIL_CONFIG.websiteLink.replace(/\/+$/, "") + "/owner/subscription",
    showButton: true,
    plainText:
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
    subscriberName: String(invoice.subscriberName || userName || "Store owner").trim(),
    storeName: String(invoice.storeName || "Unknown store").trim(),
    planName: String(invoice.planName || "PerkUp subscription").trim(),
    amount: String(invoice.currency || "PHP").toUpperCase() + " " + (Number(invoice.amountCentavos || 0) / 100).toFixed(2),
    dueDate: formatPhilippineDateTime_(invoice.dueAt),
    referenceNumber: String(invoice.referenceNumber || "Not yet created").trim()
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

function sendSubscriptionUpgradeScheduledEmail(recipientEmail, userName, upgrade) {
  return sendSubscriptionUpgradeEmail_(recipientEmail, userName, upgrade, "scheduled");
}

function sendSubscriptionUpgradeAppliedEmail(recipientEmail, userName, upgrade) {
  return sendSubscriptionUpgradeEmail_(recipientEmail, userName, upgrade, "applied");
}

function sendSubscriptionUpgradeCancelledEmail(recipientEmail, userName, upgrade) {
  return sendSubscriptionUpgradeEmail_(recipientEmail, userName, upgrade, "cancelled");
}

function sendSubscriptionUpgradeEmail_(recipientEmail, userName, upgrade, status) {
  validateEmailInput_(recipientEmail, userName);
  upgrade = upgrade || {};
  var currentAmount = Number(upgrade.currentAmountCentavos || 0);
  var targetAmount = Number(upgrade.targetAmountCentavos || 0);
  var difference = Number(upgrade.differenceCentavos || 0);
  if (!isFinite(currentAmount) || currentAmount < 0) throw new Error("A valid current plan amount is required.");
  if (!isFinite(targetAmount) || targetAmount <= currentAmount) throw new Error("A valid target plan amount is required.");
  if (!isFinite(difference) || difference !== targetAmount - currentAmount) throw new Error("The upgrade difference is invalid.");

  var currentPlan = String(upgrade.fromPlanName || "Current plan").trim();
  var targetPlan = String(upgrade.toPlanName || "Upgrade plan").trim();
  var targetDate = formatPhilippineDateTime_(upgrade.targetPeriodStart);
  var currentPrice = "PHP " + (currentAmount / 100).toFixed(2);
  var targetPrice = "PHP " + (targetAmount / 100).toFixed(2);
  var differencePrice = "PHP " + (difference / 100).toFixed(2);
  var ownerLink = EMAIL_CONFIG.websiteLink.replace(/\/+$/, "") + "/owner/subscription";
  var automatic = String(upgrade.renewalMode || "automatic") === "automatic";
  var cancellationReason = String(upgrade.cancellationReason || "").trim();
  var statusCopy = status === "applied"
    ? {
      subject: "Your PerkUp subscription upgrade is active",
      heading: "Your " + targetPlan + " upgrade is now active.",
      intro: "PerkUp verified payment of the matching renewal invoice and applied your new plan.",
      secondary: "Your upgraded features and limits are now available. The paid renewal amount was " + targetPrice + "."
    }
    : status === "cancelled"
    ? {
      subject: "Your PerkUp subscription upgrade was cancelled",
      heading: "Your scheduled upgrade was cancelled.",
      intro: "The planned change from " + currentPlan + " to " + targetPlan + " will not be attached to a future renewal.",
      secondary: "Your current plan and ordinary renewal settings remain unchanged." +
        (cancellationReason ? " Reason: " + cancellationReason : "")
    }
    : {
      subject: "Your PerkUp subscription upgrade is scheduled",
      heading: "Your " + targetPlan + " upgrade is scheduled.",
      intro: "PHP 0.00 was charged today. Your current " + currentPlan + " plan remains active until PerkUp verifies payment of the target renewal.",
      secondary: "The target renewal is " + targetDate + " at " + targetPrice + " (" + differencePrice + " more than your current recurring price)."
    };

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: statusCopy.subject,
    userName: userName,
    heading: statusCopy.heading,
    introText: statusCopy.intro,
    secondaryText: statusCopy.secondary + " Renewal mode remains " + (automatic ? "automatic." : "manual."),
    buttonText: "Review Subscription",
    buttonLink: ownerLink,
    showButton: true,
    plainText:
      statusCopy.heading + "\n" +
      "Status: " + status + "\n" +
      "Current plan: " + currentPlan + " (" + currentPrice + ")\n" +
      "Target plan: " + targetPlan + " (" + targetPrice + ")\n" +
      "Difference: " + differencePrice + "\n" +
      "Charged when scheduled: PHP 0.00\n" +
      "Target renewal: " + targetDate + "\n" +
      (status === "cancelled"
        ? "The upgrade will not be activated.\n"
        : "Activation occurs only after verified renewal payment.\n") +
      (cancellationReason ? "Cancellation reason: " + cancellationReason + "\n" : "") +
      "Terms: " + String(upgrade.termsVersion || "") + "\n" +
      "Review: " + ownerLink
  });
}

function getSubscriptionDocumentNumber_(invoice) {
  var rawId = String(invoice.invoiceId || invoice.referenceNumber || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return "PU-" + (rawId.substring(0, 12) || Utilities.getUuid().replace(/-/g, "").substring(0, 12).toUpperCase());
}

function createSubscriptionDocumentPdf_(invoice, documentType) {
  var isReceipt = documentType === "receipt";
  var title = isReceipt ? "RECEIPT" : "INVOICE";
  var paidOrDueLabel = isReceipt ? "PAID" : "DUE DATE";
  var paidOrDueValue = isReceipt ? invoice.paidAt : invoice.dueDate;
  var note = isReceipt
    ? "Payment confirmed. Keep this receipt for your records."
    : "Please use the secure PayMongo link in your email and include the document number with your payment.";
  var html = "<!doctype html><html><head><meta charset='UTF-8'><style>" +
    "@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;padding:38px 42px;font-family:Arial,sans-serif;color:#1b1b1b;font-size:12px}" +
    ".top{display:table;width:100%;border-bottom:3px solid #1b1b1b;padding-bottom:18px}.brand,.document{display:table-cell;vertical-align:bottom}" +
    ".brand img{display:block;width:98px;height:auto}.document{text-align:right}.document h1{margin:0;font-size:34px;letter-spacing:1px}.number{margin-top:5px;color:#6b6b6b}" +
    ".company{display:table;width:100%;padding:18px 0 26px}.from,.meta{display:table-cell;width:50%;vertical-align:top}.from strong{font-size:15px}.muted{color:#6b6b6b;line-height:1.55}" +
    ".meta{text-align:right}.meta-row{margin-bottom:7px}.meta-label{display:inline-block;width:90px;color:#6b6b6b;font-weight:700}.meta-value{display:inline-block;min-width:150px}" +
    ".bill{width:52%;margin-bottom:24px}.section-title{padding:7px 12px;background:#1b1b1b;color:#fff;font-weight:700;letter-spacing:.4px}.bill-body{padding:12px}.bill-name{font-size:15px;font-weight:700;margin-bottom:6px}" +
    ".status{float:right;margin-top:-58px;padding:7px 16px;border-radius:999px;background:#f3f3f3;font-size:10px;font-weight:700}" +
    "table{width:100%;border-collapse:collapse}.items th{padding:9px 12px;background:#1b1b1b;color:#fff;text-align:left;font-size:10px}.items th:last-child,.items td:last-child{text-align:right}.items td{padding:12px;border-bottom:1px solid #e2e2e2}.items tr:nth-child(even) td{background:#f7f7f7}" +
    ".summary{display:table;width:100%;margin-top:24px}.notes,.totals{display:table-cell;vertical-align:top}.notes{width:58%;padding-right:28px}.notes-title{font-size:10px;font-weight:700;color:#6b6b6b;margin-bottom:8px}.totals{width:42%}.total-row{padding:7px 10px;border-bottom:1px solid #e2e2e2}.total-row span:last-child{float:right}.grand-total{padding:11px 10px;background:#1b1b1b;color:#fff;font-weight:700;font-size:14px}" +
    ".details{display:table;width:100%;margin-top:26px;padding:14px;background:#f7f7f7;border-radius:8px}.detail{display:table-cell;width:50%}.detail-label{color:#6b6b6b;font-size:9px;font-weight:700;text-transform:uppercase}.detail-value{margin-top:5px;font-weight:700}" +
    ".footer{position:absolute;left:42px;right:42px;bottom:34px;border-top:1px solid #e2e2e2;padding-top:11px;color:#6b6b6b;font-size:9px;line-height:1.45}.footer-right{float:right;text-align:right}</style></head><body>" +
    "<div class='top'><div class='brand'><img src='" + escapeHtml_(EMAIL_CONFIG.logoUrl) + "' alt='PerkUp'></div><div class='document'><h1>" + title + "</h1><div class='number'>" + escapeHtml_(invoice.documentNumber) + "</div></div></div>" +
    "<div class='company'><div class='from'><strong>PerkUp</strong><div class='muted'>Tagum City, Davao del Norte, Philippines<br>" + escapeHtml_(EMAIL_CONFIG.contactEmail) + "<br>www.perktoday.com</div></div>" +
    "<div class='meta'><div class='meta-row'><span class='meta-label'>DATE</span><span class='meta-value'>" + escapeHtml_(formatPhilippineDateTime_(new Date())) + "</span></div>" +
    "<div class='meta-row'><span class='meta-label'>" + title + " #</span><span class='meta-value'>" + escapeHtml_(invoice.documentNumber) + "</span></div>" +
    "<div class='meta-row'><span class='meta-label'>" + paidOrDueLabel + "</span><span class='meta-value'>" + escapeHtml_(paidOrDueValue) + "</span></div></div></div>" +
    "<div class='bill'><div class='section-title'>BILL TO</div><div class='bill-body'><div class='bill-name'>" + escapeHtml_(invoice.subscriberName || invoice.storeName) + "</div><div class='muted'>" + escapeHtml_(invoice.storeName) + "</div></div></div>" +
    "<div class='status'>" + escapeHtml_(invoice.status || (isReceipt ? "Paid" : "Payment due")) + "</div>" +
    "<table class='items'><tr><th>DESCRIPTION</th><th style='text-align:center'>QTY</th><th>AMOUNT</th></tr><tr><td><strong>" + escapeHtml_(invoice.planName) + "</strong><div class='muted'>Subscription access and plan features</div></td><td style='text-align:center'>1</td><td>" + escapeHtml_(invoice.amount) + "</td></tr></table>" +
    "<div class='summary'><div class='notes'><div class='notes-title'>" + (isReceipt ? "PAYMENT NOTE" : "NOTES") + "</div>" + escapeHtml_(note) + "</div>" +
    "<div class='totals'><div class='total-row'><span>Subtotal</span><span>" + escapeHtml_(invoice.amount) + "</span></div><div class='grand-total'><span>" + (isReceipt ? "TOTAL PAID" : "TOTAL DUE") + "</span><span style='float:right'>" + escapeHtml_(invoice.amount) + "</span></div></div></div>" +
    "<div class='details'><div class='detail'><div class='detail-label'>Subscription plan</div><div class='detail-value'>" + escapeHtml_(invoice.planName) + "</div></div>" +
    "<div class='detail'><div class='detail-label'>Payment reference</div><div class='detail-value'>" + escapeHtml_(invoice.referenceNumber || "Pending") + "</div></div></div>" +
    "<div class='footer'><div class='footer-right'>www.perktoday.com<br>" + escapeHtml_(invoice.documentNumber) + "</div>This system-generated billing statement records a PerkUp charge or payment.<br>It is not a VAT official receipt or tax invoice. For questions, contact " + escapeHtml_(EMAIL_CONFIG.contactEmail) + ".</div>" +
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
  var remainingDailyRecipientQuota = MailApp.getRemainingDailyQuota();
  if (remainingDailyRecipientQuota < 1) {
    var quotaError = new Error("Google Apps Script email recipient quota is exhausted for the current quota window.");
    quotaError.code = "EMAIL_QUOTA_EXHAUSTED";
    quotaError.remainingDailyRecipientQuota = remainingDailyRecipientQuota;
    throw quotaError;
  }
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
  try {
    GmailApp.sendEmail(emailData.recipientEmail, emailData.subject, plainText, {
      htmlBody: htmlBody,
      name: EMAIL_CONFIG.senderName,
      attachments: emailData.attachments || []
    });
  } catch (sendError) {
    if (/quota|daily limit|too many times/i.test(String(sendError))) {
      sendError.code = "EMAIL_QUOTA_EXHAUSTED";
      try {
        sendError.remainingDailyRecipientQuota = MailApp.getRemainingDailyQuota();
      } catch (quotaReadError) {
        sendError.remainingDailyRecipientQuota = null;
      }
    }
    throw sendError;
  }

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
