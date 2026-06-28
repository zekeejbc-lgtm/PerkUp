import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, QrCode, ScanLine, Store, Users } from "lucide-react";
import { PublicPageShell } from "../components/PublicPageShell";
import { db } from "../lib/backend";
import { doc, getDoc } from "../lib/dataCompat";
import { DEFAULT_SUBSCRIPTION_PLANS, SubscriptionPlan } from "../lib/subscriptionBilling";

const content = {
  "/product": {
    eyebrow: "The Product",
    title: "Digital loyalty, without the paper cards.",
    intro: "PerkUp gives local businesses a simple loyalty system customers can use directly in their browser.",
    cards: [
      [QrCode, "Digital loyalty cards", "Customers keep every store card in one secure account."],
      [ScanLine, "Fast QR check-ins", "Staff record visits and rewards through a quick, reliable scan."],
      [Store, "Store tools", "Manage products, promotions, staff, customers, and feedback in one place."],
    ],
  },
  "/customers": {
    eyebrow: "For Customers",
    title: "One place for every local reward.",
    intro: "Discover nearby partner stores, track visits, and redeem rewards without installing another app.",
    cards: [
      [Store, "Discover local stores", "Browse active PerkUp partners and find the right place by category."],
      [QrCode, "Carry less", "Your loyalty cards and QR code stay available from your account."],
      [Check, "Never lose progress", "See your stamps, eligible rewards, and current promotions."],
    ],
  },
  "/businesses": {
    eyebrow: "For Businesses",
    title: "Turn visits into lasting customer relationships.",
    intro: "Launch a branded loyalty experience, understand repeat visits, and run promotions from a focused dashboard.",
    cards: [
      [Users, "Know your customers", "Review loyalty activity and customer feedback in one view."],
      [ScanLine, "Keep service moving", "Give staff a straightforward scanner and customer workflow."],
      [Store, "Manage every branch", "Keep store details, products, promotions, and team access current."],
    ],
  },
} as const;

export default function MarketingPage() {
  const { pathname } = useLocation();
  const page = content[pathname as keyof typeof content] ?? content["/product"];

  return (
    <PublicPageShell>
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{page.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{page.title}</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300">{page.intro}</p>
      <div className="mt-12 grid gap-5 sm:grid-cols-3">
        {page.cards.map(([Icon, title, description]) => (
          <section key={title} className="rounded-3xl border border-black/10 p-6 dark:border-white/10">
            <Icon className="h-6 w-6" />
            <h2 className="mt-5 font-bold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{description}</p>
          </section>
        ))}
      </div>
      <Link to="/pricing" className="mt-10 inline-flex rounded-full bg-[#1b1b1b] px-6 py-3 text-sm font-semibold text-white dark:bg-white dark:text-[#1b1b1b]">View partner pricing</Link>
    </PublicPageShell>
  );
}

export function PricingPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "settings", "subscriptions"))
      .then((snapshot) => setPlans(snapshot.exists() && Array.isArray(snapshot.data().plans) ? snapshot.data().plans : DEFAULT_SUBSCRIPTION_PLANS))
      .catch((error) => {
        console.error("Failed to load public pricing:", error);
        setPlans(DEFAULT_SUBSCRIPTION_PLANS);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <PublicPageShell>
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Pricing</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Plans for every local business.</h1>
      <p className="mt-6 text-lg text-gray-600 dark:text-gray-300">These are the current subscription prices configured by the PerkUp administrator.</p>
      {loading ? <p className="mt-12 text-gray-500">Loading current plans…</p> : (
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <section key={plan.id || plan.name} className="flex flex-col rounded-3xl border border-black/10 p-6 dark:border-white/10">
              <h2 className="text-xl font-bold">{plan.name}</h2>
              <p className="mt-4"><span className="text-4xl font-bold">₱{Number(plan.price || 0).toLocaleString("en-PH")}</span><span className="text-gray-500"> / {plan.interval || "month"}</span></p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-gray-600 dark:text-gray-300">
                {(plan as SubscriptionPlan & { features?: string[] }).features?.map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" />{feature}</li>)}
              </ul>
              <Link to="/?partner=true" className="mt-8 rounded-full bg-[#1b1b1b] px-5 py-3 text-center text-sm font-semibold text-white dark:bg-white dark:text-[#1b1b1b]">Apply with this plan</Link>
            </section>
          ))}
        </div>
      )}
    </PublicPageShell>
  );
}
