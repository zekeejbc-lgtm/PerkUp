var EMAIL_CONFIG = {
  systemName: "PerkUp",
  senderName: "PerkUp",
  websiteLink: "https://perk-up-navy.vercel.app",
  facebookLink: "https://perk-up-navy.vercel.app",
  logoUrl: "https://perk-up-navy.vercel.app/icons/perkup-logo-source.png"
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

function sendSystemEmail_(emailData) {
  var referenceId = createEmailReferenceId_();
  var template = HtmlService.createTemplateFromFile("email");

  template.userName = emailData.userName;
  template.systemName = EMAIL_CONFIG.systemName;
  template.websiteLink = EMAIL_CONFIG.websiteLink;
  template.facebookLink = EMAIL_CONFIG.facebookLink;
  template.logoUrl = EMAIL_CONFIG.logoUrl;
  template.referenceId = referenceId;
  template.heading = emailData.heading;
  template.introText = emailData.introText;
  template.secondaryText = emailData.secondaryText;
  template.otpCode = emailData.otpCode || "";
  template.buttonText = emailData.buttonText || "View Dashboard";
  template.buttonLink = emailData.buttonLink || EMAIL_CONFIG.websiteLink;
  template.showButton = emailData.showButton !== false;

  var htmlBody = template.evaluate().getContent();
  var plainText = emailData.plainText || "Please use an HTML-compatible email client to view this message.";

  MailApp.sendEmail(emailData.recipientEmail, emailData.subject, plainText, {
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
