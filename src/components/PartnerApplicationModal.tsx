import React, { useState, useEffect, useRef } from 'react';
import { X, Store, User, Mail, PenTool, Image as ImageIcon, MapPin, Phone, Check, Upload, LoaderCircle } from 'lucide-react';
import { doc, getDoc } from '@/src/lib/dataCompat';
import { db } from '../lib/backend';
import 'leaflet/dist/leaflet.css';
// @ts-ignore
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { submitPartnerApplication } from '../lib/partnerApplication';
import { MapBaseLayers } from './MapBaseLayers';

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
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<any[]>([]);

  // Form states
  const [businessName, setBusinessName] = useState('');
  const [applicantName, setApplicantName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [description, setDescription] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState('');
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const skipNextLocationSearch = useRef(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    async function loadPlans() {
      const docRef = doc(db, "settings", "subscriptions");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().plans) {
        setPlans(docSnap.data().plans);
        if (docSnap.data().plans.length > 0) {
           setSelectedPlanId(docSnap.data().plans[0].name);
        }
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

  useEffect(() => {
    if (!isOpen) return;

    const query = address.trim();
    if (skipNextLocationSearch.current) {
      skipNextLocationSearch.current = false;
      return;
    }
    if (query.length < 3) {
      setLocationSuggestions([]);
      setLocationSearchError('');
      setIsSearchingLocation(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
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
        if (!controller.signal.aborted) setIsSearchingLocation(false);
      }
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [address, isOpen]);

  if (!isOpen) return null;

  const selectLocation = (suggestion: LocationSuggestion) => {
    const lat = Number(suggestion.lat);
    const lng = Number(suggestion.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    skipNextLocationSearch.current = true;
    setAddress(suggestion.display_name);
    setCoordinates([lat, lng]);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
    setLocationSearchError('');
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      alert("Logo must be a PNG, JPEG, or WebP image no larger than 2 MB.");
      e.target.value = "";
      return;
    }
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
       setStep(2);
       return;
    }
    setIsSubmitting(true);
    try {
      await submitPartnerApplication({
        businessName,
        applicantName,
        email,
        phoneNumber,
        description,
        address,
        coordinates,
        subscriptionLevel: selectedPlanId,
      }, logoFile);
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
        // reset manually
        setStep(1);
        setBusinessName('');
        setApplicantName('');
        setEmail('');
        setPhoneNumber('');
        setDescription('');
        if (logoPreview) URL.revokeObjectURL(logoPreview);
        setLogoFile(null);
        setLogoPreview('');
        setAddress('');
      }, 3000);
    } catch (error) {
      alert("Failed to submit application");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
      <div 
        className="bg-white dark:bg-gray-900 w-full max-w-[800px] max-h-[90vh] flex flex-col rounded-[2rem] shadow-xl relative border border-gray-100 dark:border-gray-800 transition-colors mx-4"
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 md:p-8 shrink-0 flex flex-col items-center border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white transition-colors mb-2">
            Partner Application
          </h2>
          <div className="flex items-center justify-center gap-4 text-sm font-medium">
            <span className={step === 1 ? 'text-[#1b1b1b]' : 'text-gray-400'}>1. Business Details</span>
            <span className="text-gray-300 dark:text-gray-700">|</span>
            <span className={step === 2 ? 'text-[#1b1b1b]' : 'text-gray-400'}>2. Select Subscription</span>
          </div>
        </div>

        {isSuccess ? (
          <div className="p-8 text-center py-10 overflow-y-auto">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Store className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Application Received!</h3>
            <p className="text-gray-500 dark:text-gray-400">We'll review your details and contact you shortly to complete the setup process.</p>
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
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Phone className="h-4 w-4" /></div>
                        <input type="tel" required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none text-sm" placeholder="(555) 123-4567" />
                      </div>
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Logo Image Upload</label>
                      <div className="flex items-center gap-4">
                        {logoPreview ? (
                          <div className="w-12 h-12 rounded-xl border border-gray-200 overflow-hidden shrink-0">
                            <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200 text-gray-400">
                           <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                        <label className="flex-1 cursor-pointer">
                          <div className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700">
                            <Upload className="w-4 h-4" />
                            Choose File
                          </div>
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                      </div>
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
                            setAddress(e.target.value);
                            setShowLocationSuggestions(true);
                          }}
                          onFocus={() => setShowLocationSuggestions(true)}
                          onBlur={() => window.setTimeout(() => setShowLocationSuggestions(false), 150)}
                          autoComplete="off"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={showLocationSuggestions && locationSuggestions.length > 0}
                          aria-controls="location-suggestions"
                          className="block w-full pl-10 pr-10 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-[#1b1b1b] outline-none text-sm"
                          placeholder="Search for a business address"
                        />
                        {isSearchingLocation && (
                          <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                        )}
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
                      <div className="w-full h-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100">
                        <MapContainer center={[7.4478, 125.8078]} zoom={13} style={{ height: '100%', width: '100%' }}>
                          <MapBaseLayers />
                          <MapViewport position={coordinates} />
                          <LocationMarker position={coordinates} setPosition={setCoordinates} />
                        </MapContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="animate-in fade-in slide-in-from-right-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {plans.map((plan) => (
                      <div 
                        key={plan.id} 
                        onClick={() => setSelectedPlanId(plan.name)}
                        className={`cursor-pointer rounded-2xl p-5 border-2 transition-all ${selectedPlanId === plan.name ? 'border-[#1b1b1b] bg-gray-100/50 dark:bg-white/5' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-gray-400'}`}
                      >
                         <h4 className="font-bold text-gray-900 dark:text-white">{plan.name}</h4>
                         <div className="mt-2 mb-4">
                           <span className="text-2xl font-bold text-gray-900 dark:text-white">₱{plan.price}</span>
                           <span className="text-gray-500 text-sm">/{plan.interval}</span>
                         </div>
                         <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                           {plan.features.map((f: string, i: number) => (
                             <li key={i} className="flex gap-2">
                               <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                               <span>{f}</span>
                             </li>
                           ))}
                         </ul>
                      </div>
                    ))}
                    {plans.length === 0 && (
                      <div className="col-span-full text-center py-8 text-gray-500">No plans configured by admin yet. Proceed to submit.</div>
                    )}
                  </div>
                </div>
              )}

            </div>
            
            <div className="p-6 md:p-8 pt-4 shrink-0 flex gap-3 justify-end border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-b-[2rem]">
              {step === 2 && (
                <button type="button" onClick={() => setStep(1)} className="px-6 py-2.5 rounded-xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
                  Back
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-[#1b1b1b] text-white font-medium rounded-xl hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting ? 'Submitting...' : step === 1 ? 'Next Step' : 'Submit Application'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
