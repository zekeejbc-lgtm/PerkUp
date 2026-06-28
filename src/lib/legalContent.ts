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
    intro: "This policy explains what information PerkUp collects, why we use it, and the choices available to you.",
    lastUpdated: "2026-06-29",
    sections: [
      { title: "Information we collect", body: "We may collect account details such as your name, email address, username, birthday, profile photo, role, and store affiliation. We also process loyalty activity, rewards, feedback, partner applications, and store information you choose to provide.\n\nFor security and operation, we may process authentication records, trusted-device details, approximate location during location-enabled scans, IP address, browser information, and service logs." },
      { title: "How we use information", body: "We use information to create and secure accounts, operate digital loyalty cards, validate transactions, show participating stores and promotions, provide support, improve PerkUp, prevent abuse, and comply with legal obligations." },
      { title: "How information is shared", body: "Customer loyalty activity and submitted store feedback may be visible to the relevant store and its authorized staff. We may use service providers for hosting, authentication, storage, email, maps, and related operations. We do not sell personal information." },
      { title: "Retention and security", body: "We retain information while your account is active and as reasonably necessary for operations, security, disputes, and legal compliance. We use access controls and other safeguards, but no online service can guarantee absolute security." },
      { title: "Your choices and rights", body: "You may update certain profile details in your account. You may also request access, correction, or deletion by following our Data Deletion instructions. Some records may be retained where required by law or for legitimate security and recordkeeping needs." },
      { title: "Contact", body: "For privacy questions, email perkup.shop@youthserviceph.org." },
    ],
  },
  dataDeletion: {
    title: "Data Deletion",
    intro: "You can request deletion of your PerkUp account and associated personal information using the process below.",
    lastUpdated: "2026-06-29",
    sections: [
      { title: "How to request deletion", body: "Email perkup.shop@youthserviceph.org from the email address registered to your account. Use the subject “PerkUp Data Deletion Request” and include your full name and username, if applicable. We may ask you to verify account ownership before processing the request." },
      { title: "What will be deleted", body: "After verification, we will delete or anonymize your account profile and personal information associated with it, including your profile image where applicable. Deletion may also remove access to loyalty cards, rewards, and account history." },
      { title: "Information we may retain", body: "We may retain limited transaction, security, fraud-prevention, backup, or legal records when required or permitted by law. Where possible, retained records will be minimized or de-identified and will no longer be used for ordinary account operation." },
      { title: "Processing time", body: "We aim to acknowledge requests promptly and complete verified requests within 30 days. Complex or legally restricted requests may take longer, and we will notify you if an extension is needed." },
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
      { title: "Availability and termination", body: "We may change, suspend, or discontinue features and may restrict accounts that violate these terms, threaten security, or misuse the service. You may stop using PerkUp at any time and may request account deletion." },
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
