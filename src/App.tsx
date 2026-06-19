import { FormEvent, lazy, ReactNode, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuth, Role } from "./contexts/AuthContext";
import { logOut } from "./lib/backend";
import { supabase } from "./lib/supabase";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { getDisplayImageUrl } from "./lib/imageStorage";
import { DashboardShellSkeleton, PageSkeleton } from "./components/LoadingSkeleton";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const StorePage = lazy(() => import("./pages/StorePage"));
const CustomerDashboard = lazy(() => import("./pages/CustomerDashboard"));
const StaffDashboard = lazy(() => import("./pages/StaffDashboard"));
const StoreOwnerDashboard = lazy(() => import("./pages/StoreOwnerDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

function MfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    <div className="min-h-screen bg-[#fafafa] dark:bg-gray-950 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Authenticator Required</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Enter the code from your authentication app.</p>
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
            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 dark:text-white"
            placeholder="123456"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={submitting || !code}
            className="inline-flex flex-1 items-center justify-center gap-2 px-5 py-3 rounded-xl bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"
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
        if (active) setMfaRequired(data.nextLevel === "aal2" && data.currentLevel !== "aal2");
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
    return <Navigate to="/" replace />;
  }

  if (checkingMfa) return <PageSkeleton variant="auth" />;

  if (mfaRequired) {
    return <MfaChallenge onVerified={() => setMfaRequired(false)} />;
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
    <div className="min-h-screen bg-[#fafafa] dark:bg-gray-950 transition-colors">
      <nav className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-white rounded-xl shadow-sm overflow-hidden p-0.5">
                  <img src="/icons/icon-192.png?v=20260618-logo" alt="PerkUp Logo" className="w-full h-full object-contain" />
                </div>
                <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">PerkUp</span>
              </div>
              <div className="hidden sm:block h-4 w-px bg-gray-200 dark:bg-gray-800 mx-2"></div>
              <span className="rounded-md bg-orange-50 dark:bg-orange-900/30 px-2.5 py-1 text-[10px] font-bold tracking-wider text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50 uppercase">
                {user?.role.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleAccountClick}
                className="flex items-center gap-3 sm:mr-4 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              >
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                  {user?.avatarUrl || user?.photoURL ? (
                    <img src={getDisplayImageUrl(user.avatarUrl || user.photoURL || "")} alt="" className="h-full w-full object-cover" />
                  ) : user?.name ? (
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{user.name.charAt(0).toUpperCase()}</span>
                  ) : null}
                </div>
                <div className="hidden sm:flex flex-col">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{user?.name || "User"}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 leading-tight truncate max-w-[120px]">{user?.email}</span>
                </div>
              </button>
              <button
                onClick={logOut}
                className="text-sm font-medium px-4 py-2 rounded-xl bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:border dark:border-gray-800 transition-colors"
              >
                Sign out
              </button>
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
    <Routes>
      <Route path="/" element={<Suspense fallback={<PageSkeleton variant="store" />}><LandingPage /></Suspense>} />
      <Route path="/store/:storeId" element={<Suspense fallback={<PageSkeleton variant="store" />}><StorePage /></Suspense>} />
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
        <ProtectedRoute allowedRoles={["admin", "auditor"]}>
          <Layout><Suspense fallback={<PageSkeleton />}><AdminDashboard /></Suspense></Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}
