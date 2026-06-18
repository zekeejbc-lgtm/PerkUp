import { ChangeEvent, FormEvent, ReactNode, useEffect, useState } from "react";
import AccountSecurity from "@/src/components/AccountSecurity";
import { useAuth } from "../../contexts/AuthContext";
import { doc, setDoc, serverTimestamp } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { getDisplayImageUrl, uploadImageFileToDrive } from "../../lib/imageStorage";
import {
  AtSign,
  Calendar,
  CheckCircle2,
  FileText,
  ImagePlus,
  Mail,
  Phone,
  Save,
  UserCircle,
  X,
} from "lucide-react";

export default function CustomerProfile() {
  const { user, refreshUser } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    username: "",
    phone: "",
    bio: "",
    birthday: "",
    avatarUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const buildFormData = () => ({
    name: user?.name || "",
    username: user?.username || "",
    phone: user?.phone || user?.number || "",
    bio: user?.bio || "",
    birthday: user?.birthday || "",
    avatarUrl: user?.avatarUrl || user?.photoURL || "",
  });

  useEffect(() => {
    if (user) {
      setFormData(buildFormData());
    }
  }, [user]);

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    setUploading(true);
    try {
      const avatarUrl = await uploadImageFileToDrive(file, {
        owner: formData.username || user.email || user.id,
        purpose: "customer-avatar",
      });
      setFormData((current) => ({ ...current, avatarUrl }));
    } catch (error) {
      console.error("Failed to upload customer profile picture:", error);
      alert("Failed to upload profile picture.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;

    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        name: formData.name,
        username: formData.username,
        phone: formData.phone,
        number: formData.phone,
        bio: formData.bio,
        birthday: formData.birthday,
        avatarUrl: formData.avatarUrl,
        photoURL: formData.avatarUrl,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, "users", user.id), payload, { merge: true });
      await setDoc(doc(db, "customers", user.id), payload, { merge: true });
      await refreshUser();
      setSaved(true);
      setIsEditing(false);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Failed to update customer profile:", error);
      alert("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData(buildFormData());
    setSaved(false);
    setIsEditing(false);
  };

  const infoRow = (label: string, value?: string, icon?: ReactNode) => (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white break-words">{value || "Not set"}</div>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Profile</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Manage your profile and account security.</p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2rem] p-6 sm:p-8">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-5">
              <div className="relative w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center overflow-hidden group">
                {formData.avatarUrl ? (
                  <img src={getDisplayImageUrl(formData.avatarUrl)} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <UserCircle className="w-12 h-12 text-orange-600 dark:text-orange-400" />
                )}
                {isEditing && (
                  <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <ImagePlus className="w-5 h-5" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploading} />
                  </label>
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{formData.name || "Customer"}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                {uploading && <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">Uploading profile picture...</p>}
              </div>
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
                <button type="submit" disabled={saving || uploading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900">
                  <Save className="w-4 h-4" />
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>

          {!isEditing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {infoRow("Name", formData.name)}
              {infoRow("Username", formData.username, <AtSign className="w-3.5 h-3.5" />)}
              {infoRow("Number", formData.phone, <Phone className="w-3.5 h-3.5" />)}
              {infoRow("Email", user?.email || "", <Mail className="w-3.5 h-3.5" />)}
              {infoRow("Birthday", formData.birthday, <Calendar className="w-3.5 h-3.5" />)}
              {infoRow("Bio", formData.bio, <FileText className="w-3.5 h-3.5" />)}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200">Name</span>
                <input type="text" required value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 dark:text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><AtSign className="w-4 h-4 text-gray-400" /> Username</span>
                <input type="text" value={formData.username} onChange={(event) => setFormData({ ...formData, username: event.target.value })} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 dark:text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> Number</span>
                <input type="tel" value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 dark:text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> Birthday</span>
                <input type="date" value={formData.birthday} onChange={(event) => setFormData({ ...formData, birthday: event.target.value })} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 dark:text-white" />
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /> Email</span>
                <input type="email" readOnly value={user?.email || ""} className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 text-gray-500 rounded-xl outline-none cursor-not-allowed" />
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Bio</span>
                <textarea value={formData.bio} onChange={(event) => setFormData({ ...formData, bio: event.target.value })} rows={4} className="w-full resize-none px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 dark:text-white" />
              </label>
            </div>
          )}

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4">
            {saved && (
              <span className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                <CheckCircle2 className="w-5 h-5" />
                Profile saved
              </span>
            )}
          </div>
        </form>
      </div>

      <AccountSecurity />
    </div>
  );
}
