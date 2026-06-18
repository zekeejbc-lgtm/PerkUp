import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "@/src/lib/dataCompat";
import { db } from "../lib/backend";
import { ArrowLeft, MapPin, Phone, Globe, Clock, Star, Share2 } from "lucide-react";

interface StoreContent {
  id: string;
  name: string;
  description?: string;
  contact?: string;
  website?: string;
  address?: string;
  hours?: string;
}

// Keep demo stores in sync for testing when DB is empty
const DEMO_STORES: Record<string, StoreContent> = {
  "demo1": { 
    id: "demo1", name: "The Daily Grind", 
    description: "Artisan coffee & pastries locally sourced. We pride ourselves on the best espresso in town.", 
    contact: "(084) 123-4567",
    website: "https://dailygrind.example.com",
    address: "Tagum City, Davao del Norte",
    hours: "Mon-Sat: 7:00 AM - 9:00 PM"
  },
  "demo2": { 
    id: "demo2", name: "Green Leaf Salads", 
    description: "Fresh, locally sourced salads and healthy grain bowls. Your daily dose of greens.", 
    contact: "(084) 987-6543",
    website: "https://greenleaf.example.com",
    address: "Pioneer Ave, Tagum City",
    hours: "Everyday: 10:00 AM - 8:00 PM"
  },
  "demo3": { 
    id: "demo3", name: "Midnight Diner", 
    description: "We serve comfort food anytime you need it. 24/7 service all year round.", 
    contact: "(084) 555-0000",
    address: "Downtown Tagum",
    hours: "Open 24/7"
  }
};

export default function StorePage() {
  const { storeId } = useParams();
  const [store, setStore] = useState<StoreContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStore() {
      if (!storeId) return;
      try {
        const docRef = doc(db, "stores", storeId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setStore({ id: docSnap.id, ...docSnap.data() } as StoreContent);
        } else if (DEMO_STORES[storeId]) {
          setStore(DEMO_STORES[storeId]);
        } else {
          setStore(null);
        }
      } catch (error) {
        console.error("Error fetching store:", error);
        if (DEMO_STORES[storeId]) {
          setStore(DEMO_STORES[storeId]);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchStore();
  }, [storeId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] dark:bg-gray-950 flex justify-center items-center transition-colors">
        <div className="animate-pulse flex items-center text-gray-400 dark:text-gray-600">Loading store details...</div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-[#fafafa] dark:bg-gray-950 flex flex-col justify-center items-center transition-colors">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Store Not Found</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">The store you are looking for does not exist or has been removed.</p>
        <Link to="/" className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium">Return to Home</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-gray-950 selection:bg-orange-100 selection:text-orange-900 pb-20 transition-colors">
      <nav className="bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10 transition-colors">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="font-semibold text-gray-900 dark:text-white">Store Details</div>
          <button className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 pt-10">
        {/* Header section */}
        <div className="mb-10 text-center">
          <div className="w-24 h-24 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full mx-auto mb-6 flex items-center justify-center transition-colors">
            <Star className="w-10 h-10 text-gray-300 dark:text-gray-700" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white mb-4 transition-colors">{store.name}</h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto transition-colors">{store.description || "A participating partner in our digital rewards program."}</p>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 sm:grid-cols-2 mb-10">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-start gap-4 transition-colors">
            <div className="bg-orange-50 dark:bg-orange-950/30 p-3 rounded-2xl text-orange-600 dark:text-orange-400 shrink-0 transition-colors">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1 transition-colors">Location</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm transition-colors">{store.address || "Tagum City, Philippines"}</p>
              <button onClick={() => alert("Opening Maps...")} className="text-orange-600 dark:text-orange-400 text-sm font-medium mt-2 inline-block hover:underline transition-colors">Get Directions</button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-start gap-4 transition-colors">
            <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-2xl text-blue-600 dark:text-blue-400 shrink-0 transition-colors">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1 transition-colors">Hours</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm transition-colors">{store.hours || "Store hours vary. Contact for details."}</p>
            </div>
          </div>
        </div>

        {/* Contact Links */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden transition-colors">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 transition-colors">
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg transition-colors">Contact Information</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800 transition-colors">
            {store.contact && (
              <a href={`tel:${store.contact}`} className="flex items-center gap-4 p-6 hover:bg-gray-50 dark:hover:bg-gray-950/50 transition-colors">
                <Phone className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300 font-medium transition-colors">{store.contact}</span>
              </a>
            )}
            {store.website && (
              <a href={store.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-6 hover:bg-gray-50 dark:hover:bg-gray-950/50 transition-colors">
                <Globe className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300 font-medium truncate transition-colors">{store.website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
            {!store.contact && !store.website && (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm transition-colors">No contact information provided.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
