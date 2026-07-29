import React, { useState, useEffect } from "react";
import { doc, updateDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Save, MapPin, Clock, Image as ImageIcon, CheckCircle2, Upload, X, Store, BadgeCheck, Pencil, ExternalLink, Eye, Share2 } from "lucide-react";
import { MapContainer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { deleteImageFromDriveSecure, getDisplayImageUrl, isTemporaryObjectUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import { MapBaseLayers } from "../../components/MapBaseLayers";
import { TimeInput } from "../../components/TimeInput";
import { formatStoreHours } from "../../lib/dateTime";
import { STAMP_COLOR_OPTIONS, STAMP_ICON_OPTIONS, StoreStamp } from "../../components/StoreStamp";
import { CustomDropdown } from "../../components/CustomDropdown";
import { getSubscriptionGalleryPhotoLimit, SubscriptionDependencies } from "../../lib/subscriptionBilling";
import { StoreSocialLinksEditor } from "../../components/StoreSocialLinks";
import { normalizeSocialLinks } from "../../lib/storeSocialLinks";

function LocationPicker({ setPosition }: { position: [number, number], setPosition: (p: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

const getStoreFormData = (store: any) => ({
  name: store?.name || "",
  description: store?.description || "",
  category: store?.category || "",
  contact: store?.contact || "",
  website: store?.website || "",
  socialLinks: Array.isArray(store?.socialLinks)
    ? store.socialLinks.map((link: any) => ({ url: String(link?.url ?? "") }))
    : [],
  address: store?.address || "",
  latitude: store?.lat ?? store?.latitude ?? "",
  longitude: store?.lng ?? store?.longitude ?? "",
  logoUrl: store?.logoUrl || "",
  images: Array.isArray(store?.images) ? store.images : [],
  menuUrl: store?.menuUrl || "",
  openingHours: store?.openingHours || store?.hours || "Mon-Sun: 9AM - 9PM",
  openingTime: store?.openingTime || "09:00",
  closingTime: store?.closingTime || "21:00",
  stampIcon: store?.stampIcon || "star",
  stampColor: store?.stampColor || "#1b1b1b",
  stampLabel: store?.stampLabel || "Stamp",
});

export default function StoreOwnerInfo({ store, setStore, subscriptionDependencies }: { store: any, setStore: (s: any) => void, subscriptionDependencies?: SubscriptionDependencies | null }) {
  const galleryPhotoLimit = getSubscriptionGalleryPhotoLimit(subscriptionDependencies);
  const [formData, setFormData] = useState(() => getStoreFormData(store));
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});

  const getFileFromTemporaryPreview = async (url: string, purpose: string) => {
    if (!isTemporaryObjectUrl(url)) return null;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Preview fetch failed with ${response.status}`);
      const blob = await response.blob();
      const mimeType = blob.type || "image/png";
      if (!mimeType.startsWith("image/")) throw new Error("Preview is not an image.");
      const extension = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
      return new File([blob], `${purpose}-preview.${extension}`, { type: mimeType });
    } catch (error) {
      console.error("Failed to recover temporary preview for upload", error);
      throw new Error("Please re-upload the logo, menu, or store photos before saving. The current preview is temporary and cannot be shown to customers.");
    }
  };

  // Parse coords
  const lat = parseFloat(formData.latitude) || 7.4478; // Default to Tagum City
  const lng = parseFloat(formData.longitude) || 125.8078;
  const [mapCenter, setMapCenter] = useState<[number, number]>([lat, lng]);

  useEffect(() => {
    if (store) {
      setFormData(getStoreFormData(store));
      const storeLat = Number(store.lat ?? store.latitude);
      const storeLng = Number(store.lng ?? store.longitude);
      if (Number.isFinite(storeLat) && Number.isFinite(storeLng)) {
         setMapCenter([storeLat, storeLng]);
      }
    }
  }, [store]);

  useEffect(() => {
    setIsEditing(false);
    setSaved(false);
  }, [store?.id]);

  const discardChanges = () => {
    Object.keys(pendingFiles).forEach((url) => URL.revokeObjectURL(url));
    setPendingFiles({});
    setFormData(getStoreFormData(store));
    setSaved(false);
    setIsEditing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store?.id) return;
    let socialLinks;
    try {
      socialLinks = normalizeSocialLinks(formData.socialLinks);
    } catch {
      return;
    }
    setSaving(true);
    setSaved(false);
    setUploadProgress("");
    const uploadedImageUrls: string[] = [];
    let storePersisted = false;
    try {
      const imageUploadCount = [formData.logoUrl, formData.menuUrl, ...formData.images]
        .filter((url: string) => pendingFiles[url] || isTemporaryObjectUrl(url))
        .length;
      let completedImageUploads = 0;

      const uploadPending = async (url: string, purpose: string) => {
        const file = pendingFiles[url] || await getFileFromTemporaryPreview(url, purpose);
        if (file) {
          const label = purpose === "store-logo" ? "logo" : purpose === "store-menu" ? "menu" : "store photo";
          if (imageUploadCount > 0) {
            setUploadProgress(`Uploading ${label} ${completedImageUploads + 1}/${imageUploadCount}...`);
          }
          const uploadedUrl = await uploadImageFileToDriveSecure(file, {
            owner: formData.name || store?.id,
            purpose,
          });
          uploadedImageUrls.push(uploadedUrl);
          completedImageUploads += 1;
          if (imageUploadCount > 0) {
            setUploadProgress(`Uploaded images ${completedImageUploads}/${imageUploadCount}...`);
          }
          return uploadedUrl;
        }
        return url;
      };
      const logoUrl = await uploadPending(formData.logoUrl, "store-logo");
      const menuUrl = await uploadPending(formData.menuUrl, "store-menu");
      const images = await Promise.all(
        formData.images.map((url: string) => uploadPending(url, "store-photo")),
      );
      const nextStoreData = {
        ...formData,
        socialLinks,
        logoUrl,
        menuUrl,
        images,
        lat: Number(formData.latitude),
        lng: Number(formData.longitude),
        location: formData.address,
        hours: formatStoreHours(formData.openingTime, formData.closingTime),
        openingHours: formatStoreHours(formData.openingTime, formData.closingTime),
      };
      setUploadProgress("Saving branch information...");
      await updateDoc(doc(db, "stores", store.id), nextStoreData);
      storePersisted = true;
      const previousImages = [store.logoUrl, store.menuUrl, ...(store.images || [])].filter(Boolean);
      const retainedImages = new Set([logoUrl, menuUrl, ...images].filter(Boolean));
      await Promise.all(
        previousImages
          .filter((url: string) => !retainedImages.has(url))
          .map((url: string) => deleteImageFromDriveSecure(url).catch(console.error)),
      );
      setStore({ ...store, ...nextStoreData });
      Object.keys(pendingFiles).forEach((url) => URL.revokeObjectURL(url));
      setPendingFiles({});
      setSaved(true);
      setIsEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      if (!storePersisted && uploadedImageUrls.length) {
        await Promise.allSettled(uploadedImageUrls.map((url) => deleteImageFromDriveSecure(url)));
      }
      console.error(error);
      alert("Failed to update store info");
    } finally {
      setSaving(false);
      setUploadProgress("");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'menuUrl' | 'images') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (field === 'images') {
      const newImages = [...formData.images];
      const additions: Record<string, File> = {};
      for (let i = 0; i < files.length && newImages.length < galleryPhotoLimit; i++) {
        const previewUrl = URL.createObjectURL(files[i]);
        additions[previewUrl] = files[i];
        newImages.push(previewUrl);
      }
      setPendingFiles((current) => ({ ...current, ...additions }));
      setFormData(prev => ({ ...prev, images: newImages }));
    } else {
      const previousUrl = formData[field];
      if (previousUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previousUrl);
        setPendingFiles((current) => {
          const next = { ...current };
          delete next[previousUrl];
          return next;
        });
      }
      const previewUrl = URL.createObjectURL(files[0]);
      setPendingFiles((current) => ({ ...current, [previewUrl]: files[0] }));
      setFormData(prev => ({ ...prev, [field]: previewUrl }));
    }
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    const removedUrl = formData.images[index];
    if (removedUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(removedUrl);
      setPendingFiles((current) => {
        const next = { ...current };
        delete next[removedUrl];
        return next;
      });
    }
    setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const customIcon = L.divIcon({
    html: `<div style="background-image: url(${getDisplayImageUrl(formData.logoUrl) || 'https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=256&auto=format&fit=crop'}); width: 40px; height: 40px; background-size: cover; background-position: center; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"></div>`,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });

  if (!isEditing) {
    return (
      <div className="max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Information</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This is how your store currently appears to customers.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {store?.id && (
              <a
                href={`/store/${store.id}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open customer page"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                <ExternalLink className="h-4 w-4" />
                View
              </a>
            )}
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              aria-label="Edit store information"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          </div>
        </div>

        {saved && (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            Information saved. The customer preview has been refreshed.
          </div>
        )}

        {store?.id ? (
          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Customer preview</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 shadow-sm dark:bg-gray-800 dark:text-gray-400">Live store page</span>
            </div>
            <iframe
              key={store.id}
              src={`/store/${store.id}`}
              title={`${store.name || "Store"} customer page preview`}
              className="h-[760px] w-full bg-white dark:bg-[#1b1b1b]"
            />
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-gray-300 px-6 py-16 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Store preview is unavailable until this branch has been created.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Edit Store Information</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Update the general info, images, and location for your store.</p>
        </div>
        <button
          type="button"
          onClick={discardChanges}
          disabled={saving}
          aria-label="Cancel editing store information"
          className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Core Info */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Store className="w-5 h-5 text-[#1b1b1b] dark:text-white" /> Basic Details
          </h3>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Store Name</label>
              <input
                type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Category</label>
              <input type="text" required value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} placeholder="Coffee, Bakery, Retail..." className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Contact Number</label>
              <input type="tel" required value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} placeholder="+63..." className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Website (Optional)</label>
              <input type="url" value={formData.website} onChange={e => setFormData({...formData, website: e.target.value})} placeholder="https://example.com" className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
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
                 <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" /> Opening Hours
               </label>
              <div className="grid grid-cols-2 gap-4">
                <TimeInput aria-label="Opening time (Philippine time)" required value={formData.openingTime} onChange={openingTime => setFormData({...formData, openingTime})} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                <TimeInput aria-label="Closing time (Philippine time)" required value={formData.closingTime} onChange={closingTime => setFormData({...formData, closingTime})} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
              <Share2 className="h-5 w-5 text-[#1b1b1b] dark:text-white" /> Social Media
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              These links appear only on this branch&apos;s customer page. The platform logo is detected automatically.
            </p>
          </div>
          <StoreSocialLinksEditor
            value={formData.socialLinks}
            onChange={(socialLinks) => setFormData({ ...formData, socialLinks })}
          />
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <BadgeCheck className="w-5 h-5 text-[#1b1b1b] dark:text-white" /> Loyalty Stamp
          </h3>
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Stamp Name</label>
                <input
                  type="text"
                  maxLength={24}
                  value={formData.stampLabel}
                  onChange={e => setFormData({...formData, stampLabel: e.target.value})}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Icon</label>
                <CustomDropdown
                  value={formData.stampIcon}
                  onChange={stampIcon => setFormData({...formData, stampIcon})}
                  options={STAMP_ICON_OPTIONS}
                  className="w-full [&>button]:min-h-[42px] [&>button]:rounded-xl [&>button]:bg-gray-50 [&>button]:px-4 [&>button]:py-2.5 [&>button]:text-sm [&>button]:dark:bg-gray-800"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Color</label>
                <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
                  {STAMP_COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({...formData, stampColor: color})}
                      className={`h-8 w-8 rounded-full border-2 ${formData.stampColor === color ? "border-gray-900 dark:border-white" : "border-white/80 dark:border-gray-700"}`}
                      style={{ backgroundColor: color }}
                      aria-label={`Use stamp color ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
              <StoreStamp style={formData} />
              <span className="text-sm font-bold text-gray-900 dark:text-white">{formData.stampLabel || "Stamp"}</span>
            </div>
          </div>
        </div>

        {/* Location & Map */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-[#1b1b1b] dark:text-white" /> Location
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
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Click on the map to set your exact store location.</p>
            <div className="h-[300px] w-full rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 z-0 relative">
               <MapContainer center={mapCenter} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%', zIndex: 0 }}>
               <MapBaseLayers />
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
              <div className="text-xs text-gray-500 dark:text-gray-400">Lat: {lat.toFixed(6)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Lng: {lng.toFixed(6)}</div>
            </div>
          </div>
        </div>

        {/* Media & Images */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-[#1b1b1b] dark:text-white" /> Media & Images
          </h3>

          {uploadProgress && (
            <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
              <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-white" />
              <span>{uploadProgress}</span>
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Store Logo */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Store Logo</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800 shrink-0">
                  {formData.logoUrl ? (
                    <img src={getDisplayImageUrl(formData.logoUrl)} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-gray-300 dark:text-gray-600" /></div>
                  )}
                </div>
                <div className="flex-1">
                  <label title="Upload store logo" className={`inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 ${saving ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                    <Upload className="w-4 h-4" /> Upload
                    <input type="file" accept="image/*" aria-label="Upload store logo" className="hidden" onChange={(e) => handleFileUpload(e, 'logoUrl')} disabled={saving} />
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
                    <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-gray-300 dark:text-gray-600" /></div>
                  )}
                </div>
                <div className="flex-1">
                  <label title="Upload menu image" className={`inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 ${saving ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                    <Upload className="w-4 h-4" /> Upload
                    <input type="file" accept="image/*" aria-label="Upload menu image" className="hidden" onChange={(e) => handleFileUpload(e, 'menuUrl')} disabled={saving} />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Store Images */}
          <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-800">
             <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Store Photos ({formData.images.length}/{galleryPhotoLimit})</label>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Your subscription includes up to {galleryPhotoLimit} gallery photos.</p>
                </div>
                {formData.images.length < galleryPhotoLimit && (
                  <label title="Add store photos" className={`inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-[#1b1b1b] transition-colors hover:bg-gray-100 dark:bg-white/10 dark:text-white ${saving ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                    <Upload className="w-3 h-3" /> Add
                    <input type="file" accept="image/*" multiple aria-label="Add store photos" className="hidden" onChange={(e) => handleFileUpload(e, 'images')} disabled={saving} />
                  </label>
                )}
             </div>
             {formData.images.length > 0 ? (
                 <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                   {formData.images.map((img: string, i: number) => (
                      <div key={i} className="relative aspect-video rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 group">
                        <img src={getDisplayImageUrl(img)} alt={`Store ${i+1}`} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeImage(i)} disabled={saving} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed disabled:opacity-50">
                           <X className="w-4 h-4" />
                        </button>
                      </div>
                   ))}
                 </div>
             ) : (
                <div className="p-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm">
                   Upload up to {galleryPhotoLimit} photos showing the interior, exterior, products, and atmosphere of your store.
                </div>
             )}
          </div>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            aria-label="Save branch information"
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-8 py-3 rounded-xl font-bold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? (uploadProgress || "Saving...") : "Save"}
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
