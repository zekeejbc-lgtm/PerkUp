import { useEffect, useState } from "react";
import { Check, Clock, Copy, ExternalLink, Globe2, Image as ImageIcon, Mail, MapPin, Phone, Store, Ticket, UserCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { getDisplayImageUrl } from "../../lib/imageStorage";

const getReferralExpiry = (store: any) => {
  const explicitExpiry = store?.referralCodeExpiresAt;
  const expirySeconds = Number(explicitExpiry?.seconds || 0);
  if (expirySeconds) return new Date(expirySeconds * 1000);

  if (typeof explicitExpiry === "string" || typeof explicitExpiry === "number") {
    const parsedExpiry = new Date(explicitExpiry);
    if (!Number.isNaN(parsedExpiry.getTime())) return parsedExpiry;
  }

  const createdSeconds = Number(store?.referralCodeCreatedAt?.seconds || 0);
  return createdSeconds ? new Date(createdSeconds * 1000 + 30 * 24 * 60 * 60 * 1000) : null;
};

export default function StaffStore({ store }: { store: any }) {
  const { user } = useAuth();
  const [referralCopied, setReferralCopied] = useState(false);

  useEffect(() => {
    setReferralCopied(false);
  }, [store?.referralCode]);

  if (!store) return null;

  const logoUrl = getDisplayImageUrl(store.logoUrl || store.imageUrl || "");
  const menuUrl = getDisplayImageUrl(store.menuUrl || "");
  const storePhotos = Array.isArray(store.images) ? store.images.filter(Boolean).slice(0, 3) : [];
  const address = store.address || store.location || "Address not provided";
  const contact = store.contact || store.contactPhone || store.phone || "";
  const contactEmail = store.contactEmail || store.email || "";
  const hours = store.openingHours || store.hours || store.operatingHours || "";
  const website = store.website || "";
  const category = store.category || "Partner store";
  const referralCode = String(store.referralCode || "").trim();
  const referralExpiry = getReferralExpiry(store);
  const referralExpired = Boolean(referralExpiry && referralExpiry.getTime() <= Date.now());

  const copyReferralCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setReferralCopied(true);
      window.setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      setReferralCopied(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Information</h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">Details about the branch you are currently assigned to.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]">
        <div className="rounded-[2rem] border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-800/50 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              {logoUrl ? (
                <img src={logoUrl} alt={`${store.name || "Store"} logo`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Store className="h-10 w-10 text-gray-400" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{category}</p>
              <h3 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{store.name || "Unnamed Store"}</h3>
              {store.description && (
                <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{store.description}</p>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-3 text-sm text-gray-600 dark:text-gray-300 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800/50 dark:bg-gray-900">
              <MapPin className="h-5 w-5 shrink-0 text-gray-400" />
              <span>{address}</span>
            </div>

            {hours && (
              <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800/50 dark:bg-gray-900">
                <Clock className="h-5 w-5 shrink-0 text-gray-400" />
                <span>{hours}</span>
              </div>
            )}

            {contact && (
              <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800/50 dark:bg-gray-900">
                <Phone className="h-5 w-5 shrink-0 text-gray-400" />
                <span>{contact}</span>
              </div>
            )}

            {contactEmail && (
              <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800/50 dark:bg-gray-900">
                <Mail className="h-5 w-5 shrink-0 text-gray-400" />
                <span className="truncate">{contactEmail}</span>
              </div>
            )}

            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 transition-colors hover:bg-gray-50 dark:border-gray-800/50 dark:bg-gray-900 dark:hover:bg-gray-800">
                <Globe2 className="h-5 w-5 shrink-0 text-gray-400" />
                <span className="truncate">{website.replace(/^https?:\/\//, "")}</span>
                <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-gray-400" />
              </a>
            )}

            {menuUrl && (
              <a href={menuUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 transition-colors hover:bg-gray-50 dark:border-gray-800/50 dark:bg-gray-900 dark:hover:bg-gray-800">
                <ImageIcon className="h-5 w-5 shrink-0 text-gray-400" />
                <span className="truncate">View menu image</span>
                <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-gray-400" />
              </a>
            )}

            {referralCode && (
              <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800/50 dark:bg-gray-900 sm:col-span-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Ticket className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Store referral code</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Share this owner-issued code with new customers.
                      </p>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <div className="flex items-center gap-2">
                      <code className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold tracking-widest text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                        {referralCode}
                      </code>
                      <button
                        type="button"
                        onClick={copyReferralCode}
                        className="rounded-xl border border-gray-200 p-2.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
                        aria-label={referralCopied ? "Referral code copied" : "Copy referral code"}
                        title={referralCopied ? "Copied" : "Copy referral code"}
                      >
                        {referralCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                    {referralExpiry && (
                      <p className={`mt-1.5 text-xs ${referralExpired ? "font-medium text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
                        {referralExpired ? "Expired" : "Expires"} {referralExpiry.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {storePhotos.length > 0 && (
            <div className="mt-6 grid grid-cols-3 gap-3">
              {storePhotos.map((imageUrl: string, index: number) => (
                <div key={`${imageUrl}-${index}`} className="aspect-video overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                  <img
                    src={getDisplayImageUrl(imageUrl)}
                    alt={`${store.name || "Store"} photo ${index + 1}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {!store.description && !contact && !contactEmail && !hours && !website && !menuUrl && storePhotos.length === 0 && (
            <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
              Additional branch details have not been added yet.
            </div>
          )}
        </div>

        <div className="space-y-6">
          {menuUrl && (
            <a href={menuUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-[2rem] border border-gray-200 bg-gray-50 transition-colors hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-800/50 dark:hover:bg-gray-800">
              <div className="aspect-[4/3] bg-white dark:bg-gray-900">
                <img src={menuUrl} alt={`${store.name || "Store"} menu`} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center gap-3 p-4 text-sm font-semibold text-gray-900 dark:text-white">
                <ImageIcon className="h-5 w-5 text-gray-400" />
                Store Menu
                <ExternalLink className="ml-auto h-4 w-4 text-gray-400" />
              </div>
            </a>
          )}

          <div className="rounded-[2rem] border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-800/50 sm:p-8">
            <div className="mb-8 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                <UserCircle className="h-7 w-7 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Assigned Representative</p>
                <p className="mt-0.5 text-xs uppercase tracking-widest text-gray-500">Active Staff Member</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Staff Name</label>
                <div className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100">
                  {user?.name || "No name set"}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Email</label>
                <div className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100">
                  <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate">{user?.email}</span>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
                <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  As a staff member, you have access to scan customer cards, view running promotions, and assist customers with their rewards at this branch.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
