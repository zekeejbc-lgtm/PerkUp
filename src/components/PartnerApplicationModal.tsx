import React, { useState, useEffect, useRef } from 'react';
import { X, Store, User, Mail, PenTool, Image as ImageIcon, MapPin, Phone, Check, Upload, LoaderCircle, Copy, Link2, Globe2 } from 'lucide-react';
import { doc, getDoc } from '@/src/lib/dataCompat';
import { db } from '../lib/backend';
import 'leaflet/dist/leaflet.css';
// @ts-ignore
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { checkPartnerApplicationAvailability, submitPartnerApplication } from '../lib/partnerApplication';
import { getPartnerApplicationAvailabilityError } from '../lib/partnerApplicationAvailability';
import { MapBaseLayers } from './MapBaseLayers';
import { ImageCropEditor } from './ImageCropEditor';
import { formatApplicationTrackingCode } from '../lib/applicationTracking';
import { useCurrency } from '../contexts/CurrencyContext';
import { CategoryInput } from './CategoryInput';
import { FEATURED_STORE_CATEGORIES } from '../lib/storeDirectory';
import { getPreferredSubscriptionPlan, type SubscriptionPlan } from '../lib/subscriptionBilling';

// Fix Leaflet marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function LocationMarker({ position, setPosition }: { position: [number, number] | null, setPosition: (p: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return position === null ? null : (
    <Marker position={position}></Marker>
  );
}

function MapViewport({ position }: { position: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(position, Math.max(map.getZoom(), 15), { duration: 0.8 });
    }
  }, [map, position]);

  return null;
}

interface LocationSuggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
}

interface PartnerApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PartnerApplicationModal({ isOpen, onClose }: PartnerApplicationModalProps) {
  const { formatCurrency } = useCurrency();
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  // Form states
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [applicantName, setApplicantName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [description, setDescription] = useState('');
  const [personalFacebookUrl, setPersonalFacebookUrl] = useState('');
  const [businessFacebookUrl, setBusinessFacebookUrl] = useState('');
  const [businessWebsiteUrl, setBusinessWebsiteUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoEditFile, setLogoEditFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState('');
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const locationSearchController = useRef<AbortController | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');

  useEffect(() => {
    async function loadPlans() {
      const docRef = doc(db, "settings", "subscriptions");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && Array.isArray(docSnap.data().plans)) {
        const loadedPlans = docSnap.data().plans as SubscriptionPlan[];
        setPlans(loadedPlans);
        setSelectedPlanId(getPreferredSubscriptionPlan(loadedPlans)?.name || "");
      }
    }
    if (isOpen) {
      loadPlans();
      // Default to Tagum City, while still allowing the applicant to pick an exact location.
      setCoordinates([7.4478, 125.8078]);
    }
  }, [isOpen]);

  useEffect(() => () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  useEffect(() => () => locationSearchController.current?.abort(), []);

  const searchLocations = async () => {
    const query = address.trim();
    if (query.length < 3) {
      setLocationSuggestions([]);
      setLocationSearchError('Enter at least 3 characters to search.');
      setIsSearchingLocation(false);
      return;
    }

    locationSearchController.current?.abort();
    const controller = new AbortController();
    locationSearchController.current = controller;
    setIsSearchingLocation(true);
    setLocationSearchError('');

    try {
      const params = new URLSearchParams({
        q: query,
        format: 'jsonv2',
        addressdetails: '1',
        limit: '5',
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Location search failed');

      const results = await response.json() as LocationSuggestion[];
      setLocationSuggestions(results);
      setShowLocationSuggestions(true);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setLocationSuggestions([]);
        setLocationSearchError('Unable to search locations. Please try again.');
      }
    } finally {
      if (locationSearchController.current === controller) {
        locationSearchController.current = null;
        if (!controller.signal.aborted) setIsSearchingLocation(false);
      }
    }
  };

  if (!isOpen) return null;

  const resetForm = () => {
    setStep(1);
    setBusinessName('');
    setCategory('');
    setApplicantName('');
    setEmail('');
    setPhoneNumber('');
    setDescription('');
    setPersonalFacebookUrl('');
    setBusinessFacebookUrl('');
    setBusinessWebsiteUrl('');
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoEditFile(null);
    setLogoPreview('');
    setAddress('');
    setCoordinates([7.4478, 125.8078]);
    setIsSuccess(false);
    setTrackingNumber('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const selectLocation = (suggestion: LocationSuggestion) => {
    const lat = Number(suggestion.lat);
    const lng = Number(suggestion.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    setAddress(suggestion.display_name);
    setCoordinates([lat, lng]);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
    setLocationSearchError('');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      alert("Logo must be a PNG, JPEG, or WebP image no larger than 2 MB.");
      return;
    }
    setLogoEditFile(file);
  };

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, "");
    const withoutCountryCode = digits.startsWith("63") ? digits.slice(2) : digits;
    const localNumber = withoutCountryCode.startsWith("0") ? withoutCountryCode.slice(1) : withoutCountryCode;
    setPhoneNumber(localNumber.slice(0, 10));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      setIsSubmitting(true);
      try {
        const availability = await checkPartnerApplicationAvailability(email, `+63${phoneNumber}`);
        const availabilityError = getPartnerApplicationAvailabilityError(availability);
        if (availabilityError) {
          alert(availabilityError);
          return;
        }
        setStep(2);
      } catch (error) {
        alert(error instanceof Error ? error.message : "Could not check contact availability.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await submitPartnerApplication({
        businessName,
        category,
        applicantName,
        email,
        phoneNumber: `+63${phoneNumber}`,
        description,
        address,
        coordinates,
        subscriptionLevel: selectedPlanId,
        personalFacebookUrl,
        businessFacebookUrl,
        businessWebsiteUrl,
      }, logoFile);
      setTrackingNumber(result.trackingNumber || formatApplicationTrackingCode(result.applicationId, businessName));
      setIsSuccess(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to submit application");
    } finally {
      setIsSubmitting(false);
    }
  };

  const preferredPlan = getPreferredSubscriptionPlan(plans);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
      <div 
        className="bg-white dark:bg-gray-900 w-full max-w-[800px] max-h-[90vh] flex flex-col rounded-[2rem] shadow-xl relative border border-gray-100 dark:border-gray-800 transition-colors mx-4"
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 md:p-8 shrink-0 flex flex-col items-center border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white transition-colors mb-2">
            Partner Application
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm font-medium">
            <span className={step === 1 ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>1. Business Details</span>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span className={step === 2 ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>2. Select Subscription</span>
          </div>
        </div>

        {isSuccess ? (
          <div className="p-8 text-center py-10 overflow-y-auto">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Store className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Application Received!</h3>
            <p className="text-gray-500 dark:text-gray-400">We'll review your details and contact you shortly to complete the setup process.</p>
            {trackingNumber && (
              <div className="mx-auto mt-6 max-w-md rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left dark:border-gray-700 dark:bg-gray-800">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Application code</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-900 dark:bg-gray-900 dark:text-white">
                    {trackingNumber}
                  </code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(trackingNumber)}
                    className="shrink-0 rounded-xl border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                    aria-label="Copy application code"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">This code is also sent to your email. Use it to track your application status.</p>
              </div>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="mt-6 rounded-xl bg-[#1b1b1b] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-black"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0 overflow-hidden">
            <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1">
              
              {step === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
                  <div className="space-y-4">
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Business Name</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Store className="h-4 w-4" /></div>
                        <input type="text" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none text-sm" placeholder="e.g. My Coffee Shop" />
                      </div>
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Business Category</label>
                      <CategoryInput
                        required
                        value={category}
                        onChange={setCategory}
                        suggestions={FEATURED_STORE_CATEGORIES}
                        placeholder="Coffee, Bakery, Retail..."
                        className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Your Name</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><User className="h-4 w-4" /></div>
                        <input type="text" required value={applicantName} onChange={(e) => setApplicantName(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none text-sm" placeholder="John Doe" />
                      </div>
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Email Address</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Mail className="h-4 w-4" /></div>
                        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none text-sm" placeholder="hello@example.com" />
                      </div>
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Phone Number</label>
                      <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-50 focus-within:ring-2 focus-within:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800">
                        <div className="flex items-center gap-2 border-r border-gray-200 px-3 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
                          <Phone className="h-4 w-4 text-gray-400" />
                          +63
                        </div>
                        <input
                          type="tel"
                          required
                          inputMode="numeric"
                          value={phoneNumber}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          className="block min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"
                          placeholder="912 345 6789"
                        />
                      </div>
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Logo Image Upload</label>
                      <div className="flex items-center gap-4">
                        {logoPreview ? (
                          <button
                            type="button"
                            onClick={() => logoFile && setLogoEditFile(logoFile)}
                            className="w-12 h-12 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0 focus:outline-none focus:ring-2 focus:ring-[#1b1b1b]"
                            aria-label="Preview and edit logo image"
                          >
                            <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 border border-gray-200 dark:border-gray-700 text-gray-400">
                           <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                        <label className="flex-1 cursor-pointer">
                          <div className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                            <Upload className="w-4 h-4" />
                            {logoPreview ? "Change Image" : "Choose File"}
                          </div>
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                      </div>
                      {logoPreview && <p className="text-xs text-gray-500 dark:text-gray-400">Tap the preview to adjust pinch/zoom crop.</p>}
                    </div>
                     <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Tell us about your business</label>
                      <div className="relative">
                        <div className="absolute top-2 left-3 pointer-events-none text-gray-400"><PenTool className="h-4 w-4" /></div>
                        <textarea required rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none text-sm resize-none" placeholder="We run a small bakery..." />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Location Address</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><MapPin className="h-4 w-4" /></div>
                        <input
                          type="text"
                          required
                          value={address}
                          onChange={(e) => {
                            locationSearchController.current?.abort();
                            locationSearchController.current = null;
                            setAddress(e.target.value);
                            setLocationSuggestions([]);
                            setLocationSearchError('');
                            setIsSearchingLocation(false);
                            setShowLocationSuggestions(false);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void searchLocations();
                            }
                          }}
                          onFocus={() => setShowLocationSuggestions(locationSuggestions.length > 0)}
                          onBlur={() => window.setTimeout(() => setShowLocationSuggestions(false), 150)}
                          autoComplete="off"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={showLocationSuggestions && locationSuggestions.length > 0}
                          aria-controls="location-suggestions"
                          className="block w-full pl-10 pr-24 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none text-sm"
                          placeholder="Search for a business address"
                        />
                        <button
                          type="button"
                          aria-label="Search address"
                          disabled={isSearchingLocation}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => void searchLocations()}
                          className="absolute right-1.5 top-1/2 inline-flex h-7 -translate-y-1/2 items-center gap-1 rounded-lg bg-[#1b1b1b] px-2.5 text-xs font-semibold text-white transition-colors hover:bg-black disabled:cursor-wait disabled:opacity-70 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                        >
                          {isSearchingLocation && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                          Search
                        </button>
                        {showLocationSuggestions && locationSuggestions.length > 0 && (
                          <div
                            id="location-suggestions"
                            role="listbox"
                            className="absolute z-[2000] mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800"
                          >
                            {locationSuggestions.map((suggestion) => (
                              <button
                                key={suggestion.place_id}
                                type="button"
                                role="option"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectLocation(suggestion)}
                                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                              >
                                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                <span className="line-clamp-2">{suggestion.display_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {locationSearchError && <p className="text-xs text-red-500">{locationSearchError}</p>}
                    </div>
                    
                    <div className="space-y-1 text-left flex-1 h-[260px]">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Pin Location on Map</label>
                      <div className="relative z-0 w-full h-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100">
                        <MapContainer center={[7.4478, 125.8078]} zoom={13} style={{ height: '100%', width: '100%', zIndex: 0 }}>
                          <MapBaseLayers />
                          <MapViewport position={coordinates} />
                          <LocationMarker position={coordinates} setPosition={setCoordinates} />
                        </MapContainer>
                      </div>
                    </div>
                  </div>

                  <section className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 text-left dark:border-gray-700 dark:bg-gray-800/40 md:col-span-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Online presence <span className="font-normal text-gray-500 dark:text-gray-400">(Optional)</span></h3>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Add any links that can help us verify and learn more about you and your business.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <label htmlFor="personal-facebook-url" className="text-xs font-semibold text-gray-700 dark:text-gray-300">Personal Facebook</label>
                        <div className="relative">
                          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input
                            id="personal-facebook-url"
                            type="url"
                            value={personalFacebookUrl}
                            onChange={(event) => setPersonalFacebookUrl(event.target.value)}
                            className="block w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            placeholder="https://facebook.com/your-profile"
                            autoComplete="url"
                            maxLength={1000}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="business-facebook-url" className="text-xs font-semibold text-gray-700 dark:text-gray-300">Business Facebook Page</label>
                        <div className="relative">
                          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input
                            id="business-facebook-url"
                            type="url"
                            value={businessFacebookUrl}
                            onChange={(event) => setBusinessFacebookUrl(event.target.value)}
                            className="block w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            placeholder="https://facebook.com/your-business"
                            autoComplete="url"
                            maxLength={1000}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="business-website-url" className="text-xs font-semibold text-gray-700 dark:text-gray-300">Business Website</label>
                        <div className="relative">
                          <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <input
                            id="business-website-url"
                            type="url"
                            value={businessWebsiteUrl}
                            onChange={(event) => setBusinessWebsiteUrl(event.target.value)}
                            className="block w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            placeholder="https://yourbusiness.com"
                            autoComplete="url"
                            maxLength={1000}
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {step === 2 && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {plans.map((plan) => {
                      const isSelected = selectedPlanId === plan.name;
                      const isPreferred = plan === preferredPlan;
                      return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.name || "")}
                        className={`relative cursor-pointer rounded-2xl p-5 border-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 ${
                          isSelected
                            ? 'border-green-500 bg-green-50 text-green-950 shadow-sm ring-1 ring-green-500/40 dark:border-green-400 dark:bg-green-500/15 dark:text-green-50'
                            : isPreferred
                              ? 'border-green-400 bg-green-50/50 text-gray-900 ring-1 ring-green-500/20 dark:border-green-500 dark:bg-green-500/10 dark:text-white'
                              : 'border-gray-200 bg-white text-gray-900 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-white dark:hover:border-gray-500'
                        }`}
                        aria-pressed={isSelected}
                      >
                         {isSelected && (
                           <span className="absolute right-4 top-4 inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white">
                             <Check className="h-4 w-4" />
                           </span>
                         )}
                         {isPreferred && (
                           <span className="mb-3 inline-flex rounded-full bg-green-600 px-3 py-1 text-xs font-semibold text-white dark:bg-green-500 dark:text-green-950">
                             Preferred
                           </span>
                         )}
                         <h4 className={`pr-8 font-bold ${isSelected ? 'text-green-950 dark:text-green-50' : 'text-gray-900 dark:text-white'}`}>{plan.name}</h4>
                         <div className="mt-2 mb-4">
                           <span className={`text-2xl font-bold ${isSelected ? 'text-green-900 dark:text-green-100' : 'text-gray-900 dark:text-white'}`}>{formatCurrency(Number(plan.price || 0), { maximumFractionDigits: 2 })}</span>
                           <span className={`text-sm ${isSelected ? 'text-green-700 dark:text-green-200' : 'text-gray-500'}`}>/{plan.interval}</span>
                         </div>
                         <ul className={`space-y-2 text-sm ${isSelected ? 'text-green-900 dark:text-green-100' : 'text-gray-600 dark:text-gray-300'}`}>
                           {(plan.features || []).map((f: string, i: number) => (
                             <li key={i} className="flex gap-2">
                               <Check className={`w-4 h-4 shrink-0 mt-0.5 ${isSelected ? 'text-green-600 dark:text-green-300' : 'text-green-500'}`} />
                               <span>{f}</span>
                             </li>
                           ))}
                         </ul>
                      </button>
                    )})}
                    {plans.length === 0 && (
                      <div className="col-span-full text-center py-8 text-gray-500">No plans configured by admin yet. Proceed to submit.</div>
                    )}
                  </div>
                </div>
              )}

            </div>
            
            <div className="shrink-0 flex items-center justify-end gap-2.5 border-t border-gray-100 bg-white px-4 py-3.5 dark:border-gray-800 dark:bg-gray-900 sm:px-6 md:px-8 md:py-4 rounded-b-[2rem]">
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold leading-none text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-10 min-w-0 items-center justify-center whitespace-nowrap rounded-lg bg-[#1b1b1b] px-5 text-sm font-semibold leading-none text-white transition-all hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                {isSubmitting ? 'Submitting...' : step === 1 ? 'Next Step' : 'Submit Application'}
              </button>
            </div>
          </form>
        )}
        {logoEditFile && (
          <ImageCropEditor
            file={logoEditFile}
            onCancel={() => setLogoEditFile(null)}
            onApply={(file, previewUrl) => {
              if (logoPreview) URL.revokeObjectURL(logoPreview);
              setLogoFile(file);
              setLogoPreview(previewUrl);
              setLogoEditFile(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
