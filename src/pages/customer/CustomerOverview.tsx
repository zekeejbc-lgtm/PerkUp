import { FormEvent, useState, useEffect } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useAuth } from "../../contexts/AuthContext";
import { doc, getDoc, collection, query, where, getCountFromServer } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { Star, ShieldCheck, CreditCard, Gift, Info, Download, RotateCcw, X, AlertTriangle, AtSign, CheckCircle2, Pencil, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { issueCustomerQr, IssuedCustomerQr, updateCustomerProfile } from "@/src/lib/secureQr";
import { getUsernameValidationMessage, normalizeUsername } from "@/src/lib/username";
import { PageSkeleton } from "../../components/LoadingSkeleton";

const APP_NAME = "PerkUp";
const LOGO_SRC = "/icons/perkup-wordmark-light-transparent.png?v=20260625-brand";

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

const missingQrProfileFields = (user: ReturnType<typeof useAuth>["user"]) => {
  if (!user) return ["profile"];
  return [
    user.name?.trim() ? "" : "name",
    user.username?.trim() ? "" : "username",
    (user.phone || user.number)?.trim() ? "" : "phone number",
    user.birthday?.trim() ? "" : "birthday",
  ].filter(Boolean);
};

export default function CustomerOverview() {
  const { user, refreshUser } = useAuth();
  const [lifetimeStars, setLifetimeStars] = useState<number>(0);
  const [activeCards, setActiveCards] = useState<number>(0);
  const [appContact, setAppContact] = useState<AppContact | null>(null);
  const [qrTicket, setQrTicket] = useState<IssuedCustomerQr | null>(null);
  const [qrError, setQrError] = useState("");
  const [qrRefreshing, setQrRefreshing] = useState(false);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUsernameDraft(user?.username || "");
  }, [user?.username]);

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
    const missingFields = missingQrProfileFields(user);
    if (missingFields.length > 0) {
      setQrTicket(null);
      setQrError(`Complete your profile before generating a QR code. Missing: ${missingFields.join(", ")}.`);
      return () => {
        active = false;
      };
    }

    const loadQr = async () => {
      try {
        const ticket = await issueCustomerQr();
        if (!active) return;
        setQrTicket(ticket);
        setQrError("");
      } catch (error) {
        console.error("Failed to issue customer QR", error);
        if (!active) return;
        setQrError(error instanceof Error ? error.message : "Could not generate secure QR code.");
      }
    };

    loadQr();

    return () => {
      active = false;
    };
  }, [user]);

  const refreshQr = async () => {
    if (!qrTicket?.token || qrRefreshing) return;

    setShowRefreshModal(false);
    setQrRefreshing(true);
    try {
      const ticket = await issueCustomerQr({ rotate: true });
      setQrTicket(ticket);
      setQrError("");
    } catch (error) {
      console.error("Failed to refresh customer QR", error);
      setQrError(error instanceof Error ? error.message : "Could not refresh secure QR code.");
    } finally {
      setQrRefreshing(false);
    }
  };

  const openRefreshModal = () => {
    if (!qrTicket?.token || qrRefreshing) return;
    setShowRefreshModal(true);
  };

  const cancelUsernameEdit = () => {
    setUsernameDraft(user?.username || "");
    setUsernameError("");
    setUsernameSaved(false);
    setEditingUsername(false);
  };

  const saveUsername = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;

    const username = normalizeUsername(usernameDraft);
    const validationMessage = getUsernameValidationMessage(username);
    if (validationMessage) {
      setUsernameError(validationMessage);
      return;
    }

    setUsernameSaving(true);
    setUsernameSaved(false);
    setUsernameError("");
    try {
      await updateCustomerProfile({
        name: user.name || "",
        username,
        phone: user.phone || user.number || "",
        bio: user.bio || "",
        birthday: user.birthday || "",
        avatarUrl: user.avatarUrl || user.photoURL || "",
      });

      await refreshUser();
      setUsernameDraft(username);
      setUsernameSaved(true);
      setEditingUsername(false);
      window.setTimeout(() => setUsernameSaved(false), 3000);
    } catch (error) {
      console.error("Failed to update customer username:", error);
      setUsernameError(error instanceof Error ? error.message : "Failed to update username.");
    } finally {
      setUsernameSaving(false);
    }
  };

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
    ctx.fillStyle = "#ffffff";
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
      ctx.drawImage(logo, 250, 132, 250, 114);
    } catch {
      ctx.fillStyle = "#1b1b1b";
      ctx.beginPath();
      ctx.arc(366, 168, 36, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "center";
    ctx.font = "600 19px Inter, Arial, sans-serif";
    ctx.fillText("Secure Customer QR", width / 2, 278);

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#1b1b1b";
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
    drawFittedText(ctx, "Reusable offline copy", width / 2, 880, 650, 500, 16, 12, "Inter, Arial, sans-serif");

    const footerRows = [
      appContact?.email ? `Email: ${appContact.email}` : null,
      appContact?.address ? `Location: ${appContact.address}` : null,
      appContact?.phone ? `Phone: ${appContact.phone}` : null,
      ...getSocialRows(appContact),
    ].filter(Boolean) as string[];

    if (footerRows.length > 0) {
      ctx.strokeStyle = "#1b1b1b";
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

  if (loading) return <PageSkeleton />;

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
          <div className="w-12 h-12 xl:w-14 xl:h-14 bg-gray-100 dark:bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
            <Star className="w-6 h-6 xl:w-7 xl:h-7 text-[#1b1b1b] dark:text-white fill-[#1b1b1b] dark:fill-[#1b1b1b]" />
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
                  {qrError ? "Profile required" : "Generating secure QR..."}
                </div>
              )}
            </div>
            <div className="mt-4 text-center">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Secure Scanner Only</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {qrTicket
                  ? "Reusable QR. Staff scanner verifies it securely online."
                  : qrError || "Preparing your private scan code."}
              </p>
            </div>
            <div className="mt-4 text-center text-xs text-[#1b1b1b] dark:text-white font-medium">
              {qrError ? <Link to="/customer/profile" className="hover:underline">Update profile</Link> : "1 Visit = 1 Sticker"}
            </div>
            <form onSubmit={saveUsername} className="mt-5 w-full rounded-2xl border border-gray-200 bg-white p-3 text-left dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <AtSign className="h-3.5 w-3.5" />
                    Username
                  </div>
                  {!editingUsername && (
                    <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {user?.username || "Not set"}
                    </p>
                  )}
                </div>
                {!editingUsername && (
                  <button
                    type="button"
                    onClick={() => {
                      setUsernameError("");
                      setUsernameSaved(false);
                      setEditingUsername(true);
                    }}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    aria-label="Edit username"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>

              {editingUsername && (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    required
                    value={usernameDraft}
                    onChange={(event) => {
                      setUsernameDraft(normalizeUsername(event.target.value));
                      setUsernameError("");
                      setUsernameSaved(false);
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900 outline-none transition focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    placeholder="your_username"
                  />
                  <p className={`text-xs font-medium ${usernameError || getUsernameValidationMessage(usernameDraft) ? "text-[#1b1b1b] dark:text-white" : "text-green-600 dark:text-green-400"}`}>
                    {usernameError || getUsernameValidationMessage(usernameDraft) || "Strong format. Uniqueness is verified when you save."}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={cancelUsernameEdit}
                      disabled={usernameSaving}
                      className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={usernameSaving || Boolean(getUsernameValidationMessage(usernameDraft))}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900"
                    >
                      <Save className="h-4 w-4" />
                      {usernameSaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {usernameSaved && !editingUsername && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Username saved
                </p>
              )}
            </form>
            <button
              onClick={downloadQrPng}
              disabled={!qrTicket?.token}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 px-4 py-3 bg-[#1b1b1b] text-white rounded-xl text-sm font-semibold hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>
            <button
              onClick={openRefreshModal}
              disabled={!qrTicket?.token || qrRefreshing}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 px-4 py-3 bg-white text-gray-700 rounded-xl text-sm font-semibold border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              <RotateCcw className={`w-4 h-4 ${qrRefreshing ? "animate-spin" : ""}`} />
              {qrRefreshing ? "Refreshing QR..." : "Refresh QR"}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-8 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <Info className="w-6 h-6 text-[#1b1b1b]" />
            <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">How it Works</h2>
          </div>
          
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-[#1b1b1b] dark:text-white font-bold shrink-0">1</div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Find a Partner Store</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Browse our <Link to="/customer/stores" className="text-[#1b1b1b] dark:text-white hover:underline">store directory</Link> to discover cafes, shops, and restaurants that use PerkUp.</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-[#1b1b1b] dark:text-white font-bold shrink-0">2</div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Present Your QR Code</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">When making a purchase, show your Identity QR to the staff. They'll scan it to automatically add stars to your digital card.</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center text-[#1b1b1b] dark:text-white font-bold shrink-0">3</div>
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">Redeem Freebies</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Once you collect 10 stars at a specific store, let the staff know to redeem your reward on your next visit!</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRefreshModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refresh-qr-title"
          onClick={() => setShowRefreshModal(false)}
        >
          <div
            className="w-full max-w-md rounded-[2rem] border border-gray-100 bg-white shadow-2xl transition-colors dark:border-gray-800 dark:bg-gray-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative p-6 sm:p-7">
              <button
                type="button"
                onClick={() => setShowRefreshModal(false)}
                className="absolute right-4 top-4 rounded-full bg-gray-50 p-2 text-gray-400 transition-colors hover:text-gray-600 dark:bg-gray-800 dark:hover:text-gray-300"
                aria-label="Close refresh QR confirmation"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white">
                <AlertTriangle className="h-6 w-6" />
              </div>

              <h3 id="refresh-qr-title" className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                Refresh your QR code?
              </h3>
              <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                A new secure QR will replace your current one. Any QR image you previously downloaded or shared will stop working.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setShowRefreshModal(false)}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Keep Current QR
                </button>
                <button
                  type="button"
                  onClick={refreshQr}
                  disabled={qrRefreshing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1b1b1b] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className={`h-4 w-4 ${qrRefreshing ? "animate-spin" : ""}`} />
                  {qrRefreshing ? "Refreshing..." : "Refresh QR"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
