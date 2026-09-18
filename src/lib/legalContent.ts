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
    intro: "This policy explains how Perk collects, uses, discloses, retains, and deletes personal data, and the choices available to you.",
    lastUpdated: "2026-08-02",
    sections: [
      { title: "Who controls your data", body: "Personal Information Controller: Youth Service Philippines, operator of Perk, Tagum City, Davao del Norte, Philippines. Privacy and Data Protection Officer contact: perkup.shop@youthserviceph.org; telephone 0962 232 8290. Please use the subject “Perk Privacy Request.”" },
      { title: "Data we collect", body: "Account data includes your name, email address, username, birthday, telephone number, profile image, role, consent record, and store affiliation. Service data includes loyalty cards, points, stamps, rewards, scans, feedback, referrals, partner applications, store information, invoices, and payment references.\n\nSecurity and technical data may include authentication and multi-factor records, trusted-device identifiers and expiry times, approximate location for location-enabled scans, salted IP-derived abuse-prevention identifiers, browser information, diagnostic reports, and security audit logs. Supabase handles password verification using a salted password hash; Perk does not receive or store your plain-text password." },
      { title: "Purposes and legal bases", body: "Account, loyalty, application, and payment processing is necessary to provide the service or take requested pre-contract steps. Fraud prevention, service security, diagnostics, and limited audit logging support Perk’s legitimate operational and security interests. Tax and accounting records are retained to meet legal obligations. We ask for specific consent for birthday/profile processing where required and for optional direct marketing. Marketing consent is separate from creating or using a Perk account and may be withdrawn at any time." },
      { title: "Who receives data", body: "The relevant store owner and authorized staff can access only the customer identity, loyalty activity, scans, and feedback needed to operate that store’s program. Service providers include Supabase for database hosting and authentication; Google Workspace, Drive, Apps Script, and Google OAuth for images, email, and sign-in; Vercel for application hosting; PayMongo for store subscription payments; OpenStreetMap/Nominatim and Google Maps for location features; and Have I Been Pwned for compromised-password screening, which receives only the first five characters of a password hash with padding. Currency-rate requests do not include account data. We do not sell or rent personal data." },
      { title: "International processing", body: "Cloud, authentication, email, map, payment, and hosting providers may process data outside the Philippines. Perk remains accountable for transferred data and requires appropriate contractual, access-control, encryption, confidentiality, and incident-notification safeguards from processors. Provider locations and subprocessors are reviewed in Perk’s processing register." },
      { title: "Retention and secure disposal", body: "Account and loyalty data is retained while the account is active and is deleted or de-identified through the deletion process. Approved partner-application contact details are removed after 90 days; rejected, declined, or cancelled applications are deleted after 24 months. Public feedback is deleted after 24 months. Fixed client diagnostic reports are deleted after 12 months. Privileged audit events are deleted after 24 months. Unconfirmed newsletter requests expire after 7 days; unsubscribe suppression records are deleted after 30 days. Payment invoices and related accounting records are retained for five years, or longer while an audit, protest, refund claim, dispute, or other legal hold remains unresolved. Provider backups remain only for the provider’s documented backup cycle and are not used to reactivate a deleted account." },
      { title: "Your rights and choices", body: "You may request access, correction, an electronic copy, objection or restriction, erasure or blocking, and information about sources and recipients. You may withdraw consent where processing relies on consent without affecting earlier lawful processing. Customers can update profile fields and delete an account in Account Settings. Newsletter messages include one-click unsubscribe. Email other requests to the Data Protection Officer; identity verification may be required. You may lodge a complaint with the National Privacy Commission of the Philippines." },
      { title: "Automated processing", body: "Perk uses automated checks for duplicate contacts, fraud signals, subscription status, reward eligibility, and security controls. These checks support service operations and are not used as the sole basis for a decision that produces legal or similarly significant effects. You may request human review of an account or application decision." },
      { title: "Security and children", body: "We use multi-factor authentication, current-password checks, secure email-change confirmation, least-privilege access, row-level database policies, encrypted local caches, expiring tokens, signed payment webhooks, monitoring, and limited administrative access. No internet service can guarantee absolute security. Perk is not directed to a child who cannot independently consent under applicable law; a parent or guardian should contact the Data Protection Officer if a child submitted data without proper authorization." },
      { title: "Changes and contact", body: "Material changes to this notice will be announced in the service before they take effect when required. For privacy questions or requests, contact perkup.shop@youthserviceph.org or 0962 232 8290. Postal contact: Youth Service Philippines, Tagum City, Davao del Norte, Philippines." },
    ],
  },
  dataDeletion: {
    title: "Data Deletion",
    intro: "Customer accounts can be permanently deleted in Account Settings. Other account types can submit a verified deletion request.",
    lastUpdated: "2026-08-02",
    sections: [
      { title: "Customer self-service process", body: "While signed in, open Account Settings and select Delete account. Perk sends a one-time code to the registered email address. After the code is verified, enter the exact username and current password, acknowledge the permanent deletion notice, and confirm. The verification proof expires after five minutes. If any required deletion step fails, the service reports an error and does not claim that the account was deleted." },
      { title: "What is permanently deleted", body: "The process deletes the Supabase Auth login and identity, public profile, customer details, username reservation, active QR tokens, referral redemption, trusted-device information stored in the profile, promotion-scan history, submitted store feedback, and managed profile-image files. The account can no longer be used and deleted rewards cannot be restored." },
      { title: "What is de-identified", body: "Each affected store retains a loyalty-card row containing only its store identifier, the original join date, deletion status, and a newly generated random deleted-account identifier. Your name and account identifier are removed, and points, stamps, rewards, and promotion progress are reset. This marker lets a store preserve a non-identifying operational count without retaining your customer identity." },
      { title: "Other account types and assisted requests", body: "Self-service deletion currently applies to customer accounts. Store-owner, staff, and administrator records may be connected to store operations and require an assisted review. Email perkup.shop@youthserviceph.org from the registered address with the subject “Perk Data Deletion Request” and include your name and username. We will verify account ownership and explain any records that must be transferred, de-identified, retained, or deleted." },
      { title: "Backups, logs, and legal retention", body: "Deletion removes the live application data described above. Access-restricted provider backups remain only for the provider’s documented backup cycle and are not used to reactivate an account. Privileged audit events are deleted after 24 months. Payment and accounting records are retained for five years, or longer only while an audit, protest, refund claim, dispute, or legal hold remains unresolved." },
      { title: "Timing and consequences", body: "A successful in-app deletion takes effect immediately in the live service. Assisted requests are normally completed within 30 days after verification, subject to any lawful extension. Deletion is irreversible: account access, loyalty balances, reward eligibility, and history described above cannot be recovered." },
    ],
  },
  terms: {
    title: "Terms of Service",
    intro: "These terms govern your access to and use of Perk. By creating an account or using the service, you agree to them.",
    lastUpdated: "2026-06-29",
    sections: [
      { title: "Using Perk", body: "You must provide accurate information, keep your account secure, and use Perk only for lawful purposes. You are responsible for activity performed through your account and must notify us if you suspect unauthorized access." },
      { title: "Loyalty offers and participating businesses", body: "Participating businesses are responsible for their products, services, promotions, reward rules, availability, and customer interactions. Points and rewards have no cash value unless a specific offer expressly states otherwise. Businesses may correct mistakes or address suspected fraud." },
      { title: "Prohibited conduct", body: "You may not manipulate scans or rewards, impersonate another person, interfere with the service, access accounts or data without permission, upload harmful content, or use Perk in a way that violates applicable law or another person’s rights." },
      { title: "Content and intellectual property", body: "You retain ownership of content you submit. You grant Perk a limited license to host, process, and display that content as needed to operate the service. Perk’s software, branding, and original materials remain protected by applicable intellectual-property laws." },
      { title: "Account closure and deletion", body: "You may stop using Perk at any time. Customers may permanently delete an account through Account Settings after email-code, password, and username verification. Deletion immediately ends access and permanently removes rewards and the live personal data described in the Data Deletion page; limited de-identified, backup, security, or legally required records may remain as disclosed there. Other account types must submit an assisted request because their records may be tied to store operations." },
      { title: "Availability and termination", body: "We may change, suspend, or discontinue features and may restrict or terminate accounts that violate these terms, threaten security, or misuse the service. Where appropriate, we may preserve records needed to investigate misuse, resolve disputes, enforce these terms, or comply with law." },
      { title: "Disclaimers and liability", body: "Perk is provided on an “as available” basis. To the extent permitted by law, we disclaim implied warranties and are not liable for indirect, incidental, or consequential losses. Nothing in these terms limits rights or liabilities that cannot legally be limited." },
      { title: "Contact", body: "Questions about these terms may be sent to perkup.shop@youthserviceph.org." },
    ],
  },
};

export const cloneLegalPages = (pages: LegalPagesContent): LegalPagesContent =>
  JSON.parse(JSON.stringify(pages));

export const mergeLegalPages = (value?: Partial<LegalPagesContent>): LegalPagesContent => {
  const result = cloneLegalPages(DEFAULT_LEGAL_PAGES);
  (Object.keys(result) as LegalPageKey[]).forEach((key) => {
    const candidate = value?.[key];
    // A stale database override must not silently replace a newer statutory or
    // security notice shipped with the application.
    if (candidate && String(candidate.lastUpdated || "") >= result[key].lastUpdated) {
      result[key] = { ...result[key], ...candidate };
    }
  });
  return result;
};

export const formatLegalDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(parsed);
};
