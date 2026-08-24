import React, { useState, useRef } from 'react';
import {
  Upload,
  Plus,
  Trash2,
  RefreshCw,
  Star,
  Image as ImageIcon,
  AlertCircle,
  Camera,
  Check,
  MoveLeft,
  MoveRight,
} from 'lucide-react';
import { ProductImage } from '../../types';
import {
  MAX_PRODUCT_IMAGES,
  validateImageFile,
  processAndCompressImage,
  normalizeProductImages,
} from '../../utils/imageUtils';

interface ProductImageUploadProps {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  productId?: string;
  disabled?: boolean;
}

export const ProductImageUpload: React.FC<ProductImageUploadProps> = ({
  images,
  onChange,
  productId,
  disabled = false,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  const count = images.length;
  const canAddMore = count < MAX_PRODUCT_IMAGES;

  const handleTriggerUpload = () => {
    setErrorMessage(null);
    if (!canAddMore) {
      setErrorMessage('Maximum of 3 images allowed for each product.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleTriggerReplace = (index: number) => {
    setErrorMessage(null);
    setReplaceIndex(index);
    replaceFileInputRef.current?.click();
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorMessage(null);

    // Calculate how many we can take
    const availableSlots = MAX_PRODUCT_IMAGES - images.length;
    if (files.length > availableSlots) {
      setErrorMessage('Maximum of 3 images allowed for each product.');
    }

    const filesToProcess: File[] = (Array.from(files) as File[]).slice(0, availableSlots);
    if (filesToProcess.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsProcessing(true);

    try {
      const processedList: ProductImage[] = [];

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        const validation = validateImageFile(file);
        if (!validation.valid) {
          throw new Error(validation.error || 'Invalid image file.');
        }

        const newOrder = images.length + processedList.length;
        const processed = await processAndCompressImage(file, productId, newOrder);
        processedList.push(processed);
      }

      const updated = normalizeProductImages([...images, ...processedList]);
      onChange(updated);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process image.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || replaceIndex === null) return;

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const validation = validateImageFile(file);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid image file.');
      }

      const processed = await processAndCompressImage(file, productId, replaceIndex);
      // Increment version number on replacement
      const oldImg = images[replaceIndex];
      processed.version = (oldImg?.version || 1) + 1;
      processed.syncStatus = 'MODIFIED_LOCALLY';

      const updated = [...images];
      updated[replaceIndex] = processed;
      onChange(normalizeProductImages(updated));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to replace image.');
    } finally {
      setIsProcessing(false);
      setReplaceIndex(null);
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setErrorMessage(null);
    const updated = images.filter((_, idx) => idx !== indexToRemove);
    // Normalize will re-assign order: 0, 1... promoting next image to main automatically
    onChange(normalizeProductImages(updated));
  };

  const handleSetAsMain = (indexToPromote: number) => {
    if (indexToPromote === 0 || indexToPromote >= images.length) return;
    const target = images[indexToPromote];
    const rest = images.filter((_, idx) => idx !== indexToPromote);
    const reordered = [target, ...rest];
    onChange(normalizeProductImages(reordered));
  };

  const handleMove = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= images.length) return;
    const item = images[fromIndex];
    const updated = [...images];
    updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, item);
    onChange(normalizeProductImages(updated));
  };

  return (
    <div id="product-images-section" className="space-y-2.5">
      {/* Header Label */}
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-slate-300 font-semibold text-xs flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>Product Images (Optional)</span>
          </label>
          <p className="text-[11px] text-slate-400 mt-0.5">
            You can add up to 3 images. Image 1 is automatically the Main Thumbnail.
          </p>
        </div>

        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-[10px] font-mono text-slate-300">
          {count} / {MAX_PRODUCT_IMAGES} images
        </span>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleFilesSelected}
        disabled={disabled || isProcessing}
      />
      <input
        ref={replaceFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleReplaceFile}
        disabled={disabled || isProcessing}
      />

      {/* Uploaded Images Grid (up to 3 slots) */}
      <div className="grid grid-cols-3 gap-3">
        {/* Render existing images */}
        {images.map((img, index) => {
          const isMain = index === 0;
          return (
            <div
              key={img.imageId || index}
              className={`relative bg-slate-950 border rounded-xl overflow-hidden flex flex-col group transition-all ${
                isMain ? 'border-blue-500/80 shadow-md ring-1 ring-blue-500/30' : 'border-slate-800'
              }`}
            >
              {/* Image Preview Container */}
              <div className="relative h-28 w-full bg-slate-900 overflow-hidden flex items-center justify-center">
                <img
                  src={img.thumbnailUrl || img.dataUrl}
                  alt={`Product Image ${index + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />

                {/* Badge for Main Image */}
                <div className="absolute top-1.5 left-1.5">
                  {isMain ? (
                    <span className="px-1.5 py-0.5 rounded-md bg-blue-600/90 text-white text-[9px] font-bold tracking-wider flex items-center gap-1 shadow">
                      <Star className="w-2.5 h-2.5 fill-current" />
                      <span>MAIN</span>
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-sm text-slate-300 text-[9px] font-mono border border-slate-700/60">
                      #{index + 1}
                    </span>
                  )}
                </div>

                {/* Quick actions overlay */}
                <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 transition-opacity p-2">
                  <button
                    type="button"
                    onClick={() => handleTriggerReplace(index)}
                    disabled={disabled || isProcessing}
                    title="Replace this image"
                    className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-blue-600 text-white text-xs transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(index)}
                    disabled={disabled || isProcessing}
                    title="Remove this image"
                    className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-rose-600 text-white text-xs transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Bottom Card Controls */}
              <div className="p-1.5 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-[10px]">
                {!isMain ? (
                  <button
                    type="button"
                    onClick={() => handleSetAsMain(index)}
                    className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-0.5 hover:underline"
                  >
                    <Star className="w-2.5 h-2.5" />
                    <span>Set Main</span>
                  </button>
                ) : (
                  <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                    <Check className="w-2.5 h-2.5" />
                    <span>Main Image</span>
                  </span>
                )}

                <div className="flex items-center gap-0.5">
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => handleMove(index, index - 1)}
                      title="Move Left"
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      <MoveLeft className="w-3 h-3" />
                    </button>
                  )}
                  {index < images.length - 1 && (
                    <button
                      type="button"
                      onClick={() => handleMove(index, index + 1)}
                      title="Move Right"
                      className="p-1 text-slate-400 hover:text-white"
                    >
                      <MoveRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Image Slot (if less than 3) */}
        {canAddMore && (
          <button
            type="button"
            onClick={handleTriggerUpload}
            disabled={disabled || isProcessing}
            className="h-36 rounded-xl border-2 border-dashed border-slate-700/80 hover:border-blue-500/60 bg-slate-950/40 hover:bg-slate-900/60 flex flex-col items-center justify-center gap-1.5 p-3 text-slate-400 hover:text-blue-300 transition-all cursor-pointer group"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
                <span className="text-[11px] font-medium text-slate-300">Compressing...</span>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-slate-800 group-hover:bg-blue-600/20 text-slate-300 group-hover:text-blue-400 flex items-center justify-center transition">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-slate-300 group-hover:text-white">
                  + Add Image
                </span>
                <span className="text-[10px] text-slate-500">
                  {images.length === 0 ? 'Image 1 (Main)' : `Image ${images.length + 1}`}
                </span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
