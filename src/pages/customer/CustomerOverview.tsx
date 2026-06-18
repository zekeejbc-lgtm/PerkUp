import { useState, useEffect } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useAuth } from "../../contexts/AuthContext";
import { doc, getDoc, collection, query, where, getCountFromServer } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { Star, ShieldCheck, CreditCard, Gift, Info, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { issueCustomerQr, IssuedCustomerQr } from "@/src/lib/secureQr";

const APP_NAME = "PerkUp";
const LOGO_SRC = "/icons/icon-192.png?v=20260618-logo";

type AppContact = {
  address?: string;
  email?: string;
  phone?: string;
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const sanitizeFilename = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "customer";

const drawFittedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  weight: number,
  maxSize: number,
  minSize: number,
  family: string
) => {
  let size = maxSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  } while (size > minSize);

  ctx.fillText(text, x, y);
};

const getSocialRows = (contact: AppContact | null) =>
  Object.entries(contact?.socialLinks || {})
    .filter(([, value]) => Boolean(value))
    .map(([name, value]) => `${name.charAt(0).toUpperCase()}${name.slice(1)}: ${value}`);

export default function CustomerOverview() {
  const { user } = useAuth();
  const [lifetimeStars, setLifetimeStars] = useState<number>(0);
  const [activeCards, setActiveCards] = useState<number>(0);
  const [appContact, setAppContact] = useState<AppContact | null>(null);
  const [qrTicket, setQrTicket] = useState<IssuedCustomerQr | null>(null);
  const [qrError, setQrError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCustomerData() {
      if (!user) return;
      try {
        const custRef = doc(db, "customers", user.id);
        const custSnap = await getDoc(custRef);
        if (custSnap.exists()) {
          setLifetimeStars(custSnap.data().lifetimeStars || 0);
        }

        const cardsQuery = query(collection(db, "cards"), where("customerId", "==", user.id));
        const cardsSnapshot = await getCountFromServer(cardsQuery);
        setActiveCards(cardsSnapshot.data().count);

        const homepageSnap = await getDoc(doc(db, "settings", "homepage"));
        if (homepageSnap.exists()) {
          setAppContact(homepageSnap.data().footerInfo || null);
        }
      } catch (error) {
        handleDataError(error, OperationType.GET, "overview");
      } finally {
        setLoading(false);
      }
    }
    fetchCustomerData();
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;

    let active = true;
    let refreshTimer: number | undefined;

    const refreshQr = async () => {
      try {
        const ticket = await issueCustomerQr();
        if (!active) return;
        setQrTicket(ticket);
        setQrError("");

        const expiresInMs = new Date(ticket.expiresAt).getTime() - Date.now();
        refreshTimer = window.setTimeout(refreshQr, Math.max(expiresInMs - 60_000, 60_000));
      } catch (error) {
        console.error("Failed to issue customer QR", error);
        if (!active) return;
        setQrError(error instanceof Error ? error.message : "Could not generate secure QR code.");
        refreshTimer = window.setTimeout(refreshQr, 60_000);
      }
    };

    refreshQr();

    return () => {
      active = false;
      if (refreshTimer) window.clearTimeout(refreshTimer);
    };
  }, [user?.id]);

  const downloadQrPng = async () => {
    if (!qrTicket?.token) return;

    const qrCanvas = document.getElementById("customer-overview-download-qr") as HTMLCanvasElement | null;
    if (!qrCanvas) return;

    const canvas = document.createElement("canvas");
    const width = 900;
    const height = 1250;
    const scale = window.devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(scale, scale);
    ctx.fillStyle = "#fff7ed";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(15, 23, 42, 0.12)";
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 16;
    ctx.beginPath();
    ctx.roundRect(70, 70, width - 140, height - 140, 42);
    ctx.fill();
    ctx.shadowColor = "transparent";

    try {
      const logo = await loadImage(LOGO_SRC);
      ctx.drawImage(logo, 330, 132, 72, 72);
    } catch {
      ctx.fillStyle = "#ea580c";
      ctx.beginPath();
      ctx.arc(366, 168, 36, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#111827";
    ctx.textAlign = "left";
    ctx.font = "700 44px Inter, Arial, sans-serif";
    ctx.fillText(APP_NAME, 420, 180);

    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "center";
    ctx.font = "600 19px Inter, Arial, sans-serif";
    ctx.fillText("Secure Customer QR", width / 2, 242);

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#fed7aa";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(236, 300, 428, 428, 32);
    ctx.fill();
    ctx.stroke();
    ctx.drawImage(qrCanvas, 270, 334, 360, 360);

    ctx.fillStyle = "#111827";
    drawFittedText(ctx, user.name || "PerkUp User", width / 2, 810, 650, 700, 36, 22, "Inter, Arial, sans-serif");

    ctx.fillStyle = "#4b5563";
    drawFittedText(ctx, "PerkUp scanner required", width / 2, 852, 650, 500, 18, 12, "Inter, Arial, sans-serif");
    drawFittedText(ctx, `Expires ${new Date(qrTicket.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, width / 2, 880, 650, 500, 16, 12, "Inter, Arial, sans-serif");

    const footerRows = [
      appContact?.email ? `Email: ${appContact.email}` : null,
      appContact?.address ? `Location: ${appContact.address}` : null,
      appContact?.phone ? `Phone: ${appContact.phone}` : null,
      ...getSocialRows(appContact),
    ].filter(Boolean) as string[];

    if (footerRows.length > 0) {
      ctx.strokeStyle = "#fed7aa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(170, 940);
      ctx.lineTo(730, 940);
      ctx.stroke();

      ctx.fillStyle = "#9ca3af";
      ctx.font = "700 14px Inter, Arial, sans-serif";
      ctx.fillText("Contact PerkUp", width / 2, 982);

      ctx.fillStyle = "#4b5563";
      footerRows.slice(0, 6).forEach((row, index) => {
        drawFittedText(ctx, row, width / 2, 1020 + index * 32, 650, 500, 18, 12, "Inter, Arial, sans-serif");
      });
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${APP_NAME.toLowerCase()}-${sanitizeFilename(user.name || user.email || user.id)}-qr.png`;
    link.click();
  };

  if (loading) return <div className="animate-pulse text-gray-500 dark:text-gray-400">Loading your dashboard...</div>;

  return (
    <div className="space-y-8">
      <div className="sr-only" aria-hidden="true">
        <QRCodeCanvas id="customer-overview-download-qr" value={qrTicket?.token || ""} size={512} marginSize={4} />
      </div>

      <div>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          Welcome back, {user?.name?.split(' ')[0] || 'User'}! 👋
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Here is a quick overview of your rewards and activity.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors flex items-center gap-4 xl:gap-6 min-w-0">
          <div className="w-12 h-12 xl:w-14 xl:h-14 bg-orange-50 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center shrink-0">
            <Star className="w-6 h-6 xl:w-7 xl:h-7 text-orange-500 dark:text-orange-400 fill-orange-500 dark:fill-orange-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs xl:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate">Lifetime Stars</h3>
            <p className="text-2xl xl:text-3xl font-bold text-gray-900 dark:text-white mt-1 truncate">{lifetimeStars}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors flex items-center gap-4 xl:gap-6 min-w-0">
          <div className="w-12 h-12 xl:w-14 xl:h-14 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center shrink-0">
            <CreditCard className="w-6 h-6 xl:w-7 xl:h-7 text-indigo-500 dark:text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs xl:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate">Active Cards</h3>
            <p className="text-2xl xl:text-3xl font-bold text-gray-900 dark:text-white mt-1 truncate">{activeCards}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors flex items-center gap-4 xl:gap-6 min-w-0 sm:col-span-2 lg:col-span-1">
          <div className="w-12 h-12 xl:w-14 xl:h-14 bg-green-50 dark:bg-green-900/30 rounded-2xl flex items-center justify-center shrink-0">
            <Gift className="w-6 h-6 xl:w-7 xl:h-7 text-green-500 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs xl:text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate">Rewards Ready</h3>
            <p className="text-2xl xl:text-3xl font-bold text-gray-900 dark:text-white mt-1 truncate">0</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-900 p-6 md:p-8 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors flex flex-col items-center sm:items-start text-center sm:text-left">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Your Identity QR</h2>
            <ShieldCheck className="w-6 h-6 text-green-500" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm">
            Scan this code at the counter of any affiliated partner store to earn stars or redeem your rewards.
          </p>
          
          <div className="w-full max-w-[280px] bg-gray-50 dark:bg-gray-800/50 p-6 rounded-3xl border border-gray-100 dark:border-gray-700/50 flex flex-col items-center self-center sm:self-start">
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-gray-200">
              {qrTicket?.token ? (
                <QRCodeSVG value={qrTicket.token} size={160} className="w-full max-w-[160px] h-auto" />
              ) : (
                <div className="w-[160px] h-[160px] flex items-center justify-center text-center text-xs font-semibold text-gray-500">
                  Generating secure QR...
                </div>
              )}
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Secure Scanner Only</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {qrTicket
                  ? `Refreshes automatically. Expires ${new Date(qrTicket.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
                  : qrError || "Preparing your private scan code."}
              </p>
            </div>
            <div className="mt-4 text-center text-xs text-orange-600 dark:text-orange-400 font-medium">
              1 Visit = 1 Sticker
            </div>
            <button
              onClick={downloadQrPng}
              disabled={!qrTicket?.token}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-8 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <Info className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">How it Works</h2>
          </div>
          
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">1</div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Find a Partner Store</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Browse our <Link to="/customer/stores" className="text-orange-600 dark:text-orange-400 hover:underline">store directory</Link> to discover cafes, shops, and restaurants that use PerkUp.</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">2</div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Present Your QR Code</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">When making a purchase, show your Identity QR to the staff. They'll scan it to automatically add stars to your digital card.</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shrink-0">3</div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Redeem Freebies</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Once you collect 10 stars at a specific store, let the staff know to redeem your reward on your next visit!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
