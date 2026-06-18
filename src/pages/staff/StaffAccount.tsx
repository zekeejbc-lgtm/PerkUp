import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { updatePassword } from "@/src/lib/supabaseAuthCompat";
import { auth } from "../../lib/backend";
import { Mail, Shield, User, KeyRound, AlertTriangle } from "lucide-react";

export default function StaffAccount() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !newPassword) return;

    if (newPassword.length < 6) {
      setMessage({ text: "Password must be at least 6 characters long.", type: "error" });
      return;
    }

    setIsUpdating(true);
    setMessage(null);

    try {
      await updatePassword(auth.currentUser, newPassword);
      setMessage({ text: "Password updated successfully.", type: "success" });
      setNewPassword("");
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/requires-recent-login') {
        setMessage({ text: "Please sign out and sign in again before changing your password.", type: "error" });
      } else {
        setMessage({ text: "Failed to update password. Please try again.", type: "error" });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Account Settings</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Manage your staff profile and security preferences.</p>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-3xl border border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-gray-400" />
          Profile Information
        </h3>
        
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
            <span className="text-sm font-medium text-gray-500 w-32 shrink-0 flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email
            </span>
            <span className="text-sm text-gray-900 dark:text-gray-300 truncate">{user?.email}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
            <span className="text-sm font-medium text-gray-500 w-32 shrink-0 flex items-center gap-2">
              <Shield className="w-4 h-4" /> Role
            </span>
            <span className="text-sm font-semibold capitalize text-orange-600 dark:text-orange-400">
              {user?.role.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-3xl border border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-gray-400" />
          Security
        </h3>
        
        <form onSubmit={handlePasswordChange} className="space-y-4">
          {message && (
            <div className={`p-4 rounded-2xl text-sm font-medium flex items-center gap-2 ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' 
                : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
            }`}>
              {message.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0" />}
              {message.text}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
            <input 
              type="password" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-orange-500 dark:focus:border-orange-500 dark:text-white transition-colors"
            />
            <p className="text-xs text-gray-500 mt-2">Make sure it's at least 6 characters.</p>
          </div>
          
          <button 
            type="submit" 
            disabled={isUpdating || !newPassword}
            className="px-6 py-3 bg-gray-900 hover:bg-black text-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 rounded-xl font-medium disabled:opacity-50 transition-colors"
          >
            {isUpdating ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
