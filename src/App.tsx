import { FormEvent, lazy, ReactNode, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useAuth, Role } from "./contexts/AuthContext";
import { logOut } from "./lib/backend";
import { supabase } from "./lib/supabase";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { DashboardShellSkeleton, PageSkeleton } from "./components/LoadingSkeleton";
import { ThemeToggle } from "./components/ThemeToggle";
import { BrandMark } from "./components/BrandMark";
import { ProfileAvatarImage } from "./components/ProfileAvatarImage";
import { getMfaPromptReason, TrustedLoginProfile } from "./lib/trustedDevice";
import { FirstLoginPasswordChange } from "./components/FirstLoginPasswordChange";
import { PublicSiteFooter } from "./components/PublicPageShell";
import { GlobalImageViewer } from "./components/GlobalImageViewer";
import { RouteSeo } from "./components/Seo";
import { PwaPrompts } from "./components/PwaPrompts";
import { useRuntimeMode } from "./contexts/RuntimeModeContext";
import { MaintenanceScreen } from "./components/MaintenanceScreen";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const StoresPage = lazy(() => import("./pages/StoresPage"));
const StorePage = lazy(() => import("./pages/StorePage"));
const StoreReviewsPage = lazy(() => import("./pages/StoreReviewsPage"));
const StoreProductsPage = lazy(() => import("./pages/StoreProductsPage"));
const StorePromotionsPage = lazy(() => import("./pages/StorePromotionsPage"));
const CustomerDashboard = lazy(() => import("./pages/CustomerDashboard"));
const StaffDashboard = lazy(() => import("./pages/StaffDashboard"));
const StoreOwnerDashboard = lazy(() => import("./pages/StoreOwnerDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const DataDeletionPage = lazy(() => import("./pages/DataDeletionPage"));
const TermsOfServicePage = lazy(() => import("./pages/TermsOfServicePage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const MarketingPage = lazy(() => import("./pages/MarketingPage"));
const PricingPage = lazy(() => import("./pages/MarketingPage").then((module) => ({ default: module.PricingPage })));
const CustomerQrLandingPage = lazy(() => import("./pages/CustomerQrLandingPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

const SCROLL_POSITIONS_KEY = "perk:scroll-positions";

function getSavedScrollPositions(): Record<string, number> {
  try {
    return JSON.parse(window.sessionStorage.getItem(SCROLL_POSITIONS_KEY) || "{}");
  } catch {
    return {};
  }
}

function ScrollPositionManager() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    const previousSetting = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previousSetting;
    };
  }, []);

  useLayoutEffect(() => {
    const savePosition = () => {
      const positions = getSavedScrollPositions();
      positions[location.key] = window.scrollY;
      window.sessionStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
    };

    window.addEventListener("pagehide", savePosition);
    return () => {
      savePosition();
      window.removeEventListener("pagehide", savePosition);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
      return;
    }

    const targetY = navigationType === "POP"
      ? getSavedScrollPositions()[location.key] ?? 0
      : 0;
    let attempts = 0;
    let timer: number | undefined;

    const restorePosition = () => {
      window.scrollTo({ top: targetY, left: 0, behavior: "auto" });
      attempts += 1;
      if (Math.abs(window.scrollY - targetY) > 1 && attempts < 20) {
        timer = window.setTimeout(restorePosition, 50);
      }
    };

    restorePosition();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [location.key, location.hash, navigationType]);

  return null;
}

function AutoHideScrollbars() {
  useEffect(() => {
    const root = document.documentElement;
    let hideTimer: number | undefined;

    const revealScrollbars = () => {
      root.classList.add("scrollbars-visible");
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        root.classList.remove("scrollbars-visible");
      }, 1000);
    };

    const activityEvents: Array<keyof DocumentEventMap> = [
      "keydown",
      "pointermove",
      "touchmove",
      "wheel",
    ];

    document.addEventListener("scroll", revealScrollbars, true);
    activityEvents.forEach((eventName) => {
      document.addEventListener(eventName, revealScrollbars, { passive: true });
    });
    revealScrollbars();

    return () => {
      document.removeEventListener("scroll", revealScrollbars, true);
      activityEvents.forEach((eventName) => {
        document.removeEventListener(eventName, revealScrollbars);
      });
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      root.classList.remove("scrollbars-visible");
    };
  }, []);

  return null;
}

function MfaChallenge({ onVerified, profile }: { onVerified: () => void; profile?: TrustedLoginProfile | null }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("Enter the code from your authentication app.");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getMfaPromptReason(profile).then(setReason).catch(() => undefined);
  }, [profile]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;

      const factor = factors.data.totp.find((item) => item.status === "verified") ?? factors.data.totp[0];
      if (!factor) throw new Error("No authenticator app is enrolled for this account.");

      const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) throw verify.error;

      onVerified();
    } catch (challengeError) {
      console.error("MFA challenge failed:", challengeError);
      setError(challengeError instanceof Error ? challengeError.message : "Invalid authentication code.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#1b1b1b] flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white dark:bg-[#1f1f1f] border border-[#1b1b1b]/10 dark:border-white/10 rounded-[1.75rem] p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#1b1b1b] text-white dark:bg-white dark:text-[#1b1b1b] flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Authenticator Required</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{reason}</p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl text-sm font-medium flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Authentication Code</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\s/g, ""))}
            className="w-full px-4 py-3 bg-gray-50 dark:bg-[#262626] border border-gray-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:focus:ring-white dark:text-white"
            placeholder="123456"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={submitting || !code}
            className="inline-flex flex-1 items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#1b1b1b] text-white font-medium hover:bg-black disabled:opacity-50 transition-colors dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-100"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Verify
          </button>
          <button
            type="button"
            onClick={logOut}
            className="inline-flex flex-1 items-center justify-center px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </form>
    </div>
  );
}

function RestrictedAccountScreen({ status, reason }: { status: "suspended" | "banned"; reason?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-[#1b1b1b]">
      <div className="w-full max-w-lg rounded-[2rem] border border-red-200 bg-white p-7 text-center shadow-sm dark:border-red-900/60 dark:bg-gray-900 sm:p-9">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300">
          <AlertTriangle className="h-7 w-7" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-red-600 dark:text-red-400">
          Account {status}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
          Your Perk access is unavailable
        </h1>
        <p className="mt-3 leading-7 text-gray-600 dark:text-gray-300">
          {reason || (status === "banned"
            ? "This account has been banned by a Perk administrator."
            : "This account is temporarily suspended while it is under administrative review.")}
        </p>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Contact Perk Support if you believe this restriction was applied in error.
        </p>
        <button
          type="button"
          onClick={logOut}
          className="mt-7 inline-flex min-w-40 items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-black dark:bg-white dark:text-gray-900"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }: { children: ReactNode, allowedRoles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [checkingMfa, setCheckingMfa] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);

  useEffect(() => {
    let active = true;

    const checkMfa = async () => {
      if (loading || !user) {
        if (active) {
          setMfaRequired(false);
          setCheckingMfa(false);
        }
        return;
      }

      setCheckingMfa(true);
      try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) throw error;
        if (data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
          if (active) setMfaRequired(true);
          return;
        }
        if (active) setMfaRequired(false);
      } catch (error) {
        console.error("MFA assurance check failed:", error);
        // A failed assurance check must not silently downgrade an enrolled
        // account to single-factor access.
        if (active) setMfaRequired(true);
      } finally {
        if (active) setCheckingMfa(false);
      }
    };

    checkMfa();

    return () => {
      active = false;
    };
  }, [loading, user?.id]);

  if (loading) return <PageSkeleton variant="auth" />;

  if (!user) {
    return (
      <Navigate
        to="/"
        replace
        state={{
          authRequired: true,
          returnTo: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    );
  }

  if (user.accountStatus === "suspended" || user.accountStatus === "banned") {
    return <RestrictedAccountScreen status={user.accountStatus} reason={user.accountStatusReason} />;
  }

  if (user.forcePasswordReset) {
    return <FirstLoginPasswordChange />;
  }

  if (checkingMfa) return <PageSkeleton variant="auth" />;

  if (mfaRequired) {
    return <MfaChallenge profile={user} onVerified={() => setMfaRequired(false)} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />; // Redirect to their default dashboard
  }

  return children;
}

function RoleRouter() {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/" replace />;

  switch (user.role) {
    case "staff":
      return <Navigate to="/staff" replace />;
    case "store_owner":
      return <Navigate to="/owner" replace />;
    case "admin":
    case "assistant_admin":
      return <Navigate to="/admin" replace />;
    case "auditor":
      return <Navigate to="/auditor" replace />;
    case "customer":
    default:
      return <Navigate to="/customer" replace />;
  }
}

function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const accountPathByRole: Partial<Record<Role, string>> = {
    admin: "/admin/account",
    assistant_admin: "/admin/account",
    auditor: "/auditor/account",
    customer: "/customer/profile",
    staff: "/staff/account",
    store_owner: "/owner/account",
  };
  const handleAccountClick = () => {
    const accountPath = user?.role ? accountPathByRole[user.role] : undefined;
    if (!accountPath) return;

    const ownerBranchQuery = user?.role === "store_owner" ? location.search : "";
    navigate(`${accountPath}${ownerBranchQuery}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-[#1b1b1b] transition-colors">
      <nav className="sticky top-0 z-40 bg-white/85 dark:bg-[#1b1b1b]/85 backdrop-blur-xl border-b border-[#1b1b1b]/10 dark:border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex items-center gap-4">
              <BrandMark compact />
              <div className="hidden sm:block h-4 w-px bg-gray-200 dark:bg-gray-800 mx-2"></div>
              <span className="rounded-full bg-[#1b1b1b] dark:bg-white px-2.5 py-1 text-[10px] font-bold tracking-wider text-white dark:text-[#1b1b1b] border border-[#1b1b1b] dark:border-white uppercase">
                {user?.role.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleAccountClick}
                aria-label="Open profile"
                title="Open profile"
                className="flex items-center gap-3 sm:mr-4 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#1b1b1b]/30 dark:focus:ring-white/40"
              >
                <div className="h-8 w-8 min-w-8 shrink-0 aspect-square rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                  <ProfileAvatarImage
                    src={user?.avatarUrl || user?.photoURL || ""}
                    alt=""
                    className="block h-full w-full object-cover"
                    fallback={
                      user?.name ? (
                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{user.name.charAt(0).toUpperCase()}</span>
                      ) : null
                    }
                  />
                </div>
                <div className="hidden sm:flex flex-col">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{user?.name || "User"}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 leading-tight truncate max-w-[120px]">{user?.username || user?.email}</span>
                </div>
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
      <div className="hidden md:block">
        <PublicSiteFooter />
      </div>
    </div>
  );
}

export default function App() {
  const { config, loading } = useRuntimeMode();
  const { user, loading: authLoading } = useAuth();
  const hasMaintenanceAccess =
    Boolean(user) &&
    user?.isDemo !== true &&
    user?.accountStatus !== "suspended" &&
    user?.accountStatus !== "banned" &&
    ["admin", "auditor"].includes(user?.role || "");

  if (loading || (config.mode === "maintenance" && authLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#151515]">
        <div className="flex flex-col items-center gap-5" role="status" aria-label="Checking system status">
          <BrandMark />
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  if (config.mode === "maintenance" && !hasMaintenanceAccess) return <MaintenanceScreen />;

  return (
    <>
      <ScrollPositionManager />
      <AutoHideScrollbars />
      <RouteSeo />
      <GlobalImageViewer />
      <PwaPrompts />
      <Routes>
      <Route path="/" element={<Suspense fallback={<PageSkeleton variant="landing" />}><LandingPage /></Suspense>} />
      <Route path="/reset-password" element={<Suspense fallback={<PageSkeleton variant="auth" />}><ResetPasswordPage /></Suspense>} />
      <Route path="/stores" element={<Suspense fallback={<PageSkeleton variant="directory" />}><StoresPage /></Suspense>} />
      <Route path="/store/:storeId" element={<Suspense fallback={<PageSkeleton variant="store" />}><StorePage /></Suspense>} />
      <Route path="/store/:storeId/reviews" element={<Suspense fallback={<PageSkeleton variant="reviews" />}><StoreReviewsPage /></Suspense>} />
      <Route path="/store/:storeId/products" element={<Suspense fallback={<PageSkeleton variant="public-products" />}><StoreProductsPage /></Suspense>} />
      <Route path="/store/:storeId/promotions" element={<Suspense fallback={<PageSkeleton variant="public-promotions" />}><StorePromotionsPage /></Suspense>} />
      <Route path="/privacy" element={<Suspense fallback={<PageSkeleton variant="content" />}><PrivacyPolicyPage /></Suspense>} />
      <Route path="/data-deletion" element={<Suspense fallback={<PageSkeleton variant="content" />}><DataDeletionPage /></Suspense>} />
      <Route path="/terms" element={<Suspense fallback={<PageSkeleton variant="content" />}><TermsOfServicePage /></Suspense>} />
      <Route path="/feedback" element={<Suspense fallback={<PageSkeleton variant="form" />}><FeedbackPage /></Suspense>} />
      <Route path="/product" element={<Suspense fallback={<PageSkeleton variant="marketing" />}><MarketingPage /></Suspense>} />
      <Route path="/customers" element={<Suspense fallback={<PageSkeleton variant="marketing" />}><MarketingPage /></Suspense>} />
      <Route path="/businesses" element={<Suspense fallback={<PageSkeleton variant="marketing" />}><MarketingPage /></Suspense>} />
      <Route path="/pricing" element={<Suspense fallback={<PageSkeleton variant="pricing" />}><PricingPage /></Suspense>} />
      <Route path="/scan" element={<Suspense fallback={<PageSkeleton variant="qr-landing" />}><CustomerQrLandingPage /></Suspense>} />
      <Route path="/dashboard" element={<RoleRouter />} />
      
      <Route path="/customer/*" element={
        <ProtectedRoute allowedRoles={["customer"]}>
          <Layout><Suspense fallback={<DashboardShellSkeleton />}><CustomerDashboard /></Suspense></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/staff/*" element={
        <ProtectedRoute allowedRoles={["staff"]}>
          <Layout><Suspense fallback={<DashboardShellSkeleton />}><StaffDashboard /></Suspense></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/owner/*" element={
        <ProtectedRoute allowedRoles={["store_owner"]}>
          <Layout><Suspense fallback={<DashboardShellSkeleton />}><StoreOwnerDashboard /></Suspense></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/admin/*" element={
        <ProtectedRoute allowedRoles={["admin", "assistant_admin"]}>
          <Layout><Suspense fallback={<DashboardShellSkeleton navigationItems={6} />}><AdminDashboard portalBasePath="/admin" /></Suspense></Layout>
        </ProtectedRoute>
      } />
      <Route path="/auditor/*" element={
        <ProtectedRoute allowedRoles={["auditor"]}>
          <Layout><Suspense fallback={<DashboardShellSkeleton navigationItems={6} />}><AdminDashboard portalBasePath="/auditor" /></Suspense></Layout>
        </ProtectedRoute>
      } />
      <Route path="*" element={<Suspense fallback={<PageSkeleton variant="content" />}><NotFoundPage /></Suspense>} />
      </Routes>
    </>
  );
}
