import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Plus, Edit2, Trash2, X, Image as ImageIcon, Upload, Loader2 } from "lucide-react";
import { deleteImageFromDriveSecure, getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { ImageCropEditor } from "../../components/ImageCropEditor";
import { Pagination } from "../../components/Pagination";

const PRODUCTS_PER_PAGE = 9;

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
  const [availabilitySavingIds, setAvailabilitySavingIds] = useState<Set<string>>(new Set());
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imageEditorFile, setImageEditorFile] = useState<File | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(products.length / PRODUCTS_PER_PAGE));
  const paginatedProducts = products.slice((currentPage - 1) * PRODUCTS_PER_PAGE, currentPage * PRODUCTS_PER_PAGE);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

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
    setPendingImageFile(null);
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setImageEditorFile(file);
    e.target.value = "";
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const imageUrl = pendingImageFile
        ? await uploadImageFileToDriveSecure(pendingImageFile, {
            owner: store?.name || store?.id,
            purpose: "product-image",
          })
        : formData.imageUrl;
      const productData = {
        storeId: store.id,
        name: formData.name,
        price: parseFloat(formData.price),
        imageUrl,
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
      setPendingImageFile(null);
    } catch (error) {
      alert("Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!productToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "products", productToDelete.id));
      if (productToDelete.imageUrl) await deleteImageFromDriveSecure(productToDelete.imageUrl).catch(console.error);
      setProducts((current) => current.filter((product) => product.id !== productToDelete.id));
      setProductToDelete(null);
    } catch (error) {
      alert("Failed to delete product");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAvailabilityToggle = async (product: any) => {
    const nextAvailable = !(product.available ?? true);

    setAvailabilitySavingIds((current) => new Set(current).add(product.id));
    setProducts((current) =>
      current.map((item) => item.id === product.id ? { ...item, available: nextAvailable } : item)
    );

    try {
      await updateDoc(doc(db, "products", product.id), {
        available: nextAvailable,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to update product availability", error);
      setProducts((current) =>
        current.map((item) => item.id === product.id ? { ...item, available: !nextAvailable } : item)
      );
      alert("Failed to update product availability. Please try again.");
    } finally {
      setAvailabilitySavingIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  };

  if (loading) return <PageSkeleton variant="products" />;

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
          paginatedProducts.map(product => (
            <div key={product.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden group flex flex-col h-full shadow-sm hover:shadow-md transition-shadow">
              <div className="h-48 bg-gray-100 dark:bg-gray-800 relative shrink-0">
                {product.imageUrl ? (
                  <img src={getDisplayImageUrl(product.imageUrl)} alt={product.name} loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                  </div>
                )}
                {product.available === false && (
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
                <div className="mt-4 flex shrink-0 items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                  <div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={product.available ?? true}
                      aria-label={`Mark ${product.name} as ${(product.available ?? true) ? "unavailable" : "available"}`}
                      disabled={availabilitySavingIds.has(product.id)}
                      onClick={() => handleAvailabilityToggle(product)}
                      className={`group/switch flex min-h-9 items-center gap-2.5 rounded-full border py-1.5 pl-2 pr-3 text-xs font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0 dark:focus-visible:ring-white ${
                        (product.available ?? true)
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950/80"
                          : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      <span className={`relative h-5 w-9 shrink-0 rounded-full shadow-inner transition-colors ${
                        (product.available ?? true) ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                      }`}>
                        <span
                          className={`absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow transition-transform duration-200 ${
                            (product.available ?? true) ? "translate-x-4" : "translate-x-0"
                          }`}
                        >
                          {availabilitySavingIds.has(product.id) && (
                            <Loader2 className="h-2.5 w-2.5 animate-spin text-gray-500" />
                          )}
                        </span>
                      </span>
                      <span className="min-w-[4.6rem] text-left">
                        {availabilitySavingIds.has(product.id)
                          ? "Updating..."
                          : (product.available ?? true) ? "Available" : "Unavailable"}
                      </span>
                      <span className="sr-only">
                        {`Click to mark as ${(product.available ?? true) ? "unavailable" : "available"}`}
                      </span>
                    </button>
                  </div>
                  <div className="flex gap-2">
                   <button type="button" aria-label={`Edit ${product.name}`} onClick={() => handleOpenModal(product)} className="p-2 text-gray-500 hover:text-[#1b1b1b] hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors">
                     <Edit2 className="w-4 h-4" />
                   </button>
                   <button type="button" aria-label={`Delete ${product.name}`} onClick={() => setProductToDelete(product)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                     <Trash2 className="w-4 h-4" />
                   </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <Pagination
        page={currentPage}
        pageSize={PRODUCTS_PER_PAGE}
        totalItems={products.length}
        itemLabel="products"
        onPageChange={setCurrentPage}
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm dark:bg-black/60 sm:p-6">
          <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900 sm:max-h-[calc(100dvh-3rem)]">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 p-6 dark:border-gray-800">
              <h3 className="text-xl font-bold">{editingProduct ? 'Edit Product' : 'Add Product'}</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 space-y-5">
              
              <div className="mb-6 flex flex-col items-center gap-3">
                <div className="group relative h-32 w-32 overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                  {formData.imageUrl ? (
                    <button
                      type="button"
                      onClick={() => pendingImageFile && setImageEditorFile(pendingImageFile)}
                      disabled={!pendingImageFile}
                      className="h-full w-full disabled:cursor-default"
                      aria-label={pendingImageFile ? "Edit selected product image" : "Product image preview"}
                    >
                      <img src={getDisplayImageUrl(formData.imageUrl)} alt="Preview" className="h-full w-full object-cover" />
                      {pendingImageFile && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          Edit crop
                        </span>
                      )}
                    </button>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                      <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                      <span className="text-xs font-semibold">Upload Photo</span>
                    </div>
                  )}
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                  <Upload className="h-4 w-4" />
                  {formData.imageUrl ? "Choose another image" : "Choose image"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                  Recommended: 800 × 800 px (square)
                </p>
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
      {imageEditorFile && (
        <ImageCropEditor
          file={imageEditorFile}
          onCancel={() => setImageEditorFile(null)}
          onApply={(file, previewUrl) => {
            if (formData.imageUrl.startsWith("blob:")) URL.revokeObjectURL(formData.imageUrl);
            setPendingImageFile(file);
            setFormData((current) => ({ ...current, imageUrl: previewUrl }));
            setImageEditorFile(null);
          }}
        />
      )}
      <ConfirmationModal
        isOpen={Boolean(productToDelete)}
        title="Delete product?"
        description={`“${productToDelete?.name || "This product"}” will be removed from your catalog. This action cannot be undone.`}
        confirmLabel="Delete product"
        isLoading={isDeleting}
        onClose={() => setProductToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
