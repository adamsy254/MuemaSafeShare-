import React, { useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  signInWithPopup, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  serverTimestamp, 
  query,
  where
} from 'firebase/firestore';

import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import MediaGallery from './components/MediaGallery';
import ContactForm from './components/ContactForm';
import UploadModal from './components/UploadModal';
import AdminPanel from './components/AdminPanel';
import UserChatPopup from './components/UserChatPopup';
import { FileMetadata, DownloadRequest } from './types';

import { 
  Share2, 
  Clock, 
  Lock, 
  ShieldAlert, 
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [requests, setRequests] = useState<DownloadRequest[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);

  // 1. Authenticate & Profile Sync Callback Loop (Primitive Free)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setAuthLoading(false);

        // Sync or register details onto /users/{userId} to satisfy Zero-Trust rules
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists()) {
            await setDoc(userDocRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Authorized Member',
              photoURL: firebaseUser.photoURL || '',
              role: firebaseUser.email === 'adamsmuema19@gmail.com' ? 'admin' : 'user',
              createdAt: serverTimestamp()
            });
          }
        } catch (err: unknown) {
          console.error("User registration synchronization error:", err);
          // Catch and process cleanly
          try {
            handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
          } catch(e) {
            // Keep user running even if profile document sync had soft warnings
          }
        }
      } else {
        setUser(null);
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-Time Query Listeners Gated by Auth UserId Primitive
  const userId = user?.uid;
  useEffect(() => {
    if (!userId) {
      setFiles([]);
      setRequests([]);
      setCurrentUserProfile(null);
      return;
    }

    // Listener for current user's profile document from Firestore
    const unsubProfile = onSnapshot(doc(db, 'users', userId), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentUserProfile(docSnap.data());
      } else {
        // Fallback or brand new profile in creation state
        setCurrentUserProfile({
          uid: userId,
          email: user.email || '',
          displayName: user.displayName || 'Authorized Member',
          photoURL: user.photoURL || '',
          role: user.email === 'adamsmuema19@gmail.com' ? 'admin' : 'user'
        });
      }
    }, (err) => {
      console.warn("Soft warning: Current user document retrieval skipped in snapshot", err);
    });

    // Listener A: Live files logs
    const filesPath = 'files';
    const unsubFiles = onSnapshot(collection(db, filesPath), (snapshot) => {
      const parsed: FileMetadata[] = [];
      snapshot.forEach(docSnap => {
        parsed.push(docSnap.data() as FileMetadata);
      });
      setFiles(parsed);
    }, (err) => {
      console.error("Live files snapshot retrieval failed:", err);
      handleFirestoreError(err, OperationType.LIST, filesPath);
    });

    // Listener B: Live access requests logs (Split into two queries to satisfy security rules without needing blanket collection listing)
    const reqsPath = 'downloadRequests';
    
    let sentReqs: DownloadRequest[] = [];
    let receivedReqs: DownloadRequest[] = [];

    const updateRequests = () => {
      const merged = [...sentReqs];
      receivedReqs.forEach(req => {
        if (!merged.some(m => m.requestId === req.requestId)) {
          merged.push(req);
        }
      });
      setRequests(merged);
    };

    const qSent = query(collection(db, reqsPath), where('requesterId', '==', userId));
    const unsubSent = onSnapshot(qSent, (snapshot) => {
      const parsed: DownloadRequest[] = [];
      snapshot.forEach(docSnap => {
        parsed.push(docSnap.data() as DownloadRequest);
      });
      sentReqs = parsed;
      updateRequests();
    }, (err) => {
      console.error("Live sent downloadRequests snapshot failed:", err);
      handleFirestoreError(err, OperationType.LIST, reqsPath);
    });

    const qReceived = query(collection(db, reqsPath), where('fileOwnerId', '==', userId));
    const unsubReceived = onSnapshot(qReceived, (snapshot) => {
      const parsed: DownloadRequest[] = [];
      snapshot.forEach(docSnap => {
        parsed.push(docSnap.data() as DownloadRequest);
      });
      receivedReqs = parsed;
      updateRequests();
    }, (err) => {
      console.error("Live received downloadRequests snapshot failed:", err);
      handleFirestoreError(err, OperationType.LIST, reqsPath);
    });

    return () => {
      unsubProfile();
      unsubFiles();
      unsubSent();
      unsubReceived();
    };
  }, [userId]);

  // Handle standard Gmail Login
  const handleGoogleLogin = async () => {
    try {
      setErrorMsg(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Authentication popup failed:", err);
      setErrorMsg("Google Sign-In failed: " + err.message);
    }
  };

  // Helper count of pending requests targeted for current user
  const pendingRequestsToMe = requests.filter(req => req.fileOwnerId === userId && req.status === 'pending').length;

  if (authLoading) {
    return (
      <div id="loading-gate" className="w-screen h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800 font-sans">
        <div className="flex items-center space-x-3 mb-6 animate-pulse">
          <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-lg shadow-blue-500/15">
            <Share2 className="w-8 h-8" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">MuemaSafeShare</span>
        </div>
        <div className="w-16 h-1 bg-slate-200 overflow-hidden rounded-full">
          <div className="bg-blue-600 h-1 w-1/2 rounded-full animate-ping" />
        </div>
        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mt-4">Connecting Firebase Channels</p>
      </div>
    );
  }

  // --- UNAUTHENTICATED HERO LANDING GATE ---
  if (!user) {
    return (
      <main id="auth-landing-root" className="w-screen min-h-screen bg-slate-50 flex flex-col justify-between py-12 px-6 font-sans text-slate-800">
        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center flex-1 my-auto">
          {/* Logo & Call to Action text */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center space-x-2.5">
              <div className="bg-blue-600 text-white p-2 rounded-xl shadow-md shadow-blue-500/10">
                <Share2 className="w-6 h-6 stroke-[2.5]" />
              </div>
              <span className="text-lg font-extrabold text-slate-900 tracking-tight uppercase">MuemaSafeShare</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1] max-w-2xl font-display">
              Gated Media Transmission, <span className="text-blue-600 font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Simplified.</span>
            </h1>

            <p className="text-slate-600 text-sm sm:text-base leading-relaxed max-w-xl">
              An enterprise file sharing space built with Zero-Trust principles. Distribute Images, Videos, and Audios securely under active download permission bounds and direct approvals.
            </p>

            <ul className="space-y-3.5 text-xs text-slate-600 font-medium">
              <li className="flex items-center space-x-2.5">
                <ShieldCheck className="w-4.5 h-4.5 text-blue-600 shrink-0" />
                <span>Google-verified user credentials syncing</span>
              </li>
              <li className="flex items-center space-x-2.5">
                <Lock className="w-4.5 h-4.5 text-blue-600 shrink-0" />
                <span>Restricted-grade download gating request systems</span>
              </li>
              <li className="flex items-center space-x-2.5">
                <Clock className="w-4.5 h-4.5 text-blue-600 shrink-0" />
                <span>Real-time owner approval & rejection triggers inbox</span>
              </li>
            </ul>
          </div>

          {/* Dynamic Login Widget card */}
          <div className="lg:col-span-5 bg-white border border-slate-200/80 p-8 rounded-3xl relative overflow-hidden shadow-xl shadow-slate-100">
            <div className="absolute top-0 right-0 p-16 bg-gradient-to-bl from-blue-500/5 to-transparent rounded-bl-full pointer-events-none" />
            
            <div className="space-y-6 relative">
              <div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight font-display">Initiate Gated Space</h3>
                <p className="text-xs text-slate-500 mt-1">Access requires Gmail credentials synced via Firebase Authentication.</p>
              </div>

              {errorMsg && (
                <div id="auth-error" className="bg-red-500/5 border border-red-200 rounded-xl p-3 flex items-start space-x-2 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                id="btn-login-google"
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center space-x-3.5 bg-slate-900 text-white hover:bg-slate-800 font-bold py-3.5 px-4 rounded-xl shadow-md transition-all transform hover:-translate-y-0.5 cursor-pointer text-xs"
              >
                {/* Embedded Inline SVG for Google Logo */}
                <svg className="w-5 h-5 shrink-0 bg-white p-0.5 rounded-full" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign In with Google</span>
              </button>

              <div className="text-[10px] text-slate-450 leading-relaxed text-center">
                By entering this space, you align with MuemaSafeShare security matrix protocols. File distribution logs under direct administrator surveillance.
              </div>
            </div>
          </div>
        </div>

        {/* Footer Credit line */}
        <div className="text-center text-[11px] text-slate-400 font-medium">
          MuemaSafeShare Platform • Cloud Firestore Zero-Trust Sandbox Protected Environment
        </div>
      </main>
    );
  }

  // --- MAIN AUTHENTICATED WORKSPACE ---
  const isUserAdmin = currentUserProfile?.role === 'admin' || user?.email === 'adamsmuema19@gmail.com';

  return (
    <div id="safe-share-root" className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-blue-500/10 selection:text-blue-600">
      
      {/* Sidebar Navigation Panel */}
      <Sidebar 
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        user={user}
        pendingRequestsCount={pendingRequestsToMe}
        isAdmin={isUserAdmin}
      />

      {/* Primary View Layer (with full width clearance for sidebar) */}
      <main id="app-content-body" className="md:ml-64 p-6 sm:p-8 lg:p-10 min-h-screen bg-slate-55">
        
        {/* Core Multi-Screen Router Switch */}
        {currentPage === 'dashboard' && (
          <Dashboard 
            setCurrentPage={setCurrentPage}
            openUploadModal={() => setIsUploadOpen(true)}
            files={files}
            requests={requests}
            user={user}
          />
        )}

        {currentPage === 'images' && (
          <MediaGallery 
            mode="image"
            files={files}
            requests={requests}
            user={user}
            isAdmin={isUserAdmin}
          />
        )}

        {currentPage === 'videos' && (
          <MediaGallery 
            mode="video"
            files={files}
            requests={requests}
            user={user}
            isAdmin={isUserAdmin}
          />
        )}

        {currentPage === 'audio' && (
          <MediaGallery 
            mode="audio"
            files={files}
            requests={requests}
            user={user}
            isAdmin={isUserAdmin}
          />
        )}

        {currentPage === 'contact' && (
          <ContactForm />
        )}

        {currentPage === 'admin' && (
          <AdminPanel 
            user={user}
            files={files}
          />
        )}

        {/* Beautiful, High-Contrast Regulatory Footer Note */}
        <footer className="mt-16 pt-8 border-t border-slate-200 text-center space-y-1.5 pb-4">
          <p className="text-[11px] text-slate-550 font-bold tracking-wide">
            © Adams Muema — All rights reserved.
          </p>
          <p className="text-[10px] text-slate-400 max-w-2xl mx-auto leading-relaxed font-medium">
            Licensed for educational and legitimate use only. <span className="font-bold text-red-500">Strictly prohibited:</span> adult content, child exploitation material, or graphic/gore content.
          </p>
        </footer>

      </main>

      {/* Float Overlay Forms Upload Modal */}
      <UploadModal 
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => {
          // Soft triggers or snapshot handles updating lists naturally
        }}
      />

      {/* Floating Individualized Chat Messenger */}
      <UserChatPopup 
        user={user}
        isAdmin={isUserAdmin}
      />
    </div>
  );
}
