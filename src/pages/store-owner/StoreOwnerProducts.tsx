import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Plus, Edit2, Trash2, X, Image as ImageIcon, Upload } from "lucide-react";
import { deleteImageFromDriveSecure, getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import { PageSkeleton } from "../../components/LoadingSkeleton";

export default function StoreOwnerProducts({ store }: { store: any }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    imageUrl: "",
    ingredients: "",
    available: true
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!store?.id) return;
    const fetchProducts = async () => {
      try {
        const q = query(collection(db, "products"), where("storeId", "==", store.id));
        const snap = await getDocs(q);
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Failed to fetch products", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [store]);

  const handleOpenModal = (product: any = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name || "",
        price: product.price?.toString() || "",
        imageUrl: product.imageUrl || "",
        ingredients: product.ingredients || "",
        available: product.available ?? true
      });
    } else {
      setEditingProduct(null);
      setFormData({ name: "", price: "", imageUrl: "", ingredients: "", available: true });
    }
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imageUrl = await uploadImageFileToDriveSecure(file, {
        owner: store?.name || store?.id,
        purpose: "product-image",
      });
      setFormData(prev => ({ ...prev, imageUrl }));
    } catch (err) {
      console.error("Product image upload failed", err);
      alert("Failed to upload product image");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const productData = {
        storeId: store.id,
        name: formData.name,
        price: parseFloat(formData.price),
        imageUrl: formData.imageUrl,
        ingredients: formData.ingredients,
        available: formData.available,
        updatedAt: serverTimestamp(),
      };

      if (editingProduct) {
        await updateDoc(doc(db, "products", editingProduct.id), productData);
        if (editingProduct.imageUrl && editingProduct.imageUrl !== productData.imageUrl) {
          await deleteImageFromDriveSecure(editingProduct.imageUrl).catch(console.error);
        }
        setProducts(products.map(p => p.id === editingProduct.id ? { ...p, ...productData } : p));
      } else {
        const docRef = await addDoc(collection(db, "products"), { ...productData, createdAt: serverTimestamp() });
        setProducts([...products, { id: docRef.id, ...productData }]);
      }
      setIsModalOpen(false);
    } catch (error) {
      alert("Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
      const product = products.find((item) => item.id === id);
      await deleteDoc(doc(db, "products", id));
      if (product?.imageUrl) await deleteImageFromDriveSecure(product.imageUrl).catch(console.error);
      setProducts(products.filter(p => p.id !== id));
    } catch (error) {
      alert("Failed to delete product");
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Catalog</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Manage your products, prices, and availability.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-4 py-2 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-[#1b1b1b] rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
            <ImageIcon className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
            <p className="font-medium text-gray-900 dark:text-white">No products yet</p>
            <p className="text-sm text-gray-500 mt-1">Add your first product to build your catalog.</p>
          </div>
        ) : (
          products.map(product => (
            <div key={product.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden group flex flex-col h-full shadow-sm hover:shadow-md transition-shadow">
              <div className="h-48 bg-gray-100 dark:bg-gray-800 relative shrink-0">
                {product.imageUrl ? (
                  <img src={getDisplayImageUrl(product.imageUrl)} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                  </div>
                )}
                {!product.available && (
                   <div className="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center">
                     <span className="bg-gray-900 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">Unavailable</span>
                   </div>
                )}
              </div>
              <div className="p-4 flex flex-col flex-1">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <h3 className="font-bold text-gray-900 dark:text-white line-clamp-1">{product.name}</h3>
                  <span className="font-black text-gray-900 dark:text-white shrink-0 text-[#1b1b1b] dark:text-white">₱{parseFloat(product.price).toFixed(2)}</span>
                </div>
                {product.ingredients && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 flex-1">{product.ingredients}</p>
                )}
                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
                   <button onClick={() => handleOpenModal(product)} className="p-2 text-gray-500 hover:text-[#1b1b1b] hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors">
                     <Edit2 className="w-4 h-4" />
                   </button>
                   <button onClick={() => handleDelete(product.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                     <Trash2 className="w-4 h-4" />
                   </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md my-auto rounded-[2rem] shadow-xl relative border border-gray-100 dark:border-gray-800 overflow-hidden shrink-0">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="text-xl font-bold">{editingProduct ? 'Edit Product' : 'Add Product'}</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-5">
              
              <div className="flex justify-center mb-6">
                <div className="relative w-32 h-32 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 overflow-hidden group">
                  {formData.imageUrl ? (
                    <img src={getDisplayImageUrl(formData.imageUrl)} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                      <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                      <span className="text-xs font-semibold">Upload Photo</span>
                    </div>
                  )}
                  <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                    <Upload className="w-6 h-6 text-white" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none" />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Price (PHP)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₱</span>
                  <input required type="number" step="0.01" min="0" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full pl-8 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none" placeholder="0.00" />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Ingredients/Details (optional)</label>
                <textarea rows={2} value={formData.ingredients} onChange={e => setFormData({...formData, ingredients: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none resize-none" />
              </div>
              
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="available" checked={formData.available} onChange={e => setFormData({...formData, available: e.target.checked})} className="w-4 h-4 rounded border-gray-300 text-[#1b1b1b] focus:ring-[#1b1b1b]" />
                <label htmlFor="available" className="text-sm font-medium text-gray-700 dark:text-gray-300">Product is available for sale</label>
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-800 mt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-6 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
