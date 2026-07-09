var EMAIL_CONFIG = {
  systemName: "PerkUp",
  senderName: "PerkUp",
  websiteLink: "https://perk-up-navy.vercel.app",
  logoUrl: "https://perk-up-navy.vercel.app/icons/perkup-wordmark-light-transparent.png?v=20260625-brand",
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
  var passwordMessage = requirePasswordChange
    ? "This secure button can be used once. After signing you in, PerkUp will require you to create a private password before opening the store portal."
    : "This secure button can be used once to sign in. Afterward, use the regular store portal login with your account credentials.";

  return sendSystemEmail_({
    recipientEmail: recipientEmail,
    subject: storeName + " is ready on PerkUp",
    userName: userName,
    heading: "Your store is ready, " + userName + "!",
    introText: "Your PerkUp store account has been created successfully. Here are the details currently registered for your store.",
    secondaryText: passwordMessage,
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
  template.buttonText = emailData.buttonText || "View Dashboard";
  template.buttonLink = emailData.buttonLink || EMAIL_CONFIG.websiteLink;
  template.showButton = emailData.showButton !== false;

  var htmlBody = template.evaluate().getContent();
  var plainText = emailData.plainText || "Please use an HTML-compatible email client to view this message.";

  // UPDATED: Swapped MailApp for GmailApp to bypass external spam filters
  GmailApp.sendEmail(emailData.recipientEmail, emailData.subject, plainText, {
    htmlBody: htmlBody,
    name: EMAIL_CONFIG.senderName
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
