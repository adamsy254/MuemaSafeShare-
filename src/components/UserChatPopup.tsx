import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  MessageSquare, 
  X, 
  Send, 
  User, 
  MessageCircle, 
  ChevronRight,
  Sparkles,
  Inbox
} from 'lucide-react';

interface UserChatPopupProps {
  user: any;
  isAdmin: boolean;
}

interface Message {
  id?: string;
  messageId?: string;
  threadId: string;
  senderUid: string;
  senderName: string;
  senderEmail: string;
  recipientEmail: string;
  text: string;
  createdAt: any;
}

export default function UserChatPopup({ user, isAdmin }: UserChatPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [activeThread, setActiveThread] = useState<string>(''); // For admin: email of selected user
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load messages from Firestore
  useEffect(() => {
    if (!user) return;

    let q;
    if (isAdmin) {
      // Admins listen to all messages
      q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'));
    } else {
      // Normal users only listen to messages in their own thread
      q = query(
        collection(db, 'messages'), 
        where('threadId', '==', user.email),
        orderBy('createdAt', 'asc')
      );
    }

    const unsub = onSnapshot(q, (snapshot) => {
      const parsed: Message[] = [];
      snapshot.forEach((docSnap) => {
        parsed.push({
          id: docSnap.id,
          ...docSnap.data()
        } as Message);
      });
      setMessages(parsed);
    }, (err) => {
      console.warn("Could not load support messages:", err);
    });

    return () => unsub();
  }, [user, isAdmin]);

  // If normal user, thread is always their own email
  useEffect(() => {
    if (user && !isAdmin) {
      setActiveThread(user.email);
    }
  }, [user, isAdmin]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeThread, isOpen]);

  // Handle message dispatch
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !user || !activeThread) return;

    setSending(true);
    try {
      const newMsgId = 'msg_' + Math.random().toString(36).substr(2, 9);
      const recipient = isAdmin ? activeThread : 'adamsmuema19@gmail.com';

      await addDoc(collection(db, 'messages'), {
        messageId: newMsgId,
        threadId: activeThread,
        senderUid: user.uid,
        senderName: user.displayName || 'Authorized Member',
        senderEmail: user.email,
        recipientEmail: recipient,
        text: messageText,
        createdAt: serverTimestamp()
      });

      setMessageText('');
    } catch (err) {
      console.error("Message delivery failed:", err);
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  // Group threads (For Admin review)
  const threadsMap: Record<string, { lastMsg: Message; count: number }> = {};
  if (isAdmin) {
    messages.forEach((msg) => {
      const tId = msg.threadId;
      if (!threadsMap[tId] || !threadsMap[tId].lastMsg.createdAt || (msg.createdAt && msg.createdAt.seconds > threadsMap[tId].lastMsg.createdAt.seconds)) {
        threadsMap[tId] = {
          lastMsg: msg,
          count: (threadsMap[tId]?.count || 0) + 1
        };
      } else {
        threadsMap[tId].count += 1;
      }
    });
  }

  const adminThreads = Object.keys(threadsMap).map((tId) => ({
    threadId: tId,
    lastMsg: threadsMap[tId].lastMsg,
    count: threadsMap[tId].count
  })).sort((a, b) => {
    const timeA = a.lastMsg.createdAt?.seconds || 0;
    const timeB = b.lastMsg.createdAt?.seconds || 0;
    return timeB - timeA;
  });

  // Calculate unread or direct response counters for standard users
  const incomingAgentMessages = messages.filter(m => m.senderEmail !== user.email);

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans text-slate-800">
      {/* Floating Action Bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center space-x-2 bg-slate-900 border border-slate-700 hover:bg-black text-white px-4 py-3 rounded-full shadow-2xl transition-all cursor-pointer select-none group"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
          </span>
          <span className="text-xs font-bold font-display uppercase tracking-wider">
            {isAdmin ? 'Mod Console' : 'Support Chat'}
          </span>
          <MessageCircle className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
          
          {incomingAgentMessages.length > 0 && !isAdmin && (
            <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-[9px] font-extrabold text-white h-5 w-5 rounded-full flex items-center justify-center border-2 border-white">
              {incomingAgentMessages.length}
            </span>
          )}
        </button>
      )}

      {/* Pop-up Box */}
      {isOpen && (
        <div className="bg-white rounded-2xl w-80 sm:w-96 h-[440px] flex flex-col border border-slate-200 shadow-2xl relative overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <div className="text-left">
                <span className="text-xs font-extrabold font-display leading-tight block">
                  {isAdmin ? 'Thread Investigator' : 'Adams Support Desk'}
                </span>
                <span className="text-[9.5px] text-slate-400 font-medium block">
                  {activeThread ? `Direct channel: ${activeThread}` : 'Select active conversation'}
                </span>
              </div>
            </div>
            
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Core Panel Content */}
          {isAdmin && !activeThread ? (
            /* ADMIN ROOT: Show all threads list */
            <div className="flex-1 overflow-y-auto bg-slate-50/50 flex flex-col divide-y divide-slate-100">
              <div className="p-3 bg-white text-center border-b font-medium text-[11px] text-slate-400">
                ACTIVE USER DIALOGUES
              </div>
              {adminThreads.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-2">
                  <Inbox className="w-5 h-5" />
                  <span className="text-xs font-semibold">No interactive user replies active.</span>
                </div>
              ) : (
                adminThreads.map((t) => (
                  <button
                    key={t.threadId}
                    onClick={() => setActiveThread(t.threadId)}
                    className="w-full text-left p-3.5 hover:bg-slate-100 transition-colors flex items-start space-x-3 cursor-pointer"
                  >
                    <img 
                      src={`https://api.dicebear.com/7.x/initials/svg?seed=${t.threadId}`} 
                      alt="User avatar" 
                      className="w-7 h-7 rounded-full border bg-white shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 truncate block">{t.threadId}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-450" />
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">{t.lastMsg.text}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            /* CONVERSATION VIEW */
            <>
              {/* Back button if admin is inside a thread */}
              {isAdmin && (
                <button
                  onClick={() => setActiveThread('')}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border-b text-slate-650 text-[10px] font-bold text-left flex items-center space-x-1 transition-all cursor-pointer"
                >
                  <span>← Back to threads index</span>
                </button>
              )}

              {/* Chat messages */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/30">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                    <div className="p-3 bg-slate-100 rounded-full text-slate-400">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-bold text-slate-800">Direct Support Message Box</h4>
                      <p className="text-[10px] text-slate-500 max-w-xs mx-auto leading-relaxed mt-1">
                        Type your question or query below directly. Adams will receive this within seconds and coordinate a responsive answer.
                      </p>
                    </div>
                  </div>
                ) : (
                  messages
                    .filter((m) => m.threadId === activeThread)
                    .map((msg) => {
                      const isMe = msg.senderEmail === user.email;
                      const isSenderAdmin = msg.senderEmail === 'adamsmuema19@gmail.com';
                      return (
                        <div key={msg.id} className={`flex items-start gap-2 max-w-[85%] ${isMe ? 'ml-auto flex-row-reverse' : ''}`}>
                          <img 
                            src={`https://api.dicebear.com/7.x/initials/svg?seed=${msg.senderName}`} 
                            alt="User initials"
                            className="w-6 h-6 rounded-full border bg-white shrink-0"
                          />
                          <div className="space-y-0.5">
                            <div className={`p-2.5 rounded-xl text-xs ${
                              isMe 
                                ? 'bg-blue-600 text-white rounded-tr-none' 
                                : 'bg-white text-slate-850 border rounded-tl-none shadow-xs'
                            }`}>
                              <span className="block break-words whitespace-pre-wrap leading-relaxed">{msg.text}</span>
                            </div>
                            <div className={`flex items-center space-x-1 text-[8.5px] text-slate-400 ${isMe ? 'justify-end' : ''}`}>
                              <span className="font-bold">{isMe ? 'You' : msg.senderName}</span>
                              {isSenderAdmin && !isMe && (
                                <span className="bg-slate-200 text-slate-700 text-[7px] font-bold px-1.5 rounded-md scale-90">ADMIN</span>
                              )}
                              <span>•</span>
                              <span>
                                {msg.createdAt?.seconds 
                                  ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                                  : 'Sync'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat input form */}
              <div className="p-3 border-t bg-white">
                <form onSubmit={handleSend} className="flex space-x-1.5">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a responsive message..."
                    disabled={sending}
                    maxLength={1000}
                    className="flex-1 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 py-1.5 px-3 rounded-lg text-xs font-medium"
                  />
                  <button
                    type="submit"
                    disabled={sending || !messageText.trim()}
                    className="p-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-850 text-white rounded-lg transition-all cursor-pointer disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
