import AccountSecurity from "@/src/components/AccountSecurity";
import { useAuth } from "../../contexts/AuthContext";
import { doc, updateDoc } from "@/src/lib/dataCompat";
import { db, logOut } from "../../lib/backend";
import { AtSign, Calendar, CheckCircle2, FileText, ImagePlus, LogOut, Mail, Phone, Save, Shield, User, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { getDisplayImageUrl, uploadImageFileToDrive } from "../../lib/imageStorage";

export default function StaffAccount() {
  const { user, refreshUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    phone: "",
    bio: "",
    birthday: "",
    avatarUrl: "",
  });

  const buildFormData = () => ({
    name: user?.name || "",
    username: user?.username || "",
    phone: user?.phone || user?.number || "",
    bio: user?.bio || "",
    birthday: user?.birthday || "",
    avatarUrl: user?.avatarUrl || user?.photoURL || "",
  });

  useEffect(() => {
    if (user) setFormData(buildFormData());
  }, [user]);

  const handleCancel = () => {
    setFormData(buildFormData());
    setSaved(false);
    setIsEditing(false);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;

    setSaving(true);
    setSaved(false);
    try {
      await updateDoc(doc(db, "users", user.id), {
        name: formData.name,
        username: formData.username,
        phone: formData.phone,
        number: formData.phone,
        bio: formData.bio,
        birthday: formData.birthday,
        avatarUrl: formData.avatarUrl,
        photoURL: formData.avatarUrl,
      });
      await refreshUser();
      setIsEditing(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Failed to update staff profile:", error);
      alert("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    try {
      const avatarUrl = await uploadImageFileToDrive(file, {
        owner: formData.username || user.email || user.id,
        purpose: "staff-avatar",
      });
      setFormData((current) => ({ ...current, avatarUrl }));
    } catch (error) {
      console.error("Failed to upload staff profile picture:", error);
      alert("Failed to upload profile picture.");
    } finally {
      event.target.value = "";
    }
  };

  const scrollToEmailSecurity = () => {
    document.getElementById("email-security")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const infoRow = (label: string, value?: string, icon?: React.ReactNode) => (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800">
      <span className="text-sm font-medium text-gray-500 w-36 shrink-0 flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="text-sm text-gray-900 dark:text-gray-300 truncate">{value || "Not set"}</span>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Account Settings</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Manage your staff profile and security preferences.</p>
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

      <form onSubmit={handleSave} className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-3xl border border-gray-200 dark:border-gray-800">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 group">
              {formData.avatarUrl ? (
                <img src={getDisplayImageUrl(formData.avatarUrl)} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <User className="w-9 h-9" />
              )}
              {isEditing && (
                <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <ImagePlus className="w-5 h-5" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Profile Information</h3>
          </div>
          {!isEditing ? (
            <button
              type="button"
              onClick={() => {
                setSaved(false);
                setIsEditing(true);
              }}
              className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={handleCancel} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800">
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
                <Save className="w-4 h-4" />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>

        {!isEditing ? (
          <div className="space-y-4">
            {infoRow("Name", formData.name, <User className="w-4 h-4" />)}
            {infoRow("Username", formData.username, <AtSign className="w-4 h-4" />)}
            {infoRow("Number", formData.phone, <Phone className="w-4 h-4" />)}
            <div className="flex flex-col gap-3 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 sm:flex-row sm:items-center">
              <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="text-sm font-medium text-gray-500 w-36 shrink-0 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </span>
                <span className="text-sm text-gray-900 dark:text-gray-300 truncate">{user?.email || "Not set"}</span>
              </div>
            </div>
            {infoRow("Birthday", formData.birthday, <Calendar className="w-4 h-4" />)}
            {infoRow("Bio", formData.bio, <FileText className="w-4 h-4" />)}
            {infoRow("Role", user?.role.replace("_", " "), <Shield className="w-4 h-4" />)}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-200">Full Name</span>
              <input type="text" required value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 dark:text-white" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><AtSign className="w-4 h-4 text-gray-400" /> Username</span>
              <input type="text" value={formData.username} onChange={(event) => setFormData({ ...formData, username: event.target.value })} className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 dark:text-white" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> Number</span>
              <input type="tel" value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 dark:text-white" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> Birthday</span>
              <input type="date" value={formData.birthday} onChange={(event) => setFormData({ ...formData, birthday: event.target.value })} className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 dark:text-white" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /> Email</span>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input type="email" readOnly value={user?.email || ""} className="min-w-0 flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 text-gray-500 rounded-xl outline-none cursor-not-allowed" />
                <button
                  type="button"
                  onClick={scrollToEmailSecurity}
                  className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
                >
                  Change email
                </button>
              </div>
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Bio</span>
              <textarea value={formData.bio} onChange={(event) => setFormData({ ...formData, bio: event.target.value })} rows={4} className="w-full resize-none px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 dark:text-white" />
            </label>
          </div>
        )}

        {saved && (
          <div className="mt-4 flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
            <CheckCircle2 className="w-5 h-5" />
            Profile saved
          </div>
        )}
      </form>

      <AccountSecurity />
    </div>
  );
}
