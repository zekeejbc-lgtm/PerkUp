import React, { useState, useEffect } from "react";
import { doc, updateDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Save, MapPin, Clock, Image as ImageIcon, CheckCircle2, Upload, X, Store } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { getDisplayImageUrl, uploadImageFileToDrive } from "../../lib/imageStorage";

function LocationPicker({ setPosition }: { position: [number, number], setPosition: (p: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function StoreOwnerInfo({ store, setStore }: { store: any, setStore: (s: any) => void }) {
  const [formData, setFormData] = useState({
    name: store?.name || "",
    description: store?.description || "",
    address: store?.address || "",
    latitude: store?.latitude || "",
    longitude: store?.longitude || "",
    logoUrl: store?.logoUrl || "",
    images: store?.images || [], // array of up to 3 images
    menuUrl: store?.menuUrl || "",
    openingHours: store?.openingHours || "Mon-Sun: 9AM - 9PM",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Parse coords
  const lat = parseFloat(formData.latitude) || 14.5995; // Default to Manila
  const lng = parseFloat(formData.longitude) || 120.9842;
  const [mapCenter, setMapCenter] = useState<[number, number]>([lat, lng]);

  useEffect(() => {
    if (store) {
      setFormData({
        name: store?.name || "",
        description: store?.description || "",
        address: store?.address || "",
        latitude: store?.latitude || "",
        longitude: store?.longitude || "",
        logoUrl: store?.logoUrl || "",
        images: store?.images || [],
        menuUrl: store?.menuUrl || "",
        openingHours: store?.openingHours || "Mon-Sun: 9AM - 9PM",
      });
      if (store.latitude && store.longitude) {
         setMapCenter([parseFloat(store.latitude), parseFloat(store.longitude)]);
      }
    }
  }, [store]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store?.id) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateDoc(doc(db, "stores", store.id), { ...formData });
      setStore({ ...store, ...formData });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error(error);
      alert("Failed to update store info");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'menuUrl' | 'images') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      if (field === 'images') {
        const newImages = [...formData.images];
        for (let i = 0; i < files.length && newImages.length < 3; i++) {
           const imageUrl = await uploadImageFileToDrive(files[i], {
             owner: formData.name || store?.id,
             purpose: "store-photo",
           });
           newImages.push(imageUrl);
        }
        setFormData(prev => ({ ...prev, images: newImages }));
      } else {
        const imageUrl = await uploadImageFileToDrive(files[0], {
          owner: formData.name || store?.id,
          purpose: field === "logoUrl" ? "store-logo" : "store-menu",
        });
        setFormData(prev => ({ ...prev, [field]: imageUrl }));
      }
    } catch (err) {
      console.error("Image upload failed", err);
      alert("Failed to process image");
    }
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const customIcon = L.divIcon({
    html: `<div style="background-image: url(${getDisplayImageUrl(formData.logoUrl) || 'https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=256&auto=format&fit=crop'}); width: 40px; height: 40px; background-size: cover; background-position: center; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"></div>`,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Information</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Update the general info, images, and location for your store.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Core Info */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Store className="w-5 h-5 text-[#1b1b1b]" /> Basic Details
          </h3>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Store Name</label>
              <input
                type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Description</label>
              <textarea
                rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="Tell customers what your store is all about..."
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none resize-none"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                 <Clock className="w-4 h-4 text-gray-400" /> Opening Hours
               </label>
              <input
                type="text" value={formData.openingHours} onChange={e => setFormData({...formData, openingHours: e.target.value})}
                placeholder="Mon-Sun: 9AM - 9PM"
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Location & Map */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-[#1b1b1b]" /> Location
          </h3>

          <div className="space-y-2 mb-4">
               <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Full Address</label>
               <input
                 type="text" required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})}
                 placeholder="123 Coffee Street, CA"
                 className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none"
               />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-200">Pinpoint on Map</p>
            <p className="text-xs text-gray-500 mb-2">Click on the map to set your exact store location.</p>
            <div className="h-[300px] w-full rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 z-0 relative">
               <MapContainer center={mapCenter} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%', zIndex: 0 }}>
                 <TileLayer
                   attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                   url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                 />
                 <LocationPicker
                    position={[lat, lng]}
                    setPosition={([newLat, newLng]) => {
                       setFormData({ ...formData, latitude: newLat.toString(), longitude: newLng.toString() });
                       setMapCenter([newLat, newLng]);
                    }}
                 />
                 <Marker position={[lat, lng]} icon={customIcon} />
               </MapContainer>
            </div>
            <div className="flex gap-4 mt-2">
              <div className="text-xs text-gray-500">Lat: {lat.toFixed(6)}</div>
              <div className="text-xs text-gray-500">Lng: {lng.toFixed(6)}</div>
            </div>
          </div>
        </div>

        {/* Media & Images */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-[#1b1b1b]" /> Media & Images
          </h3>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Store Logo */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Store Logo</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800 shrink-0">
                  {formData.logoUrl ? (
                    <img src={getDisplayImageUrl(formData.logoUrl)} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-gray-300" /></div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <Upload className="w-4 h-4" /> Upload Logo
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'logoUrl')} />
                  </label>
                </div>
              </div>
            </div>

            {/* Store Menu */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Menu Image (Optional)</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800 shrink-0">
                  {formData.menuUrl ? (
                    <img src={getDisplayImageUrl(formData.menuUrl)} alt="Menu" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-gray-300" /></div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <Upload className="w-4 h-4" /> Upload Menu
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'menuUrl')} />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Store Images */}
          <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-800">
             <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Store Photos ({formData.images.length}/3)</label>
                {formData.images.length < 3 && (
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors">
                    <Upload className="w-3 h-3" /> Add Photos
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFileUpload(e, 'images')} />
                  </label>
                )}
             </div>
             {formData.images.length > 0 ? (
                 <div className="grid grid-cols-3 gap-4">
                   {formData.images.map((img: string, i: number) => (
                      <div key={i} className="relative aspect-video rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 group">
                        <img src={getDisplayImageUrl(img)} alt={`Store ${i+1}`} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeImage(i)} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                           <X className="w-4 h-4" />
                        </button>
                      </div>
                   ))}
                 </div>
             ) : (
                <div className="p-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-gray-500 text-sm">
                   Upload 2-3 photos showing the interior and exterior of your store.
                </div>
             )}
          </div>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-8 py-3 rounded-xl font-bold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
            Save Branch Information
          </button>

          {saved && (
            <span className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400 text-sm font-bold animate-in fade-in slide-in-from-left-2">
              <CheckCircle2 className="w-5 h-5" />
              Information Saved!
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
