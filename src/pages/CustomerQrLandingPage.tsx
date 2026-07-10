import { ArrowRight, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { normalizeCustomerUsername } from "../lib/secureQr";

const getSharedUsername = () => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return normalizeCustomerUsername(params.get("user") || "");
};

export default function CustomerQrLandingPage() {
  const username = getSharedUsername();

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 dark:bg-[#121212] dark:text-white sm:py-14">
      <div className="mx-auto max-w-xl overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-xl shadow-gray-200/50 dark:border-white/10 dark:bg-[#1f1f1f] dark:shadow-black/30">
        <header className="flex items-center justify-between border-b border-gray-100 px-6 py-5 dark:border-white/10">
          <BrandMark />
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700 dark:bg-green-500/10 dark:text-green-300">
            Official QR
          </span>
        </header>

        <section className="px-6 py-10 text-center sm:px-10 sm:py-12">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[#1b1b1b] text-white shadow-lg dark:bg-white dark:text-[#1b1b1b]">
            <QrCode className="h-10 w-10" />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight">You scanned a PerkUp QR</h1>
          <p className="mx-auto mt-3 max-w-md leading-7 text-gray-500 dark:text-gray-300">
            {username
              ? `This code belongs to @${username}. PerkUp partner staff can scan it in the app to confirm the customer and award rewards.`
              : "This is a secure customer code. PerkUp partner staff can scan it inside the app to confirm the customer and award rewards."}
          </p>

          <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/5">
              <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
              <p className="mt-3 font-bold">Partner staff?</p>
              <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">Open the PerkUp staff scanner and scan the QR there.</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/5">
              <Smartphone className="h-6 w-6 text-[#1b1b1b] dark:text-white" />
              <p className="mt-3 font-bold">New to PerkUp?</p>
              <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">Discover loyalty cards, promotions, and rewards from partner stores.</p>
            </div>
          </div>

          <Link
            to="/customers"
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1b1b1b] px-5 py-4 font-bold text-white transition hover:bg-black dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-100"
          >
            Explore PerkUp
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link to="/" className="mt-4 inline-block text-sm font-semibold text-gray-500 hover:underline dark:text-gray-400">
            Sign in or create an account
          </Link>
        </section>
      </div>
    </main>
  );
}
