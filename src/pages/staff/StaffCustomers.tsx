import { useState, useEffect } from "react";
import { collection, doc, query, where, getDoc, getDocs } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Cake, CreditCard, Star, Users, X } from "lucide-react";
import { SkeletonBlock } from "../../components/LoadingSkeleton";
import { getBirthdayStatus } from "@/src/lib/birthday";
import { Pagination } from "../../components/Pagination";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { formatCustomerCode } from "../../lib/customerId";

const CUSTOMERS_PER_PAGE = 10;

const getCustomerName = (card: any) => {
  if (card.accountDeleted) return "Deleted account";
  const profile = card.customerProfile || {};
  return profile.name || profile.displayName || card.customerName || "Unknown customer";
};

const getCustomerSubtext = (card: any) => {
  if (card.accountDeleted) return "Customer identifier removed";
  const profile = card.customerProfile || {};
  if (profile.username) return `@${profile.username}`;
  if (profile.email) return profile.email;
  return card.customerId ? formatCustomerCode(card.customerId) : "No customer ID";
};

const getCustomerDetailSubtext = (card: any) => {
  if (card.accountDeleted) return "Customer identifier removed";
  const username = card.customerProfile?.username;
  if (username) return `@${username}`;
  return card.customerId ? formatCustomerCode(card.customerId) : "Loyalty customer";
};

const getCardAppName = (card: any, store: any) =>
  card.cardName || card.title || card.appName || card.storeName || store?.name || "PerkUp loyalty card";

const formatCardDate = (value: any) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : "Recently";
};

export default function StaffCustomers({ store }: { store: any }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const totalPages = Math.max(1, Math.ceil(customers.length / CUSTOMERS_PER_PAGE));
  const paginatedCustomers = customers.slice((currentPage - 1) * CUSTOMERS_PER_PAGE, currentPage * CUSTOMERS_PER_PAGE);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!selectedCustomer) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedCustomer(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedCustomer]);

  useEffect(() => {
    if (!store?.id) return;
    async function fetchCustomers() {
      try {
        const q = query(collection(db, "cards"), where("storeId", "==", store.id));
        const snap = await getDocs(q);
        
        const custData = await Promise.all(snap.docs.map(async (d) => {
          const card = { id: d.id, ...d.data() } as any;
          if (!card.customerId) return card;

          try {
            const [userDoc, customerDoc] = await Promise.all([
              getDoc(doc(db, "users", card.customerId)),
              getDoc(doc(db, "customers", card.customerId)),
            ]);
            const userProfile = userDoc.exists() ? userDoc.data() : {};
            const customerProfile = customerDoc.exists() ? customerDoc.data() : {};
            return {
              ...card,
              customerProfile: {
                ...customerProfile,
                ...userProfile,
              },
            };
          } catch (profileError) {
            console.warn("Failed to load customer profile", card.customerId, profileError);
            return card;
          }
        }));
        setCustomers(custData);
      } catch (err) {
        console.error("Failed to load customers", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCustomers();
  }, [store]);

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Customers</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">View customers and their card progress.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <SkeletonBlock key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-12 rounded-[2rem] border border-dashed border-gray-300 dark:border-gray-700 text-center flex flex-col items-center">
          <Users className="w-16 h-16 text-gray-400 mb-6" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No customers yet</h3>
          <p className="text-gray-500 max-w-sm mb-8">When a customer joins your store's program, they will appear here.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">App / Card</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Birthday</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Stars</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {paginatedCustomers.map(c => {
                  const birthday = getBirthdayStatus(c.customerProfile?.birthday);
                  const avatarUrl = c.customerProfile?.avatarUrl || c.customerProfile?.photoURL || c.customerProfile?.profilePic || "";
                  const customerName = getCustomerName(c);
                  const customerSubtext = getCustomerSubtext(c);
                  const cardAppName = getCardAppName(c, store);

                  return (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomer(c)}
                            className="group flex min-w-0 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                            aria-label={`View details for ${customerName}`}
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-300 bg-gray-100 transition-transform group-hover:scale-105 dark:border-white/15 dark:bg-white/10">
                              {avatarUrl && !c.accountDeleted ? (
                                <img src={getDisplayImageUrl(avatarUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
                              ) : (
                                <Users className="w-5 h-5 text-[#1b1b1b] dark:text-white" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block max-w-[120px] truncate text-sm font-semibold text-gray-900 group-hover:underline dark:text-white sm:max-w-xs">{customerName}</span>
                              <span className="block max-w-[120px] truncate text-xs text-gray-500 sm:max-w-xs">{customerSubtext}</span>
                              {!c.accountDeleted && c.customerId && (
                                <span className="mt-0.5 block max-w-[120px] truncate font-mono text-[11px] text-gray-400 sm:max-w-xs" title={c.customerId}>
                                  {formatCustomerCode(c.customerId)}
                                </span>
                              )}
                            </span>
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 shrink-0 text-[#1b1b1b] dark:text-white" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-white max-w-[160px]">{cardAppName}</p>
                            <p className="text-xs text-gray-500">Joined {formatCardDate(c.joinedAt)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                          c.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'active' ? 'bg-green-500' : 'bg-gray-500'}`} />
                          {c.accountDeleted ? "Account deleted" : (c.status || "Active")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
                          birthday.isToday
                            ? "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900/60 dark:bg-pink-950/30 dark:text-pink-300"
                            : "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          <Cake className="w-3.5 h-3.5" />
                          {birthday.isToday ? "Birthday today" : birthday.hasBirthday ? birthday.label : "Not set"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                         <span className="flex items-center gap-2 font-bold text-gray-900 dark:text-white" title={`Total Stars: ${c.stars || 0}`}>
                           <Star className="w-4 h-4 text-[#1b1b1b] fill-[#1b1b1b] cursor-help" />
                           {c.stars || 0}
                         </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={currentPage}
            pageSize={CUSTOMERS_PER_PAGE}
            totalItems={customers.length}
            itemLabel="customers"
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {selectedCustomer && (() => {
        const birthday = getBirthdayStatus(selectedCustomer.customerProfile?.birthday);
        const avatarUrl = selectedCustomer.customerProfile?.avatarUrl || selectedCustomer.customerProfile?.photoURL || selectedCustomer.customerProfile?.profilePic || "";
        const customerName = getCustomerName(selectedCustomer);
        const customerSubtext = getCustomerDetailSubtext(selectedCustomer);

        return (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedCustomer(null);
            }}
          >
            <div role="dialog" aria-modal="true" aria-labelledby="staff-customer-details-title" className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                    {avatarUrl && !selectedCustomer.accountDeleted ? (
                      <img src={getDisplayImageUrl(avatarUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Users className="h-5 w-5 text-gray-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 id="staff-customer-details-title" className="truncate text-lg font-bold text-gray-900 dark:text-white">{customerName}</h3>
                    <p className="truncate text-sm text-gray-500 dark:text-gray-400">{customerSubtext}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedCustomer(null)} className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white" aria-label="Close customer details">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-800/70">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Stars</p>
                  <p className="mt-1 flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white"><Star className="h-4 w-4 fill-current" /> {selectedCustomer.stars || 0}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-800/70">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Status</p>
                  <p className="mt-1 truncate font-semibold capitalize text-gray-900 dark:text-white">{selectedCustomer.accountDeleted ? "Account deleted" : (selectedCustomer.status || "Active")}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-800/70">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Joined</p>
                  <p className="mt-1 font-semibold text-gray-900 dark:text-white">{formatCardDate(selectedCustomer.joinedAt)}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-800/70">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Birthday</p>
                  <p className="mt-1 font-semibold text-gray-900 dark:text-white">{birthday.hasBirthday ? birthday.label : "Not set"}</p>
                </div>
              </div>

              {!selectedCustomer.accountDeleted && selectedCustomer.customerId && (
                <div className="mt-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-700">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Customer ID</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-gray-900 dark:text-white">{formatCustomerCode(selectedCustomer.customerId)}</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
