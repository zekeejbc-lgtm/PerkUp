import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Layout, Save, Upload, Plus, Trash2, Loader2, ImagePlus, RefreshCcw, CheckCircle2, XCircle, ExternalLink, Download } from "lucide-react";

export default function AdminHomepage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<{id: string, message: string, type: 'success' | 'error', persistent: boolean}[]>([]);
  const [urlErrors, setUrlErrors] = useState<{facebook: boolean, instagram: boolean, twitter: boolean}>({
    facebook: false, instagram: false, twitter: false
  });
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
      phone: "+1 (555) 123-4567",
      socialLinks: {
        facebook: "",
        instagram: "",
        twitter: ""
      }
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
          usePartnerStores: data.usePartnerStores ?? false,
          footerInfo: {
            ...config.footerInfo,
            ...data.footerInfo,
            socialLinks: {
              ...config.footerInfo.socialLinks,
              ...(data.footerInfo?.socialLinks || {})
            }
          }
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

  const handleDownloadJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "homepage_config.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showToast("Configuration downloaded successfully", "success");
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
    
    setUrlErrors(newErrors);
    
    if (hasErrors) {
      showToast("Please enter valid URLs for social media links.", "error");
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "homepage"), { ...config, updatedAt: serverTimestamp() }, { merge: true });
      showToast("Homepage configuration saved successfully.", "success");
    } catch (error) {
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

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-orange-600" /></div>;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Layout className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Edit Homepage</h3>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDownloadJson} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            Download Config JSON
          </button>
          <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-orange-600 bg-orange-50 hover:bg-orange-100 transition-colors">
            <ExternalLink className="w-4 h-4" />
            Preview Landing Page
          </a>
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
