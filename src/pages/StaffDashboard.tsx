import { useState, useEffect } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useAuth } from "../contexts/AuthContext";
import { collection, query, getDocs, setDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ScanLine, CheckCircle2 } from "lucide-react";

export default function StaffDashboard() {
  const { user } = useAuth();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [scannedId, setScannedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAssignment() {
        setLoading(false);
    }
    loadAssignment();
  }, []);

  const handleScan = async (id: string) => {
    if (!id || id === scannedId) return;
    setScannedId(id);
    console.log("Scanned:", id);
    
    // Simulate processing
    setTimeout(() => setScannedId(null), 3000);
  };

  if (loading) return <div className="animate-pulse text-gray-500 dark:text-gray-400">Loading scanner...</div>;

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="bg-white dark:bg-gray-900 p-6 sm:p-8 rounded-[2rem] border border-gray-200 dark:border-gray-800 shadow-sm transition-colors">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center shrink-0">
             <ScanLine className="w-6 h-6 text-gray-700 dark:text-gray-300" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">Scanner</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Ready to scan customer codes</p>
          </div>
        </div>
        
        <div className="rounded-[2rem] overflow-hidden aspect-square relative bg-black shadow-inner">
           {!scannedId ? (
              <Scanner onScan={(result) => handleScan(result[0].rawValue)} />
           ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-gray-900 z-10 transition-colors">
                <CheckCircle2 className="w-16 h-16 text-green-500 mb-4 animate-bounce" />
                <p className="text-lg font-bold text-gray-900 dark:text-white">Success</p>
                <p className="font-mono text-xs text-gray-400 dark:text-gray-500 tracking-widest mt-2">{scannedId}</p>
              </div>
           )}
        </div>
        
        <div className="mt-6 text-center">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-widest font-mono">
                Hold QR code steady in frame
            </p>
        </div>
      </div>
    </div>
  );
}
