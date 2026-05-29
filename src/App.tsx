import { ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth, Role } from "./contexts/AuthContext";
import { logOut } from "./lib/firebase";

// Placeholders for views
import LandingPage from "./pages/LandingPage";
import StorePage from "./pages/StorePage";
import CustomerDashboard from "./pages/CustomerDashboard";
import StaffDashboard from "./pages/StaffDashboard";
import StoreOwnerDashboard from "./pages/StoreOwnerDashboard";
import AdminDashboard from "./pages/AdminDashboard";

function ProtectedRoute({ children, allowedRoles }: { children: ReactNode, allowedRoles?: Role[] }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-[#fafafa]">Loading...</div>;

  if (!user) {
    return <Navigate to="/" replace />;
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
  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-gray-950 transition-colors">
      <nav className="sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm overflow-hidden shrink-0">
                  <img src="https://i.imgur.com/qnbXJU8.png" alt="PerkUp Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">PerkUp</span>
              </div>
              <div className="hidden sm:block h-4 w-px bg-gray-200 dark:bg-gray-800 mx-2"></div>
              <span className="rounded-md bg-orange-50 dark:bg-orange-900/30 px-2.5 py-1 text-[10px] font-bold tracking-wider text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/50 uppercase">
                {user?.role.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 mr-4">
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden">
                  {user?.name ? (
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{user.name.charAt(0).toUpperCase()}</span>
                  ) : null}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{user?.name || "User"}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 leading-tight truncate max-w-[120px]">{user?.email}</span>
                </div>
              </div>
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
      <Route path="/" element={<LandingPage />} />
      <Route path="/store/:storeId" element={<StorePage />} />
      <Route path="/dashboard" element={<RoleRouter />} />
      
      <Route path="/customer/*" element={
        <ProtectedRoute allowedRoles={["customer"]}>
          <Layout><CustomerDashboard /></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/staff/*" element={
        <ProtectedRoute allowedRoles={["staff"]}>
          <Layout><StaffDashboard /></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/owner/*" element={
        <ProtectedRoute allowedRoles={["store_owner"]}>
          <Layout><StoreOwnerDashboard /></Layout>
        </ProtectedRoute>
      } />
      
      <Route path="/admin/*" element={
        <ProtectedRoute allowedRoles={["admin", "auditor"]}>
          <Layout><AdminDashboard /></Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}
