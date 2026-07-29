import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Layout, Save, Upload, Plus, Trash2, Loader2, ImagePlus, RefreshCcw, CheckCircle2, XCircle, Edit3, QrCode, Star, Coffee, ArrowRight, Store as StoreIcon, Search, MapPin, Mail, Phone, Video, Link2 } from "lucide-react";
import { deleteImageFromDriveSecure, getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { BrandMark } from "../../components/BrandMark";
import { HomepageVideoPlayer } from "../../components/HomepageVideoPlayer";
import { ScrollableRegion } from "../../components/ScrollableRegion";
import { Pagination } from "../../components/Pagination";
import { useCollectionPagination } from "../../hooks/useCollectionPagination";
import { CustomDropdown } from "../../components/CustomDropdown";
import {
  DEFAULT_HOW_IT_WORKS_CONFIG,
  HowItWorksConfig,
  HomepageVideoConfig,
  isValidVideoLink,
  normalizeHowItWorksConfig,
} from "../../lib/homepageVideos";

type HomepageConfig = {
  heroHeadline: string;
  heroSubheadline: string;
  heroImageUrl: string;
  trustedBusinesses: { name: string; logoUrl: string }[];
  usePartnerStores: boolean;
  animateTrustedBusinesses: boolean;
  footerInfo: {
    address: string;
    email: string;
    phone: string;
    socialLinks: {
      facebook: string;
      instagram: string;
      twitter: string;
    };
  };
  applicationsOpen: boolean;
  howItWorks: HowItWorksConfig;
};

const DEFAULT_CONFIG: HomepageConfig = {
  heroHeadline: "Local Dining, Reimagined",
  heroSubheadline: "Discover exclusive offers and hidden gems in your neighborhood.",
  heroImageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80",
  trustedBusinesses: [
    { name: "Downtown Coffee", logoUrl: "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=100&h=100&q=80" }
  ],
  usePartnerStores: false,
  animateTrustedBusinesses: true,
  footerInfo: {
    address: "Tagum City, Davao del Norte, Philippines",
    email: "perkup.shop@youthserviceph.org",
    phone: "0962 232 8290",
    socialLinks: {
      facebook: "",
      instagram: "",
      twitter: ""
    }
  },
  applicationsOpen: true,
  howItWorks: DEFAULT_HOW_IT_WORKS_CONFIG,
};

const cloneConfig = (value: HomepageConfig): HomepageConfig => JSON.parse(JSON.stringify(value));

const mergeHomepageConfig = (data: Partial<HomepageConfig> = {}): HomepageConfig => ({
  ...DEFAULT_CONFIG,
  ...data,
  trustedBusinesses: data.trustedBusinesses ?? DEFAULT_CONFIG.trustedBusinesses,
  usePartnerStores: data.usePartnerStores ?? DEFAULT_CONFIG.usePartnerStores,
  animateTrustedBusinesses: data.animateTrustedBusinesses ?? DEFAULT_CONFIG.animateTrustedBusinesses,
  applicationsOpen: data.applicationsOpen ?? DEFAULT_CONFIG.applicationsOpen,
  howItWorks: normalizeHowItWorksConfig(data.howItWorks),
  footerInfo: {
    ...DEFAULT_CONFIG.footerInfo,
    ...(data.footerInfo || {}),
    socialLinks: {
      ...DEFAULT_CONFIG.footerInfo.socialLinks,
      ...(data.footerInfo?.socialLinks || {})
    }
  }
});

function MiniHomepagePreview({ config }: { config: HomepageConfig }) {
  const logos = config.usePartnerStores
    ? [{ name: "Active partner stores", logoUrl: "" }, { name: "Auto synced", logoUrl: "" }, { name: "Published partners", logoUrl: "" }]
    : config.trustedBusinesses.length > 0
      ? config.trustedBusinesses
      : DEFAULT_CONFIG.trustedBusinesses;

  return (
    <div className="w-full min-w-0 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1b1b1b] shadow-sm overflow-hidden">
      <div className="flex min-w-0 items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 px-4 py-3 bg-gray-50 dark:bg-gray-900">
        <div className="flex shrink-0 items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>
        <span className="truncate text-xs font-semibold text-gray-500 dark:text-gray-400">Live admin preview</span>
      </div>

      <div className="max-h-160 overflow-y-auto overflow-x-hidden bg-white dark:bg-[#1b1b1b]">
        <header className="relative z-20 bg-white dark:bg-[#1b1b1b] border-b border-gray-200/50 dark:border-gray-800/50">
          <nav className="flex min-w-0 items-center justify-between gap-4 px-4 py-3 sm:px-5">
            <BrandMark compact className="shrink-0" />
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span className="whitespace-nowrap text-xs font-medium text-gray-900 dark:text-gray-100">Sign in</span>
              <span className="whitespace-nowrap px-3 py-1.5 text-xs font-medium text-white bg-[#1b1b1b] rounded-xl">Sign up</span>
            </div>
          </nav>
        </header>

        <section className="isolate relative z-0 overflow-hidden px-4 pb-10 pt-8 sm:px-5 lg:pb-12 lg:pt-10">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-linear-to-b from-transparent via-[#fafafa]/80 dark:via-[#1b1b1b]/80 to-[#fafafa] dark:to-[#1b1b1b] z-10" />
            <img src={getDisplayImageUrl(config.heroImageUrl)} alt="Hero image" className="w-full h-full object-cover opacity-30 dark:opacity-20" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-5xl">
            <div className="grid min-w-0 grid-cols-1 items-center gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
              <div className="min-w-0 max-w-xl">
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#1b1b1b] dark:border-white/15 dark:bg-white/10 dark:text-white mb-5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-[#1b1b1b] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1b1b1b]" />
                  </span>
                  <span className="truncate">Digital Loyalty Starts Here</span>
                </div>

                <h1 className="wrap-break-word text-3xl font-semibold tracking-tight text-gray-900 dark:text-white leading-[1.1] mb-4 whitespace-pre-wrap md:text-4xl xl:text-5xl">
                  {config.heroHeadline}
                </h1>
                <p className="max-w-md wrap-break-word text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed md:text-base">
                  {config.heroSubheadline}
                </p>
                <span className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gray-900 dark:bg-white px-5 py-3 text-xs font-medium text-white dark:text-gray-900 shadow-sm">
                  Get Started
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>

              <div className="relative min-w-0 overflow-hidden rounded-3xl border border-gray-200 bg-gray-100 p-4 shadow-sm aspect-4/3 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
                <div className="relative h-full flex flex-col items-center justify-center space-y-5">
                  <div className="w-[min(14rem,82%)] -rotate-6 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1b1b1b]">
                    <div className="flex justify-between items-start mb-5">
                      <div className="w-10 h-10 bg-gray-50 dark:bg-gray-900 rounded-2xl flex items-center justify-center">
                        <QrCode className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      </div>
                      <div className="flex gap-1">
                        {[1, 2, 3].map((i) => (
                          <Star key={i} className="w-3.5 h-3.5 text-[#1b1b1b] fill-[#1b1b1b] dark:text-white dark:fill-white" />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-lg w-3/4" />
                      <div className="h-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg w-1/2" />
                    </div>
                  </div>

                  <div className="w-[min(14rem,82%)] translate-x-4 rotate-3 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1b1b1b] sm:translate-x-8">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Coffee Card</span>
                      <span className="text-[10px] font-medium text-[#1b1b1b] dark:text-white bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-md">8/10</span>
                    </div>
                    <div className="flex min-w-0 gap-1.5 overflow-hidden">
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className="w-5 h-5 bg-gray-100 dark:bg-white/15 rounded-full flex items-center justify-center">
                          <Coffee className="w-2.5 h-2.5 text-[#1b1b1b] dark:text-white" />
                        </div>
                      ))}
                      {[...Array(2)].map((_, i) => (
                        <div key={`empty-${i}`} className="w-5 h-5 bg-gray-50 dark:bg-gray-900 rounded-full border border-gray-100 dark:border-gray-800" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden border-t border-gray-100 bg-white py-10 dark:border-gray-800 dark:bg-[#1b1b1b]">
          <p className="text-center text-xs font-bold text-gray-400 dark:text-gray-500 mb-7 uppercase tracking-widest px-5">Trusted by local businesses</p>
          <div className="grid min-w-0 grid-cols-2 gap-5 px-5 md:grid-cols-4">
            {logos.slice(0, 4).map((logo, idx) => (
              <div key={`${logo.name}-${idx}`} className="flex flex-col items-center justify-center gap-3">
                <div className="w-14 h-14 bg-gray-50 dark:bg-gray-900 rounded-3xl flex items-center justify-center text-gray-400 dark:text-gray-500 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                  {logo.logoUrl ? <img src={getDisplayImageUrl(logo.logoUrl)} className="w-full h-full object-cover" alt={logo.name} /> : <StoreIcon className="w-7 h-7" />}
                </div>
                <span className="max-w-full wrap-break-word text-center text-xs font-semibold tracking-tight text-gray-400 dark:text-gray-500">{logo.name}</span>
              </div>
            ))}
          </div>
        </section>

        {config.howItWorks.enabled && config.howItWorks.videos.some((video) => video.enabled && isValidVideoLink(video.url)) && (
          <section className="border-t border-gray-100 bg-gray-50 px-5 py-12 dark:border-gray-800 dark:bg-gray-950/40">
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{config.howItWorks.heading}</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">{config.howItWorks.subheading}</p>
              <div className="mt-7 grid gap-5 md:grid-cols-2">
                {config.howItWorks.videos.filter((video) => video.enabled && isValidVideoLink(video.url)).slice(0, 2).map((video) => (
                  <div key={video.id} className="rounded-2xl border border-gray-200 bg-white p-3 text-left dark:border-gray-800 dark:bg-[#1b1b1b]">
                    <HomepageVideoPlayer url={video.url} title={video.title} compact />
                    <p className="mt-3 text-xs font-semibold text-gray-900 dark:text-white">{video.title}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="bg-white dark:bg-[#1b1b1b] py-12 border-t border-gray-100 dark:border-gray-800">
          <div className="px-5">
            <div className="text-center max-w-lg mx-auto mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Find affiliated stores</h2>
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Discover places where you can earn and redeem rewards. Find a partner near you.</p>
              <div className="relative max-w-sm mx-auto mt-5">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <div className="h-11 rounded-2xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 dark:ring-gray-800 pl-10 pr-4 flex items-center text-xs text-gray-400">
                  Search by store name or category...
                </div>
              </div>
            </div>
            <div className="rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm h-56 bg-gray-100 dark:bg-gray-900 relative">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(148,163,184,0.15)_1px,transparent_1px),linear-gradient(rgba(148,163,184,0.15)_1px,transparent_1px)] bg-size-[32px_32px]" />
              <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-[#1b1b1b] shadow flex items-center justify-center">
                <MapPin className="w-5 h-5 text-[#1b1b1b]" />
              </div>
            </div>
          </div>
        </section>

        {config.applicationsOpen && (
          <section className="bg-gray-900 text-white py-12 relative overflow-hidden">
            <div className="px-5 text-center">
              <h2 className="text-2xl font-bold tracking-tight mb-4">Become a Partner Store</h2>
              <p className="text-gray-400 text-sm max-w-xl mx-auto mb-7">Join our growing network of local businesses. Drive more foot traffic, build customer loyalty, and get insights into your best customers.</p>
              <span className="inline-flex bg-[#1b1b1b] text-white px-5 py-3 rounded-2xl text-sm font-medium">Apply to be a Partner</span>
            </div>
          </section>
        )}

        <footer className="bg-white dark:bg-[#1b1b1b] border-t border-gray-200 dark:border-gray-800 pt-10 pb-6">
          <div className="px-5">
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <BrandMark compact />
                </div>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-5 text-sm leading-relaxed">The modern digital loyalty program for independent businesses. Reward your best customers without the paper cards.</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400"><Mail className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs">{config.footerInfo.email}</span></div>
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400"><Phone className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs">{config.footerInfo.phone}</span></div>
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400"><MapPin className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs">{config.footerInfo.address}</span></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Product</h3>
                  <div className="space-y-2 text-gray-500 dark:text-gray-400"><p>For Customers</p><p>For Businesses</p><p>Pricing</p></div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Company</h3>
                  <div className="space-y-2 text-gray-500 dark:text-gray-400"><p>About Us</p><p>Careers</p><p>Privacy Policy</p></div>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-100 dark:border-gray-800 pt-6 text-center text-xs text-gray-400 dark:text-gray-500">
              &copy; {new Date().getFullYear()} Perk. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function AdminHomepage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [toasts, setToasts] = useState<{id: string, message: string, type: 'success' | 'error', persistent: boolean}[]>([]);
  const [urlErrors, setUrlErrors] = useState<{facebook: boolean, instagram: boolean, twitter: boolean}>({
    facebook: false, instagram: false, twitter: false
  });
  const [config, setConfig] = useState<HomepageConfig>(DEFAULT_CONFIG);
  const [savedConfig, setSavedConfig] = useState<HomepageConfig>(DEFAULT_CONFIG);
  const [pendingImageFiles, setPendingImageFiles] = useState<Record<string, File>>({});
  const [videoUrlErrors, setVideoUrlErrors] = useState<Record<string, boolean>>({});

  const loadConfig = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, "settings", "homepage");
      const docSnap = await getDoc(docRef);
      let nextConfig = DEFAULT_CONFIG;
      if (docSnap.exists()) {
        const data = docSnap.data() as Partial<HomepageConfig>;
        nextConfig = mergeHomepageConfig(data);
      } else {
        await setDoc(docRef, { ...DEFAULT_CONFIG, updatedAt: serverTimestamp() });
      }
      setConfig(cloneConfig(nextConfig));
      setSavedConfig(cloneConfig(nextConfig));
      setIsEditing(false);
    } catch (error) {
      console.error("Error loading homepage config:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleHeroImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (config.heroImageUrl.startsWith("blob:")) URL.revokeObjectURL(config.heroImageUrl);
      const previewUrl = URL.createObjectURL(file);
      setPendingImageFiles((current) => ({ ...current, [previewUrl]: file }));
      setConfig({...config, heroImageUrl: previewUrl});
      e.target.value = "";
    }
  };

  const handleBusinessLogoUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const previousUrl = config.trustedBusinesses[index]?.logoUrl || "";
      if (previousUrl.startsWith("blob:")) URL.revokeObjectURL(previousUrl);
      const previewUrl = URL.createObjectURL(file);
      setPendingImageFiles((current) => ({ ...current, [previewUrl]: file }));
      handleBusinessChange(index, "logoUrl", previewUrl);
      e.target.value = "";
    }
  };

  const showToast = (message: string, type: 'success' | 'error', persistent = false) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type, persistent }]);
    
    if (!persistent) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 5000);
    }
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleCancel = () => {
    Object.keys(pendingImageFiles).forEach((url) => URL.revokeObjectURL(url));
    setPendingImageFiles({});
    setConfig(cloneConfig(savedConfig));
    setUrlErrors({ facebook: false, instagram: false, twitter: false });
    setVideoUrlErrors({});
    setIsEditing(false);
  };

  const handleSave = async () => {
    // Validate URLs
    const newErrors = {
      facebook: false,
      instagram: false,
      twitter: false
    };
    
    let hasErrors = false;
    
    const isValidUrl = (string: string) => {
      if (!string) return true; // Empty string is fine
      try {
        new URL(string);
        return true;
      } catch (_) {
        return false;
      }
    };
    
    if (!isValidUrl(config.footerInfo?.socialLinks?.facebook || '')) {
      newErrors.facebook = true;
      hasErrors = true;
    }
    if (!isValidUrl(config.footerInfo?.socialLinks?.instagram || '')) {
      newErrors.instagram = true;
      hasErrors = true;
    }
    if (!isValidUrl(config.footerInfo?.socialLinks?.twitter || '')) {
      newErrors.twitter = true;
      hasErrors = true;
    }

    const nextVideoErrors: Record<string, boolean> = {};
    config.howItWorks.videos.forEach((video) => {
      if ((video.enabled || video.url.trim()) && !isValidVideoLink(video.url)) {
        nextVideoErrors[video.id] = true;
        hasErrors = true;
      }
    });
    setVideoUrlErrors(nextVideoErrors);
    
    setUrlErrors(newErrors);
    
    if (hasErrors) {
      showToast("Please fix the highlighted links before saving.", "error");
      return;
    }

    setSaving(true);
    const uploadedImageUrls: string[] = [];
    let configPersisted = false;
    try {
      const heroImageUrl = pendingImageFiles[config.heroImageUrl]
        ? await uploadImageFileToDriveSecure(pendingImageFiles[config.heroImageUrl], { purpose: "homepage-hero" })
        : config.heroImageUrl;
      if (pendingImageFiles[config.heroImageUrl]) uploadedImageUrls.push(heroImageUrl);
      const trustedBusinesses = await Promise.all(config.trustedBusinesses.map(async (business) => {
        const logoUrl = pendingImageFiles[business.logoUrl]
          ? await uploadImageFileToDriveSecure(pendingImageFiles[business.logoUrl], {
              owner: business.name,
              purpose: "trusted-business-logo",
            })
          : business.logoUrl;
        if (pendingImageFiles[business.logoUrl]) uploadedImageUrls.push(logoUrl);
        return { ...business, logoUrl };
      }));
      const nextConfig = { ...config, heroImageUrl, trustedBusinesses };
      await setDoc(doc(db, "settings", "homepage"), { ...nextConfig, updatedAt: serverTimestamp() }, { merge: true });
      configPersisted = true;
      const previousImages = [
        savedConfig.heroImageUrl,
        ...savedConfig.trustedBusinesses.map((business) => business.logoUrl),
      ].filter(Boolean);
      const retainedImages = new Set([
        nextConfig.heroImageUrl,
        ...nextConfig.trustedBusinesses.map((business) => business.logoUrl),
      ].filter(Boolean));
      await Promise.all(
        previousImages
          .filter((url) => !retainedImages.has(url))
          .map((url) => deleteImageFromDriveSecure(url).catch(console.error)),
      );
      Object.keys(pendingImageFiles).forEach((url) => URL.revokeObjectURL(url));
      setPendingImageFiles({});
      setConfig(cloneConfig(nextConfig));
      setSavedConfig(cloneConfig(nextConfig));
      setIsEditing(false);
      showToast("Homepage configuration saved successfully.", "success");
    } catch (error) {
      if (!configPersisted && uploadedImageUrls.length) {
        await Promise.allSettled(uploadedImageUrls.map((url) => deleteImageFromDriveSecure(url)));
      }
      console.error(error);
      showToast("Failed to save configuration.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleAddBusiness = () => {
    setConfig({
      ...config,
      trustedBusinesses: [...config.trustedBusinesses, { name: "New Business", logoUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=100&h=100&q=80" }]
    });
  };

  const handleRemoveBusiness = (index: number) => {
    const newBusinesses = [...config.trustedBusinesses];
    newBusinesses.splice(index, 1);
    setConfig({ ...config, trustedBusinesses: newBusinesses });
  };

  const handleBusinessChange = (index: number, field: string, value: string) => {
    const newBusinesses = [...config.trustedBusinesses];
    newBusinesses[index] = { ...newBusinesses[index], [field]: value };
    setConfig({ ...config, trustedBusinesses: newBusinesses });
  };

  const handleAddVideo = (audience: HomepageVideoConfig["audience"] = "customer") => {
    const id = crypto.randomUUID();
    setConfig({
      ...config,
      howItWorks: {
        ...config.howItWorks,
        videos: [
          ...config.howItWorks.videos,
          {
            id,
            audience,
            title: audience === "business" ? "Business owner demo" : "Customer demo",
            description: audience === "business"
              ? "See how business owners manage rewards and grow customer loyalty."
              : "See how customers collect stamps and redeem rewards.",
            url: "",
            enabled: true,
          },
        ],
      },
    });
  };

  const handleVideoChange = (id: string, changes: Partial<HomepageVideoConfig>) => {
    setConfig({
      ...config,
      howItWorks: {
        ...config.howItWorks,
        videos: config.howItWorks.videos.map((video) => video.id === id ? { ...video, ...changes } : video),
      },
    });
    if (changes.url !== undefined && videoUrlErrors[id]) {
      setVideoUrlErrors((current) => ({ ...current, [id]: false }));
    }
  };

  const handleRemoveVideo = (id: string) => {
    setConfig({
      ...config,
      howItWorks: {
        ...config.howItWorks,
        videos: config.howItWorks.videos.filter((video) => video.id !== id),
      },
    });
    setVideoUrlErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const videoPagination = useCollectionPagination(config.howItWorks.videos, 6);
  const businessPagination = useCollectionPagination(config.trustedBusinesses, 9);

  if (loading) return <PageSkeleton variant="homepage" />;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Layout className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Edit Homepage</h3>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button onClick={handleCancel} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50">
                <RefreshCcw className="w-4 h-4" />
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-[#1b1b1b] hover:bg-black transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </>
          ) : (
            <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-[#1b1b1b] hover:bg-black transition-colors">
              <Edit3 className="w-4 h-4" />
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="w-full min-w-0 max-w-6xl space-y-8 p-4 sm:p-6">
        <MiniHomepagePreview config={config} />

        {isEditing && (
        <div className="space-y-8 max-w-4xl">
        {/* Registration Toggle */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white">Partner Applications Status</h4>
            <p className="text-xs text-gray-500 mt-1">Control whether new stores can apply to become partners from the landing page.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={config.applicationsOpen} onChange={e => setConfig({...config, applicationsOpen: e.target.checked})} />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1b1b1b]/30 dark:peer-focus:ring-white/30 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#1b1b1b]"></div>
          </label>
        </div>

        {/* Hero Section */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
          <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 border-b border-gray-100 dark:border-gray-800 pb-2">Hero Section</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Headline</label>
                <input type="text" value={config.heroHeadline} onChange={e => setConfig({...config, heroHeadline: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Subheadline</label>
                <textarea rows={3} value={config.heroSubheadline} onChange={e => setConfig({...config, heroSubheadline: e.target.value})} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm resize-none" />
              </div>
              <div>
                 <label className="flex text-xs font-semibold text-gray-500 mb-1 items-center gap-1"><ImagePlus className="w-3 h-3"/> Hero Image</label>
                 <label className="flex items-center justify-center gap-2 px-4 py-2 w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Upload className="w-4 h-4" />
                    Upload Image
                    <input type="file" accept="image/*" onChange={handleHeroImageUpload} className="hidden" />
                 </label>
              </div>
            </div>
            
            <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-xl overflow-hidden relative min-h-50">
              {config.heroImageUrl ? (
                 <img src={getDisplayImageUrl(config.heroImageUrl)} alt="Hero Preview" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                 <span className="text-sm text-gray-400">No Image Provided</span>
              )}
              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-4 text-center">
                 <h3 className="text-white font-bold text-lg">{config.heroHeadline}</h3>
                 <p className="text-white/80 text-xs mt-1">{config.heroSubheadline}</p>
              </div>
            </div>
          </div>
        </div>

        {/* How It Works Videos */}
        <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
          <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-gray-500" />
                <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">How does it work?</h4>
              </div>
              <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                Add customer and business-owner demos using YouTube, Facebook, Google Drive, Vimeo, Loom, direct video files, or another public link.
              </p>
            </div>
            <label className="relative inline-flex shrink-0 cursor-pointer items-center gap-3">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Show on homepage</span>
              <input
                type="checkbox"
                className="peer sr-only"
                checked={config.howItWorks.enabled}
                onChange={(event) => setConfig({
                  ...config,
                  howItWorks: { ...config.howItWorks, enabled: event.target.checked },
                })}
              />
              <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:right-5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#1b1b1b] peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-gray-700 dark:peer-checked:bg-white dark:peer-checked:after:bg-[#1b1b1b]" />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Section heading</label>
              <input
                type="text"
                value={config.howItWorks.heading}
                onChange={(event) => setConfig({
                  ...config,
                  howItWorks: { ...config.howItWorks, heading: event.target.value },
                })}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Section description</label>
              <input
                type="text"
                value={config.howItWorks.subheading}
                onChange={(event) => setConfig({
                  ...config,
                  howItWorks: { ...config.howItWorks, subheading: event.target.value },
                })}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => handleAddVideo("customer")} className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700">
              <Plus className="h-3.5 w-3.5" /> Add customer video
            </button>
            <button type="button" onClick={() => handleAddVideo("business")} className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700">
              <Plus className="h-3.5 w-3.5" /> Add business video
            </button>
          </div>

          <ScrollableRegion label="Homepage videos" className="space-y-4 pr-1">
            {videoPagination.pageItems.map((video) => {
              const index = config.howItWorks.videos.findIndex((item) => item.id === video.id);
              return (
              <div key={video.id} className="grid gap-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/70 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.85fr)]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Video {index + 1}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                        <input type="checkbox" checked={video.enabled} onChange={(event) => handleVideoChange(video.id, { enabled: event.target.checked })} />
                        Published
                      </label>
                      <button type="button" onClick={() => handleRemoveVideo(video.id)} aria-label={`Remove ${video.title}`} className="rounded-lg p-2 text-red-500 transition hover:bg-red-50 dark:hover:bg-red-950/30">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Demo account type</label>
                      <CustomDropdown
                        value={video.audience}
                        onChange={(value) => handleVideoChange(video.id, { audience: value as HomepageVideoConfig["audience"] })}
                        ariaLabel={`Demo account type for ${video.title || `video ${index + 1}`}`}
                        options={[
                          { label: "Customer", value: "customer" },
                          { label: "Business owner", value: "business" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-500">Video title</label>
                      <input type="text" value={video.title} onChange={(event) => handleVideoChange(video.id, { title: event.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
                    </div>
                  </div>
                  <div>
                    <label className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${videoUrlErrors[video.id] ? "text-red-500" : "text-gray-500"}`}>
                      <Link2 className="h-3.5 w-3.5" /> Public video link
                    </label>
                    <input
                      type="url"
                      value={video.url}
                      placeholder="https://youtube.com/watch?v=... or any public video page"
                      onChange={(event) => handleVideoChange(video.id, { url: event.target.value })}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm dark:bg-gray-800 ${videoUrlErrors[video.id] ? "border-red-500" : "border-gray-200 dark:border-gray-700"}`}
                    />
                    {videoUrlErrors[video.id] && <p className="mt-1 text-[11px] text-red-500">Enter a complete public http:// or https:// link.</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Short description</label>
                    <textarea rows={2} value={video.description} onChange={(event) => handleVideoChange(video.id, { description: event.target.value })} className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
                  </div>
                </div>
                <div className="self-center">
                  <HomepageVideoPlayer url={video.url} title={video.title || `Video ${index + 1}`} compact />
                  <p className="mt-2 text-center text-[11px] text-gray-500">Live embed preview</p>
                </div>
              </div>
              );
            })}
            {config.howItWorks.videos.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-500 dark:border-gray-700">
                No demo videos yet. Add one for customers and one for business owners.
              </div>
            )}
          </ScrollableRegion>
          <Pagination page={videoPagination.page} pageSize={videoPagination.pageSize} totalItems={videoPagination.totalItems} onPageChange={videoPagination.setPage} itemLabel="videos" />
        </div>

        {/* Trusted By Showcase */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Trusted By Showcase</h4>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={config.usePartnerStores} onChange={e => setConfig({ ...config, usePartnerStores: e.target.checked })} className="rounded border-gray-300 text-[#1b1b1b] focus:ring-[#1b1b1b]" />
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Use Active Partner Stores automatically</span>
              </label>
            </div>
            {!config.usePartnerStores && (
              <button onClick={handleAddBusiness} className="text-xs font-semibold text-[#1b1b1b] flex items-center gap-1 hover:text-[#1b1b1b]">
                <Plus className="w-3 h-3" /> Add Business
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
            <div>
              <h5 className="text-sm font-semibold text-gray-900 dark:text-white">Animate business logos</h5>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Move the logos continuously across the homepage. Turn this off to show a centered, static layout.</p>
            </div>
            <label className="relative inline-flex shrink-0 cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={config.animateTrustedBusinesses}
                onChange={(event) => setConfig({ ...config, animateTrustedBusinesses: event.target.checked })}
                aria-label="Animate business logos"
              />
              <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-[#1b1b1b] peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1b1b1b]/30 dark:bg-gray-700 dark:peer-checked:bg-white dark:peer-checked:after:bg-[#1b1b1b] dark:peer-focus:ring-white/30"></div>
            </label>
          </div>

          {config.usePartnerStores ? (
            <div className="p-8 text-center text-gray-500 text-sm border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50">
              The homepage will automatically fetch and display active partner stores here.
            </div>
          ) : (
            <>
            <ScrollableRegion label="Trusted businesses" className="grid grid-cols-1 gap-4 pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {businessPagination.pageItems.map((b) => {
                const i = config.trustedBusinesses.indexOf(b);
                return (
                <div key={i} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 relative group">
                  <button onClick={() => handleRemoveBusiness(i)} className="absolute top-2 right-2 p-1.5 bg-white dark:bg-gray-800 text-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-red-50">
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 border-2 border-white dark:border-gray-800 shadow-sm relative group/img cursor-pointer">
                      <img src={getDisplayImageUrl(b.logoUrl)} alt={b.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      <label className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity cursor-pointer text-white">
                        <Upload className="w-5 h-5" />
                        <input type="file" accept="image/*" onChange={(e) => handleBusinessLogoUpload(i, e)} className="hidden" />
                      </label>
                    </div>
                    <div className="w-full space-y-2">
                      <input type="text" value={b.name} onChange={e => handleBusinessChange(i, 'name', e.target.value)} placeholder="Business Name" className="w-full text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded text-sm font-semibold" />
                    </div>
                  </div>
                </div>
                );
              })}
              {config.trustedBusinesses.length === 0 && (
                <div className="col-span-full py-8 text-center text-gray-500 text-sm">No businesses featured yet.</div>
              )}
            </ScrollableRegion>
            <Pagination page={businessPagination.page} pageSize={businessPagination.pageSize} totalItems={businessPagination.totalItems} onPageChange={businessPagination.setPage} itemLabel="businesses" />
            </>
          )}
        </div>

        {/* Footer Info */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
          <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 border-b border-gray-100 dark:border-gray-800 pb-2">Footer Information</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Company Address</label>
                <input type="text" value={config.footerInfo?.address || ""} onChange={e => setConfig({...config, footerInfo: {...config.footerInfo, address: e.target.value}})} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
             </div>
             <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Contact Email</label>
                <input type="text" value={config.footerInfo?.email || ""} onChange={e => setConfig({...config, footerInfo: {...config.footerInfo, email: e.target.value}})} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
             </div>
             <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Contact Phone</label>
                <input type="text" value={config.footerInfo?.phone || ""} onChange={e => setConfig({...config, footerInfo: {...config.footerInfo, phone: e.target.value}})} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
             </div>
          </div>
          
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
            <h5 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Social Media Links</h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={`block text-xs font-semibold mb-1 ${urlErrors.facebook ? 'text-red-500' : 'text-gray-500'}`}>Facebook URL</label>
                <input 
                  type="url" 
                  placeholder="https://facebook.com/..." 
                  value={config.footerInfo?.socialLinks?.facebook || ""} 
                  onChange={e => {
                    setConfig({...config, footerInfo: {...config.footerInfo, socialLinks: {...config.footerInfo.socialLinks, facebook: e.target.value}}});
                    if (urlErrors.facebook) setUrlErrors({...urlErrors, facebook: false});
                  }} 
                  className={`w-full bg-gray-50 dark:bg-gray-900 border px-3 py-2 rounded-lg text-sm transition-colors ${urlErrors.facebook ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 dark:border-gray-700'}`} 
                />
                {urlErrors.facebook && <span className="text-[10px] text-red-500 mt-1 block">Valid URL required</span>}
              </div>
              <div>
                <label className={`block text-xs font-semibold mb-1 ${urlErrors.instagram ? 'text-red-500' : 'text-gray-500'}`}>Instagram URL</label>
                <input 
                  type="url" 
                  placeholder="https://instagram.com/..." 
                  value={config.footerInfo?.socialLinks?.instagram || ""} 
                  onChange={e => {
                    setConfig({...config, footerInfo: {...config.footerInfo, socialLinks: {...config.footerInfo.socialLinks, instagram: e.target.value}}});
                    if (urlErrors.instagram) setUrlErrors({...urlErrors, instagram: false});
                  }} 
                  className={`w-full bg-gray-50 dark:bg-gray-900 border px-3 py-2 rounded-lg text-sm transition-colors ${urlErrors.instagram ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 dark:border-gray-700'}`} 
                />
                {urlErrors.instagram && <span className="text-[10px] text-red-500 mt-1 block">Valid URL required</span>}
              </div>
              <div>
                <label className={`block text-xs font-semibold mb-1 ${urlErrors.twitter ? 'text-red-500' : 'text-gray-500'}`}>Twitter/X URL</label>
                <input 
                  type="url" 
                  placeholder="https://twitter.com/..." 
                  value={config.footerInfo?.socialLinks?.twitter || ""} 
                  onChange={e => {
                    setConfig({...config, footerInfo: {...config.footerInfo, socialLinks: {...config.footerInfo.socialLinks, twitter: e.target.value}}});
                    if (urlErrors.twitter) setUrlErrors({...urlErrors, twitter: false});
                  }} 
                  className={`w-full bg-gray-50 dark:bg-gray-900 border px-3 py-2 rounded-lg text-sm transition-colors ${urlErrors.twitter ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 dark:border-gray-700'}`} 
                />
                {urlErrors.twitter && <span className="text-[10px] text-red-500 mt-1 block">Valid URL required</span>}
              </div>
            </div>
          </div>
        </div>

        </div>
        )}
      </div>
      
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in duration-300 ${t.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {t.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
            <p className="font-medium text-sm mr-4">{t.message}</p>
            {t.persistent && (
              <button onClick={() => dismissToast(t.id)} className="ml-auto opacity-70 hover:opacity-100 transition-opacity">
                <XCircle className="w-4 h-4" />
              </button>
            )}
            {!t.persistent && (
              <button onClick={() => dismissToast(t.id)} className="ml-auto opacity-70 hover:opacity-100 transition-opacity">
                <XCircle className="w-4 h-4" />
              </button>
             )}
          </div>
        ))}
      </div>
    </div>
  );
}
