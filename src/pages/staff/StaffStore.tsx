import { Store, MapPin, UserCircle, Phone, Mail, Clock } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

export default function StaffStore({ store }: { store: any }) {
  const { user } = useAuth();
  
  if (!store) return null;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Information</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Details about the branch you are currently assigned to.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Store Detail Card */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-6 sm:p-8 rounded-[2rem] border border-gray-200 dark:border-gray-800 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-gray-100 dark:bg-white/10 rounded-[1.5rem] flex items-center justify-center mb-6">
            <Store className="w-10 h-10 text-[#1b1b1b] dark:text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{store.name || "Unnamed Store"}</h3>
          
          <div className="space-y-3 mt-6 text-sm text-gray-600 dark:text-gray-300 w-full text-left">
            <div className="flex items-start gap-3 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800/50">
              <MapPin className="w-5 h-5 shrink-0 text-gray-400" />
              <span>{store.address || "Address not provided"}</span>
            </div>
            {(store.contactEmail || store.contactPhone) && (
              <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800/50">
                <Phone className="w-5 h-5 shrink-0 text-gray-400" />
                <span>{store.contactPhone} {store.contactEmail && `• ${store.contactEmail}`}</span>
              </div>
            )}
            {store.operatingHours && (
              <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800/50">
                <Clock className="w-5 h-5 shrink-0 text-gray-400" />
                <span>{store.operatingHours}</span>
              </div>
            )}
          </div>
        </div>

        {/* Staff Assignment Card */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-6 sm:p-8 rounded-[2rem] border border-gray-200 dark:border-gray-800">
           <div className="flex items-center gap-4 mb-8">
             <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
               <UserCircle className="w-7 h-7 text-gray-500 dark:text-gray-400" />
             </div>
             <div>
               <p className="text-sm font-semibold text-gray-900 dark:text-white">Assigned Representative</p>
               <p className="text-xs text-gray-500 uppercase tracking-widest mt-0.5">Active Staff Member</p>
             </div>
           </div>

           <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1 block">Staff Name</label>
                <div className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 text-sm font-medium">
                  {user?.name || "No name set"}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1 block">Email</label>
                <div className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  {user?.email}
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  As a staff member, you have access to scan customer cards, view running promotions, and assist customers with their rewards at this branch.
                </p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
