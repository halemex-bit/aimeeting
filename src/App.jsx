import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings, AlertCircle, CheckCircle2, ClipboardList, User, MessageSquare } from 'lucide-react';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState('Sedia untuk mula');
  
  // Real-time parsed output state
  const [alerts, setAlerts] = useState([]);
  const [keyNotes, setKeyNotes] = useState([]);
  const [actionItems, setActionItems] = useState([]);
  
  // Transcripts list
  const [transcripts, setTranscripts] = useState([]);

  const transcriptEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const textBufferRef = useRef(''); // Buffer of unrecognized text to send to Gemini
  const checkIntervalRef = useRef(null);

  // Auto scroll transcript to bottom with smooth motion
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

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

        if (finalTranscript) {
          const cleanedText = finalTranscript.trim();
          
          setTranscripts(prev => {
            // Check if identical line was just added
            if (prev.length > 0 && prev[prev.length - 1].text === cleanedText) {
              return prev;
            }
            return [...prev, { speaker: "Speaker", text: cleanedText }];
          });

          // Add to queue for Gemini analysis
          textBufferRef.current += ' ' + cleanedText;
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
      setStatusText('Browser anda tidak menyokong Web Speech API');
    }
  }, []);

  // Send accumulated text to Gemini proxy every 5 seconds
  const sendBufferToGemini = async () => {
    const textToSend = textBufferRef.current.trim();
    if (!textToSend) return;

    // Clear buffer so we don't send duplicate chunks
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
      // Restore buffer if API failed
      textBufferRef.current = textToSend + ' ' + textBufferRef.current;
      setStatusText('Gagal menganalisis. Menunggu...');
    }
  };

  const startRecording = () => {
    if (!recognitionRef.current) return;
    
    setIsRecording(true);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden font-sans">
      
      {/* Background Neon Glowing Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-900/10 blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col z-10">
        
        {/* Modern Header */}
        <header className="w-full flex items-center justify-between mb-10 pb-6 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 shadow-[0_8px_30px_rgb(124,58,237,0.3)]">
              <span className="text-xl">🎙️</span>
              <div className="absolute inset-0 rounded-2xl border border-white/20" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Crony Meeting
              </h1>
              <p className="text-xs text-slate-400 font-medium tracking-wide">
                ANALISIS MESYUARAT KECERDASAN MASA NYATA
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
            <span className={`h-2.5 w-2.5 rounded-full bg-rose-500 ${isRecording ? 'animate-ping' : ''}`} />
            <span className="text-xs font-bold text-rose-400 tracking-wider">🔴 LIVE</span>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* Left Panel (Control Panel & Highlights) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Control Panel Card */}
            <div className="glass-card rounded-3xl p-6 shadow-2xl relative overflow-hidden transition-all duration-300 hover:border-white/10 group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all duration-500" />
              
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
                <Settings className="w-4 h-4 text-purple-400" />
                Panel Kawalan Utama
              </h2>

              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between bg-slate-900/60 rounded-2xl p-4 border border-white/5">
                  <span className="text-xs font-semibold text-slate-400">Status Mikrofon</span>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                    isRecording 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {statusText}
                  </span>
                </div>

                <div className="flex gap-4">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      className="flex-1 flex items-center justify-center gap-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-200 active:scale-[0.97] shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 cursor-pointer"
                    >
                      <Mic className="w-5 h-5" />
                      Mula Dengar
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="flex-1 flex items-center justify-center gap-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold py-4 px-6 rounded-2xl transition-all duration-200 active:scale-[0.97] shadow-lg shadow-rose-500/20 cursor-pointer"
                    >
                      <MicOff className="w-5 h-5" />
                      Berhenti
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Highlights (Key alerts, Decisions, Actions) */}
            <div className="glass-card rounded-3xl p-6 shadow-2xl relative overflow-hidden flex-grow flex flex-col justify-start">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                MAKLUMAN PENTING & KEPUTUSAN
              </h2>

              {/* Direct Alerts for Halem */}
              <div className="mb-6">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                  🔔 TUGASAN UNTUK HALEM:
                </h3>
                {alerts.length === 0 ? (
                  <div className="text-xs text-slate-500 italic bg-slate-900/30 rounded-xl p-3 border border-white/5">
                    Menunggu tugasan Halem dikesan...
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {alerts.map((alert, idx) => (
                      <div 
                        key={idx} 
                        className="bg-rose-950/20 border border-rose-500/30 text-rose-200 text-xs px-4 py-3 rounded-2xl font-medium animate-fadeIn"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        {alert}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Decisions & Key Notes */}
              <div className="mb-6">
                <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  📌 KEPUTUSAN TERKINI:
                </h3>
                {keyNotes.length === 0 ? (
                  <div className="text-xs text-slate-500 italic bg-slate-900/30 rounded-xl p-3 border border-white/5">
                    Menunggu keputusan utama dikesan...
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {keyNotes.map((note, idx) => (
                      <div 
                        key={idx} 
                        className="bg-emerald-950/20 border border-emerald-500/30 text-emerald-200 text-xs px-4 py-3 rounded-2xl font-medium animate-fadeIn"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        {note}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* General Action Items */}
              <div>
                <h3 className="text-xs font-bold text-sky-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-sky-400" />
                  📋 TUGASAN AHLI LAIN:
                </h3>
                {actionItems.length === 0 ? (
                  <div className="text-xs text-slate-500 italic bg-slate-900/30 rounded-xl p-3 border border-white/5">
                    Tiada tindakan ditugaskan setakat ini.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {actionItems.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="bg-sky-950/20 border border-sky-500/30 text-sky-200 text-xs px-4 py-3 rounded-2xl font-medium flex justify-between items-center animate-fadeIn"
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <span>{item.task}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 rounded-lg text-sky-300">
                          {item.assignee}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Right Panel (Transcripts) */}
          <div className="lg:col-span-7 flex flex-col h-[650px] lg:h-auto">
            <div className="glass-card rounded-3xl p-6 shadow-2xl flex flex-col h-full relative overflow-hidden">
              
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                Transkripsi Masa Nyata (Live Stream)
              </h2>

              {/* Scroller View */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-4 scroll-smooth">
                {transcripts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 italic text-sm">
                    <span>Klik "Mula Dengar" untuk memulakan perbualan...</span>
                  </div>
                ) : (
                  transcripts.map((t, idx) => {
                    const isHalem = t.text.toLowerCase().includes('halem') || t.text.toLowerCase().includes('halim');
                    return (
                      <div 
                        key={idx} 
                        className={`flex flex-col p-4 rounded-2xl transition-all duration-300 border ${
                          isHalem
                            ? 'bg-rose-950/10 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.05)]'
                            : 'bg-white/5 border-white/5 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`p-1 rounded-lg ${isHalem ? 'bg-rose-500/20' : 'bg-slate-800'}`}>
                            <User className={`w-3 h-3 ${isHalem ? 'text-rose-400' : 'text-slate-400'}`} />
                          </div>
                          <span className={`text-xs font-bold uppercase tracking-wider ${
                            isHalem ? 'text-rose-400' : 'text-slate-300'
                          }`}>
                            {t.speaker}
                          </span>
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed font-light">
                          "{t.text}"
                        </p>
                      </div>
                    );
                  })
                )}
                <div ref={transcriptEndRef} />
              </div>

              {/* Info footer */}
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>Pengecaman pertuturan dikuasakan oleh Web Speech API (ms-MY).</span>
                <span className="text-purple-400">Autoscroll Aktif</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Social Footer */}
      <footer className="w-full flex items-center justify-center gap-6 py-6 border-t border-white/5 text-slate-600 text-xs z-10">
        <span>© 2026 Crony Meeting. Hak Cipta Terpelihara.</span>
        <div className="flex items-center gap-3">
          <a href="https://github.com/halemex-bit/aimeeting" target="_blank" rel="noreferrer" className="hover:text-purple-400 transition-colors">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
