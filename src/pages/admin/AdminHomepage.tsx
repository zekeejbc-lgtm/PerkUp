import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Layout, Save, Upload, Plus, Trash2, Loader2, ImagePlus, RefreshCcw } from "lucide-react";

export default function AdminHomepage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    heroHeadline: "Local Dining, Reimagined",
    heroSubheadline: "Discover exclusive offers and hidden gems in your neighborhood.",
    heroImageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80",
    trustedBusinesses: [
      { name: "Downtown Coffee", logoUrl: "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=100&h=100&q=80" }
    ],
    usePartnerStores: false,
    footerInfo: {
      address: "123 Market St, San Francisco, CA",
      email: "hello@localbites.com",
      phone: "+1 (555) 123-4567"
    },
    applicationsOpen: true
  });

  const loadConfig = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, "settings", "homepage");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        setConfig({
          ...config,
          ...data,
          usePartnerStores: data.usePartnerStores ?? false
        });
      } else {
        await setDoc(docRef, { ...config, updatedAt: serverTimestamp() });
      }
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
      const reader = new FileReader();
      reader.onloadend = () => setConfig({...config, heroImageUrl: reader.result as string});
      reader.readAsDataURL(file);
    }
  };

  const handleBusinessLogoUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => handleBusinessChange(index, "logoUrl", reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "homepage"), { ...config, updatedAt: serverTimestamp() }, { merge: true });
      alert("Homepage configuration saved successfully.");
    } catch (error) {
      console.error(error);
      alert("Failed to save configuration.");
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

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-orange-600" /></div>;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Layout className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Edit Homepage</h3>
        </div>
        <div className="flex gap-2">
          <button onClick={loadConfig} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50">
            <RefreshCcw className="w-4 h-4" />
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-orange-600 hover:bg-orange-700 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      <div className="p-6 space-y-8 max-w-4xl">
        {/* Registration Toggle */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white">Partner Applications Status</h4>
            <p className="text-xs text-gray-500 mt-1">Control whether new stores can apply to become partners from the landing page.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={config.applicationsOpen} onChange={e => setConfig({...config, applicationsOpen: e.target.checked})} />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 dark:peer-focus:ring-orange-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-orange-600"></div>
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
                 <label className="block text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><ImagePlus className="w-3 h-3"/> Hero Image</label>
                 <label className="flex items-center justify-center gap-2 px-4 py-2 w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Upload className="w-4 h-4" />
                    Upload Image
                    <input type="file" accept="image/*" onChange={handleHeroImageUpload} className="hidden" />
                 </label>
              </div>
            </div>
            
            <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-xl overflow-hidden relative min-h-[200px]">
              {config.heroImageUrl ? (
                 <img src={config.heroImageUrl} alt="Hero Preview" className="absolute inset-0 w-full h-full object-cover" />
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

        {/* Trusted By Showcase */}
        <div className="bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Trusted By Showcase</h4>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={config.usePartnerStores} onChange={e => setConfig({ ...config, usePartnerStores: e.target.checked })} className="rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Use Active Partner Stores automatically</span>
              </label>
            </div>
            {!config.usePartnerStores && (
              <button onClick={handleAddBusiness} className="text-xs font-semibold text-orange-600 flex items-center gap-1 hover:text-orange-700">
                <Plus className="w-3 h-3" /> Add Business
              </button>
            )}
          </div>
          
          {config.usePartnerStores ? (
            <div className="p-8 text-center text-gray-500 text-sm border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50">
              The homepage will automatically fetch and display active partner stores here.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {config.trustedBusinesses.map((b, i) => (
                <div key={i} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 relative group">
                  <button onClick={() => handleRemoveBusiness(i)} className="absolute top-2 right-2 p-1.5 bg-white dark:bg-gray-800 text-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-red-50">
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 border-2 border-white dark:border-gray-800 shadow-sm relative group/img cursor-pointer">
                      <img src={b.logoUrl} alt={b.name} className="w-full h-full object-cover" />
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
              ))}
              {config.trustedBusinesses.length === 0 && (
                <div className="col-span-full py-8 text-center text-gray-500 text-sm">No businesses featured yet.</div>
              )}
            </div>
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
        </div>

      </div>
    </div>
  );
}
