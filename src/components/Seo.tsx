import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://www.perktoday.com";
const LOGO_IMAGE = `${SITE_URL}/icons/perk-wordmark-dark-transparent.png`;
const DEFAULT_IMAGE = `${SITE_URL}/images/perk-social-preview-v3.png`;
const DEFAULT_DESCRIPTION = "Perk is a secure digital loyalty system for customers, staff, and local partner stores.";

type JsonLd = Record<string, unknown> | Array<Record<string, unknown>>;

interface SeoProps {
  title: string;
  description?: string;
  canonicalPath?: string;
  image?: string;
  noIndex?: boolean;
  type?: "website" | "article";
  jsonLd?: JsonLd;
}

const setMeta = (selector: string, attribute: "name" | "property", key: string, content: string) => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
};

export function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  canonicalPath = "/",
  image = DEFAULT_IMAGE,
  noIndex = false,
  type = "website",
  jsonLd,
}: SeoProps) {
  useEffect(() => {
    const canonicalUrl = new URL(canonicalPath, SITE_URL).toString();
    const imageUrl = new URL(image, SITE_URL).toString();
    document.title = title;

    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[name="robots"]', "name", "robots", noIndex ? "noindex, nofollow" : "index, follow");
    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[property="og:type"]', "property", "og:type", type);
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMeta('meta[property="og:image"]', "property", "og:image", imageUrl);
    setMeta('meta[property="og:site_name"]', "property", "og:site_name", "Perk");
    setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    setMeta('meta[name="twitter:image"]', "name", "twitter:image", imageUrl);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    const previousJsonLd = document.getElementById("perk-route-jsonld");
    previousJsonLd?.remove();
    if (jsonLd) {
      const script = document.createElement("script");
      script.id = "perk-route-jsonld";
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
      document.head.appendChild(script);
    }

    return () => document.getElementById("perk-route-jsonld")?.remove();
  }, [canonicalPath, description, image, jsonLd, noIndex, title, type]);

  return null;
}

const routeMetadata: Record<string, Omit<SeoProps, "canonicalPath">> = {
  "/": {
    title: "Perk | Digital Loyalty for Local Businesses",
    description: "Discover local partner stores and collect secure digital loyalty rewards with Perk—no paper cards or app download required.",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Perk",
        url: SITE_URL,
        logo: LOGO_IMAGE,
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Perk",
        url: SITE_URL,
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/stores?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  },
  "/stores": {
    title: "Local Partner Stores | Perk",
    description: "Browse Perk partner stores, search by category, check opening hours, and discover local loyalty rewards.",
  },
  "/product": {
    title: "Digital Loyalty Platform | Perk",
    description: "Digital loyalty cards, fast QR check-ins, promotions, products, customer feedback, and store management in one platform.",
  },
  "/customers": {
    title: "Loyalty Rewards for Customers | Perk",
    description: "Discover nearby Perk stores, track visits, carry digital loyalty cards, and redeem local rewards from one account.",
  },
  "/businesses": {
    title: "Customer Loyalty for Local Businesses | Perk",
    description: "Launch a branded digital loyalty experience, understand repeat visits, run promotions, and manage every branch with Perk.",
  },
  "/pricing": {
    title: "Plans and Pricing for Businesses | Perk",
    description: "Compare Perk digital loyalty plans for local businesses and choose the tools that fit your store and team.",
  },
  "/privacy": { title: "Privacy Policy | Perk", description: "Read how Perk collects, uses, protects, and manages personal information." },
  "/terms": { title: "Terms of Service | Perk", description: "Read the terms that govern access to and use of Perk services." },
  "/data-deletion": { title: "Data Deletion | Perk", description: "Learn how to request deletion of your Perk account and associated personal data." },
};

const privateRoutePattern = /^\/(?:admin|auditor|owner|staff|customer)(?:\/|$)|^\/(?:dashboard|reset-password|scan|feedback)(?:\/|$)/;

export function RouteSeo() {
  const { pathname } = useLocation();
  const metadata = routeMetadata[pathname];

  if (metadata) return <Seo {...metadata} canonicalPath={pathname} />;
  if (privateRoutePattern.test(pathname)) {
    return <Seo title="Perk" canonicalPath={pathname} noIndex />;
  }
  if (pathname.startsWith("/store/")) {
    return <Seo title="Partner Store | Perk" description="View this Perk partner store's details, products, promotions, and loyalty rewards." canonicalPath={pathname} />;
  }
  return <Seo title="Page Not Found | Perk" description="The requested Perk page could not be found." canonicalPath={pathname} noIndex />;
}
