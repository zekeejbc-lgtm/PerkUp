import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const root = process.cwd();
const distDirectory = path.join(root, "dist");
const baseHtml = await readFile(path.join(distDirectory, "index.html"), "utf8");
const siteUrl = "https://www.perktoday.com";
const defaultImage = `${siteUrl}/icons/perkup-logo-source.png`;

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const pages = [
  {
    path: "/",
    title: "PerkUp | Digital Loyalty for Local Businesses",
    description: "Discover local partner stores and collect secure digital loyalty rewards with PerkUp—no paper cards or app download required.",
    heading: "Digital loyalty starts here.",
    body: "Reward loyal customers, discover local partner stores, and leave paper punch cards behind with PerkUp.",
  },
  {
    path: "/stores",
    title: "Local Partner Stores | PerkUp",
    description: "Browse PerkUp partner stores, search by category, check opening hours, and discover local loyalty rewards.",
    heading: "All affiliated stores",
    body: "Browse active PerkUp partner stores and find loyalty rewards near you.",
  },
  {
    path: "/product",
    title: "Digital Loyalty Platform | PerkUp",
    description: "Digital loyalty cards, fast QR check-ins, promotions, products, customer feedback, and store management in one platform.",
    heading: "Digital loyalty, without the paper cards.",
    body: "PerkUp gives local businesses a simple loyalty system customers can use directly in their browser.",
  },
  {
    path: "/customers",
    title: "Loyalty Rewards for Customers | PerkUp",
    description: "Discover nearby PerkUp stores, track visits, carry digital loyalty cards, and redeem local rewards from one account.",
    heading: "One place for every local reward.",
    body: "Discover nearby partner stores, track visits, and redeem rewards without installing another app.",
  },
  {
    path: "/businesses",
    title: "Customer Loyalty for Local Businesses | PerkUp",
    description: "Launch a branded digital loyalty experience, understand repeat visits, run promotions, and manage every branch with PerkUp.",
    heading: "Turn visits into lasting customer relationships.",
    body: "Launch a branded loyalty experience, understand repeat visits, and run promotions from a focused dashboard.",
  },
  {
    path: "/pricing",
    title: "Plans and Pricing for Businesses | PerkUp",
    description: "Compare PerkUp digital loyalty plans for local businesses and choose the tools that fit your store and team.",
    heading: "Plans for every local business.",
    body: "Compare current PerkUp subscription plans for stores and growing teams.",
  },
  {
    path: "/privacy",
    title: "Privacy Policy | PerkUp",
    description: "Read how PerkUp collects, uses, protects, and manages personal information.",
    heading: "Privacy Policy",
    body: "Learn how PerkUp handles and protects personal information.",
  },
  {
    path: "/terms",
    title: "Terms of Service | PerkUp",
    description: "Read the terms that govern access to and use of PerkUp services.",
    heading: "Terms of Service",
    body: "Review the terms governing access to and use of PerkUp.",
  },
  {
    path: "/data-deletion",
    title: "Data Deletion | PerkUp",
    description: "Learn how to request deletion of your PerkUp account and associated personal data.",
    heading: "Data Deletion",
    body: "Learn how to request deletion of your PerkUp account and associated data.",
  },
];

const env = loadEnv("production", root, "");
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
let stores = [];

if (supabaseUrl && supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase
    .from("stores")
    .select("id,data")
    .eq("data->>status", "active");

  if (error) {
    console.warn(`SEO generation could not load public stores: ${error.message}`);
  } else {
    stores = (data || [])
      .filter((row) => row.data?.initialPaymentRequired !== true && row.data?.initialPaymentStatus !== "pending")
      .map((row) => ({ id: row.id, ...(row.data || {}) }));
  }
} else {
  console.warn("SEO generation skipped dynamic store pages because the public Supabase build variables are missing.");
}

const replaceMeta = (html, attribute, key, content) => {
  const expression = new RegExp(`<meta\\s+${attribute}=["']${key}["'][^>]*>`, "i");
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`;
  return expression.test(html) ? html.replace(expression, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
};

const createFallback = (page, extra = "") => `
  <main id="seo-static-content" style="max-width:72rem;margin:0 auto;padding:4rem 1.5rem;font-family:Inter,system-ui,sans-serif;color:#1b1b1b">
    <nav aria-label="Primary"><a href="/">PerkUp</a> · <a href="/stores">Stores</a> · <a href="/businesses">For Businesses</a> · <a href="/pricing">Pricing</a></nav>
    <article style="margin-top:4rem"><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.body)}</p>${extra}</article>
  </main>`;

const renderPage = (page, { image = defaultImage, jsonLd, extra = "" } = {}) => {
  const canonical = new URL(page.path, siteUrl).toString();
  const absoluteImage = new URL(image, siteUrl).toString();
  let html = baseHtml
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
    .replace('<div id="root"></div>', `<div id="root">${createFallback(page, extra)}</div>`);

  html = replaceMeta(html, "name", "description", page.description);
  html = replaceMeta(html, "name", "robots", "index, follow");
  html = replaceMeta(html, "property", "og:title", page.title);
  html = replaceMeta(html, "property", "og:description", page.description);
  html = replaceMeta(html, "property", "og:type", "website");
  html = replaceMeta(html, "property", "og:url", canonical);
  html = replaceMeta(html, "property", "og:image", absoluteImage);
  html = replaceMeta(html, "name", "twitter:title", page.title);
  html = replaceMeta(html, "name", "twitter:description", page.description);
  html = replaceMeta(html, "name", "twitter:image", absoluteImage);

  if (jsonLd) {
    html = html.replace("</head>", `    <script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("<", "\\u003c")}</script>\n  </head>`);
  }
  return html;
};

const storeLinks = stores.length
  ? `<ul>${stores.map((store) => `<li><a href="/store/${encodeURIComponent(store.id)}">${escapeHtml(store.name || "Partner store")}</a>${store.category ? ` — ${escapeHtml(store.category)}` : ""}</li>`).join("")}</ul>`
  : "";

for (const page of pages) {
  const target = page.path === "/" ? path.join(distDirectory, "index.html") : path.join(distDirectory, page.path.slice(1), "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  const jsonLd = page.path === "/" ? [
    { "@context": "https://schema.org", "@type": "Organization", name: "PerkUp", url: siteUrl, logo: defaultImage },
    { "@context": "https://schema.org", "@type": "WebSite", name: "PerkUp", url: siteUrl },
  ] : undefined;
  await writeFile(target, renderPage(page, { jsonLd, extra: page.path === "/stores" ? storeLinks : "" }));
}

for (const store of stores) {
  const storePath = `/store/${encodeURIComponent(store.id)}`;
  const page = {
    path: storePath,
    title: `${store.name || "Partner Store"} | PerkUp Partner Store`,
    description: store.description || `View ${store.name || "this partner store"}'s details, products, promotions, and PerkUp loyalty rewards.`,
    heading: store.name || "PerkUp Partner Store",
    body: store.description || "View store details and current PerkUp loyalty rewards.",
  };
  const image = new URL(store.logoUrl || defaultImage, siteUrl).toString();
  const target = path.join(distDirectory, "store", encodeURIComponent(store.id), "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, renderPage(page, {
    image,
    extra: `<p>${escapeHtml(store.category || "Partner store")}${store.address ? ` · ${escapeHtml(store.address)}` : ""}</p><p><a href="${storePath}/products">Products</a> · <a href="${storePath}/promotions">Promotions</a></p>`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: store.name,
      url: `${siteUrl}${storePath}`,
      description: store.description,
      image,
      telephone: store.contact,
      address: store.address,
      openingHours: store.openingHours || store.hours,
    },
  }));
}

const sitemapPaths = [...pages.map((page) => page.path), ...stores.map((store) => `/store/${encodeURIComponent(store.id)}`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapPaths.map((route) => `  <url><loc>${escapeHtml(new URL(route, siteUrl).toString())}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile(path.join(distDirectory, "sitemap.xml"), sitemap);

console.log(`Generated ${pages.length} static SEO pages, ${stores.length} store pages, and sitemap.xml.`);
