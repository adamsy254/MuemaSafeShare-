import React, { useState, useEffect } from 'react';
import { 
  FileImage, 
  FileVideo, 
  FileAudio, 
  Upload, 
  Check, 
  X, 
  Download, 
  Clock, 
  ShieldCheck, 
  ShieldAlert, 
  AlertCircle, 
  FileText,
  UserCheck2,
  Lock,
  ArrowUpRight
} from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  getDocs 
} from 'firebase/firestore';
import { FileMetadata, DownloadRequest } from '../types';
import { localCache } from '../localCache';

interface DashboardProps {
  setCurrentPage: (page: string) => void;
  openUploadModal: () => void;
  files: FileMetadata[];
  requests: DownloadRequest[];
  user: any;
}

export default function Dashboard({ setCurrentPage, openUploadModal, files, requests, user }: DashboardProps) {
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter requests that are sent to me as the owner
  const inboxRequests = requests.filter(req => req.fileOwnerId === user?.uid);
  
  // Clean stats
  const totalMyFiles = files.filter(f => f.ownerId === user?.uid).length;
  const totalApprovedByMe = requests.filter(req => req.fileOwnerId === user?.uid && req.status === 'approved').length;
  const pendingRequestsToMe = inboxRequests.filter(req => req.status === 'pending').length;

  // Handle request actions (Approve / Reject)
  const handleRequestResolution = async (reqId: string, resolution: 'approved' | 'rejected') => {
    try {
      setSuccessMsg(null);
      setErrorMsg(null);
      const reqRef = doc(db, 'downloadRequests', reqId);
      await updateDoc(reqRef, {
        status: resolution,
        updatedAt: serverTimestamp()
      });
      setSuccessMsg(`Request successfully ${resolution}!`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.UPDATE, `downloadRequests/${reqId}`);
      } catch (adaptedErr: any) {
        setErrorMsg("Failed to resolve request: " + adaptedErr.message);
      }
    }
  };

  // Create a new download access request
  const handleRequestAccess = async (file: FileMetadata) => {
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
        createdAt: new Date(), // Local fallback, serverTimestamp will replace if needed or we use server rules
        updatedAt: new Date()
      };

      // Since update rules are strict regarding exact structure:
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

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'image': return <FileImage className="w-4.5 h-4.5 text-emerald-600" />;
      case 'video': return <FileVideo className="w-4.5 h-4.5 text-blue-600" />;
      case 'audio': return <FileAudio className="w-4.5 h-4.5 text-pink-600" />;
      default: return <FileText className="w-4.5 h-4.5 text-slate-500" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Helper to determine the permission/download status of a file relative to user
  const getFileStatusAndAction = (file: FileMetadata) => {
    if (file.ownerId === user?.uid) {
      return { label: 'Owner', badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-150', canDownload: true };
    }
    if (file.permissionSetting === 'public') {
      return { label: 'Public', badgeColor: 'bg-emerald-55 text-emerald-700 border-emerald-100', canDownload: true };
    }

    // Is there a corresponding request?
    const currentReq = requests.find(r => r.fileId === file.fileId && r.requesterId === user?.uid);
    if (!currentReq) {
      return { label: 'Restricted', badgeColor: 'bg-slate-100 text-slate-600 border-slate-200', canRequest: true };
    }
    if (currentReq.status === 'pending') {
      return { label: 'Pending Access', badgeColor: 'bg-amber-50/80 text-amber-700 border-amber-200', requested: true };
    }
    if (currentReq.status === 'approved') {
      return { label: 'Access Approved', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-150', canDownload: true };
    }
    return { label: 'Access Denied', badgeColor: 'bg-red-50 text-red-700 border-red-150', denied: true };
  };

  // Trigger browser download by file url
  const initiateFileDownload = (file: FileMetadata) => {
    window.open(localCache.getResolvedUrl(file), '_blank', 'noreferrer');
  };

  return (
    <div className="space-y-8 animate-fade-in text-slate-800">
      {/* Header section with brand banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 sm:p-8 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-3xl shadow-lg shadow-blue-500/15 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-24 bg-gradient-to-bl from-white/10 to-transparent rounded-bl-full pointer-events-none" />
        <div className="space-y-1 relative z-10">
          <h2 className="text-2xl font-extrabold tracking-tight font-display text-white">MuemaSafeShare Platform</h2>
          <p className="text-sm text-blue-105 font-medium">Welcome back, <span className="font-extrabold text-white">{user?.displayName || user?.email}</span>. Oversee secure files and access regulations.</p>
        </div>
        <button 
          id="btn-trigger-upload-modal"
          onClick={openUploadModal}
          className="flex items-center justify-center space-x-2 bg-white text-blue-600 font-extrabold px-6 py-3.5 rounded-2xl hover:bg-blue-50 hover:text-blue-700 hover:scale-[1.02] transition-all shadow-md cursor-pointer self-start md:self-auto relative z-10 text-xs"
        >
          <Upload className="w-5 h-5 stroke-[2.5]" />
          <span>Upload Material</span>
        </button>
      </div>

      {successMsg && (
        <div id="dashboard-success-notif" className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-xs font-bold text-emerald-700 flex items-center space-x-2.5 shadow-sm">
          <ShieldCheck className="w-4.5 h-4.5 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div id="dashboard-error-notif" className="bg-red-50 border border-red-205 p-4 rounded-2xl text-xs font-bold text-red-700 flex items-center space-x-2.5 shadow-sm">
          <ShieldAlert className="w-4.5 h-4.5 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Metrics bento-grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div id="stat-my-uploads" className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center space-x-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">My Uploaded Assets</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{totalMyFiles} files</p>
          </div>
        </div>

        <div id="stat-pending-inbox" className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center space-x-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pending Inbox Requests</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{pendingRequestsToMe} alerts</p>
          </div>
        </div>

        <div id="stat-approved-credentials" className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center space-x-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <UserCheck2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Approved Download Rules</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-0.5">{totalApprovedByMe} active</p>
          </div>
        </div>
      </div>

      {/* Navigation Space Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Images Gallery', page: 'images', desc: 'Secure view and raw file filters', color: 'border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/30' },
          { label: 'Videos Lounge', page: 'videos', desc: 'Media screening and playback space', color: 'border-blue-100 hover:border-blue-300 hover:bg-blue-50/30' },
          { label: 'Audios Space', page: 'audio', desc: 'Acoustic play lists & download logs', color: 'border-pink-100 hover:border-pink-300 hover:bg-pink-50/30' },
          { label: 'Get in Touch', page: 'contact', desc: 'Contact channel to the admin desks', color: 'border-slate-200 hover:border-slate-350 hover:bg-slate-50' },
        ].map((nav, i) => (
          <button 
            key={i}
            id={`dash-nav-card-${nav.page}`}
            onClick={() => setCurrentPage(nav.page)}
            className={`bg-white border ${nav.color} p-4 rounded-2xl text-left transition-all hover:translate-y-[-2px] hover:shadow-md shadow-sm shadow-slate-100/50 cursor-pointer group`}
          >
            <div className="flex justify-between items-start">
              <h4 className="text-xs font-extrabold text-slate-800 capitalize group-hover:text-blue-600 transition-colors font-display">{nav.label}</h4>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <p className="text-[11px] text-slate-500 mt-2 line-clamp-2 leading-relaxed font-medium">{nav.desc}</p>
          </button>
        ))}
      </div>

      {/* Main split: Pending Approval Inbox vs Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Inbox panel (Left Column, col-span-5) */}
        <div id="inbox-requests-column" className="lg:col-span-5 space-y-6">
          <div className="flex justify-between items-center pb-2 border-b border-slate-205">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight font-display">Access Control Inbox</h3>
            <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {pendingRequestsToMe} pending
            </span>
          </div>

          <div className="space-y-4 max-h-[450px] overflow-y-auto pr-2">
            {inboxRequests.length === 0 ? (
              <div className="bg-white border border-slate-200 p-12 text-center rounded-2xl text-slate-400 text-xs shadow-sm">
                <ShieldCheck className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                <span>You don't have any download request in sync at the moment.</span>
              </div>
            ) : (
              [...inboxRequests]
                .sort((a,b) => b.updatedAt?.seconds - a.updatedAt?.seconds)
                .map((req) => (
                  <div key={req.requestId} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center space-x-1.5">
                          {getMediaIcon(req.fileType)}
                          <p className="text-xs font-bold text-slate-800 truncate max-w-[200px]">{req.fileName}</p>
                        </div>
                        <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">Requested by: <span className="text-blue-600 font-extrabold">{req.requesterName}</span> ({req.requesterEmail})</p>
                      </div>

                      {/* Status pill right side */}
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${
                        req.status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-205' :
                        req.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-205' :
                        'bg-red-50 text-red-700 border-red-205'
                      }`}>
                        {req.status}
                      </span>
                    </div>

                    {req.status === 'pending' && (
                      <div className="flex space-x-2 pt-2">
                        <button
                          id={`btn-approve-${req.requestId}`}
                          onClick={() => handleRequestResolution(req.requestId, 'approved')}
                          className="flex-1 flex items-center justify-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3 rounded-xl transition-all cursor-pointer shadow-sm"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Approve Access</span>
                        </button>
                        <button
                          id={`btn-reject-${req.requestId}`}
                          onClick={() => handleRequestResolution(req.requestId, 'rejected')}
                          className="flex-1 flex items-center justify-center space-x-1 bg-red-50/60 border border-red-200 hover:bg-red-100/80 text-red-600 hover:text-red-700 text-xs font-bold py-2 px-3 rounded-xl transition-all cursor-pointer animate-scale-up"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Deny Request</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Global Recent Activity Feed (Right Column, col-span-7) */}
        <div id="activity-feed-column" className="lg:col-span-7 space-y-6">
          <div className="flex justify-between items-center pb-2 border-b border-slate-202">
            <h3 className="text-sm font-bold text-slate-850 tracking-tight font-display font-bold">Recent Transfers Activity Feed</h3>
            <span className="text-xs text-slate-400 font-bold">Global transfers list</span>
          </div>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
            {files.length === 0 ? (
              <div className="bg-white border border-slate-200 p-16 text-center rounded-2xl text-slate-400 text-xs shadow-sm">
                <Upload className="w-10 h-10 mx-auto mb-3 text-slate-300 animate-bounce" />
                <span>No files have been shared onto the platform yet. Be the first to start!</span>
              </div>
            ) : (
              [...files]
                .sort((a,b) => b.createdAt?.seconds - a.createdAt?.seconds)
                .slice(0, 15) // Top 15 recent items
                .map((file) => {
                  const status = getFileStatusAndAction(file);
                  return (
                    <div key={file.fileId} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
                      <div className="flex items-start space-x-3.5 min-w-0">
                        {/* Circle Icon Container */}
                        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl leading-none">
                          {getMediaIcon(file.type)}
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-extrabold text-slate-900 truncate pr-4">{file.name}</p>
                          <p className="text-xs text-slate-500 font-medium leading-relaxed">Shared by: <span className="text-slate-800 font-bold">{file.ownerName}</span> ({file.ownerEmail})</p>
                          <div className="flex items-center space-x-2 pt-1 text-[10px] text-slate-400 font-bold font-mono">
                            <span>{formatBytes(file.size)}</span>
                            <span>•</span>
                            <span className="uppercase text-[9px] text-blue-600">{file.type}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action controller based on right security status */}
                      <div className="flex items-center space-x-3 self-end sm:self-auto shrink-0 min-w-[140px] justify-end">
                        <span className={`text-[10px] font-bold py-1 px-2.5 rounded-lg border leading-tight ${status.badgeColor}`}>
                          {status.label}
                        </span>

                        {status.canDownload && (
                          <button
                            id={`btn-download-${file.fileId}`}
                            onClick={() => initiateFileDownload(file)}
                            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all hover:scale-[1.05] cursor-pointer shadow-md shadow-blue-500/10"
                            title="Download Shared Asset"
                          >
                            <Download className="w-4 h-4 stroke-[2.5]" />
                          </button>
                        )}

                        {status.canRequest && (
                          <button
                            id={`btn-request-${file.fileId}`}
                            onClick={() => handleRequestAccess(file)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 text-xs font-bold rounded-xl border border-blue-200 transition-all cursor-pointer"
                          >
                            Request Access
                          </button>
                        )}

                        {status.requested && (
                          <button
                            disabled
                            className="px-3 py-1.5 bg-slate-50 text-amber-600 text-xs font-bold rounded-xl border border-amber-205 cursor-not-allowed"
                          >
                            Pending Review
                          </button>
                        )}

                        {status.denied && (
                          <button
                            disabled
                            className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-150 cursor-not-allowed"
                          >
                            Access Locked
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
