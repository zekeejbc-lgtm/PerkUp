import { FormEvent, lazy, ReactNode, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useAuth, Role } from "./contexts/AuthContext";
import { logOut } from "./lib/backend";
import { supabase } from "./lib/supabase";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { getDisplayImageUrl } from "./lib/imageStorage";
import { DashboardShellSkeleton, PageSkeleton } from "./components/LoadingSkeleton";
import { ThemeToggle } from "./components/ThemeToggle";
import { BrandMark } from "./components/BrandMark";
import { findTrustedLoginDevice, getMfaPromptReason, trustCurrentDeviceForUser, TrustedLoginProfile } from "./lib/trustedDevice";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const StoresPage = lazy(() => import("./pages/StoresPage"));
const StorePage = lazy(() => import("./pages/StorePage"));
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

const SCROLL_POSITIONS_KEY = "perkup:scroll-positions";

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

function MfaChallenge({ onVerified, profile }: { onVerified: () => void; profile?: TrustedLoginProfile | null }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("Enter the code from your authentication app.");
  const [trustDevice, setTrustDevice] = useState(false);
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

      const userResponse = await supabase.auth.getUser();
      const userId = userResponse.data.user?.id;
      if (trustDevice && userId) {
        await trustCurrentDeviceForUser(userId);
      }

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

        <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-left dark:border-gray-800 dark:bg-gray-800/70">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(event) => setTrustDevice(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-[#1b1b1b] focus:ring-[#1b1b1b]"
          />
          <span>
            <span className="block text-sm font-semibold text-gray-900 dark:text-white">Trust this device for 30 days</span>
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
              Skip this prompt on this browser unless the device or location changes.
            </span>
          </span>
        </label>

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
          const trustedDevice = await findTrustedLoginDevice(user);
          if (active) setMfaRequired(!trustedDevice);
          return;
        }
        if (active) setMfaRequired(false);
      } catch (error) {
        console.error("MFA assurance check failed:", error);
        if (active) setMfaRequired(false);
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
    case "auditor":
      return <Navigate to="/admin" replace />;
    case "customer":
    default:
      return <Navigate to="/customer" replace />;
  }
}

function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const accountPathByRole: Partial<Record<Role, string>> = {
    admin: "/admin/account",
    auditor: "/admin/account",
    customer: "/customer/profile",
    staff: "/staff/account",
    store_owner: "/owner/account",
  };

  const handleAccountClick = () => {
    const accountPath = user?.role ? accountPathByRole[user.role] : undefined;
    if (accountPath) navigate(accountPath);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#1b1b1b] transition-colors">
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
                className="flex items-center gap-3 sm:mr-4 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#1b1b1b]/30 dark:focus:ring-white/40"
              >
                <div className="h-8 w-8 min-w-8 shrink-0 aspect-square rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                  {user?.avatarUrl || user?.photoURL ? (
                    <img src={getDisplayImageUrl(user.avatarUrl || user.photoURL || "")} alt="" className="block h-full w-full object-cover" />
                  ) : user?.name ? (
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{user.name.charAt(0).toUpperCase()}</span>
                  ) : null}
                </div>
                <div className="hidden sm:flex flex-col">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{user?.name || "User"}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 leading-tight truncate max-w-[120px]">{user?.email}</span>
                </div>
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollPositionManager />
      <Routes>
      <Route path="/" element={<Suspense fallback={<PageSkeleton variant="landing" />}><LandingPage /></Suspense>} />
      <Route path="/reset-password" element={<Suspense fallback={<PageSkeleton variant="auth" />}><ResetPasswordPage /></Suspense>} />
      <Route path="/stores" element={<Suspense fallback={<PageSkeleton variant="content" />}><StoresPage /></Suspense>} />
      <Route path="/store/:storeId" element={<Suspense fallback={<PageSkeleton variant="store" />}><StorePage /></Suspense>} />
      <Route path="/privacy" element={<Suspense fallback={<PageSkeleton variant="content" />}><PrivacyPolicyPage /></Suspense>} />
      <Route path="/data-deletion" element={<Suspense fallback={<PageSkeleton variant="content" />}><DataDeletionPage /></Suspense>} />
      <Route path="/terms" element={<Suspense fallback={<PageSkeleton variant="content" />}><TermsOfServicePage /></Suspense>} />
      <Route path="/feedback" element={<Suspense fallback={<PageSkeleton variant="form" />}><FeedbackPage /></Suspense>} />
      <Route path="/product" element={<Suspense fallback={<PageSkeleton variant="marketing" />}><MarketingPage /></Suspense>} />
      <Route path="/customers" element={<Suspense fallback={<PageSkeleton variant="marketing" />}><MarketingPage /></Suspense>} />
      <Route path="/businesses" element={<Suspense fallback={<PageSkeleton variant="marketing" />}><MarketingPage /></Suspense>} />
      <Route path="/pricing" element={<Suspense fallback={<PageSkeleton variant="pricing" />}><PricingPage /></Suspense>} />
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
        <ProtectedRoute allowedRoles={["admin", "assistant_admin", "auditor"]}>
          <Layout><Suspense fallback={<PageSkeleton />}><AdminDashboard /></Suspense></Layout>
        </ProtectedRoute>
      } />
      </Routes>
    </>
  );
}
