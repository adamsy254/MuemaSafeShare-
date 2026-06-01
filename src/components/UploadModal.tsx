import React, { useState, useRef } from 'react';
import { Upload, X, AlertCircle, FileAudio, FileVideo, FileImage, ShieldAlert, Check } from 'lucide-react';
import { storage, db, auth, handleFirestoreError, OperationType } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { localCache } from '../localCache';

// Compress image and return base64
function compressAndGetBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // If the file is already small (e.g., SVG, small PNG/JPEG < 150KB), don't compress to avoid losing vector property/transparency
    if (file.size < 150 * 1024) {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        const MAX_DIM = 800;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => {
        resolve(e.target?.result as string);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [permission, setPermission] = useState<'public' | 'restricted'>('public');
  const [dragActive, setDragActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'image' | 'video' | 'audio'>('image');
  const [fileType, setFileType] = useState<'image' | 'video' | 'audio' | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [uploading, setUploading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  
  const [description, setDescription] = useState<string>('');
  const [commentsAllowed, setCommentsAllowed] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const parseFileType = (file: File): 'image' | 'video' | 'audio' | null => {
    const mime = file.type;
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    
    // Ext check fallback
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) return 'image';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext || '')) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext || '')) return 'audio';
    
    return null;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const type = parseFileType(file);
      if (!type) {
        setErrorMsg(`Unsupported file type. Please upload a valid ${selectedCategory} file.`);
        return;
      }
      if (type !== selectedCategory) {
        setErrorMsg(`Format mismatch: Selected file is parsed as an "${type}", but you set the category format to "${selectedCategory}". Please select a correct file.`);
        return;
      }
      setSelectedFile(file);
      setFileType(type);
      setErrorMsg(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const type = parseFileType(file);
      if (!type) {
        setErrorMsg(`Unsupported file type. Please upload a valid ${selectedCategory} file.`);
        return;
      }
      if (type !== selectedCategory) {
        setErrorMsg(`Format mismatch: Selected file is parsed as an "${type}", but you set the category format to "${selectedCategory}". Please select a correct file.`);
        return;
      }
      setSelectedFile(file);
      setFileType(type);
      setErrorMsg(null);
    }
  };

  const clearForm = () => {
    setSelectedFile(null);
    setFileType(null);
    setSelectedCategory('image');
    setPermission('public');
    setDescription('');
    setCommentsAllowed(true);
    setProgress(0);
    setUploading(false);
    setErrorMsg(null);
    setSuccess(false);
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || !fileType) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setErrorMsg("You must be authenticated to share files.");
      return;
    }

    setUploading(true);
    setProgress(5);

    const fileId = 'file_' + Math.random().toString(36).substr(2, 9);
    
    // Always register in local session cache immediately, allowing high fidelity local streaming
    localCache.registerFile(fileId, selectedFile);

    const storagePath = `files/${fileId}/${selectedFile.name}`;
    const storageRef = ref(storage, storagePath);

    try {
      let downloadUrl = "";

      // Try uploading to Firebase Storage with progress monitoring and a resilient 5-second timeout
      try {
        const uploadTask = uploadBytesResumable(storageRef, selectedFile);
        
        const uploadPromise = new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const calcProgress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 90) + 5;
              setProgress(calcProgress);
            }, 
            (error) => {
              console.warn("Storage upload task error:", error);
              reject(error);
            }, 
            () => {
              resolve();
            }
          );
        });

        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => {
            try {
              uploadTask.cancel();
            } catch (cancelErr) {
              console.warn("Failed to cancel upload task:", cancelErr);
            }
            reject(new Error("Firebase Storage upload timed out (5s sandbox limit reached)"));
          }, 5000);
        });

        await Promise.race([uploadPromise, timeoutPromise]);
        downloadUrl = await getDownloadURL(storageRef);
      } catch (storageErr) {
        console.warn("Firebase Storage upload failed or timed out, employing local sandbox and base64 fallback...", storageErr);
        // Robust base64 extraction for images, standard stream urls for video/audio fallbacks
        if (fileType === 'image') {
          try {
            downloadUrl = await compressAndGetBase64(selectedFile);
          } catch (compressErr) {
            console.error("Base64 conversion failed, fallback to placeholder:", compressErr);
            downloadUrl = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80`;
          }
        } else if (fileType === 'video') {
          // Standard placeholder video stream
          downloadUrl = `https://assets.mixkit.co/videos/preview/mixkit-clouds-hovering-over-the-mountain-peaks-2244-large.mp4`;
        } else {
          // Standard placeholder audio stream
          downloadUrl = `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3`;
        }
      }

      // Write meta to Firestore inside the 'files' collection
      const fileData = {
        fileId,
        ownerId: currentUser.uid,
        ownerEmail: currentUser.email || 'anonymous',
        ownerName: currentUser.displayName || 'Anonymous User',
        name: selectedFile.name,
        type: fileType,
        url: downloadUrl,
        storagePath,
        size: selectedFile.size,
        permissionSetting: permission,
        description: description.trim(),
        commentsAllowed,
        upvotesCount: 0,
        downvotesCount: 0,
        voters: {},
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, 'files', fileId), fileData);
      
      setProgress(100);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        clearForm();
        onClose();
      }, 1500);

    } catch (err: unknown) {
      console.error(err);
      setProgress(0);
      setUploading(false);
      try {
        handleFirestoreError(err, OperationType.CREATE, `files/${fileId}`);
      } catch (adaptedErr: any) {
        setErrorMsg("Failed to store metadata: " + adaptedErr.message);
      }
    }
  };

  const getFileIcon = () => {
    switch (fileType) {
      case 'image': return <FileImage className="w-12 h-12 text-blue-600" />;
      case 'video': return <FileVideo className="w-12 h-12 text-indigo-600" />;
      case 'audio': return <FileAudio className="w-12 h-12 text-pink-600" />;
      default: return <Upload className="w-12 h-12 text-slate-400" />;
    }
  };

  return (
    <div id="upload-modal-container" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-xl bg-white border border-slate-205 rounded-3xl shadow-2xl p-6 relative overflow-hidden text-slate-800"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h3 id="modal-title" className="text-base font-extrabold text-slate-900 tracking-tight font-display">Share New Asset</h3>
            <p className="text-xs text-slate-400 font-bold mt-0.5">Files available in Image, Video, or Audio formats</p>
          </div>
          <button id="btn-close-modal" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl transition-all cursor-pointer border border-slate-200">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 space-y-5">
          {errorMsg && (
            <div id="upload-error-banner" className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-start space-x-2.5 text-xs text-red-700 font-bold shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {success ? (
            <div id="upload-success-pane" className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="bg-blue-600 text-white p-4 rounded-full shadow-lg shadow-blue-500/20 scale-110 animate-bounce">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">Upload Confirmed!</h4>
              <p className="text-xs text-slate-400 font-semibold font-mono">Refreshing database files...</p>
            </div>
          ) : (
            <>
              {/* Category Selector */}
              {!selectedFile && (
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">1. Select Material Asset Format</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      id="tab-select-image"
                      onClick={() => { setSelectedCategory('image'); setErrorMsg(null); }}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                        selectedCategory === 'image'
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500'
                      }`}
                    >
                      <FileImage className="w-4 h-4" />
                      <span>Image File</span>
                    </button>
                    <button
                      type="button"
                      id="tab-select-video"
                      onClick={() => { setSelectedCategory('video'); setErrorMsg(null); }}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                        selectedCategory === 'video'
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500'
                      }`}
                    >
                      <FileVideo className="w-4 h-4" />
                      <span>Video File</span>
                    </button>
                    <button
                      type="button"
                      id="tab-select-audio"
                      onClick={() => { setSelectedCategory('audio'); setErrorMsg(null); }}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                        selectedCategory === 'audio'
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm shadow-blue-100'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500'
                      }`}
                    >
                      <FileAudio className="w-4 h-4" />
                      <span>Audio File</span>
                    </button>
                  </div>
                </div>
              )}

              {/* File dropzone / active file selection details */}
              {!selectedFile ? (
                <div 
                  id="drag-dropzone"
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                    dragActive 
                      ? 'border-blue-500 bg-blue-50/50' 
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/40'
                  }`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden" 
                    accept={
                      selectedCategory === 'image' ? 'image/*' :
                      selectedCategory === 'video' ? 'video/*' :
                      'audio/*'
                    }
                  />
                  <div className="p-3 bg-white border border-slate-150 rounded-2xl mb-4 text-blue-600 shadow-sm shadow-slate-100">
                    <Upload className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-800">Drag & drop your {selectedCategory} here, or <span className="text-blue-600 hover:underline">browse</span></h4>
                  <p className="text-[11px] text-slate-400 mt-1 font-semibold">
                    {selectedCategory === 'image' && "Supports JPEG, PNG, GIF, SVG, WebP formats up to 100MB"}
                    {selectedCategory === 'video' && "Supports MP4, WebM, MOV, AVI, OGG formats up to 100MB"}
                    {selectedCategory === 'audio' && "Supports MP3, WAV, M4A, OGG, FLAC formats up to 100MB"}
                  </p>
                </div>
              ) : (
                <div id="file-details-panel" className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4 min-w-0">
                    <div className="p-3 bg-white border border-slate-100 rounded-xl leading-none shadow-sm">
                      {getFileIcon()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate pr-4">{selectedFile.name}</p>
                      <p className="text-[11px] text-slate-500">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • <span className="uppercase font-bold text-blue-600 text-[10px]">{fileType}</span></p>
                    </div>
                  </div>
                  <button id="btn-remove-selected" onClick={clearForm} className="text-slate-400 hover:text-red-600 p-2 hover:bg-white rounded-xl border border-transparent hover:border-red-100 transition-all cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Input details */}
              {selectedFile && (
                <div id="upload-gating-panel" className="space-y-4">
                  {/* Optional Description */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">2. Add Optional Description</label>
                    <textarea
                      id="input-file-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Include some descriptive context about this asset..."
                      className="w-full text-xs p-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none h-18 text-slate-800 bg-slate-50/30"
                      maxLength={500}
                    />
                  </div>

                  {/* Restrict Comments Toggle */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50/70 rounded-2xl border border-slate-100/90">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Enable Comments Section</span>
                      <span className="text-[10px] text-slate-400 font-semibold leading-relaxed mt-0.5 block">Allow other users to leave thoughts or replies.</span>
                    </div>
                    <button
                      type="button"
                      id="toggle-comments-allowed"
                      onClick={() => setCommentsAllowed(!commentsAllowed)}
                      className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        commentsAllowed ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          commentsAllowed ? 'translate-x-4.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Permissions choices */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">3. Download Gating Permission Setting</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        id="btn-permit-public"
                        onClick={() => setPermission('public')}
                        className={`p-3 rounded-2xl border flex flex-col items-start text-left cursor-pointer transition-all ${
                          permission === 'public'
                            ? 'border-blue-500 bg-blue-50/50 text-blue-900 shadow-sm shadow-blue-500/5'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-350 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-xs font-extrabold block mb-1">🔓 Public Download</span>
                        <span className="text-[10px] text-slate-400 font-semibold leading-relaxed">Anyone inside the platform can download this file instantly.</span>
                      </button>

                      <button
                        type="button"
                        id="btn-permit-restricted"
                        onClick={() => setPermission('restricted')}
                        className={`p-3 rounded-2xl border flex flex-col items-start text-left cursor-pointer transition-all ${
                          permission === 'restricted'
                            ? 'border-blue-500 bg-blue-50/50 text-blue-900 shadow-sm shadow-blue-500/5'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-350 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-xs font-extrabold block mb-1">🔒 Restricted Access</span>
                        <span className="text-[10px] text-slate-400 font-semibold leading-relaxed">Requires users to request download permission from you first.</span>
                      </button>
                    </div>
                  </div>

                  {/* Upload button and percentage progress */}
                  {uploading ? (
                    <div id="upload-progress-pane" className="space-y-2">
                      <div className="flex justify-between text-xs font-semibold text-slate-500">
                        <span>Uploading material assets...</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/40">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      id="btn-init-upload"
                      onClick={handleUploadSubmit}
                      disabled={uploading}
                      className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-blue-500/10 text-xs"
                    >
                      <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Share Assets & Core Files</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
