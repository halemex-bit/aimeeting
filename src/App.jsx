import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings, AlertCircle, CheckCircle2, ClipboardList, User, MessageSquare, Sparkles, X, ChevronRight, Send, ArrowRight, CornerDownLeft } from 'lucide-react';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState('Sedia untuk rekod');
  
  // Modal / Transcribing overlay state
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  // Real-time parsed output state
  const [alerts, setAlerts] = useState([]);
  const [keyNotes, setKeyNotes] = useState([]);
  const [actionItems, setActionItems] = useState([]);
  
  // Transcripts list
  const [transcripts, setTranscripts] = useState([]);
  const [currentInterimText, setCurrentInterimText] = useState('');

  // AI Chat Assistant States
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: 'Hi! Saya pembantu AI anda. Sila tanya apa-apa soalan mengenai intipati mesyuarat ini.' }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  const transcriptEndRef = useRef(null);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const textBufferRef = useRef(''); // Buffer of unrecognized text to send to Gemini
  const checkIntervalRef = useRef(null);

  // Auto scroll transcript to bottom
  useEffect(() => {
    if (showLiveModal) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts, currentInterimText, showLiveModal]);

  // Auto scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Initialize Speech Recognition for immediate visual feedback
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ms-MY'; // Optimized for Malay/English code-switching

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += text;
          } else {
            interimTranscript += text;
          }
        }

        // Live text stream update
        setCurrentInterimText(interimTranscript);

        if (finalTranscript) {
          const cleanedText = finalTranscript.trim();
          
          setTranscripts(prev => {
            // Check if identical line was just added
            if (prev.length > 0 && prev[prev.length - 1].text === cleanedText) {
              return prev;
            }
            return [...prev, { speaker: "Anda", text: cleanedText }];
          });

          // Add to queue for Gemini analysis
          textBufferRef.current += ' ' + cleanedText;
          setCurrentInterimText('');
        }
      };

      recognition.onerror = (e) => {
        console.error("Speech recognition error", e);
        if (e.error === 'not-allowed') {
          setStatusText('Akses mikrofon dinafikan');
          setIsRecording(false);
        }
      };

      recognitionRef.current = recognition;
    } else {
      setStatusText('Speech API tidak disokong');
    }
  }, []);

  // Send accumulated text to Gemini proxy every 5 seconds
  const sendBufferToGemini = async () => {
    const textToSend = textBufferRef.current.trim();
    if (!textToSend) return;

    textBufferRef.current = '';
    setStatusText('Menganalisis perbualan...');

    try {
      const response = await fetch('http://localhost:5000/api/process-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: textToSend })
      });
      const data = await response.json();
      
      if (data.has_significant_update) {
        if (data.direct_alerts_for_halem && data.direct_alerts_for_halem.length > 0) {
          setAlerts(prev => [...new Set([...prev, ...data.direct_alerts_for_halem])]);
        }
        if (data.general_key_notes && data.general_key_notes.length > 0) {
          setKeyNotes(prev => [...new Set([...prev, ...data.general_key_notes])]);
        }
        if (data.general_action_items && data.general_action_items.length > 0) {
          setActionItems(prev => {
            const newItems = [...prev];
            data.general_action_items.forEach(item => {
              if (!newItems.some(i => i.task === item.task)) {
                newItems.push(item);
              }
            });
            return newItems;
          });
        }
      }
      setStatusText('Mendengar secara aktif...');
    } catch (err) {
      console.error("Error analyzing text chunk with Gemini:", err);
      textBufferRef.current = textToSend + ' ' + textBufferRef.current;
      setStatusText('Retrying analysis...');
    }
  };

  const startRecording = () => {
    if (!recognitionRef.current) return;
    
    setIsRecording(true);
    setShowLiveModal(true);
    setStatusText('Mendengar secara aktif...');
    textBufferRef.current = '';
    
    try {
      recognitionRef.current.start();
      
      // Start 5-second analyzer sweep
      checkIntervalRef.current = setInterval(sendBufferToGemini, 5000);
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    setStatusText('Diberhentikan');
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    clearInterval(checkIntervalRef.current);
    
    // Process final remaining buffer
    sendBufferToGemini();
  };

  const triggerSummarization = async () => {
    if (transcripts.length === 0) return;
    setIsSummarizing(true);
    setSummaryText('Menjana rumusan mesyuarat...');
    setShowSummaryModal(true);

    try {
      const fullText = transcripts.map(t => `${t.speaker}: ${t.text}`).join('\n');
      const response = await fetch('http://localhost:5000/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullTranscript: fullText })
      });
      const data = await response.json();
      setSummaryText(data.summary || 'Tiada rumusan dapat dijana.');
    } catch (e) {
      console.error(e);
      setSummaryText('Gagal menjana rumusan. Sila semak sambungan server.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!userInput.trim() || isChatLoading) return;

    const userMsg = userInput.trim();
    setUserInput('');
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setIsChatLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: chatMessages.slice(1), // ignore introductory message
          transcripts: transcripts
        })
      });
      const data = await response.json();
      setChatMessages(prev => [...prev, { sender: 'bot', text: data.reply || 'Maaf, saya tidak dapat memahami konteks tersebut.' }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { sender: 'bot', text: 'Ralat sambungan. Gagal menghubungi pembantu AI.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden font-sans antialiased selection:bg-purple-500/30">
      
      {/* Background Neon Glowing Orbs */}
      <div className="absolute top-[-10%] left-[-15%] w-[60%] h-[60%] rounded-full bg-purple-950/15 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-15%] w-[60%] h-[60%] rounded-full bg-indigo-950/15 blur-[140px] pointer-events-none" />

      {/* Main Container */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-6 py-10 flex flex-col z-10">
        
        {/* iOS 26 Layout Header */}
        <header className="w-full flex items-center justify-between mb-10 pb-6 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600/90 to-indigo-600/90 shadow-[0_8px_30px_rgb(124,58,237,0.25)] border border-white/10">
              <span className="text-2xl">🎙️</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-b from-white to-slate-300 bg-clip-text text-transparent">
                Crony Meeting
              </h1>
              <p className="text-[10px] font-bold text-slate-400 tracking-widest mt-1">
                INTELLIGENT MEETING COPILOT
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {transcripts.length > 0 && (
              <button
                onClick={triggerSummarization}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 active:scale-95 transition-all text-xs font-semibold text-slate-200 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                Summarize Meeting
              </button>
            )}

            <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-rose-500/5 border border-rose-500/10">
              <span className={`h-2 w-2 rounded-full bg-rose-500 ${isRecording ? 'animate-ping' : ''}`} />
              <span className="text-[10px] font-extrabold text-rose-400 tracking-widest uppercase">LIVE</span>
            </div>
          </div>
        </header>

        {/* Dashboard Sections Grid */}
        <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* Left Column: Robot Graphic & Info & AI Chat */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* iOS Robot Avatar Card */}
            <div className="glass-card rounded-[32px] p-6 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center text-center">
              <div className="relative mb-4">
                {/* Glowing Pulsing Aura during recording */}
                {isRecording && (
                  <div className="absolute inset-0 rounded-full bg-purple-500/30 blur-2xl animate-pulse scale-125" />
                )}
                <img 
                  src="/robot.png" 
                  alt="AI Assistant Logo" 
                  className={`w-28 h-28 object-contain rounded-2xl relative z-10 transition-transform duration-300 ${
                    isRecording ? 'animate-bounce scale-110' : ''
                  }`} 
                />
              </div>
              <h2 className="text-base font-bold text-white mb-1">Crony InfoBot</h2>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                {isRecording ? 'Sedang mendengar perbualan mesyuarat anda...' : 'Sedia untuk memulakan pemantauan pintar.'}
              </p>
              
              <div className="mt-5 w-full">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-3.5 px-6 rounded-2xl transition-all duration-200 active:scale-[0.97] shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer"
                  >
                    <Mic className="w-5 h-5" />
                    Mula Mesyuarat
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold py-3.5 px-6 rounded-2xl transition-all duration-200 active:scale-[0.97] shadow-lg shadow-rose-500/20 cursor-pointer"
                  >
                    <MicOff className="w-5 h-5" />
                    Tamat & Proses
                  </button>
                )}
              </div>
            </div>

            {/* AI Sembang / Chat Module */}
            <div className="glass-card rounded-[32px] p-6 shadow-2xl flex-grow flex flex-col min-h-[350px]">
              <h3 className="text-xs font-extrabold text-indigo-400 tracking-widest uppercase flex items-center gap-2 mb-4">
                💬 Tanya InfoBot (Sembang AI)
              </h3>
              
              {/* Chat Log Window */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs max-h-[220px]">
                {chatMessages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                      msg.sender === 'user' 
                        ? 'bg-purple-600/30 text-purple-100 self-end ml-auto border border-purple-500/20' 
                        : 'bg-white/5 text-slate-300 mr-auto border border-white/5'
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
                {isChatLoading && (
                  <div className="bg-white/5 text-slate-400 p-3 rounded-2xl mr-auto max-w-[85%] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input form */}
              <form onSubmit={handleSendMessage} className="mt-4 flex items-center gap-2 bg-slate-900/60 border border-white/5 rounded-2xl p-2 focus-within:border-purple-500/50 transition-all">
                <input
                  type="text"
                  placeholder="Ask InfoBot anything..."
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-slate-200 outline-none px-2"
                />
                <button 
                  type="submit"
                  disabled={!userInput.trim() || isChatLoading}
                  className="p-2.5 rounded-xl bg-purple-600/80 hover:bg-purple-500 text-white disabled:opacity-40 transition-all active:scale-90 shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

          </div>

          {/* Right Column: Alerts & Decision Panels (Split Sections) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Direct Alerts for Halem */}
            <div className="glass-card rounded-[32px] p-8 shadow-2xl relative overflow-hidden flex-1">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-extrabold text-rose-400 tracking-widest uppercase flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  🔔 Tugasan Khas Halem
                </h3>
                <span className="text-[10px] font-extrabold px-2.5 py-1 bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20 uppercase tracking-widest">
                  Priority
                </span>
              </div>
              
              {alerts.length === 0 ? (
                <div className="h-28 flex flex-col items-center justify-center text-center text-slate-500 border border-dashed border-white/5 rounded-2xl p-4">
                  <p className="text-xs">Tiada tugasan baru dikesan untuk Halem.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {alerts.map((alert, idx) => (
                    <div 
                      key={idx} 
                      className="bg-rose-500/[0.03] border border-rose-500/20 text-rose-200 text-xs px-4 py-3.5 rounded-2xl font-medium animate-fadeIn flex items-start gap-3"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <ChevronRight className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      <span>{alert}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Decisions & Key Notes */}
            <div className="glass-card rounded-[32px] p-8 shadow-2xl relative overflow-hidden flex-1">
              <h3 className="text-xs font-extrabold text-emerald-400 tracking-widest uppercase flex items-center gap-2 mb-6">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                📌 Keputusan Penting Mesyuarat
              </h3>

              {keyNotes.length === 0 ? (
                <div className="h-28 flex flex-col items-center justify-center text-center text-slate-500 border border-dashed border-white/5 rounded-2xl p-4">
                  <p className="text-xs">Keputusan rasmi mesyuarat akan direkodkan di sini.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {keyNotes.map((note, idx) => (
                    <div 
                      key={idx} 
                      className="bg-emerald-500/[0.03] border border-emerald-500/20 text-emerald-200 text-xs px-4 py-3.5 rounded-2xl font-medium animate-fadeIn flex items-start gap-3"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* General Action Items */}
            <div className="glass-card rounded-[32px] p-8 shadow-2xl relative overflow-hidden flex-1">
              <h3 className="text-xs font-extrabold text-sky-400 tracking-widest uppercase flex items-center gap-2 mb-6">
                <ClipboardList className="w-4 h-4 text-sky-400" />
                📋 Tugasan Ahli Kumpulan Lain
              </h3>

              {actionItems.length === 0 ? (
                <div className="h-28 flex flex-col items-center justify-center text-center text-slate-500 border border-dashed border-white/5 rounded-2xl p-4">
                  <p className="text-xs">Senarai tindakan tugasan akan direkodkan di sini.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {actionItems.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="bg-sky-500/[0.03] border border-sky-500/20 text-sky-200 text-xs px-4 py-3.5 rounded-2xl font-medium flex justify-between items-center animate-fadeIn"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <span>{item.task}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-sky-500/20 border border-sky-500/30 px-2.5 py-1 rounded-lg text-sky-300">
                        {item.assignee}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* --- Live Transcribing Popup Modal (iOS 26 Style Blur) --- */}
      {showLiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-2xl transition-all duration-300" />
          
          <div className="relative w-full max-w-2xl bg-slate-900/80 border border-white/10 rounded-[32px] shadow-2xl overflow-hidden animate-fadeIn flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse" />
                <h3 className="text-sm font-semibold text-slate-200">Sesi Transkripsi Masa Nyata</h3>
              </div>
              <button 
                onClick={() => {
                  stopRecording();
                  setShowLiveModal(false);
                }}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 active:scale-90 transition-all text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Live Text Area */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4 min-h-[300px]">
              {transcripts.length === 0 && !currentInterimText ? (
                <div className="h-full flex items-center justify-center text-slate-500 italic text-xs">
                  Sila bercakap... Transkripsi akan tertera di sini.
                </div>
              ) : (
                <>
                  {transcripts.map((t, idx) => (
                    <div key={idx} className="bg-white/5 border border-white/5 p-4 rounded-2xl animate-fadeIn">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">Speaker</span>
                      <p className="text-sm text-slate-200 font-light leading-relaxed">"{t.text}"</p>
                    </div>
                  ))}
                  {currentInterimText && (
                    <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-2xl opacity-80 animate-pulse">
                      <span className="text-[10px] font-bold text-purple-400 block mb-1">Tengah Bercakap...</span>
                      <p className="text-sm text-purple-200 font-light leading-relaxed">"{currentInterimText}"</p>
                    </div>
                  )}
                </>
              )}
              <div ref={transcriptEndRef} />
            </div>

            <div className="p-6 border-t border-white/5 flex justify-end gap-3">
              <button
                onClick={() => {
                  stopRecording();
                  setShowLiveModal(false);
                }}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-6 py-3 rounded-full transition-all active:scale-95 cursor-pointer"
              >
                Tamatkan Sesi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Summarization Modal --- */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-2xl transition-all duration-300" />
          
          <div className="relative w-full max-w-2xl bg-slate-900/80 border border-white/10 rounded-[32px] shadow-2xl overflow-hidden animate-fadeIn flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Rumusan Eksekutif Mesyuarat
              </h3>
              <button 
                onClick={() => setShowSummaryModal(false)}
                className="p-2 rounded-full bg-white/5 hover:bg-white/10 active:scale-90 transition-all text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-8 overflow-y-auto">
              {isSummarizing ? (
                <div className="h-48 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                  <span className="text-xs text-slate-400">Gemini sedang merumuskan perbincangan...</span>
                </div>
              ) : (
                <div className="prose prose-invert max-w-none text-sm text-slate-300 leading-relaxed space-y-4">
                  {summaryText.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/5 flex justify-end">
              <button
                onClick={() => setShowSummaryModal(false)}
                className="bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold px-6 py-3 rounded-full transition-all active:scale-95 cursor-pointer"
              >
                Tutup Rumusan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Social Footer */}
      <footer className="w-full flex items-center justify-center gap-6 py-8 border-t border-white/5 text-slate-600 text-xs z-10">
        <span>© 2026 Crony Meeting. Hak Cipta Terpelihara.</span>
        <div className="flex items-center gap-3">
          <a href="https://github.com/halemex-bit/aimeeting" target="_blank" rel="noreferrer" className="hover:text-purple-400 transition-colors">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
