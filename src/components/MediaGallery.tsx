import React, { useState } from 'react';
import { 
  FileImage, 
  FileVideo, 
  FileAudio, 
  Download, 
  Search, 
  Play, 
  Pause, 
  Maximize2, 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  Lock, 
  Unlock,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  MessageSquare,
  ArrowUpRight
} from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, serverTimestamp, updateDoc, increment, collection, query, orderBy, onSnapshot, deleteDoc } from 'firebase/firestore';
import { FileMetadata, DownloadRequest, Comment } from '../types';
import { localCache } from '../localCache';

interface MediaGalleryProps {
  mode: 'image' | 'video' | 'audio';
  files: FileMetadata[];
  requests: DownloadRequest[];
  user: any;
  isAdmin?: boolean;
}

export default function MediaGallery({ mode, files, requests, user, isAdmin = false }: MediaGalleryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'public' | 'restricted'>('all');
  const [selectedFile, setSelectedFile] = useState<FileMetadata | null>(null);
  const [playingVideo, setPlayingVideo] = useState<FileMetadata | null>(null);
  const [playingAudio, setPlayingAudio] = useState<FileMetadata | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Audio HTML DOM reference
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState<Record<string, string>>({});
  const [expandedCommentsFileId, setExpandedCommentsFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'comments'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Comment[] = [];
      snapshot.forEach(doc => {
        list.push({ commentId: doc.id, ...doc.data() } as Comment);
      });
      setComments(list);
    }, (err) => {
      console.error("Comments subscription failed:", err);
    });
    return () => unsubscribe();
  }, [user]);

  const handleVote = async (file: FileMetadata, voteType: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      setErrorMsg("You must be logged in to rate or vote.");
      return;
    }
    const fileId = file.fileId;
    const voters = file.voters || {};
    const existing = voters[user.uid];
    
    let upDelta = 0;
    let downDelta = 0;
    const nextVoters = { ...voters };

    if (existing === voteType) {
      // Remove vote entirely
      if (voteType === 'up') upDelta = -1;
      else downDelta = -1;
      delete nextVoters[user.uid];
    } else {
      // Toggle or clean up previous vote type
      if (existing === 'up') upDelta = -1;
      else if (existing === 'down') downDelta = -1;

      if (voteType === 'up') upDelta += 1;
      else downDelta += 1;
      nextVoters[user.uid] = voteType;
    }

    try {
      setErrorMsg(null);
      await updateDoc(doc(db, 'files', fileId), {
        upvotesCount: increment(upDelta),
        downvotesCount: increment(downDelta),
        voters: nextVoters
      });
    } catch (err: any) {
      console.error("Voting failed:", err);
      try {
        handleFirestoreError(err, OperationType.UPDATE, `files/${fileId}`);
      } catch (adaptedErr: any) {
        setErrorMsg("Failed to store vote: " + adaptedErr.message);
      }
    }
  };

  const handleAddComment = async (fileId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const text = newCommentText[fileId]?.trim() || '';
    if (!text) return;

    try {
      setErrorMsg(null);
      const commentId = 'comment_' + Math.random().toString(36).substr(2, 9);
      const commentRef = doc(db, 'comments', commentId);
      
      await setDoc(commentRef, {
        commentId,
        fileId,
        userId: user.uid,
        userName: user.displayName || 'Authorized Member',
        userEmail: user.email || 'anonymous',
        text,
        createdAt: serverTimestamp()
      });

      setNewCommentText(prev => ({ ...prev, [fileId]: '' }));
    } catch (err: any) {
      console.error("Comment submit error:", err);
      try {
        handleFirestoreError(err, OperationType.CREATE, `comments/${fileId}`);
      } catch (adapted: any) {
        setErrorMsg("Could not post comment: " + adapted.message);
      }
    }
  };

  const handleDeleteComment = async (comment: Comment, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setErrorMsg(null);
      await deleteDoc(doc(db, 'comments', comment.commentId));
      setSuccessMsg("Comment deleted.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Comment delete error:", err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `comments/${comment.commentId}`);
      } catch (adapted: any) {
        setErrorMsg("Failed to remove comment: " + adapted.message);
      }
    }
  };

  const handleToggleCommentsAllowed = async (file: FileMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setErrorMsg(null);
      const nextCommentsAllowed = !file.commentsAllowed;
      await updateDoc(doc(db, 'files', file.fileId), {
        commentsAllowed: nextCommentsAllowed
      });
      setSuccessMsg(nextCommentsAllowed ? "Comments sections unlocked." : "Comments section restricted.");
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Toggle comment restriction failed:", err);
      try {
        handleFirestoreError(err, OperationType.UPDATE, `files/${file.fileId}`);
      } catch (adapted: any) {
        setErrorMsg("Failed to toggle restrictions: " + adapted.message);
      }
    }
  };

  const handleDeleteFile = async (file: FileMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingFileId !== file.fileId) {
      setDeletingFileId(file.fileId);
      return;
    }

    try {
      setErrorMsg(null);
      await deleteDoc(doc(db, 'files', file.fileId));
      setSuccessMsg(`"${file.name}" deleted permanently.`);
      setDeletingFileId(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Delete file failed:", err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `files/${file.fileId}`);
      } catch (adapted: any) {
        setErrorMsg("Failed to delete asset: " + adapted.message);
      }
    }
  };

  const renderCommentsSection = (file: FileMetadata, isDarkTheme = false) => {
    const fileAccess = getFileAccessState(file);
    const fileComments = comments.filter((c) => c.fileId === file.fileId);
    
    // Class names based on dark/light themes
    const textPrimary = isDarkTheme ? "text-slate-100" : "text-slate-800";
    const textSecondary = isDarkTheme ? "text-slate-400" : "text-slate-500";
    const textMuted = isDarkTheme ? "text-slate-500" : "text-slate-400";
    const bgContainer = isDarkTheme ? "bg-slate-950/40 border-slate-800/80" : "bg-white border-slate-100 shadow-sm";
    const borderMuted = isDarkTheme ? "border-slate-800" : "border-slate-150";
    const inputBg = isDarkTheme ? "bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600 focus:ring-blue-550/40 focus:border-blue-500" : "bg-white border-slate-200 text-slate-800 focus:ring-blue-500";

    return (
      <div 
        id={`comments-drawer-${file.fileId}`}
        onClick={(e) => e.stopPropagation()} 
        className={`space-y-3.5 p-4 rounded-2xl ${isDarkTheme ? 'bg-slate-900/40 border border-slate-800/60' : 'bg-slate-50/50 border-t border-slate-100'} text-xs`}
      >
        <div className="flex items-center justify-between">
          <span className={`text-[10px] uppercase tracking-wider font-extrabold ${textMuted}`}>Feedback Thread</span>
          {file.commentsAllowed === false && (
            <span className={`text-[9px] font-bold py-0.5 px-1.5 rounded ${isDarkTheme ? 'text-amber-450 bg-amber-950/40 border border-amber-900/30' : 'text-amber-700 bg-amber-50'}`}>Restricted</span>
          )}
        </div>

        {/* Optional Description */}
        {file.description && (
          <div className={`p-3 rounded-xl border ${bgContainer} italic leading-relaxed text-[11px]`}>
            <span className={`not-italic text-[9.5px] font-extrabold uppercase tracking-wider ${textMuted} block mb-1`}>
              Description
            </span>
            "{file.description}"
          </div>
        )}

        {/* Owner settings - Allow comments toggle */}
        {(fileAccess.isOwner || isAdmin) && (
          <div className={`flex items-center justify-between py-1 text-[10.5px] border-b ${borderMuted}`}>
            <span className={`${textSecondary} font-semibold`}>Allow comments:</span>
            <button
              id={`toggle-comments-btn-${file.fileId}`}
              onClick={(e) => handleToggleCommentsAllowed(file, e)}
              className={`hover:underline cursor-pointer font-bold ${file.commentsAllowed !== false ? 'text-blue-500' : 'text-amber-500'}`}
            >
              {file.commentsAllowed !== false ? '🔓 Enabled' : '🔒 Disabled'}
            </button>
          </div>
        )}

        {/* Comments scrolling thread */}
        <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
          {fileComments.length === 0 ? (
            <p className={`text-[10px] ${textMuted} font-medium py-3 text-center`}>No replies or comments yet.</p>
          ) : (
            fileComments.map((comment) => {
              const canDeleteComment = comment.userId === user?.uid || file.ownerId === user?.uid || isAdmin;
              return (
                <div key={comment.commentId} className={`p-2.5 rounded-xl border relative pr-7 ${bgContainer}`}>
                  <div className="truncate min-w-0">
                    <span className={`font-extrabold ${textPrimary} text-[10px]`}>{comment.userName}</span>
                    <span className={`text-[9px] ${textMuted} font-medium ml-1`}>({comment.userEmail.split('@')[0]})</span>
                  </div>
                  <p className={`text-[11px] mt-0.5 leading-normal ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>{comment.text}</p>
                  {canDeleteComment && (
                    <button
                      id={`delete-comment-btn-${comment.commentId}`}
                      onClick={(e) => handleDeleteComment(comment, e)}
                      className={`absolute top-2 right-1.5 p-1 rounded cursor-pointer transition-colors ${isDarkTheme ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}
                      title="Delete comment"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Form to submit comment */}
        {file.commentsAllowed !== false ? (
          <form onSubmit={(e) => handleAddComment(file.fileId, e)} className="flex gap-2">
            <input
              type="text"
              id={`comment-input-${file.fileId}`}
              value={newCommentText[file.fileId] || ''}
              onChange={(e) => setNewCommentText(prev => ({ ...prev, [file.fileId]: e.target.value }))}
              placeholder="Add response..."
              className={`flex-1 text-[11px] p-2 border rounded-xl focus:outline-none focus:ring-1 ${inputBg}`}
              maxLength={500}
            />
            <button
              type="submit"
              id={`comment-submit-btn-${file.fileId}`}
              disabled={!(newCommentText[file.fileId]?.trim())}
              className="px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold rounded-xl text-[10.5px] cursor-pointer transition-colors shrink-0"
            >
              Send
            </button>
          </form>
        ) : (
          <p className={`text-[10px] p-2 border rounded-xl text-center font-semibold ${isDarkTheme ? 'text-amber-400 bg-amber-955/30 border-amber-900/50' : 'text-amber-600 bg-amber-50 border-amber-100'}`}>
            🔒 Commenting has been restricted on this post.
          </p>
        )}
      </div>
    );
  };

  // Filter files belonging to this mode
  const modeFiles = files.filter(f => f.type === mode);

  // Apply search query and permission filters
  const filteredFiles = modeFiles.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          file.ownerName.toLowerCase().includes(searchQuery.toLowerCase());
    if (filterType === 'all') return matchesSearch;
    return matchesSearch && file.permissionSetting === filterType;
  });

  // Calculate access rights for files
  const getFileAccessState = (file: FileMetadata) => {
    if (file.ownerId === user?.uid) {
      return { label: 'Owned Unit', color: 'text-indigo-700 bg-indigo-50 border-indigo-150', canAccess: true, isOwner: true };
    }
    if (file.permissionSetting === 'public') {
      return { label: 'Public Entry', color: 'text-emerald-700 bg-emerald-55 border-emerald-110', canAccess: true };
    }

    const currentReq = requests.find(r => r.fileId === file.fileId && r.requesterId === user?.uid);
    if (!currentReq) {
      return { label: 'Restricted Access', color: 'text-slate-600 bg-slate-100 border-slate-200', canRequest: true };
    }
    if (currentReq.status === 'pending') {
      return { label: 'Pending Access', color: 'text-amber-700 bg-amber-50 border-amber-200', pending: true };
    }
    if (currentReq.status === 'approved') {
      return { label: 'Approved Access', color: 'text-emerald-700 bg-emerald-50 border-emerald-150', canAccess: true };
    }
    return { label: 'Access Denied', color: 'text-red-700 bg-red-50 border-red-150', denied: true };
  };

  const handleRequestAccess = async (file: FileMetadata, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering card click
    if (!user) return;
    try {
      setSuccessMsg(null);
      setErrorMsg(null);

      const requestId = `${file.fileId}_${user.uid}`;
      const requestRef = doc(db, 'downloadRequests', requestId);

      const requestPayload: DownloadRequest = {
        requestId,
        fileId: file.fileId,
        fileName: file.name,
        fileType: file.type,
        fileOwnerId: file.ownerId,
        fileOwnerEmail: file.ownerEmail,
        requesterId: user.uid,
        requesterEmail: user.email || 'anonymous',
        requesterName: user.displayName || 'Authorized User',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await setDoc(requestRef, {
        ...requestPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setSuccessMsg(`Requested access for ${file.name}. Pending owner review.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.CREATE, `downloadRequests/${file.fileId}_${user.uid}`);
      } catch (adaptedErr: any) {
        setErrorMsg("Failed to request access: " + adaptedErr.message);
      }
    }
  };

  const initiateDownload = async (file: FileMetadata, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const resolvedUrl = localCache.getResolvedUrl(file);
    
    // 1. Force immediate direct-to-disk download using Blobs
    try {
      const resp = await fetch(resolvedUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (err) {
      console.warn("Direct blob download deferred: ", err);
    }
    
    // 2. Fallback or simultaneous: Open in tab to keep original behavior intact
    window.open(resolvedUrl, '_blank', 'noreferrer');
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 1;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Audio Playback callbacks
  const toggleAudio = (file: FileMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingAudio?.fileId === file.fileId) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
    } else {
      setPlayingAudio(file);
      setIsPlaying(true);
      setAudioProgress(0);
      // Wait for React to render audio element before triggering play
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = localCache.getResolvedUrl(file);
          audioRef.current.play().catch(err => {
            console.error("Audio playback error:", err);
            setErrorMsg("Codec Error: HTML5 Audio cannot stream this direct storage file.");
          });
        }
      }, 100);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      const p = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setAudioProgress(isNaN(p) ? 0 : p);
    }
  };

  const handleAudioEnd = () => {
    setIsPlaying(false);
    setAudioProgress(0);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12 text-slate-800">
      {/* Title block */}
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight capitalize font-display">{mode}s Central Hub</h2>
        <p className="text-xs text-slate-500 font-medium">View and download {mode} media resources safely inside standard user access boundaries.</p>
      </div>

      {successMsg && (
        <div id="media-success-log" className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl text-xs font-bold text-emerald-700 flex items-center space-x-2 shadow-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div id="media-error-log" className="bg-red-55 p-3.5 border border-red-205 rounded-2xl text-xs font-bold text-red-700 flex items-center space-x-2 shadow-sm">
          <ShieldAlert className="w-4 h-4 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filters & search panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            id="media-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${mode}s by name or owner...`}
            className="w-full text-xs text-slate-800 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500/60 focus:bg-white focus:outline-none transition-colors placeholder:text-slate-400 font-medium"
          />
        </div>

        {/* Permissions Gating Filter tags */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 self-start md:self-auto">
          {[
            { id: 'all', label: 'All Media' },
            { id: 'public', label: '🔒 Public Only' },
            { id: 'restricted', label: '🔓 Restricted Only' }
          ].map((tab) => {
            const isTabActive = filterType === tab.id;
            return (
              <button
                key={tab.id}
                id={`filter-btn-${tab.id}`}
                onClick={() => setFilterType(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  isTabActive 
                    ? 'bg-white text-blue-600 shadow-sm border border-slate-100/10' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Grid Layout */}
      {filteredFiles.length === 0 ? (
        <div className="p-16 border border-dashed border-slate-200 rounded-3xl text-center bg-white shadow-sm">
          <div className="p-4 bg-slate-50 border border-slate-100 max-w-max mx-auto rounded-full text-slate-400 mb-3 leading-none">
            {mode === 'image' && <FileImage className="w-8 h-8" />}
            {mode === 'video' && <FileVideo className="w-8 h-8" />}
            {mode === 'audio' && <FileAudio className="w-8 h-8" />}
          </div>
          <h4 className="text-sm font-bold text-slate-800">No {mode} files found</h4>
          <p className="text-xs text-slate-500 mt-1">Upload files or adjust searches filter to display active catalogs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredFiles.map((file) => {
            const access = getFileAccessState(file);
            return (
              <div 
                key={file.fileId} 
                id={`media-card-${file.fileId}`}
                onClick={() => {
                  if (access.canAccess) {
                    if (mode === 'image') setSelectedFile(file);
                    if (mode === 'video') setPlayingVideo(file);
                    if (mode === 'audio') setSelectedFile(file);
                  }
                }}
                className={`bg-white border border-slate-200 rounded-2xl overflow-hidden group transition-all duration-300 hover:border-slate-300 hover:shadow-md flex flex-col justify-between shadow-sm ${
                  access.canAccess ? 'cursor-zoom-in' : ''
                }`}
              >
                {/* Visual Thumbnail Frame */}
                <div className="relative aspect-video bg-slate-50 overflow-hidden flex items-center justify-center border-b border-slate-100">
                  {mode === 'image' && (
                    <img 
                      src={localCache.getResolvedUrl(file)} 
                      alt={file.name} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                  )}

                  {mode === 'video' && (
                    <div className="relative w-full h-full flex items-center justify-center bg-slate-900">
                      {/* Video Simulated Thumbnail */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent z-10" />
                      <div className="p-2.5 bg-blue-600 text-white z-10 rounded-full group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/20">
                        <Play className="w-5 h-5 fill-current stroke-[2]" />
                      </div>
                      <FileVideo className="w-16 h-16 text-slate-850 absolute -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2" />
                    </div>
                  )}

                  {mode === 'audio' && (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-50 to-white">
                      <div className="p-2.5 bg-pink-50 border border-pink-100 text-pink-600 rounded-full group-hover:scale-110 transition-all cursor-pointer z-10 shadow-sm" onClick={(e) => toggleAudio(file, e)}>
                        {playingAudio?.fileId === file.fileId && isPlaying ? (
                          <Pause className="w-5 h-5 fill-current text-pink-600" />
                        ) : (
                          <Play className="w-5 h-5 fill-current text-pink-600 ml-0.5" />
                        )}
                      </div>
                      <FileAudio className="w-20 h-20 text-slate-105 absolute -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2" />
                    </div>
                  )}

                  {/* Absolute positioning overlays */}
                  <div className="absolute top-2.5 left-2.5 z-20 flex gap-1.5">
                    <span className={`text-[9px] font-bold py-0.5 px-1.5 rounded-lg border leading-tight ${access.color}`}>
                      {access.label}
                    </span>
                    <span className="text-[9px] font-bold py-0.5 px-1.5 text-slate-655 bg-white/95 border border-slate-205 rounded-lg shadow-sm">
                      {file.permissionSetting === 'public' ? '🔓 Public' : '🔒 Restricted'}
                    </span>
                  </div>
                </div>

                {/* Details Footer */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600 font-display transition-colors flex-1" title={file.name}>
                        {file.name}
                      </p>
                      {(access.isOwner || isAdmin) && (
                        <button
                          id={`delete-post-btn-${file.fileId}`}
                          onClick={(e) => handleDeleteFile(file, e)}
                          className={`flex items-center space-x-1 py-1 px-1.5 rounded-lg text-[9px] font-bold cursor-pointer shrink-0 transition-all ${
                            deletingFileId === file.fileId
                              ? 'bg-red-600 text-white animate-pulse'
                              : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                          }`}
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          <span>{deletingFileId === file.fileId ? 'Delete?' : ''}</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">Shared by: <span className="text-slate-400">{file.ownerName}</span></p>
                  </div>

                  {/* Interactions & Rating Row */}
                  <div className="flex items-center justify-between py-2 border-t border-slate-100 text-slate-500 gap-1">
                    <div className="flex items-center space-x-1">
                      {/* Upvote */}
                      <button
                        id={`btn-upvote-${file.fileId}`}
                        onClick={(e) => handleVote(file, 'up', e)}
                        className={`p-1 px-2 rounded-lg flex items-center space-x-1 cursor-pointer transition-all border text-[10px] font-semibold ${
                          file.voters?.[user?.uid] === 'up'
                            ? 'bg-blue-55 text-blue-605 border-blue-200 font-bold'
                            : 'bg-slate-50 border-slate-150 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                        title="Upvote post"
                      >
                        <ThumbsUp className="w-3 h-3" />
                        <span>{file.upvotesCount || 0}</span>
                      </button>

                      {/* Downvote */}
                      <button
                        id={`btn-downvote-${file.fileId}`}
                        onClick={(e) => handleVote(file, 'down', e)}
                        className={`p-1 px-2 rounded-lg flex items-center space-x-1 cursor-pointer transition-all border text-[10px] font-semibold ${
                          file.voters?.[user?.uid] === 'down'
                            ? 'bg-amber-55 text-amber-800 border-amber-300 font-bold'
                            : 'bg-slate-50 border-slate-150 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                        title="Downvote post"
                      >
                        <ThumbsDown className="w-3 h-3" />
                        <span>{file.downvotesCount || 0}</span>
                      </button>
                    </div>

                    {/* Comments button toggle */}
                    <button
                      id={`btn-comments-toggle-${file.fileId}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (file.type === 'image' || file.type === 'audio') {
                          setSelectedFile(file);
                        } else if (file.type === 'video') {
                          setPlayingVideo(file);
                        }
                      }}
                      className="p-1 px-2 rounded-lg flex items-center space-x-1 cursor-pointer transition-all border text-[10px] font-bold bg-slate-50 border-slate-150 text-slate-600 hover:bg-slate-100"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>
                        {comments.filter(c => c.fileId === file.fileId).length}
                      </span>
                    </button>
                  </div>

                  {/* Operational controls footer card */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 font-bold font-mono">{formatBytes(file.size)}</span>
                    
                    {access.canAccess && (
                      <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-205 py-1 px-2.5 rounded-lg select-none">
                        Accessible
                      </span>
                    )}

                    {access.canRequest && (
                      <button
                        id={`card-request-btn-${file.fileId}`}
                        onClick={(e) => handleRequestAccess(file, e)}
                        className="flex items-center space-x-1.5 py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-605 rounded-xl text-[10px] font-bold cursor-pointer transition-colors border border-blue-200"
                      >
                        Request Access
                      </button>
                    )}

                    {access.pending && (
                      <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200 py-1 px-2.5 rounded-lg select-none">
                        Pending Access
                      </span>
                    )}

                    {access.denied && (
                      <span className="text-[9px] font-extrabold text-red-700 bg-red-50 border border-red-200 py-1 px-2.5 rounded-lg select-none">
                        Denied
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Audio Stream Playbar - displays when an audio file begins loading */}
      {playingAudio && (
        <div id="persistent-audio-playbar" className="fixed bottom-4 right-4 z-40 bg-white border border-slate-200/90 p-4 rounded-3xl shadow-2xl flex items-center space-x-4 max-w-sm w-full animate-fade-in text-slate-800">
          <audio 
            ref={audioRef}
            onTimeUpdate={handleAudioTimeUpdate}
            onEnded={handleAudioEnd}
          />
          <div className="p-2.5 bg-pink-50 border border-pink-100 text-pink-600 rounded-xl leading-none">
            <FileAudio className="w-5 h-5 animate-bounce text-pink-600" />
          </div>
          <div className="flex-1 min-w-0 pr-2">
            <p className="text-xs font-bold text-slate-900 truncate leading-snug">{playingAudio.name}</p>
            <p className="text-[10px] text-slate-400 font-semibold truncate mt-0.5 leading-snug">Streaming • {playingAudio.ownerName}</p>
            {/* Timeline progress line */}
            <div className="w-full bg-slate-100 h-1 overflow-hidden rounded-full mt-2 border border-slate-200/50">
              <div 
                className="bg-pink-500 h-1 rounded-full transition-all duration-100"
                style={{ width: `${audioProgress}%` }}
              />
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <button
              id="audio-stream-play"
              onClick={(e) => toggleAudio(playingAudio, e)}
              className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg hover:text-slate-900 transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>
            <button
              id="audio-stream-close"
              onClick={() => {
                setIsPlaying(false);
                setPlayingAudio(null);
                if (audioRef.current) {
                  audioRef.current.pause();
                }
              }}
              className="p-1.5 text-slate-405 hover:text-red-500 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* IMAGE PREVIEW MODAL */}
      {selectedFile && selectedFile.type === 'image' && (
        <div id="image-panel-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md" onClick={() => setSelectedFile(null)}>
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl overflow-y-auto max-h-[90vh] relative shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button id="image-panel-close-btn" onClick={() => setSelectedFile(null)} className="absolute top-4 right-4 z-40 bg-slate-950/80 hover:bg-slate-955 text-slate-400 hover:text-white p-2 rounded-full cursor-pointer transition-colors border border-slate-850">
              <X className="w-5 h-5" />
            </button>
            
            <div className="max-h-[60vh] bg-slate-950 flex items-center justify-center overflow-hidden">
              <img 
                src={localCache.getResolvedUrl(selectedFile)} 
                alt={selectedFile.name} 
                className="max-h-[60vh] object-contain w-full"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="p-6 bg-slate-900 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white tracking-tight font-display">{selectedFile.name}</h4>
                  <p className="text-xs text-slate-400 font-medium">Captured and shared by: <span className="text-blue-400 font-bold">{selectedFile.ownerName}</span> ({selectedFile.ownerEmail})</p>
                </div>
                <button
                  id="expanded-image-download"
                  onClick={() => initiateDownload(selectedFile)}
                  className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-blue-500/10 cursor-pointer self-start sm:self-auto text-xs"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Download Image</span>
                </button>
              </div>
              <div className="flex gap-4 pt-2 text-[11px] text-slate-500 border-t border-slate-850">
                <span>Size: <span className="text-slate-350 font-bold font-mono">{formatBytes(selectedFile.size)}</span></span>
                <span>•</span>
                <span>Privacy: <span className="text-indigo-400 font-bold capitalize">{selectedFile.permissionSetting} Access</span></span>
                <span>•</span>
                <span>Internal Ref: <span className="font-mono text-slate-600">{selectedFile.fileId}</span></span>
              </div>

              {/* Enhanced Description and Feedback Section inside expanded modal */}
              <div className="pt-2">
                {renderCommentsSection(selectedFile, true)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AUDIO PREVIEW MODAL */}
      {selectedFile && selectedFile.type === 'audio' && (
        <div id="audio-panel-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md" onClick={() => setSelectedFile(null)}>
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl overflow-y-auto max-h-[90vh] relative shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button id="audio-panel-close-btn" onClick={() => setSelectedFile(null)} className="absolute top-4 right-4 z-40 bg-slate-950/80 hover:bg-slate-955 text-slate-400 hover:text-white p-2 rounded-full cursor-pointer transition-colors border border-slate-850">
              <X className="w-5 h-5" />
            </button>
            
            {/* Ambient soundwave design in audio modal */}
            <div className="p-8 bg-slate-950 flex flex-col items-center justify-center border-b border-slate-850 relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/10 via-transparent to-transparent opacity-40 animate-pulse" />
              <div className="relative p-8 bg-slate-900 border border-slate-850 rounded-full flex items-center justify-center w-32 h-32 mb-4 shadow-xl shadow-slate-950/60 transition-transform hover:scale-[1.02]">
                <FileAudio className={`w-14 h-14 ${playingAudio?.fileId === selectedFile.fileId && isPlaying ? 'text-pink-500 animate-bounce' : 'text-slate-505'}`} />
                {/* Micro play button overlay */}
                <button 
                  onClick={(e) => toggleAudio(selectedFile, e)}
                  className="absolute bottom-1 right-1 p-2 bg-pink-600 hover:bg-pink-700 text-white rounded-full shadow-md hover:scale-110 transition-all cursor-pointer"
                >
                  {playingAudio?.fileId === selectedFile.fileId && isPlaying ? (
                    <Pause className="w-4 h-4 fill-current text-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5 text-white" />
                  )}
                </button>
              </div>
              
              <div className="text-center space-y-1 max-w-md">
                <span className="text-[10px] text-pink-500 font-extrabold tracking-widest uppercase">AUDIO RESOURCE</span>
                <h4 className="text-base font-bold text-white tracking-tight leading-snug">{selectedFile.name}</h4>
              </div>

              {/* Real-time playback progress wrapper */}
              {playingAudio?.fileId === selectedFile.fileId && (
                <div className="w-full max-w-sm bg-slate-800 h-1 overflow-hidden rounded-full mt-5 border border-slate-850">
                  <div 
                    className="bg-pink-500 h-1 rounded-full transition-all duration-100"
                    style={{ width: `${audioProgress}%` }}
                  />
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-900 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white tracking-tight">Audio Details</h4>
                  <p className="text-xs text-slate-400 font-medium">Shared by: <span className="text-blue-400 font-bold">{selectedFile.ownerName}</span> ({selectedFile.ownerEmail})</p>
                </div>
                <button
                  id="expanded-audio-download"
                  onClick={() => initiateDownload(selectedFile)}
                  className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-blue-500/10 cursor-pointer self-start sm:self-auto text-xs"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Download Audio</span>
                </button>
              </div>
              <div className="flex gap-4 pt-2 text-[11px] text-slate-500 border-t border-slate-850">
                <span>Size: <span className="text-slate-350 font-bold font-mono">{formatBytes(selectedFile.size)}</span></span>
                <span>•</span>
                <span>Privacy: <span className="text-indigo-400 font-bold capitalize">{selectedFile.permissionSetting} Access</span></span>
                <span>•</span>
                <span>Internal Ref: <span className="font-mono text-slate-600">{selectedFile.fileId}</span></span>
              </div>

              {/* Enhanced Description and Feedback Section inside expanded modal */}
              <div className="pt-2">
                {renderCommentsSection(selectedFile, true)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIDEO PREVIEW MODAL */}
      {playingVideo && (
        <div id="video-panel-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md" onClick={() => setPlayingVideo(null)}>
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl overflow-y-auto max-h-[90vh] relative shadow-2xl animate-scale-up" onClick={(e) => e.stopPropagation()}>
            <button id="video-panel-close-btn" onClick={() => setPlayingVideo(null)} className="absolute top-4 right-4 z-40 bg-slate-950/80 hover:bg-slate-955 text-slate-400 hover:text-white p-2 rounded-full cursor-pointer transition-colors border border-slate-850">
              <X className="w-5 h-5" />
            </button>
            
            <div className="bg-slate-950 relative w-full aspect-video flex items-center justify-center">
              <video 
                src={localCache.getResolvedUrl(playingVideo)} 
                controls 
                autoPlay
                className="w-full h-full object-contain"
                onError={() => {
                  setErrorMsg("Renderer Warning: standard storage codec rendering constraints are subject to browser support.");
                }}
              />
            </div>

            <div className="p-6 bg-slate-900 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-white tracking-tight font-display">{playingVideo.name}</h4>
                  <p className="text-xs text-slate-400 font-medium">Streamed via Secure Link. Shared by: <span className="text-blue-400 font-bold">{playingVideo.ownerName}</span></p>
                </div>
                <button
                  id="expanded-video-download"
                  onClick={() => initiateDownload(playingVideo)}
                  className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-blue-500/10 cursor-pointer self-start sm:self-auto text-xs"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Download Video</span>
                </button>
              </div>
              <div className="flex gap-4 pt-2 text-[11px] text-slate-500 border-t border-slate-850">
                <span>Size: <span className="text-slate-350 font-bold font-mono">{formatBytes(playingVideo.size)}</span></span>
                <span>•</span>
                <span>Gating setting: <span className="text-emerald-400 font-bold capitalize">{playingVideo.permissionSetting} Access</span></span>
              </div>

              {/* Enhanced Description and Feedback Section inside expanded modal */}
              <div className="pt-2">
                {renderCommentsSection(playingVideo, true)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
