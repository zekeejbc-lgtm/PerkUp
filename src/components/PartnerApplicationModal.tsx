import React, { useState, useEffect } from 'react';
import { X, Store, User, Mail, PenTool, Image as ImageIcon, MapPin, Phone, CreditCard, Check, Upload } from 'lucide-react';
import { collection, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import 'leaflet/dist/leaflet.css';
// @ts-ignore
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

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
  const [logoUrl, setLogoUrl] = useState('');
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
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
      // Default to rough US center, we can let user pick
      setCoordinates([39.8283, -98.5795]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
       setStep(2);
       return;
    }
    setIsSubmitting(true);
    try {
      const newAppRef = doc(collection(db, 'applications'));
      await setDoc(newAppRef, {
        businessName,
        applicantName,
        email,
        phoneNumber,
        description,
        logoUrl,
        address,
        coordinates,
        subscriptionLevel: selectedPlanId,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
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
        setLogoUrl('');
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
            <span className={step === 1 ? 'text-orange-600' : 'text-gray-400'}>1. Business Details</span>
            <span className="text-gray-300 dark:text-gray-700">|</span>
            <span className={step === 2 ? 'text-orange-600' : 'text-gray-400'}>2. Select Subscription</span>
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
                        <input type="text" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-orange-600 outline-none text-sm" placeholder="e.g. My Coffee Shop" />
                      </div>
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Your Name</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><User className="h-4 w-4" /></div>
                        <input type="text" required value={applicantName} onChange={(e) => setApplicantName(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-orange-600 outline-none text-sm" placeholder="John Doe" />
                      </div>
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Email Address</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Mail className="h-4 w-4" /></div>
                        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-orange-600 outline-none text-sm" placeholder="hello@example.com" />
                      </div>
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Phone Number</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><Phone className="h-4 w-4" /></div>
                        <input type="tel" required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-orange-600 outline-none text-sm" placeholder="(555) 123-4567" />
                      </div>
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Logo Image Upload</label>
                      <div className="flex items-center gap-4">
                        {logoUrl ? (
                          <div className="w-12 h-12 rounded-xl border border-gray-200 overflow-hidden shrink-0">
                            <img src={logoUrl} alt="Logo Preview" className="w-full h-full object-cover" />
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
                        <textarea required rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-orange-600 outline-none text-sm resize-none" placeholder="We run a small bakery..." />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1 text-left">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Location Address</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400"><MapPin className="h-4 w-4" /></div>
                        <input type="text" required value={address} onChange={(e) => setAddress(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl focus:ring-2 focus:ring-orange-600 outline-none text-sm" placeholder="123 Market St, San Francisco, CA" />
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-left flex-1 h-[260px]">
                      <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Pin Location on Map</label>
                      <div className="w-full h-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100">
                        <MapContainer center={[39.8283, -98.5795]} zoom={3} style={{ height: '100%', width: '100%' }}>
                          <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          />
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
                        className={`cursor-pointer rounded-2xl p-5 border-2 transition-all ${selectedPlanId === plan.name ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-orange-300'}`}
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
                className="px-6 py-2.5 bg-orange-600 text-white font-medium rounded-xl hover:bg-orange-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
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
