import React, { useState } from 'react';
import { Mail, User, MessageSquare, Send, CheckCircle2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ContactSubmission } from '../types';

export default function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) {
      setErrorMsg("Please fill out all required fields.");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setErrorMsg("Please provide a valid email address coordinates.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const contactId = 'contact_' + Math.random().toString(36).substr(2, 9);
    
    try {
      const contactData: ContactSubmission = {
        contactId,
        name,
        email,
        message,
        createdAt: new Date()
      };

      // Store in firestore contacts collection
      await setDoc(doc(db, 'contacts', contactId), {
        ...contactData,
        createdAt: serverTimestamp()
      });

      setSuccess(true);
      setName('');
      setEmail('');
      setMessage('');
    } catch (err) {
      console.error(err);
      try {
        handleFirestoreError(err, OperationType.CREATE, `contacts/${contactId}`);
      } catch (adaptedErr: any) {
        setErrorMsg("Submission rejected: " + adaptedErr.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12 text-slate-800">
      {/* Page Title */}
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight font-display">Contact & Developer Channel</h2>
        <p className="text-xs text-slate-500 leading-relaxed mt-1 font-medium">Have questions regarding transfer quotas, account security, or download configurations? Ping our support desk or support the author.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Side: Contact Form (takes 2 columns on lg) */}
        <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-10 bg-gradient-to-bl from-blue-600/5 to-transparent rounded-bl-full pointer-events-none" />

          {success ? (
            <div id="contact-success-panel" className="text-center py-8 space-y-4">
              <div className="p-4 bg-blue-600 text-white max-w-max mx-auto rounded-full shadow-lg shadow-blue-500/15 animate-bounce">
                <CheckCircle2 className="w-8 h-8 stroke-[3]" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight font-display">Submission Transmitted Successfully</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed font-medium">Your message was validated and registered on Firestore. One of our regional administrators will review your dispatch shortly.</p>
              </div>
              <button
                id="btn-contact-reset"
                onClick={() => setSuccess(false)}
                className="px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-200 shadow-sm"
              >
                Send Another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {errorMsg && (
                <div id="contact-error-banner" className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center space-x-2 text-xs text-red-700 font-bold leading-none shadow-sm">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 block">Your Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    id="contact-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Adams Muema"
                    maxLength={100}
                    className="w-full text-xs text-slate-800 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Email Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 block">Email Address Coordinates</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    id="contact-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. adamsmuema19@gmail.com"
                    maxLength={100}
                    className="w-full text-xs text-slate-800 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Message Area */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 block">Message Details</label>
                <div className="relative">
                  <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <textarea
                    id="contact-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what you need help configuring..."
                    rows={4}
                    maxLength={1000}
                    className="w-full text-xs text-slate-800 pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white focus:outline-none transition-colors resize-none"
                    required
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="btn-contact-submit"
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer disabled:opacity-50 text-xs shadow-md shadow-blue-500/10"
              >
                {loading ? (
                  <span>Transmitting message...</span>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Send Secure Dispatch</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Right Side: About Me & Coffee Support Cards */}
        <div className="space-y-6">
          {/* About Me Section */}
          <div id="about-me-card" className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative overflow-hidden">
            <h3 className="text-[10.5px] font-extrabold text-slate-400 tracking-wider mb-4 uppercase">About Me</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-extrabold text-slate-900 font-display">Adams Muema Musee</h4>
                <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">Full-stack innovator, specializing in secure distributed media distribution grids and cloud applications.</p>
              </div>
              <div className="pt-2 space-y-2 text-xs font-semibold">
                <a 
                  href="https://wa.me/254702896107" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center space-x-3 text-slate-700 hover:text-emerald-600 transition-colors bg-slate-50 hover:bg-emerald-50/40 p-2.5 rounded-xl border border-slate-200"
                >
                  <span className="w-5 h-5 flex items-center justify-center bg-emerald-500 text-white rounded-lg text-xs font-bold leading-none shadow-sm shadow-emerald-500/15">💬</span>
                  <span className="truncate">WhatsApp Contact</span>
                </a>
                <a 
                  href="https://github.com/adamsy254" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center space-x-3 text-slate-700 hover:text-indigo-600 transition-colors bg-slate-50 hover:bg-indigo-50/40 p-2.5 rounded-xl border border-slate-200"
                >
                  <span className="w-5 h-5 flex items-center justify-center bg-slate-900 text-white rounded-lg text-xs font-bold leading-none shadow-sm shadow-slate-900/15">🐙</span>
                  <span className="truncate">GitHub Profile</span>
                </a>
              </div>
            </div>
          </div>

          {/* Support on PayPal section */}
          <div id="paypal-me-card" className="bg-amber-50/50 border border-amber-200/80 rounded-3xl p-6 shadow-sm">
            <h3 className="text-xs font-extrabold text-amber-800 tracking-tight mb-2">Support Development</h3>
            <p className="text-xs text-amber-700 font-medium leading-relaxed mb-4">If you find this portal helpful, feel free to fuel my coding sessions with a warm cup of coffee!</p>
            
            <a 
              href="https://www.paypal.com/donate/?hosted_button_id=UW2NDM92AU67U" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-extrabold text-xs rounded-xl shadow-md shadow-amber-500/10 transition-all border border-amber-400 cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current text-slate-950 shrink-0" viewBox="0 0 24 24">
                <path d="M20.007 7.031c-.347 1.763-1.42 3.195-3.159 4.095c-1.378.713-2.936.98-4.509.98h-1.923l-.935 5.867a.64.64 0 01-.634.54H5.892a.641.641 0 01-.633-.742L7.33 2.115A1.282 1.282 0 018.597 1h7.054c1.171 0 2.11.233 2.822.685c.983.626 1.637 1.626 1.71 3.013c.045.877-.184 1.68-.176 2.333z" opacity="0.4" />
                <path d="M16.848 10.126c-.347 1.763-1.42 3.195-3.159 4.095c-1.378.713-2.936.98-4.509.98h-1.923l-.935 5.867a.64.64 0 01-.634.54H2.735a.641.641 0 01-.633-.742L4.173 5.21A1.282 1.282 0 015.44 4.095h7.054c1.171 0 2.11.233 2.822.685c.983.626 1.637 1.626 1.71 3.013c.045.877-.184 1.68-.278 2.333z" />
              </svg>
              <span>Support me on PayPal – Buy me a coffee ☕</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
