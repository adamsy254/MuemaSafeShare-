import React from 'react';
import { 
  Home, 
  Image as ImageIcon, 
  Video, 
  Volume2, 
  Mail, 
  Upload, 
  LogOut, 
  CheckCircle2, 
  Clock, 
  Lock, 
  Share2,
  Shield,
  MessageSquare
} from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

interface SidebarProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  user: any;
  pendingRequestsCount: number;
  isAdmin: boolean;
}

export default function Sidebar({ currentPage, setCurrentPage, user, pendingRequestsCount, isAdmin }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', name: 'Home Dashboard', icon: Home },
    { id: 'images', name: 'Images Space', icon: ImageIcon },
    { id: 'videos', name: 'Videos Hub', icon: Video },
    { id: 'audio', name: 'Audio Stream', icon: Volume2 },
    { id: 'contact', name: 'Contact Channel', icon: Mail },
  ];

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  return (
    <aside id="app-sidebar" className="fixed top-0 left-0 z-40 w-64 h-screen transition-transform -translate-x-full md:translate-x-0 bg-white border-r border-slate-200 flex flex-col justify-between">
      {/* Upper Brand Section */}
      <div className="px-5 py-6">
        <div id="sidebar-logo" className="flex items-center space-x-3 mb-8">
          <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 text-white p-2 rounded-xl shadow-md shadow-blue-500/10">
            <Share2 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-950 tracking-tight leading-none font-display">MuemaSafe</h1>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block mt-0.5">Share Hub</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-semibold transition-all group cursor-pointer ${
                  isActive 
                    ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4.5 h-4.5 transition-transform group-hover:scale-105 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                  <span>{item.name}</span>
                </div>
                {item.id === 'dashboard' && pendingRequestsCount > 0 && (
                  <span className="bg-blue-600 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full animate-pulse">
                    {pendingRequestsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Actions & Sign Out */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        {user && (
          <div id="user-profile-anchor" className="flex items-center space-x-3 mb-4 p-2 bg-white rounded-xl border border-slate-200/60 shadow-sm shadow-slate-100">
            <img 
              className="w-9 h-9 rounded-full border border-slate-200 object-cover" 
              src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || 'User'}`} 
              alt={user.displayName || 'Profile'}
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate leading-snug">{user.displayName || 'System User'}</p>
              <p className="text-[10px] text-slate-400 truncate leading-snug">{user.email}</p>
            </div>
          </div>
        )}

        <button 
          id="btn-signout"
          onClick={handleLogout}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-red-55/60 hover:text-red-600 border border-transparent hover:border-red-100 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out Account</span>
        </button>

        {isAdmin && (
          <button 
            id="btn-admin-panel"
            onClick={() => setCurrentPage('admin')}
            className={`w-full flex items-center justify-center space-x-2 mt-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              currentPage === 'admin'
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/10 hover:bg-blue-750'
                : 'bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 border-slate-200 shadow-sm'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Admin Center</span>
          </button>
        )}
      </div>
    </aside>
  );
}
