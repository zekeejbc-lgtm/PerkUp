import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, updateDoc } from "@/src/lib/dataCompat";
import { db, logOut } from "../../lib/backend";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { useAuth } from "../../contexts/AuthContext";
import { User, Mail, Plus, Trash2, Shield, Save, X, AtSign, Phone, Calendar, FileText, ImagePlus, LogOut, CheckCircle2 } from "lucide-react";
import AccountSecurity from "@/src/components/AccountSecurity";
import { deleteImageFromDriveSecure, getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import { SkeletonBlock } from "../../components/LoadingSkeleton";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { sanitizePasswordInput } from "../../lib/passwordStrength";
import { sanitizeUsernameInput } from "../../lib/username";

export default function AdminAccount() {
  const { user, refreshUser } = useAuth();
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // My Account state
  const [isEditingMyAccount, setIsEditingMyAccount] = useState(false);
  const [myName, setMyName] = useState(user?.name || "");
  const [myEmail, setMyEmail] = useState(user?.email || "");
  const [myUsername, setMyUsername] = useState(user?.username || "");
  const [myPhone, setMyPhone] = useState(user?.phone || user?.number || "");
  const [myBio, setMyBio] = useState(user?.bio || "");
  const [myBirthday, setMyBirthday] = useState(user?.birthday || "");
  const [myAvatarUrl, setMyAvatarUrl] = useState(user?.avatarUrl || user?.photoURL || "");
  const [myAccountSaved, setMyAccountSaved] = useState(false);
  const [pendingMyAvatarFile, setPendingMyAvatarFile] = useState<File | null>(null);

  // New admin state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminToDelete, setAdminToDelete] = useState<any>(null);
  const [isDeletingAdmin, setIsDeletingAdmin] = useState(false);

  useEffect(() => {
    async function fetchAdmins() {
      try {
        const q = query(collection(db, "users"), where("role", "in", ["admin", "assistant_admin"]));
        const snap = await getDocs(q);
        setAdmins(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Failed to fetch admins:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAdmins();
  }, []);

  useEffect(() => {
    setMyName(user?.name || "");
    setMyEmail(user?.email || "");
    setMyUsername(user?.username || "");
    setMyPhone(user?.phone || user?.number || "");
    setMyBio(user?.bio || "");
    setMyBirthday(user?.birthday || "");
    setMyAvatarUrl(user?.avatarUrl || user?.photoURL || "");
  }, [user]);

  const handleUpdateMyAccount = async () => {
    let uploadedAvatarUrl = "";
    let profilePersisted = false;
    try {
      if (user?.id) {
        const avatarUrl = pendingMyAvatarFile
          ? await uploadImageFileToDriveSecure(pendingMyAvatarFile, {
              owner: myUsername || myEmail || user.id,
              purpose: "admin-avatar",
            })
          : myAvatarUrl;
        if (pendingMyAvatarFile) uploadedAvatarUrl = avatarUrl;
        await updateDoc(doc(db, "users", user.id), {
          name: myName,
          username: myUsername,
          phone: myPhone,
          number: myPhone,
          bio: myBio,
          birthday: myBirthday,
          avatarUrl,
          photoURL: avatarUrl,
        });
        profilePersisted = true;
        const previousAvatarUrl = user.avatarUrl || user.photoURL || "";
        if (previousAvatarUrl && previousAvatarUrl !== avatarUrl) {
          await deleteImageFromDriveSecure(previousAvatarUrl).catch(console.error);
        }
        await refreshUser();
        setPendingMyAvatarFile(null);
      }
      setIsEditingMyAccount(false);
      setMyAccountSaved(true);
      window.setTimeout(() => setMyAccountSaved(false), 3000);
    } catch (e) {
      if (!profilePersisted && uploadedAvatarUrl) {
        await deleteImageFromDriveSecure(uploadedAvatarUrl).catch(console.error);
      }
      console.error(e);
      alert("Failed to update account.");
    }
  };

  const handleCancelMyAccountEdit = () => {
    if (myAvatarUrl.startsWith("blob:")) URL.revokeObjectURL(myAvatarUrl);
    setPendingMyAvatarFile(null);
    setMyName(user?.name || "");
    setMyEmail(user?.email || "");
    setMyUsername(user?.username || "");
    setMyPhone(user?.phone || user?.number || "");
    setMyBio(user?.bio || "");
    setMyBirthday(user?.birthday || "");
    setMyAvatarUrl(user?.avatarUrl || user?.photoURL || "");
    setMyAccountSaved(false);
    setIsEditingMyAccount(false);
  };

  const handleMyAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    if (myAvatarUrl.startsWith("blob:")) URL.revokeObjectURL(myAvatarUrl);
    setPendingMyAvatarFile(file);
    setMyAvatarUrl(URL.createObjectURL(file));
    event.target.value = "";
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

  const handleAddAssistantAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await invokeAdminBackend<{ user: any }>({
        action: "create_account",
        email: newAdminEmail,
        password: newAdminPassword,
        name: newAdminName,
        role: "assistant_admin",
      });

      setAdmins([...admins, result.user]);
      setShowAddModal(false);
      setNewAdminName("");
      setNewAdminEmail("");
      setNewAdminPassword("");
    } catch (error) {
      console.error(error);
      alert("Failed to create assistant admin: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestDeleteAdmin = (admin: any) => {
    if (admin.id === user?.id) {
      alert("You cannot delete your own account here.");
      return;
    }
    setAdminToDelete(admin);
  };

  const handleDeleteAdmin = async () => {
    if (!adminToDelete) return;
    setIsDeletingAdmin(true);
    try {
      await invokeAdminBackend<{ deleted: boolean }>({ action: "delete_user", userId: adminToDelete.id });
      setAdmins((current) => current.filter((admin) => admin.id !== adminToDelete.id));
      setAdminToDelete(null);
    } catch (error) {
      console.error(error);
      alert("Failed to delete admin");
    } finally {
      setIsDeletingAdmin(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 animate-in fade-in duration-300">
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

      <div className="space-y-8">
        <div className="space-y-8">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleUpdateMyAccount();
            }}
            className="space-y-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2rem] p-6 sm:p-8"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-5">
                <div className="relative h-20 w-20 min-w-20 shrink-0 aspect-square bg-gray-100 dark:bg-white/10 rounded-full flex items-center justify-center overflow-hidden group">
                  {myAvatarUrl ? (
                    <img src={getDisplayImageUrl(myAvatarUrl)} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <User className="w-12 h-12 text-[#1b1b1b] dark:text-white" />
                  )}
                  {isEditingMyAccount && (
                    <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <ImagePlus className="w-5 h-5" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleMyAvatarUpload} />
                    </label>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{myName || "Admin User"}</h3>
                  <p className="break-words text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                </div>
              </div>
              {!isEditingMyAccount ? (
                <button
                  type="button"
                  onClick={() => {
                    setMyAccountSaved(false);
                    setIsEditingMyAccount(true);
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                >
                  Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={handleCancelMyAccountEdit} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800">
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                  <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900">
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                </div>
              )}
            </div>

            {!isEditingMyAccount ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {infoRow("Name", myName, <User className="w-3.5 h-3.5" />)}
                {infoRow("Username", myUsername, <AtSign className="w-3.5 h-3.5" />)}
                {infoRow("Number", myPhone, <Phone className="w-3.5 h-3.5" />)}
                {infoRow("Email", user?.email, <Mail className="w-3.5 h-3.5" />)}
                {infoRow("Birthday", myBirthday, <Calendar className="w-3.5 h-3.5" />)}
                {infoRow("Bio", myBio, <FileText className="w-3.5 h-3.5" />)}
                {infoRow("Role", user?.role?.replace("_", " "), <Shield className="w-3.5 h-3.5" />)}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-200">Name</span>
                  <input type="text" value={myName} onChange={e => setMyName(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:text-white" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><AtSign className="w-4 h-4 text-gray-400" /> Username</span>
                  <input type="text" value={myUsername} onChange={e => setMyUsername(sanitizeUsernameInput(e.target.value))} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:text-white" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> Number</span>
                  <input type="tel" value={myPhone} onChange={e => setMyPhone(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:text-white" />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /> Birthday</span>
                  <input type="date" value={myBirthday} onChange={e => setMyBirthday(e.target.value)} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:text-white" />
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /> Email</span>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input type="email" value={myEmail} readOnly className="min-w-0 flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 text-gray-500 rounded-xl outline-none cursor-not-allowed" />
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
                  <textarea value={myBio} onChange={e => setMyBio(e.target.value)} rows={4} className="w-full resize-none px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:text-white" />
                </label>
              </div>
            )}

            <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4">
              {myAccountSaved && (
                <span className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  Profile saved
                </span>
              )}
            </div>
          </form>

          <AccountSecurity />
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Assistant Admins</h4>
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 text-xs font-medium bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white px-3 py-1.5 rounded-lg hover:bg-gray-200">
              <Plus className="w-3 h-3" /> Add New
            </button>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            {loading ? (
              <div className="space-y-3 p-4">
                <SkeletonBlock className="h-16 rounded-2xl" />
                <SkeletonBlock className="h-16 rounded-2xl" />
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
                 {admins.map(admin => (
                   <div key={admin.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-300">
                         {admin.name?.charAt(0) || 'A'}
                       </div>
                       <div>
                         <p className="font-medium text-sm text-gray-900 dark:text-white">{admin.name}</p>
                         <p className="text-xs text-gray-500">{admin.email} • {admin.role === 'admin' ? 'Super Admin' : 'Assistant'}</p>
                       </div>
                     </div>
                     {admin.role !== 'admin' && (
                       <button onClick={() => requestDeleteAdmin(admin)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                         <Trash2 className="w-4 h-4" />
                       </button>
                     )}
                   </div>
                 ))}
                 {admins.length === 1 && (
                   <div className="p-6 text-center text-sm text-gray-500">No assistant admins configured.</div>
                 )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-4xl shadow-xl p-6 border border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Add Assistant Admin</h3>
            <form onSubmit={handleAddAssistantAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Name</label>
                <input type="text" required value={newAdminName} onChange={e => setNewAdminName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" placeholder="Alice Smith" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Email</label>
                <input type="email" required value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" placeholder="alice@admin.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Password</label>
                <input type="password" required value={newAdminPassword} onChange={e => setNewAdminPassword(sanitizePasswordInput(e.target.value))} minLength={6} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" placeholder="Min 6 characters, no spaces" />
              </div>
              
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="rounded-lg bg-[#1b1b1b] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50">
                  {isSubmitting ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={Boolean(adminToDelete)}
        title="Delete assistant admin?"
        description={`${adminToDelete?.name || adminToDelete?.email || "This assistant admin"} will permanently lose administrative access. This action cannot be undone.`}
        confirmLabel="Delete admin"
        isLoading={isDeletingAdmin}
        onClose={() => setAdminToDelete(null)}
        onConfirm={handleDeleteAdmin}
      />
    </div>
  );
}
