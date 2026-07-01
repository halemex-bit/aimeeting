import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings, AlertCircle, CheckCircle2, TrendingUp, Send, User, MessageSquare } from 'lucide-react';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [useSimulation, setUseSimulation] = useState(true);
  const [statusText, setStatusText] = useState('Sedia untuk mula');
  
  // Real-time parsed output state
  const [alerts, setAlerts] = useState([
    "Siapkan sebut harga vendor sebelum Jumaat."
  ]);
  const [keyNotes, setKeyNotes] = useState([
    "Bajet pemasaran diluluskan (RM 15,000)."
  ]);
  const [actionItems, setActionItems] = useState([
    { assignee: "Sarah", task: "Sediakan laporan slaid pembentangan" }
  ]);
  
  // Transcripts list
  const [transcripts, setTranscripts] = useState([
    { speaker: "Speaker 1", text: "Jadi kita setuju untuk proceed dengan cadangan kempen marketing." },
    { speaker: "Speaker 2", text: "Ya, Halem tolong check bahagian sebut harga vendor tu dulu." },
    { speaker: "Speaker 1", text: "Boleh, nanti update dalam group Telegram sebelum Jumaat." }
  ]);

  const transcriptEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioIntervalRef = useRef(null);

  // Auto scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Simulation runner
  useEffect(() => {
    let simInterval;
    if (isRecording && useSimulation) {
      const simulatedSpeakers = ["Speaker 1", "Speaker 2", "Halem", "Sarah"];
      const simulatedLines = [
        "Kita perlu pastikan kualiti audio sentiasa bersih.",
        "Halem, tolong hubungi pihak katering untuk confirm menu makan tengah hari.",
        "Untuk bajet keseluruhan, kita kekalkan pada kadar RM 15,000 sahaja.",
        "Sarah akan lead bahagian reka bentuk grafik poster.",
        "Halem ada apa-apa update berkenaan dengan tempahan dewan?",
        "Ya, dewan utama dah disahkan untuk hari Sabtu depan.",
        "Keputusan rasmi: Kita guna vendor audio alternatif jika kos melebihi bajet."
      ];

      simInterval = setInterval(() => {
        const randomSpeaker = simulatedSpeakers[Math.floor(Math.random() * simulatedSpeakers.length)];
        const randomLine = simulatedLines[Math.floor(Math.random() * simulatedLines.length)];
        
        // Add to transcript
        setTranscripts(prev => [...prev, { speaker: randomSpeaker, text: randomLine }]);

        // Send simulated trigger to proxy server to get decisions / alerts updates
        fetch('http://localhost:5000/api/process-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioData: 'simulated_chunk', mimeType: 'audio/webm' })
        })
          .then(res => res.json())
          .then(data => {
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
          })
          .catch(err => console.error("Error simulation API call:", err));

      }, 4000);
    }
    return () => clearInterval(simInterval);
  }, [isRecording, useSimulation]);

  // Actual Web Audio recording logic
  const startRecording = async () => {
    try {
      setIsRecording(true);
      setStatusText('Mendengar...');
      
      if (useSimulation) return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      let chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        chunks = [];
        
        // Convert to base64
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64Audio = reader.result.split(',')[1];
          setStatusText('Memproses audio...');
          try {
            const response = await fetch('http://localhost:5000/api/process-audio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioData: base64Audio, mimeType: 'audio/webm' })
            });
            const data = await response.json();
            
            if (data.has_significant_update) {
              if (data.direct_alerts_for_halem.length > 0) {
                setAlerts(prev => [...new Set([...prev, ...data.direct_alerts_for_halem])]);
              }
              if (data.general_key_notes.length > 0) {
                setKeyNotes(prev => [...new Set([...prev, ...data.general_key_notes])]);
              }
              if (data.general_action_items.length > 0) {
                setActionItems(prev => [...prev, ...data.general_action_items]);
              }
            }
            setStatusText('Mendengar...');
          } catch (err) {
            console.error(err);
            setStatusText('Gagal memproses audio');
          }
        };
      };

      // Record in 10 second chunks
      mediaRecorder.start();
      audioIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.start();
        }
      }, 10000);

    } catch (err) {
      console.error(err);
      setStatusText('Gagal akses mikrofon');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    setStatusText('Diberhentikan');
    clearInterval(audioIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-start max-w-7xl mx-auto">
      {/* Header */}
      <header className="w-full flex items-center justify-between mb-8 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/30">
            🤖
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white m-0 leading-none">Crony Meeting Bot</h1>
            <p className="text-xs text-slate-400 mt-1">Pembantu Mesyuarat Eksekutif Pintar</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
          <span className={`h-2.5 w-2.5 rounded-full bg-red-500 ${isRecording ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-semibold text-red-400 uppercase tracking-widest">LIVE</span>
        </div>
      </header>

      {/* Main Grid */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (Control Panel & Key Alerts) */}
        <div className="lg:col-span-5 flex flex-col gap-6 w-full">
          
          {/* Panel Kawalan */}
          <div className="glass-card rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-purple-400" />
              PANEL KAWALAN
            </h2>
            <p className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-lg p-2.5 mb-4">
              Status: <span className="font-semibold text-white">{statusText}</span>
            </p>
            <div className="flex flex-wrap gap-3">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                >
                  <Mic className="w-4 h-4" />
                  Mula Dengar
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-rose-500/20 transition-all active:scale-95"
                >
                  <MicOff className="w-4 h-4" />
                  Berhenti
                </button>
              )}
              
              <button 
                onClick={() => setUseSimulation(!useSimulation)}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                  useSimulation 
                    ? 'bg-purple-600/20 border-purple-500 text-purple-300' 
                    : 'bg-slate-800/40 border-white/10 text-slate-400'
                }`}
              >
                {useSimulation ? 'Mode: Simulasi (ON)' : 'Mode: Mikrofon Real-time'}
              </button>
            </div>
          </div>

          {/* Makluman Penting & Key Notes */}
          <div className="glass-card rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              MAKLUMAN PENTING & KEY NOTES
            </h2>

            {/* Direct Alerts for Halem */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                🔔 TUGASAN UNTUK HALEM:
              </h3>
              {alerts.length === 0 ? (
                <p className="text-sm text-slate-500 italic">Tiada tugasan baru buat masa ini.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {alerts.map((alert, idx) => (
                    <div key={idx} className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm px-3.5 py-2.5 rounded-xl font-medium">
                      - {alert}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Decisions & Notes */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                📌 KEPUTUSAN TERKINI & KEY NOTES:
              </h3>
              {keyNotes.length === 0 ? (
                <p className="text-sm text-slate-500 italic">Tiada keputusan baru dikesan.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {keyNotes.map((note, idx) => (
                    <div key={idx} className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm px-3.5 py-2.5 rounded-xl">
                      - {note}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* General Action Items */}
            <div>
              <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                📋 TUGASAN AHLI KUMPULAN:
              </h3>
              {actionItems.length === 0 ? (
                <p className="text-sm text-slate-500 italic">Tiada tindakan ditugaskan.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {actionItems.map((item, idx) => (
                    <div key={idx} className="bg-sky-500/10 border border-sky-500/20 text-sky-300 text-sm px-3.5 py-2.5 rounded-xl flex justify-between items-center">
                      <span>{item.task}</span>
                      <span className="text-xs font-semibold bg-sky-500/20 px-2 py-0.5 rounded text-sky-200">{item.assignee}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right Column (Live Transcript) */}
        <div className="lg:col-span-7 w-full flex flex-col">
          <div className="glass-card rounded-2xl p-6 shadow-xl flex flex-col h-[580px]">
            <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-400" />
              TRANSKRIPSI MASA NYATA (LIVE STREAM)
            </h2>
            
            {/* Scroller Area */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
              {transcripts.map((t, idx) => (
                <div 
                  key={idx} 
                  className={`flex flex-col p-3.5 rounded-xl transition-all duration-300 ${
                    t.speaker === 'Halem' || t.text.includes('Halem')
                      ? 'bg-rose-500/10 border border-rose-500/20'
                      : 'bg-white/5 border border-white/5 opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <User className={`w-3.5 h-3.5 ${
                      t.speaker === 'Halem' ? 'text-rose-400' : 'text-slate-400'
                    }`} />
                    <span className={`text-xs font-bold ${
                      t.speaker === 'Halem' ? 'text-rose-400' : 'text-slate-300'
                    }`}>
                      {t.speaker}
                    </span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed font-light">
                    "{t.text}"
                  </p>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
            
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
              <span>Fokus paparan transkripsi dikurangkan opacity bagi mengurangkan beban visual mata.</span>
              <span className="font-mono text-purple-400">Status: Aktif</span>
            </div>
          </div>
        </div>

      </div>

      {/* Footer / Social Icons */}
      <footer className="w-full flex items-center justify-center gap-6 mt-12 pt-6 border-t border-white/5 text-slate-500 text-xs">
        <span>© 2026 Crony Meeting. Hak Cipta Terpelihara.</span>
        <div className="flex items-center gap-3">
          <a href="#" className="hover:text-purple-400 transition-colors">GitHub</a>
          <a href="#" className="hover:text-purple-400 transition-colors">Twitter</a>
          <a href="#" className="hover:text-purple-400 transition-colors">LinkedIn</a>
        </div>
      </footer>
    </div>
  );
}
