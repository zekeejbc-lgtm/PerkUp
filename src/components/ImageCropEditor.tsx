import React, { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";

type ImageCropEditorProps = {
  file: File;
  onCancel: () => void;
  onApply: (file: File, previewUrl: string) => void;
};

const OUTPUT_SIZE = 800;

export function ImageCropEditor({ file, onCancel, onApply }: ImageCropEditorProps) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [saving, setSaving] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{ x: number; y: number; distance: number | null }>({
    x: 0,
    y: 0,
    distance: null,
  });

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const pointerDistance = (points: { x: number; y: number }[]) =>
    Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

  const pointerCenter = (points: { x: number; y: number }[]) => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  });

  const beginGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const center = pointerCenter(points);
    gestureRef.current = {
      ...center,
      distance: points.length >= 2 ? pointerDistance(points.slice(0, 2)) : null,
    };
  };

  const moveGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const center = pointerCenter(points);
    const previous = gestureRef.current;
    const viewportSize = event.currentTarget.clientWidth || 1;

    // Moving the image right/down moves the crop source left/up.
    setOffsetX((value) => clamp(value - ((center.x - previous.x) / viewportSize) * 200, -100, 100));
    setOffsetY((value) => clamp(value - ((center.y - previous.y) / viewportSize) * 200, -100, 100));

    let distance: number | null = null;
    if (points.length >= 2) {
      distance = pointerDistance(points.slice(0, 2));
      if (previous.distance && previous.distance > 0) {
        setZoom((value) => clamp(value * (distance! / previous.distance!), 1, 3));
      }
    }
    gestureRef.current = { ...center, distance };
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    const points = [...pointersRef.current.values()];
    if (points.length === 0) {
      gestureRef.current = { x: 0, y: 0, distance: null };
      return;
    }
    const center = pointerCenter(points);
    gestureRef.current = {
      ...center,
      distance: points.length >= 2 ? pointerDistance(points.slice(0, 2)) : null,
    };
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((value) => clamp(value - event.deltaY * 0.002, 1, 3));
  };

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const createCrop = async () => {
    const image = imageRef.current;
    if (!image) return;
    setSaving(true);

    const cropSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
    const maxX = Math.max(0, (image.naturalWidth - cropSize) / 2);
    const maxY = Math.max(0, (image.naturalHeight - cropSize) / 2);
    const sourceX = (image.naturalWidth - cropSize) / 2 + (offsetX / 100) * maxX;
    const sourceY = (image.naturalHeight - cropSize) / 2 + (offsetY / 100) * maxY;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    canvas.getContext("2d")?.drawImage(
      image,
      sourceX,
      sourceY,
      cropSize,
      cropSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );

    canvas.toBlob((blob) => {
      if (!blob) {
        setSaving(false);
        return;
      }
      const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
      const croppedFile = new File([blob], `${baseName}-cropped.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
      onApply(croppedFile, URL.createObjectURL(blob));
      setSaving(false);
    }, "image/jpeg", 0.9);
  };

  const imageStyle: React.CSSProperties = {
    width: `${zoom * 100}%`,
    height: `${zoom * 100}%`,
    objectFit: "cover",
    transform: `translate(${-offsetX * (zoom - 1) / zoom}%, ${-offsetY * (zoom - 1) / zoom}%)`,
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-black/70 p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Edit image">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:max-h-[calc(100dvh-3rem)]">
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 p-5 dark:border-gray-800">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Edit image</h3>
            <p className="text-xs text-gray-500">Drag to reposition. Pinch or scroll to zoom.</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close image editor">
            <X className="h-5 w-5" />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
        <div
            className="mx-auto aspect-square w-full max-w-[300px] cursor-grab touch-none overflow-hidden rounded-2xl bg-gray-950 active:cursor-grabbing sm:max-w-[340px]"
          onPointerDown={beginGesture}
          onPointerMove={moveGesture}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onWheel={handleWheel}
        >
          {sourceUrl && <img ref={imageRef} src={sourceUrl} alt="Crop preview" className="pointer-events-none h-full w-full select-none" style={imageStyle} draggable={false} />}
        </div>

        <div className="mt-5">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="mb-2 flex items-center justify-between"><span>Zoom</span><span>{zoom.toFixed(1)}×</span></span>
            <span className="flex items-center gap-3">
              <Minus className="h-4 w-4" />
              <input className="w-full accent-[#1b1b1b]" type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
              <Plus className="h-4 w-4" />
            </span>
          </label>
        </div>
        </main>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-gray-200 p-5 dark:border-gray-800">
          <button type="button" onClick={onCancel} className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">Cancel</button>
          <button type="button" onClick={createCrop} disabled={saving} className="flex items-center gap-2 rounded-xl bg-[#1b1b1b] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            <Check className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
