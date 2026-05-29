import { useState } from 'react';
import { X, Store, User, Mail, PenTool } from 'lucide-react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface PartnerApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PartnerApplicationModal({ isOpen, onClose }: PartnerApplicationModalProps) {
  const [businessName, setBusinessName] = useState('');
  const [applicantName, setApplicantName] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const newAppRef = doc(collection(db, 'applications'));
      await setDoc(newAppRef, {
        businessName,
        applicantName,
        email,
        description,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
        setBusinessName('');
        setApplicantName('');
        setEmail('');
        setDescription('');
      }, 3000);
    } catch (error) {
      alert("Failed to submit application");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-gray-900 w-full max-w-[500px] max-h-[90vh] overflow-y-auto rounded-[2rem] shadow-xl relative border border-gray-100 dark:border-gray-800 transition-colors mx-4"
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white transition-colors mb-1">
              Partner Application
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Join our network and start rewarding your customers.
            </p>
          </div>

          {isSuccess ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Store className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Application Received!</h3>
              <p className="text-gray-500 dark:text-gray-400">We'll review your details and contact you shortly to complete the setup process.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1 text-left">
                <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Business Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Store className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                    placeholder="e.g. My Coffee Shop"
                  />
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Your Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <User className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                    placeholder="John Doe"
                  />
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors"
                    placeholder="hello@example.com"
                  />
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs font-semibold text-gray-900 dark:text-gray-100">Tell us about your business</label>
                <div className="relative">
                  <div className="absolute top-3 left-3 pointer-events-none text-gray-400">
                    <PenTool className="h-5 w-5" />
                  </div>
                  <textarea
                    required
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="block w-full pl-10 pr-3 py-3 border-0 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl ring-1 ring-inset ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-orange-600 dark:focus:ring-orange-500 sm:text-sm sm:leading-6 transition-colors resize-none"
                    placeholder="We run a small bakery..."
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-6 bg-orange-600 text-white font-medium py-3 px-4 rounded-xl hover:bg-orange-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
