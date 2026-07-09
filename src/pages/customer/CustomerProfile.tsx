import { ChangeEvent, FormEvent, ReactNode, useEffect, useState } from "react";
import AccountSecurity from "@/src/components/AccountSecurity";
import { ProfileAvatarImage } from "@/src/components/ProfileAvatarImage";
import { useAuth } from "../../contexts/AuthContext";
import { logOut } from "../../lib/backend";
import { deleteImageFromDriveSecure, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import { updateCustomerProfile } from "@/src/lib/secureQr";
import { getUsernameValidationMessage, normalizeUsername } from "@/src/lib/username";
import {
  AtSign,
  Calendar,
  CheckCircle2,
  FileText,
  ImagePlus,
  LogOut,
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
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreviewUrl, setPendingAvatarPreviewUrl] = useState("");
  const [formError, setFormError] = useState("");

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

  useEffect(() => {
    return () => {
      if (pendingAvatarPreviewUrl) URL.revokeObjectURL(pendingAvatarPreviewUrl);
    };
  }, [pendingAvatarPreviewUrl]);

  const clearPendingAvatar = () => {
    if (pendingAvatarPreviewUrl) {
      URL.revokeObjectURL(pendingAvatarPreviewUrl);
    }
    setPendingAvatarFile(null);
    setPendingAvatarPreviewUrl("");
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith("image/")) {
      setFormError("Only image uploads are supported.");
      event.target.value = "";
      return;
    }

    if (pendingAvatarPreviewUrl) URL.revokeObjectURL(pendingAvatarPreviewUrl);
    setPendingAvatarFile(file);
    setPendingAvatarPreviewUrl(URL.createObjectURL(file));
    setFormError("");
    event.target.value = "";
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;

    const username = normalizeUsername(formData.username);
    const usernameMessage = getUsernameValidationMessage(username);
    if (usernameMessage) {
      setFormError(usernameMessage);
      return;
    }

    setSaving(true);
    setSaved(false);
    setFormError("");
    let uploadedAvatarUrl = "";
    try {
      let avatarUrl = formData.avatarUrl;
      const previousAvatarUrl = user.avatarUrl || user.photoURL || "";

      if (pendingAvatarFile) {
        avatarUrl = await uploadImageFileToDriveSecure(pendingAvatarFile, {
          owner: username || user.email || user.id,
          purpose: "customer-avatar",
        });
        uploadedAvatarUrl = avatarUrl;
      }

      await updateCustomerProfile({
        name: formData.name,
        username,
        phone: formData.phone,
        bio: formData.bio,
        birthday: formData.birthday,
        avatarUrl,
      });

      if (uploadedAvatarUrl && previousAvatarUrl && previousAvatarUrl !== uploadedAvatarUrl) {
        deleteImageFromDriveSecure(previousAvatarUrl).catch((deleteError) => {
          console.warn("Profile saved, but the previous Drive avatar could not be deleted:", deleteError);
        });
      }

      await refreshUser();
      clearPendingAvatar();
      setFormData((current) => ({ ...current, username, avatarUrl }));
      setSaved(true);
      setIsEditing(false);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      if (uploadedAvatarUrl) {
        deleteImageFromDriveSecure(uploadedAvatarUrl).catch((deleteError) => {
          console.warn("Profile save failed, and the new Drive avatar could not be cleaned up:", deleteError);
        });
      }
      console.error("Failed to update customer profile:", error);
      setFormError(error instanceof Error ? error.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData(buildFormData());
    clearPendingAvatar();
    setSaved(false);
    setFormError("");
    setIsEditing(false);
  };

  const scrollToEmailSecurity = () => {
    document.getElementById("email-security")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        <form onSubmit={handleSave} className="space-y-6">
          {formError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {formError}
            </div>
          )}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-5">
              <div className="relative h-20 w-20 min-w-20 shrink-0 aspect-square bg-gray-100 dark:bg-white/10 rounded-full flex items-center justify-center overflow-hidden group">
                <ProfileAvatarImage
                  src={pendingAvatarPreviewUrl || formData.avatarUrl}
                  alt="Profile"
                  className="block h-full w-full object-cover"
                  fallback={<UserCircle className="w-12 h-12 text-[#1b1b1b] dark:text-white" />}
                />
                {isEditing && (
                  <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <ImagePlus className="w-5 h-5" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={saving} />
                  </label>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{formData.name || "Customer"}</h3>
                <p className="break-words text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                {pendingAvatarFile && <p className="mt-1 text-xs text-[#1b1b1b] dark:text-white">New profile picture ready to save.</p>}
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
                <button type="submit" disabled={saving || Boolean(getUsernameValidationMessage(formData.username))} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900">
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
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200">Name</span>
                <input type="text" required value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><AtSign className="w-4 h-4 text-gray-400" /> Username <span className="text-[#1b1b1b]">*</span></span>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(event) => setFormData({ ...formData, username: normalizeUsername(event.target.value) })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:text-white"
                />
                <p className={`text-xs font-medium ${getUsernameValidationMessage(formData.username) ? "text-[#1b1b1b] dark:text-white" : "text-green-600 dark:text-green-400"}`}>
                  {getUsernameValidationMessage(formData.username) || "Strong format. Uniqueness is verified when you save."}
                </p>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> Number</span>
                <input type="tel" required value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:text-white" />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> Birthday</span>
                <input type="date" required value={formData.birthday} onChange={(event) => setFormData({ ...formData, birthday: event.target.value })} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:text-white" />
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /> Email</span>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input type="email" readOnly value={user?.email || ""} className="min-w-0 flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 text-gray-500 rounded-xl outline-none cursor-not-allowed" />
                  <button
                    type="button"
                    onClick={scrollToEmailSecurity}
                    className="inline-flex items-center justify-center rounded-xl bg-[#1b1b1b] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
                  >
                    Change email
                  </button>
                </div>
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" /> Bio</span>
                <textarea value={formData.bio} onChange={(event) => setFormData({ ...formData, bio: event.target.value })} rows={4} className="w-full resize-none px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:text-white" />
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
