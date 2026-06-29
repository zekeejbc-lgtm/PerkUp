export type LegalPageKey = "privacy" | "dataDeletion" | "terms";

export type LegalSection = {
  title: string;
  body: string;
};

export type LegalPageContent = {
  title: string;
  intro: string;
  lastUpdated: string;
  sections: LegalSection[];
};

export type LegalPagesContent = Record<LegalPageKey, LegalPageContent>;

export const LEGAL_PAGE_LABELS: Record<LegalPageKey, string> = {
  privacy: "Privacy Policy",
  dataDeletion: "Data Deletion",
  terms: "Terms of Service",
};

export const DEFAULT_LEGAL_PAGES: LegalPagesContent = {
  privacy: {
    title: "Privacy Policy",
    intro: "This policy explains how PerkUp collects, uses, discloses, retains, and deletes personal data, and the choices available to you.",
    lastUpdated: "2026-06-29",
    sections: [
      { title: "Data we collect", body: "Account data includes your name, email address, username, birthday, profile image, role, and store affiliation. Service data includes loyalty cards, points, stamps, reward and scan activity, feedback, referral redemption, partner applications, and store information you submit.\n\nSecurity and technical data may include authentication and multi-factor records, trusted-device identifiers and expiry times, approximate location used during location-enabled scans, IP address, browser information, and service logs. PerkUp does not receive or store your plain-text password." },
      { title: "Purpose and legal basis", body: "We process data to provide and secure accounts; operate loyalty cards, rewards, referrals, and participating-store features; verify transactions; respond to support and privacy requests; prevent fraud and misuse; improve reliability; and meet legal obligations. Depending on the activity, processing is necessary to provide the service you request, based on your consent, required for legitimate operational and security interests, or required by law." },
      { title: "Disclosure and processors", body: "The relevant store owner and authorized staff can access customer loyalty activity and feedback needed to operate that store's program. We use providers for database hosting and authentication (Supabase), managed image storage (Google Drive), email delivery, maps, and application hosting. These providers process data for service delivery under their own contractual and security terms. We do not sell or rent personal data." },
      { title: "Retention and deletion", body: "Active-account data is retained while needed to provide PerkUp. When a customer completes in-app account deletion, PerkUp permanently deletes the Auth account, profile, customer record, username reservation, QR tokens, referral redemption, scan history, feedback, trusted-device data, and managed profile images. Loyalty-card rows are de-identified: the store and original join date remain with a random deleted-account identifier, while identity, rewards, points, stamps, and promotion progress are erased. Provider backups and security logs may persist for their normal limited retention periods and are not used to restore the account." },
      { title: "Your rights and choices", body: "Subject to applicable law, you may ask to access, correct, object to or restrict processing of, receive a copy of, or delete your personal data, and may withdraw consent where processing relies on consent. You can update available profile fields or use Account Settings to delete a customer account. For another account type or any other privacy request, contact us. We may verify your identity before acting on a request." },
      { title: "Security and children", body: "We use authentication, access controls, row-level database policies, and limited administrative access to protect data. No internet service can guarantee absolute security. PerkUp is not directed to children below the age at which they may independently consent to data processing under applicable law; a parent or guardian should contact us if a child submitted data without appropriate authorization." },
      { title: "Contact", body: "For privacy requests or questions, email perkup.shop@youthserviceph.org. You may also raise a concern with the National Privacy Commission of the Philippines where applicable." },
    ],
  },
  dataDeletion: {
    title: "Data Deletion",
    intro: "Customer accounts can be permanently deleted in Account Settings. Other account types can submit a verified deletion request.",
    lastUpdated: "2026-06-29",
    sections: [
      { title: "Customer self-service process", body: "While signed in, open Account Settings and select Delete account. PerkUp sends a one-time code to the registered email address. After the code is verified, enter the exact username and current password, acknowledge the permanent deletion notice, and confirm. The verification proof expires after five minutes. If any required deletion step fails, the service reports an error and does not claim that the account was deleted." },
      { title: "What is permanently deleted", body: "The process deletes the Supabase Auth login and identity, public profile, customer details, username reservation, active QR tokens, referral redemption, trusted-device information stored in the profile, promotion-scan history, submitted store feedback, and managed profile-image files. The account can no longer be used and deleted rewards cannot be restored." },
      { title: "What is de-identified", body: "Each affected store retains a loyalty-card row containing only its store identifier, the original join date, deletion status, and a newly generated random deleted-account identifier. Your name and account identifier are removed, and points, stamps, rewards, and promotion progress are reset. This marker lets a store preserve a non-identifying operational count without retaining your customer identity." },
      { title: "Other account types and assisted requests", body: "Self-service deletion currently applies to customer accounts. Store-owner, staff, and administrator records may be connected to store operations and require an assisted review. Email perkup.shop@youthserviceph.org from the registered address with the subject “PerkUp Data Deletion Request” and include your name and username. We will verify account ownership and explain any records that must be transferred, de-identified, retained, or deleted." },
      { title: "Backups, logs, and legal retention", body: "Deletion removes live application data described above. Limited provider backups, security logs, fraud-prevention records, or records required by law may remain for their applicable retention periods. They are access-restricted, are not used to reactivate the account, and will be deleted or de-identified when the applicable retention need ends." },
      { title: "Timing and consequences", body: "A successful in-app deletion takes effect immediately in the live service. Assisted requests are normally completed within 30 days after verification, subject to any lawful extension. Deletion is irreversible: account access, loyalty balances, reward eligibility, and history described above cannot be recovered." },
    ],
  },
  terms: {
    title: "Terms of Service",
    intro: "These terms govern your access to and use of PerkUp. By creating an account or using the service, you agree to them.",
    lastUpdated: "2026-06-29",
    sections: [
      { title: "Using PerkUp", body: "You must provide accurate information, keep your account secure, and use PerkUp only for lawful purposes. You are responsible for activity performed through your account and must notify us if you suspect unauthorized access." },
      { title: "Loyalty offers and participating businesses", body: "Participating businesses are responsible for their products, services, promotions, reward rules, availability, and customer interactions. Points and rewards have no cash value unless a specific offer expressly states otherwise. Businesses may correct mistakes or address suspected fraud." },
      { title: "Prohibited conduct", body: "You may not manipulate scans or rewards, impersonate another person, interfere with the service, access accounts or data without permission, upload harmful content, or use PerkUp in a way that violates applicable law or another person’s rights." },
      { title: "Content and intellectual property", body: "You retain ownership of content you submit. You grant PerkUp a limited license to host, process, and display that content as needed to operate the service. PerkUp’s software, branding, and original materials remain protected by applicable intellectual-property laws." },
      { title: "Account closure and deletion", body: "You may stop using PerkUp at any time. Customers may permanently delete an account through Account Settings after email-code, password, and username verification. Deletion immediately ends access and permanently removes rewards and the live personal data described in the Data Deletion page; limited de-identified, backup, security, or legally required records may remain as disclosed there. Other account types must submit an assisted request because their records may be tied to store operations." },
      { title: "Availability and termination", body: "We may change, suspend, or discontinue features and may restrict or terminate accounts that violate these terms, threaten security, or misuse the service. Where appropriate, we may preserve records needed to investigate misuse, resolve disputes, enforce these terms, or comply with law." },
      { title: "Disclaimers and liability", body: "PerkUp is provided on an “as available” basis. To the extent permitted by law, we disclaim implied warranties and are not liable for indirect, incidental, or consequential losses. Nothing in these terms limits rights or liabilities that cannot legally be limited." },
      { title: "Contact", body: "Questions about these terms may be sent to perkup.shop@youthserviceph.org." },
    ],
  },
};

export const cloneLegalPages = (pages: LegalPagesContent): LegalPagesContent =>
  JSON.parse(JSON.stringify(pages));

export const mergeLegalPages = (value?: Partial<LegalPagesContent>): LegalPagesContent => {
  const result = cloneLegalPages(DEFAULT_LEGAL_PAGES);
  (Object.keys(result) as LegalPageKey[]).forEach((key) => {
    if (value?.[key]) result[key] = { ...result[key], ...value[key] };
  });
  return result;
};

export const formatLegalDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(parsed);
};
