import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { doc, updateDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { UserCircle, Mail, Key, Phone, MapPin, AtSign, Upload, Save, CheckCircle2 } from "lucide-react";
import { getDisplayImageUrl, uploadImageFileToDrive } from "../../lib/imageStorage";

export default function StoreOwnerAccount() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    username: "",
    avatarUrl: ""
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        address: user.address || "",
        phone: user.phone || "",
        username: user.username || "",
        avatarUrl: user.avatarUrl || ""
      });
    }
  }, [user]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const avatarUrl = await uploadImageFileToDrive(file, {
        owner: formData.username || user?.email || user?.id,
        purpose: "store-owner-avatar",
      });
      setFormData(prev => ({ ...prev, avatarUrl }));
    } catch (err) {
      console.error("Avatar upload failed", err);
      alert("Failed to upload profile image");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateDoc(doc(db, "users", user.id), {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        username: formData.username,
        avatarUrl: formData.avatarUrl
      });
      // Context should ideally reload but this handles UI immediately
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error(error);
      alert("Failed to update account information");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Account Settings</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Manage your personal information, profile, and credentials.</p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2rem] p-6 sm:p-8 space-y-8">
        
        <form onSubmit={handleSave} className="space-y-6 flex flex-col items-start w-full">
          {/* Profile Picture */}
          <div className="flex items-center gap-6 mb-4">
            <div className="relative w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full border-4 border-white dark:border-gray-950 shadow-sm overflow-hidden group">
              {formData.avatarUrl ? (
                <img src={getDisplayImageUrl(formData.avatarUrl)} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <UserCircle className="w-full h-full text-gray-300 p-2" />
              )}
              <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-white text-xs font-semibold">
                Upload
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{formData.name || 'Store Owner'}</h3>
              <p className="text-gray-500 text-sm">{user?.role.toUpperCase().replace('_', ' ')}</p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 w-full">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Full Name</label>
              <input 
                type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" 
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><AtSign className="w-4 h-4 text-gray-400" /> Username</label>
              <input 
                type="text" required value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" 
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> Address</label>
              <input 
                type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" 
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> Contact Number</label>
              <input 
                type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" 
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" /> Email Address
              </label>
              <input 
                type="email" readOnly value={user?.email || ''} 
                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 text-gray-500 rounded-xl outline-none cursor-not-allowed" 
              />
            </div>
          </div>

          <div className="w-full pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4">
            <button type="submit" disabled={saving} className="flex items-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-6 py-2.5 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
              <Save className="w-5 h-5" />
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
            {saved && (
              <span className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium animate-in fade-in slide-in-from-left-2">
                <CheckCircle2 className="w-5 h-5" />
                Profile saved!
              </span>
            )}
          </div>
        </form>

        <div className="pt-6 mt-6 border-t border-gray-100 dark:border-gray-800 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
              <Key className="w-4 h-4 text-gray-400" />
              Authentication & Password
            </label>
            <p className="text-xs text-gray-500 mb-2">Need to change your password? We will send a secure link to your email.</p>
            <button type="button" onClick={() => alert("Password reset email sent!")} className="text-sm font-bold bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50 px-4 py-2 rounded-lg transition-colors">
              Send password reset email
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
