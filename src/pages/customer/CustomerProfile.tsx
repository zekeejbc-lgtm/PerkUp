import { useAuth } from "../../contexts/AuthContext";
import { User as UserIcon, Mail } from "lucide-react";
import { logOut } from "../../lib/backend";

export default function CustomerProfile() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Profile</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your account details and preferences.</p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors max-w-2xl overflow-hidden">
        <div className="p-8 pb-0 flex items-center gap-6 mb-8">
            <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center shrink-0 border-4 border-white dark:border-gray-950 shadow-sm">
                {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full rounded-full object-cover" />
                ) : (
                    <UserIcon className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                )}
            </div>
            <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {user?.name || "PerkUp User"}
                </h3>
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mt-1">
                    <Mail className="w-4 h-4" />
                    <span className="text-sm">{user?.email}</span>
                </div>
            </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 p-8 space-y-8">
            <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4">Account Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                    <div>
                        <div className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">User ID</div>
                        <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{user?.id}</div>
                    </div>
                    <div>
                        <div className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Role</div>
                        <div className="inline-block px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300 capitalize">
                            {user?.role.replace('_', ' ')}
                        </div>
                    </div>
                </div>
            </div>

            <div className="pt-6 border-t border-gray-100 dark:border-gray-800">
                <button
                    onClick={logOut}
                    className="flex justify-center w-full px-4 py-3 border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                >
                    Sign Out
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}
