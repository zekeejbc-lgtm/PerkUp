import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, updatePassword, signOut } from "firebase/auth";
import { db, auth, secondaryAuth } from "../../lib/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { User, Mail, Key, Plus, Trash2, Shield, UserCog, Loader2, Save } from "lucide-react";

export default function AdminAccount() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // My Account state
  const [isEditingMyAccount, setIsEditingMyAccount] = useState(false);
  const [myName, setMyName] = useState(user?.displayName || "");
  const [myEmail, setMyEmail] = useState(user?.email || "");
  const [newPassword, setNewPassword] = useState("");

  // New admin state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleUpdateMyAccount = async () => {
    try {
      if (newPassword && auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
      }
      
      if (user?.uid) {
        await updateDoc(doc(db, "users", user.uid), {
          name: myName,
        });
        // We wouldn't easily update email without re-auth, so we might skip email update for demo or just update DB
      }
      alert("Account updated successfully");
      setIsEditingMyAccount(false);
      setNewPassword("");
    } catch (e) {
      console.error(e);
      alert("Failed to update account. Re-authentication might be required for password changes.");
    }
  };

  const handleAddAssistantAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const creds = await createUserWithEmailAndPassword(secondaryAuth, newAdminEmail, newAdminPassword);
      const newAdminId = creds.user.uid;
      
      const newAdminData = {
        email: newAdminEmail,
        name: newAdminName,
        role: "assistant_admin",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, "users", newAdminId), newAdminData);
      await signOut(secondaryAuth);

      setAdmins([...admins, { id: newAdminId, ...newAdminData }]);
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

  const handleDeleteAdmin = async (adminId: string) => {
    if (adminId === user?.uid) {
      alert("You cannot delete your own account here.");
      return;
    }
    if (!window.confirm("Delete this assistant admin?")) return;
    try {
      await deleteDoc(doc(db, "users", adminId));
      setAdmins(admins.filter(a => a.id !== adminId));
    } catch (error) {
      console.error(error);
      alert("Failed to delete admin");
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 bg-gray-50/50 dark:bg-gray-900/50">
        <UserCog className="w-5 h-5 text-gray-500" />
        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Account & Admins</h3>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* My Account Profile */}
        <div className="space-y-6">
          <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">My Profile</h4>
          <div className="bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm relative">
             {!isEditingMyAccount ? (
               <button onClick={() => setIsEditingMyAccount(true)} className="absolute top-4 right-4 text-xs font-medium bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 text-gray-700 dark:text-gray-200">
                 Edit
               </button>
             ) : (
               <button onClick={handleUpdateMyAccount} className="absolute top-4 right-4 flex items-center gap-1 text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700">
                 <Save className="w-3 h-3" /> Save
               </button>
             )}

             <div className="flex items-center gap-4 mb-6">
               <div className="w-16 h-16 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-2xl">
                 {myName.charAt(0) || user?.email?.charAt(0) || 'A'}
               </div>
               <div>
                 <h5 className="font-bold text-gray-900 dark:text-white text-lg">{myName || "Admin User"}</h5>
                 <p className="text-gray-500 text-sm flex items-center gap-1"><Shield className="w-3 h-3"/> Super Admin</p>
               </div>
             </div>

             <div className="space-y-4">
               <div>
                 <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><User className="w-3 h-3" /> Name/Username</label>
                 {isEditingMyAccount ? (
                   <input type="text" value={myName} onChange={e => setMyName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                 ) : (
                   <p className="text-gray-900 dark:text-white text-sm font-medium">{myName || "Not set"}</p>
                 )}
               </div>
               <div>
                 <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><Mail className="w-3 h-3" /> Email Address</label>
                 {isEditingMyAccount ? (
                   <input type="email" value={myEmail} disabled className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm text-gray-400 cursor-not-allowed" title="Email change requires special flow" />
                 ) : (
                   <p className="text-gray-900 dark:text-white text-sm font-medium">{user?.email}</p>
                 )}
               </div>
               {isEditingMyAccount && (
                 <div>
                   <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><Key className="w-3 h-3" /> New Password</label>
                   <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" placeholder="Leave blank to keep current" />
                 </div>
               )}
             </div>
          </div>
        </div>

        {/* Assistant Admins */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Assistant Admins</h4>
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-3 py-1.5 rounded-lg hover:bg-orange-200">
              <Plus className="w-3 h-3" /> Add New
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
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
                       <button onClick={() => handleDeleteAdmin(admin.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
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
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-[2rem] shadow-xl p-6 border border-gray-100 dark:border-gray-800">
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
                <input type="password" required value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} minLength={6} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" placeholder="Min 6 characters" />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium py-2 px-4 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-orange-600 text-white font-medium py-2 px-4 rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50">
                  {isSubmitting ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
