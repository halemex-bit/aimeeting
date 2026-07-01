import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings, AlertCircle, CheckCircle2, ClipboardList, User, MessageSquare, Sparkles, X, ChevronRight } from 'lucide-react';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState('Ready to monitor');
  
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

  const transcriptEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const textBufferRef = useRef(''); // Buffer of unrecognized text to send to Gemini
  const checkIntervalRef = useRef(null);

  // Auto scroll transcript to bottom with smooth motion
  useEffect(() => {
    if (showLiveModal) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts, currentInterimText, showLiveModal]);

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
            return [...prev, { speaker: "Speaker", text: cleanedText }];
          });

          // Add to queue for Gemini analysis
          textBufferRef.current += ' ' + cleanedText;
          setCurrentInterimText('');
        }
      };

      recognition.onerror = (e) => {
        console.error("Speech recognition error", e);
        if (e.error === 'not-allowed') {
          setStatusText('Microphone access denied');
          setIsRecording(false);
        }
      };

      recognitionRef.current = recognition;
    } else {
      setStatusText('Speech API not supported');
    }
  }, []);

  // Send accumulated text to Gemini proxy every 5 seconds
  const sendBufferToGemini = async () => {
    const textToSend = textBufferRef.current.trim();
    if (!textToSend) return;

    // Clear buffer so we don't send duplicate chunks
    textBufferRef.current = '';
    setStatusText('Analyzing conversation...');

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
      setStatusText('Listening...');
    } catch (err) {
      console.error("Error analyzing text chunk with Gemini:", err);
      // Restore buffer if API failed
      textBufferRef.current = textToSend + ' ' + textBufferRef.current;
      setStatusText('Retrying analysis...');
    }
  };

  const startRecording = () => {
    if (!recognitionRef.current) return;
    
    setIsRecording(true);
    setShowLiveModal(true);
    setStatusText('Listening...');
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
    setStatusText('Stopped');
    
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
    setSummaryText('Generating summary...');
    setShowSummaryModal(true);

    try {
      const fullText = transcripts.map(t => `${t.speaker}: ${t.text}`).join('\n');
      const response = await fetch('http://localhost:5000/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullTranscript: fullText })
      });
      const data = await response.json();
      setSummaryText(data.summary || 'No summary could be generated.');
    } catch (e) {
      console.error(e);
      setSummaryText('Failed to generate summary. Please check your connection.');
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden font-sans antialiased selection:bg-purple-500/30">
      
      {/* Background Neon Glowing Orbs */}
      <div className="absolute top-[-10%] left-[-15%] w-[60%] h-[60%] rounded-full bg-purple-900/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-15%] w-[60%] h-[60%] rounded-full bg-indigo-900/10 blur-[130px] pointer-events-none" />

      {/* Main Container */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-6 py-10 flex flex-col z-10">
        
        {/* iOS 26 Layout Header */}
        <header className="w-full flex items-center justify-between mb-12 pb-6 border-b border-white/5">
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

        {/* Dashboard Sections Grid - Split Columns */}
        <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* Left: Alerts & Halem Mentions */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            
            {/* Control Panel / Status */}
            <div className="glass-card rounded-[32px] p-6 shadow-2xl relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-300">Live Status</h2>
                  <p className="text-xs text-slate-500 mt-1">{statusText}</p>
                </div>
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-6 py-3 rounded-full transition-all active:scale-[0.97] cursor-pointer shadow-lg shadow-purple-500/10"
                  >
                    <Mic className="w-4 h-4" />
                    Start Session
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-6 py-3 rounded-full transition-all active:scale-[0.97] cursor-pointer shadow-lg shadow-rose-500/10"
                  >
                    <MicOff className="w-4 h-4" />
                    Stop Session
                  </button>
                )}
              </div>
            </div>

            {/* Direct Alerts for Halem */}
            <div className="glass-card rounded-[32px] p-8 shadow-2xl relative overflow-hidden flex-grow">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-extrabold text-rose-400 tracking-widest uppercase flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  🔔 Tasks for Halem
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-500/10 text-rose-400 rounded-md border border-rose-500/20">
                  Priority
                </span>
              </div>
              
              {alerts.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 border border-dashed border-white/5 rounded-2xl p-4">
                  <p className="text-xs">No tasks currently identified for Halem.</p>
                </div>
              ) : (
                <div className="space-y-3">
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

          </div>

          {/* Right: Key Notes & Other Assignees */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            
            {/* Key Notes */}
            <div className="glass-card rounded-[32px] p-8 shadow-2xl relative overflow-hidden flex-grow">
              <h3 className="text-xs font-extrabold text-emerald-400 tracking-widest uppercase flex items-center gap-2 mb-6">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                📌 Major Decisions & Notes
              </h3>

              {keyNotes.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-center text-slate-500 border border-dashed border-white/5 rounded-2xl p-4">
                  <p className="text-xs">Major decisions will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
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
            <div className="glass-card rounded-[32px] p-8 shadow-2xl relative overflow-hidden flex-grow">
              <h3 className="text-xs font-extrabold text-sky-400 tracking-widest uppercase flex items-center gap-2 mb-6">
                <ClipboardList className="w-4 h-4 text-sky-400" />
                📋 Team Action Items
              </h3>

              {actionItems.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-center text-slate-500 border border-dashed border-white/5 rounded-2xl p-4">
                  <p className="text-xs">Assigned tasks will appear here.</p>
                </div>
              ) : (
                <div className="space-y-3">
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
          {/* Modal Backdrop Blur */}
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-2xl transition-all duration-300" />
          
          {/* Modal Box */}
          <div className="relative w-full max-w-2xl bg-slate-900/80 border border-white/10 rounded-[32px] shadow-2xl overflow-hidden animate-fadeIn flex flex-col max-h-[80vh]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse" />
                <h3 className="text-sm font-semibold text-slate-200">Live Transcript Session</h3>
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
                  Speak now... Transcript will stream here.
                </div>
              ) : (
                <>
                  {transcripts.map((t, idx) => (
                    <div key={idx} className="bg-white/5 border border-white/5 p-4 rounded-2xl animate-fadeIn">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">SPEAKER</span>
                      <p className="text-sm text-slate-200 font-light leading-relaxed">"{t.text}"</p>
                    </div>
                  ))}
                  {currentInterimText && (
                    <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-2xl opacity-80 animate-pulse">
                      <span className="text-[10px] font-bold text-purple-400 block mb-1">INTERIM</span>
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
                End Session
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
                Meeting Executive Summary
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
                  <span className="text-xs text-slate-400">Gemini is synthesizing transcript...</span>
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
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Social Footer */}
      <footer className="w-full flex items-center justify-center gap-6 py-8 border-t border-white/5 text-slate-600 text-xs z-10">
        <span>© 2026 Crony Meeting. All Rights Reserved.</span>
        <div className="flex items-center gap-3">
          <a href="https://github.com/halemex-bit/aimeeting" target="_blank" rel="noreferrer" className="hover:text-purple-400 transition-colors">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
