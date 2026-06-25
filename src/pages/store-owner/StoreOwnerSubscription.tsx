import { CreditCard, CheckCircle2, AlertCircle } from "lucide-react";

export default function StoreOwnerSubscription() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Subscription Management</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Review your active PerkUp subscription details.</p>
      </div>

      <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-8 rounded-3xl text-white shadow-lg relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
        
        <div className="flex justify-between items-start relative z-10">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-xs font-bold uppercase tracking-widest mb-6">
              <CheckCircle2 className="w-3.5 h-3.5" /> Active Plan
            </div>
            <h3 className="text-3xl font-bold mb-2">Professional Tier</h3>
            <p className="text-gray-400 max-w-sm">Full access to customer analytics, unlimited scans, and advanced promotional tools.</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-black mb-1 text-[#1b1b1b]">₱2,499</div>
            <div className="text-sm text-gray-400 uppercase tracking-widest">per month</div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between sm:items-center gap-4 relative z-10">
           <div className="flex items-center gap-4 text-sm">
             <div className="bg-white/10 p-2 rounded-xl">
               <CreditCard className="w-5 h-5" />
             </div>
             <div>
               <p className="text-gray-300">Next billing date</p>
               <p className="font-semibold text-white">August 1st, 2026</p>
             </div>
           </div>
           
           <button className="bg-white text-gray-900 px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors">
             Manage Billing
           </button>
        </div>
      </div>

      <div className="bg-gray-100 dark:bg-white/10 border border-gray-300 dark:border-white/15 p-6 rounded-2xl flex items-start gap-4">
        <AlertCircle className="w-6 h-6 text-[#1b1b1b] dark:text-white shrink-0" />
        <div>
           <h4 className="font-bold text-gray-900 dark:text-white">Payment Method Setup</h4>
           <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Your account is currently running on a promotional period. Please add a payment method before August 1st to ensure uninterrupted access.</p>
        </div>
      </div>
    </div>
  );
}
