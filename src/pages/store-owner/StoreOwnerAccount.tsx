import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { doc, updateDoc } from "@/src/lib/dataCompat";
import { db, logOut } from "../../lib/backend";
import { UserCircle, Mail, Phone, MapPin, AtSign, Save, CheckCircle2, X, Calendar, FileText, LogOut } from "lucide-react";
import { deleteImageFromDriveSecure, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import AccountSecurity from "@/src/components/AccountSecurity";
import CurrencyPreference from "@/src/components/CurrencyPreference";
import { ProfileAvatarImage } from "@/src/components/ProfileAvatarImage";
import { sanitizeUsernameInput } from "@/src/lib/username";

export default function StoreOwnerAccount() {
  const { user, refreshUser } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    username: "",
    avatarUrl: "",
    bio: "",
    birthday: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);

  const buildFormData = () => ({
    name: user?.name || "",
    address: user?.address || "",
    phone: user?.phone || "",
    username: user?.username || "",
    avatarUrl: user?.avatarUrl || user?.photoURL || "",
    bio: user?.bio || "",
    birthday: user?.birthday || "",
  });

  useEffect(() => {
    if (user) {
      setFormData(buildFormData());
    }
  }, [user]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isEditing) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (formData.avatarUrl.startsWith("blob:")) URL.revokeObjectURL(formData.avatarUrl);
    setPendingAvatarFile(file);
    setFormData(prev => ({ ...prev, avatarUrl: URL.createObjectURL(file) }));
    e.target.value = "";
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setSaving(true);
    setSaved(false);
    let uploadedAvatarUrl = "";
    let profilePersisted = false;
    try {
      const avatarUrl = pendingAvatarFile
        ? await uploadImageFileToDriveSecure(pendingAvatarFile, {
            owner: formData.username || user?.email || user?.id,
            purpose: "store-owner-avatar",
          })
        : formData.avatarUrl;
      if (pendingAvatarFile) uploadedAvatarUrl = avatarUrl;
      await updateDoc(doc(db, "users", user.id), {
        name: formData.name,
        address: formData.address,
        phone: formData.phone,
        number: formData.phone,
        username: formData.username,
        avatarUrl,
        photoURL: avatarUrl,
        bio: formData.bio,
        birthday: formData.birthday,
      });
      profilePersisted = true;
      const previousAvatarUrl = user.avatarUrl || user.photoURL || "";
      if (previousAvatarUrl && previousAvatarUrl !== avatarUrl) {
        await deleteImageFromDriveSecure(previousAvatarUrl).catch(console.error);
      }
      await refreshUser();
      setPendingAvatarFile(null);
      setSaved(true);
      setIsEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      if (!profilePersisted && uploadedAvatarUrl) {
        await deleteImageFromDriveSecure(uploadedAvatarUrl).catch(console.error);
      }
      console.error(error);
      alert("Failed to update account information");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (formData.avatarUrl.startsWith("blob:")) URL.revokeObjectURL(formData.avatarUrl);
    setPendingAvatarFile(null);
    setFormData(buildFormData());
    setSaved(false);
    setIsEditing(false);
  };

  const scrollToEmailSecurity = () => {
    document.getElementById("email-security")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const infoRow = (label: string, value?: string, icon?: React.ReactNode) => (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white break-words">{value || "Not set"}</div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Profile</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Manage your profile and account security.</p>
        </div>
        <button
          type="button"
          onClick={logOut}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2rem] p-6 sm:p-8">
        <form onSubmit={handleSave} className="space-y-6 flex flex-col items-start w-full">
          {/* Profile Picture */}
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-5">
            <div className="relative h-20 w-20 min-w-20 shrink-0 aspect-square bg-gray-100 dark:bg-white/10 rounded-full flex items-center justify-center overflow-hidden group">
              <ProfileAvatarImage
                src={formData.avatarUrl}
                alt="Profile"
                className="w-full h-full object-cover"
                fallback={<UserCircle className="w-12 h-12 text-[#1b1b1b] dark:text-white" />}
              />
              {isEditing && (
              <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-white">
                <UserCircle className="w-5 h-5" />
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{formData.name || 'Store Owner'}</h3>
              <p className="break-words text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
            </div>
            </div>
            {!isEditing ? (
              <button
                type="button"
                onClick={() => {
                  setSaved(false);
                  setIsEditing(true);
                }}
                aria-label="Edit profile"
                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={handleCancel} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800">
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>

          {!isEditing ? (
            <div className="grid gap-4 sm:grid-cols-2 w-full">
              {infoRow("Full Name", formData.name)}
              {infoRow("Username", formData.username, <AtSign className="w-3.5 h-3.5" />)}
              {infoRow("Address", formData.address, <MapPin className="w-3.5 h-3.5" />)}
              {infoRow("Number", formData.phone, <Phone className="w-3.5 h-3.5" />)}
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <Mail className="w-3.5 h-3.5" />
                  Email
                </div>
                <div className="mt-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white break-words">{user?.email || "Not set"}</div>
                </div>
              </div>
              {infoRow("Birthday", formData.birthday, <Calendar className="w-3.5 h-3.5" />)}
              {infoRow("Bio", formData.bio, <FileText className="w-3.5 h-3.5" />)}
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 w-full">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Full Name</label>
              <input
                type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><AtSign className="w-4 h-4 text-gray-400" /> Username</label>
              <input
                type="text" required value={formData.username} onChange={e => setFormData({...formData, username: sanitizeUsernameInput(e.target.value)})}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> Address</label>
              <input
                type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> Number</label>
              <input
                type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> Birthday</label>
              <input
                type="date" value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" /> Email
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="email" readOnly value={user?.email || ''}
                  className="min-w-0 flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 text-gray-500 rounded-xl outline-none cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={scrollToEmailSecurity}
                  className="inline-flex items-center justify-center rounded-xl bg-[#1b1b1b] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
                >
                  Change email
                </button>
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Bio</label>
              <textarea
                value={formData.bio}
                onChange={e => setFormData({...formData, bio: e.target.value})}
                rows={4}
                className="w-full resize-none px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]"
              />
            </div>
          </div>
          )}

          <div className="w-full pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4">
            {saved && (
              <span className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium animate-in fade-in slide-in-from-left-2">
                <CheckCircle2 className="w-5 h-5" />
                Profile saved!
              </span>
            )}
          </div>
        </form>

      </div>

      <CurrencyPreference />
      <AccountSecurity />
    </div>
  );
}
