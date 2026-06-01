import React, { useState, useEffect } from 'react';
import { 
  db, 
  handleFirestoreError, 
  OperationType 
} from '../firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Shield, 
  Users, 
  FileText, 
  MessageSquare, 
  Trash2, 
  Search, 
  UserPlus, 
  UserMinus, 
  Lock, 
  Check, 
  AlertCircle,
  FileAudio,
  FileVideo,
  FileImage,
  ExternalLink,
  Mail,
  CornerUpLeft,
  X
} from 'lucide-react';
import { UserProfile, FileMetadata, Comment } from '../types';

interface AdminPanelProps {
  user: any;
  files: FileMetadata[];
}

export default function AdminPanel({ user, files }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'posts' | 'comments' | 'contacts'>('users');
  const [userList, setUserList] = useState<UserProfile[]>([]);
  const [commentList, setCommentList] = useState<Comment[]>([]);
  const [contactList, setContactList] = useState<any[]>([]);
  
  // Search and filter states
  const [userSearch, setUserSearch] = useState('');
  const [postSearch, setPostSearch] = useState('');
  const [commentSearch, setCommentSearch] = useState('');
  const [contactSearch, setContactSearch] = useState('');

  // Reply popup states
  const [selectedContactForReply, setSelectedContactForReply] = useState<any | null>(null);
  const [replyMessageText, setReplyMessageText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  // Status/Error notifications
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'danger' } | null>(null);

  // Auto-dismiss notifications
  useEffect(() => {
    if (actionMsg) {
      const t = setTimeout(() => setActionMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [actionMsg]);

  // 1. Real-time Users List snapshot subscription
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const parsed: UserProfile[] = [];
      snapshot.forEach(docSnap => {
        parsed.push({ 
          uid: docSnap.id, 
          ...docSnap.data() 
        } as UserProfile);
      });
      setUserList(parsed);
    }, (err) => {
      console.error("Failed to load users for Admin page", err);
    });
    return () => unsub();
  }, []);

  // 2. Real-time Comments List snapshot subscription
  useEffect(() => {
    // Collect all comments across all assets
    const q = query(collection(db, 'comments'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const parsed: Comment[] = [];
      snapshot.forEach(docSnap => {
        parsed.push({ 
          commentId: docSnap.id, 
          ...docSnap.data() 
        } as Comment);
      });
      setCommentList(parsed);
    }, (err) => {
      console.error("Failed to fetch comments for Admin review", err);
    });
    return () => unsub();
  }, []);

  // 3. Real-time Contacts snapshot subscription
  useEffect(() => {
    const q = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const parsed: any[] = [];
      snapshot.forEach(docSnap => {
        parsed.push({ 
          contactId: docSnap.id, 
          ...docSnap.data() 
        });
      });
      setContactList(parsed);
    }, (err) => {
      console.error("Failed to load contacts for Admin panel", err);
    });
    return () => unsub();
  }, []);

  const handleDeleteContact = async (contactId: string) => {
    if (!window.confirm("Are you sure you want to delete this contact submission?")) return;
    try {
      await deleteDoc(doc(db, 'contacts', contactId));
      setActionMsg({ text: "Purged contact database listing.", type: 'success' });
    } catch (err) {
      console.error("Failed to delete contact submission", err);
      setActionMsg({ text: "Failed to purge database entry.", type: 'danger' });
    }
  };

  const handleSendContactReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContactForReply || !replyMessageText.trim()) return;

    setSubmittingReply(true);
    try {
      // 1. Threaded conversation message creation
      const tMsgId = 'msg_' + Math.random().toString(36).substr(2, 9);
      await addDoc(collection(db, 'messages'), {
        messageId: tMsgId,
        threadId: selectedContactForReply.email,
        senderUid: user.uid,
        senderName: user.displayName || 'Adams Muema',
        senderEmail: user.email,
        recipientEmail: selectedContactForReply.email,
        text: replyMessageText,
        createdAt: serverTimestamp()
      });

      // 2. Mark ContactSubmission as replied
      await updateDoc(doc(db, 'contacts', selectedContactForReply.contactId), {
        replyText: replyMessageText,
        repliedAt: serverTimestamp(),
        repliedBy: user.email
      });

      setActionMsg({ text: `Response delivered to thread for: "${selectedContactForReply.email}".`, type: 'success' });
      setSelectedContactForReply(null);
      setReplyMessageText('');
    } catch (err) {
      console.error("Error replying to contact dispatch:", err);
      setActionMsg({ text: "Delivery failure: Insufficient keys.", type: 'danger' });
    } finally {
      setSubmittingReply(false);
    }
  };

  // Update a User's Role (choose who is admin and who is not)
  const handleToggleUserRole = async (targetUser: UserProfile) => {
    // Safe guard: Don't accidentally demote yourself if you are adamsmuema19@gmail.com
    if (targetUser.uid === user.uid && user.email === 'adamsmuema19@gmail.com') {
      setActionMsg({ text: "You cannot change role for the principal admin account.", type: 'danger' });
      return;
    }

    const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
    try {
      await updateDoc(doc(db, 'users', targetUser.uid), {
        role: newRole
      });
      setActionMsg({ text: `Successfully changed ${targetUser.displayName}'s role to ${newRole}!`, type: 'success' });
    } catch (err) {
      console.error("Error setting user role", err);
      setActionMsg({ text: "Failed to update user role. Permissions denied.", type: 'danger' });
    }
  };

  // Delete a User record completely from users collection
  const handleDeleteUser = async (targetUser: UserProfile) => {
    if (targetUser.uid === user.uid) {
      setActionMsg({ text: "You cannot delete your own profile.", type: 'danger' });
      return;
    }

    if (!window.confirm(`Are you absolutely sure you want to delete user ${targetUser.displayName}? This removes their synced profile listing.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', targetUser.uid));
      setActionMsg({ text: `Deleted user profile for ${targetUser.displayName}.`, type: 'success' });
    } catch (err) {
      console.error("Error deleting user profile", err);
      setActionMsg({ text: "Failed to delete user profile. Permissions denied.", type: 'danger' });
    }
  };

  // Delete a Post/File
  const handleDeletePost = async (file: FileMetadata) => {
    if (!window.confirm(`Are you sure you want to delete post "${file.name}"? This removes the security ledger entry.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'files', file.fileId));
      setActionMsg({ text: `Successfully deleted post "${file.name}".`, type: 'success' });
    } catch (err) {
      console.error("Error purging media file", err);
      setActionMsg({ text: "Failed to purge post file metadata.", type: 'danger' });
    }
  };

  // Delete generic comments on any post or asset
  const handleDeleteComment = async (comment: Comment) => {
    if (!window.confirm(`Are you sure you want to delete the comment: "${comment.text.substring(0, 30)}..."?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'comments', comment.commentId));
      setActionMsg({ text: "Comment purged successfully.", type: 'success' });
    } catch (err) {
      console.error("Error deleting feedback thread block", err);
      setActionMsg({ text: "Comment deletion blocked: Insufficient keys.", type: 'danger' });
    }
  };

  // Filters
  const filteredUsers = userList.filter(u => 
    u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.role || 'user').toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredPosts = files.filter(f => 
    f.name.toLowerCase().includes(postSearch.toLowerCase()) ||
    f.ownerName.toLowerCase().includes(postSearch.toLowerCase()) ||
    f.ownerEmail.toLowerCase().includes(postSearch.toLowerCase()) ||
    f.type.toLowerCase().includes(postSearch.toLowerCase())
  );

  const filteredComments = commentList.filter(c => {
    const parentFile = files.find(f => f.fileId === c.fileId);
    const fileName = parentFile ? parentFile.name : '';
    return c.text.toLowerCase().includes(commentSearch.toLowerCase()) ||
      c.userName.toLowerCase().includes(commentSearch.toLowerCase()) ||
      c.userEmail.toLowerCase().includes(commentSearch.toLowerCase()) ||
      fileName.toLowerCase().includes(commentSearch.toLowerCase());
  });

  const filteredContacts = contactList.filter(c => 
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.message.toLowerCase().includes(contactSearch.toLowerCase()) ||
    (c.replyText || '').toLowerCase().includes(contactSearch.toLowerCase())
  );

  return (
    <div id="admin-panel-container" className="space-y-8 animate-fade-in text-slate-800">
      
      {/* Upper header segment */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="bg-red-50 text-red-600 p-3 rounded-2xl border border-red-100 shadow-inner">
            <Shield className="w-7 h-7 stroke-[2]" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900 font-display">Administrator Command Center</h2>
            <p className="text-xs text-slate-500 mt-0.5">Global user coordination, file curation, and response moderating tools.</p>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 text-xs font-bold text-red-650 bg-red-50 py-1.5 px-3 rounded-xl border border-red-100 self-start sm:self-auto">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span>ADMINISTRATOR PERMISSION ACTIVE</span>
        </div>
      </div>

      {/* Real-time Status banner */}
      {actionMsg && (
        <div 
          id="admin-status-toast" 
          className={`flex items-start space-x-3 p-4 rounded-2xl border animate-slide-in text-xs font-semibold ${
            actionMsg.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-red-50/80 border-red-200 text-red-800'
          }`}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Tabs Row Navigation */}
      <div className="flex space-x-1.5 bg-slate-100 p-1.5 rounded-2xl max-w-xl">
        <button
          id="tab-btn-users"
          onClick={() => setActiveTab('users')}
          className={`flex-1 flex items-center justify-center space-x-2.5 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'users'
              ? 'bg-white text-slate-950 shadow-sm border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span className="truncate">Users ({userList.length})</span>
        </button>
        <button
          id="tab-btn-posts"
          onClick={() => setActiveTab('posts')}
          className={`flex-1 flex items-center justify-center space-x-2.5 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'posts'
              ? 'bg-white text-slate-950 shadow-sm border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span className="truncate">Posts ({files.length})</span>
        </button>
        <button
          id="tab-btn-comments"
          onClick={() => setActiveTab('comments')}
          className={`flex-1 flex items-center justify-center space-x-2.5 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'comments'
              ? 'bg-white text-slate-950 shadow-sm border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          <span className="truncate">Comments ({commentList.length})</span>
        </button>
        <button
          id="tab-btn-contacts"
          onClick={() => setActiveTab('contacts')}
          className={`flex-1 flex items-center justify-center space-x-2.5 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'contacts'
              ? 'bg-white text-slate-950 shadow-sm border border-slate-200/50'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Mail className="w-4 h-4 shrink-0" />
          <span className="truncate">Contacts ({contactList.length})</span>
        </button>
      </div>

      {/* TAB AREA PANELS */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        
        {/* USERS MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="divide-y divide-slate-100">
            {/* Search filter row */}
            <div className="p-5 bg-slate-50/50 flex items-center justify-between gap-4 border-b border-slate-200">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  id="admin-search-users"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Filter users by name, email or role..."
                  className="w-full bg-white border border-slate-205 rounded-xl py-2 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Listing {filteredUsers.length} Users
              </span>
            </div>

            {/* List entries */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3 px-6">User Avatar & Name</th>
                    <th className="py-3 px-6">Sync Email</th>
                    <th className="py-3 px-6">Current Role</th>
                    <th className="py-3 px-6 text-right">Coordination Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 font-semibold bg-white">
                        No registered users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((item) => (
                      <tr key={item.uid} className="hover:bg-slate-50/40 transition-colors">
                        <td className="py-4 px-6 font-semibold flex items-center space-x-3">
                          <img 
                            src={item.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${item.displayName}`} 
                            alt={item.displayName}
                            className="w-8 h-8 rounded-full object-cover border border-slate-205 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <span className="text-slate-900 font-bold truncate max-w-xs">{item.displayName || 'Authorized Member'}</span>
                        </td>
                        <td className="py-4 px-6 text-slate-500 font-medium font-mono">
                          {item.email}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                            item.role === 'admin'
                              ? 'bg-red-50 text-red-650 ring-1 ring-red-200'
                              : 'bg-slate-100 text-slate-655'
                          }`}>
                            <Shield className="w-2.5 h-2.5" />
                            <span>{item.role || 'user'}</span>
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right space-x-2 whitespace-nowrap">
                          {/* Role toggling element */}
                          <button
                            id={`btn-toggle-role-${item.uid}`}
                            onClick={() => handleToggleUserRole(item)}
                            className={`p-1.5 rounded-lg border text-[10.5px] font-bold cursor-pointer transition-all ${
                              item.role === 'admin'
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                            }`}
                            title={item.role === 'admin' ? "Demote user to normal User" : "Grant administrator access"}
                          >
                            {item.role === 'admin' ? 'Remove Admin' : 'Assign Admin'}
                          </button>

                          {/* Deletion of synced records */}
                          <button
                            id={`btn-delete-user-${item.uid}`}
                            onClick={() => handleDeleteUser(item)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg cursor-pointer transition-all"
                            title="Delete User listing record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* POSTS MANAGEMENT */}
        {activeTab === 'posts' && (
          <div className="divide-y divide-slate-100">
            {/* Search filter row */}
            <div className="p-5 bg-slate-50/50 flex items-center justify-between gap-4 border-b border-slate-200">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  id="admin-search-posts"
                  value={postSearch}
                  onChange={(e) => setPostSearch(e.target.value)}
                  placeholder="Filter posts by title, type, owner..."
                  className="w-full bg-white border border-slate-205 rounded-xl py-2 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Listing {filteredPosts.length} Posts
              </span>
            </div>

            {/* List entries */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3 px-6">File Specs & Preview</th>
                    <th className="py-3 px-6">File Type</th>
                    <th className="py-3 px-6">File Publisher</th>
                    <th className="py-3 px-6">Gate Rule</th>
                    <th className="py-3 px-6 text-right">Moderating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPosts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-semibold bg-white">
                        No asset files found.
                      </td>
                    </tr>
                  ) : (
                    filteredPosts.map((item) => {
                      return (
                        <tr key={item.fileId} className="hover:bg-slate-50/40 transition-colors">
                          <td className="py-4 px-6 font-bold text-slate-900 max-w-sm">
                            <div className="flex items-center space-x-2.5">
                              {/* Media Icon */}
                              <span className="p-1.5 bg-slate-100 text-slate-600 rounded-lg border border-slate-200 shrink-0">
                                {item.type === 'image' && <FileImage className="w-4 h-4 text-blue-500" />}
                                {item.type === 'video' && <FileVideo className="w-4 h-4 text-amber-500" />}
                                {item.type === 'audio' && <FileAudio className="w-4 h-4 text-pink-500" />}
                              </span>
                              <div className="truncate">
                                <span className="block truncate font-bold" title={item.name}>{item.name}</span>
                                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tight">{(item.size / 1024 / 1024).toFixed(2)} MB</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6 font-mono text-[10.5px] uppercase font-bold text-slate-550">
                            {item.type}
                          </td>
                          <td className="py-4 px-6">
                            <span className="block font-bold text-slate-800">{item.ownerName}</span>
                            <span className="block text-[10px] text-slate-400 font-mono">{item.ownerEmail}</span>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-extrabold text-[9.5px] uppercase ${
                              item.permissionSetting === 'public'
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                : 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                            }`}>
                              {item.permissionSetting}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end space-x-2.5">
                              {/* Direct Link */}
                              <a 
                                href={item.url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 rounded-lg transition-all"
                                title="Open original media URL"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              {/* Purge Button */}
                              <button
                                id={`btn-purge-post-${item.fileId}`}
                                onClick={() => handleDeletePost(item)}
                                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-650 border border-red-200 rounded-lg cursor-pointer transition-all"
                                title="Purge post metadata record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* COMMENTS MODERATING */}
        {activeTab === 'comments' && (
          <div className="divide-y divide-slate-100">
            {/* Search filter row */}
            <div className="p-5 bg-slate-50/50 flex items-center justify-between gap-4 border-b border-slate-200">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  id="admin-search-comments"
                  value={commentSearch}
                  onChange={(e) => setCommentSearch(e.target.value)}
                  placeholder="Filter comments by author, text or file name..."
                  className="w-full bg-white border border-slate-205 rounded-xl py-2 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Listing {filteredComments.length} Comments
              </span>
            </div>

            {/* List entries */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3 px-6">Publisher & Email</th>
                    <th className="py-3 px-6">Target File Reference</th>
                    <th className="py-3 px-6">Feedback / Comment text</th>
                    <th className="py-3 px-6 text-right">Moderating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredComments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 font-semibold bg-white">
                        No feedback threads or comments available.
                      </td>
                    </tr>
                  ) : (
                    filteredComments.map((item) => {
                      const parentFile = files.find(f => f.fileId === item.fileId);
                      return (
                        <tr key={item.commentId} className="hover:bg-slate-50/40 transition-colors">
                          <td className="py-4 px-6">
                            <span className="block font-bold text-slate-900">{item.userName}</span>
                            <span className="block text-[10px] text-slate-400 font-mono">{item.userEmail}</span>
                          </td>
                          <td className="py-4 px-6 max-w-xs font-semibold">
                            {parentFile ? (
                              <div className="space-y-0.5">
                                <span className="block text-slate-800 truncate" title={parentFile.name}>{parentFile.name}</span>
                                <span className="block text-[9px] text-indigo-505 bg-indigo-50/60 py-0.5 px-1.5 rounded-md inline-block capitalize font-bold">{parentFile.type} Space</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono text-[10px]">Unlisted Post ID ({item.fileId.substring(0, 8)})</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-slate-700 min-w-[200px] leading-relaxed max-w-md">
                            <span className="italic block font-normal">"{item.text}"</span>
                          </td>
                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            <button
                              id={`btn-purge-comment-${item.commentId}`}
                              onClick={() => handleDeleteComment(item)}
                              className="p-1.5 bg-red-50 hover:bg-red-100 text-red-650 border border-red-200 rounded-lg cursor-pointer transition-all"
                              title="Delete Comment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CONTACTS MANAGEMENT */}
        {activeTab === 'contacts' && (
          <div className="divide-y divide-slate-100">
            {/* Search filter row */}
            <div className="p-5 bg-slate-50/50 flex items-center justify-between gap-4 border-b border-slate-200">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  id="admin-search-contacts"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Filter contact messages, emails, names..."
                  className="w-full bg-white border border-slate-205 rounded-xl py-2 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Listing {filteredContacts.length} Contacts
              </span>
            </div>

            {/* List entries */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3 px-6">Sender Details</th>
                    <th className="py-3 px-6">Date Sent</th>
                    <th className="py-3 px-6">Message Details</th>
                    <th className="py-3 px-6">Reply Status</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredContacts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 font-semibold bg-white">
                        No contact query dispatches found.
                      </td>
                    </tr>
                  ) : (
                    filteredContacts.map((item) => {
                      const isReplied = !!item.replyText;
                      return (
                        <tr key={item.contactId} className="hover:bg-slate-50/40 transition-colors">
                          <td className="py-4 px-6">
                            <span className="block font-bold text-slate-900">{item.name}</span>
                            <span className="block text-[10px] text-slate-400 font-mono">{item.email}</span>
                          </td>
                          <td className="py-4 px-6 text-slate-400 font-mono text-[10px] whitespace-nowrap">
                            {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'}) : 'Just now'}
                          </td>
                          <td className="py-4 px-6 text-slate-700 leading-relaxed max-w-sm">
                            <p className="font-medium text-slate-800 break-words">{item.message}</p>
                            {isReplied && (
                              <div className="mt-2.5 p-2.5 bg-slate-50 rounded-xl border border-dashed text-[11px] text-slate-500 font-medium">
                                <span className="font-bold text-blue-600">Reply sent: </span>
                                <span>"{item.replyText}"</span>
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-6 whitespace-nowrap">
                            {isReplied ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full font-bold text-[9.5px] bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 uppercase">
                                <Check className="w-2.5 h-2.5" />
                                <span>REPLIED</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full font-bold text-[9.5px] bg-amber-50 text-amber-700 ring-1 ring-amber-200 uppercase">
                                <span>PENDING REVIEW</span>
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                id={`btn-reply-contact-${item.contactId}`}
                                onClick={() => {
                                  setSelectedContactForReply(item);
                                  setReplyMessageText(item.replyText || '');
                                }}
                                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border text-[10.5px] font-bold cursor-pointer transition-all ${
                                  isReplied 
                                    ? 'bg-slate-50 hover:bg-slate-105 text-slate-600 border-slate-200' 
                                    : 'bg-blue-600 hover:bg-blue-700 hover:text-white text-white border-blue-600 shadow-md shadow-blue-500/10'
                                }`}
                              >
                                <CornerUpLeft className="w-3.5 h-3.5" />
                                <span>{isReplied ? 'Edit Reply' : 'Reply'}</span>
                              </button>
                              
                              <button
                                id={`btn-purge-contact-${item.contactId}`}
                                onClick={() => handleDeleteContact(item.contactId)}
                                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-650 border border-red-200 rounded-lg cursor-pointer transition-all"
                                title="Delete submission data"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* POPUP REPLY DISPATCH MODAL (NON OVERWHELMING) */}
      {selectedContactForReply && (
        <div id="contact-reply-dialog-bg" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden border border-slate-200 shadow-2xl relative">
            <div className="px-5 py-4 bg-slate-50 border-b flex items-center justify-between">
              <div className="flex items-center space-x-2.5 text-slate-800">
                <CornerUpLeft className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-extrabold font-display">Reply to dispatch: {selectedContactForReply.name}</span>
              </div>
              <button 
                onClick={() => setSelectedContactForReply(null)}
                className="p-1.5 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleSendContactReply} className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 border border-dashed rounded-xl space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Original message sent by:</span>
                  <span className="font-mono text-[10px] text-slate-400">{selectedContactForReply.email}</span>
                </div>
                <p className="italic">"{selectedContactForReply.message}"</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 block">Your Reply Message Text</label>
                <textarea
                  id="reply-box-text"
                  required
                  rows={4}
                  value={replyMessageText}
                  onChange={(e) => setReplyMessageText(e.target.value)}
                  placeholder="Type an intuitive response..."
                  maxLength={1000}
                  className="w-full text-xs text-slate-800 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white focus:outline-none transition-colors resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSelectedContactForReply(null)}
                  className="px-4 py-2 border bg-white hover:bg-slate-50 rounded-xl text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReply || !replyMessageText.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl cursor-pointer disabled:opacity-40"
                >
                  {submittingReply ? 'Sending response...' : 'Send secure reply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
