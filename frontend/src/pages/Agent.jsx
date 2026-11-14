import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, Bot, AudioWaveform, PhoneCall,   ArrowUpRight, 
  // PhoneOff, Play, Pause, Volume2,
} from "lucide-react";
import StatCard from "../components/StatCard";
import { api, WS_URL } from "../api";

const fmt = n => Intl.NumberFormat().format(n);

export default function Agent() {
  // const [live,      setLive]      = useState(false);
  // const [recording, setRecording] = useState(false);
  // const [volume,    setVolume]    = useState(78);
  // const [messages,  setMessages]  = useState([]);

  const [messages, setMessages] = useState(() => {
  const saved = localStorage.getItem("campaign_messages");
  return saved ? JSON.parse(saved) : [];
});

useEffect(() => {
  localStorage.setItem(
    "campaign_messages",
    JSON.stringify(messages)
  );
}, [messages]);

  const [wsStatus,  setWsStatus]  = useState("disconnected");
  const [lastSent, setLastSent] = useState(() => {
  return localStorage.getItem("lastSent") || null;
});

const [lastResp, setLastResp] = useState(() => {
  const saved = localStorage.getItem("lastResp");
  return saved ? JSON.parse(saved) : null;
});

useEffect(() => {
  if (lastSent) {
    localStorage.setItem("lastSent", lastSent);
  }
}, [lastSent]);

useEffect(() => {
  if (lastResp) {
    localStorage.setItem(
      "lastResp",
      JSON.stringify(lastResp)
    );
  }
}, [lastResp]);

  const [stats,     setStats]     = useState(null);

  const chatRef = useRef(null);
  const wsRef   = useRef(null);

  // Load real stats
  useEffect(() => {
    api.dashboardStats().then(setStats).catch(() => {});
  }, []);

  // WebSocket connection
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen  = () => {
        console.log("WS OPEN");
        setWsStatus("connected");
        const pingInterval = setInterval(() => {if (ws.readyState === WebSocket.OPEN) {ws.send("ping");}}, 30000);
        ws.pingInterval = pingInterval;
        ws.send(JSON.stringify({
  type: "subscribe",
  page: "agent"
}))
      };
      ws.onclose = () => {
        console.log("WS CLOSED");
        setWsStatus("disconnected");
        setTimeout(connect, 3000); // auto-reconnect
      };
      ws.onerror = () => setWsStatus("error");

      ws.onmessage = (evt) => {
        console.log("WS MESSAGE", evt.data);
        try {
          const data = JSON.parse(evt.data);
          if (data.type === "transcript") {
            setLastSent(data.text);
            setMessages(m => [...m, { role: "User", text: data.text, ts: new Date() }]);
          } else if (data.type === "ai_response") {
            setLastResp({ text: data.text, sentiment: data.sentiment, issue: data.issue });
            setMessages(m => [...m, { role: "AI", text: data.text, sentiment: data.sentiment, ts: new Date() }]);
          } else if (data.type === "status") {
            setMessages(m => [...m, { role: "System", text: data.message, ts: new Date() }]);
          }
        } catch (error) {
          console.error(error);
        }
      };
    };
    connect();
    return () => {
  clearInterval(wsRef.current?.pingInterval);
  wsRef.current?.close();
};
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const sentimentColor = s => s === "Supporter" ? "#10b981" : s === "Opposed" ? "#ef4444" : "#f59e0b";

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white">AI Voice Agent</h1>
          <p className="text-slate-400 mt-1">Real-time AI election campaign system</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${wsStatus === "connected" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === "connected" ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`}/>
            {wsStatus === "connected" ? "WS Connected" : "WS Disconnected"}
          </div>
          <button className="px-5 py-3 rounded-xl bg-[#00d4ff] text-black font-semibold hover:scale-105 transition-all flex items-center gap-2">
            Launch Agent <ArrowUpRight size={18}/>
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard title="Total Calls"   value={stats ? fmt(stats.total_calls)   : "…"} sub="From database"        accent="#00d4ff" icon={<PhoneCall className="text-[#00d4ff]"/>}/>
        <StatCard title="Answered"      value={stats ? fmt(stats.answered_calls) : "…"} sub={stats?.connect_rate || "0%"} accent="#10b981" icon={<Bot className="text-emerald-400"/>}/>
        <StatCard title="Voice Quality" value="HD"                                       sub="Natural voice"       accent="#7c3aed" icon={<AudioWaveform className="text-violet-400"/>}/>
        <StatCard title="Avg Duration"  value={stats?.avg_duration || "…"}               sub="Per completed call"  accent="#f59e0b" icon={<Mic className="text-amber-400"/>}/>
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT PANEL */}
        <div className="xl:col-span-2 bg-[#0d1520] border border-white/[0.08] rounded-3xl p-6">
          
              {/* LIVE CHAT */}
      <div className="bg-[#0d1520] border border-white/[0.08] rounded-3xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-2xl font-bold text-white">Live Conversation</h2>
            <p className="text-slate-400 text-sm mt-1">Real-time AI interaction transcript via WebSocket</p>
          </div>
          <button onClick={() => setMessages([])} className="text-xs text-slate-500 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 transition-all">Clear</button>
        </div>

        <div ref={chatRef} className="space-y-4 max-h-[420px] overflow-y-auto pr-2">
          {messages.length === 0
            ? <p className="text-slate-500 text-sm text-center py-12">Waiting for live events… (WebSocket {wsStatus})</p>
            : <AnimatePresence>
                {messages.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`flex ${msg.role === "AI" || msg.role === "System" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 border ${
                      msg.role === "AI"     ? "bg-[#00d4ff]/10 border-[#00d4ff]/20 text-cyan-100" :
                      msg.role === "System" ? "bg-white/[0.03] border-white/[0.08] text-slate-400" :
                                             "bg-violet-500/10 border-violet-500/20 text-violet-100"
                    }`}>
                      <p className="text-xs font-bold mb-1 opacity-70">{msg.role}</p>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
          }
        </div>
      </div>






        </div>

        {/* RIGHT PANEL — Live Groq results */}
        <div className="bg-[#0d1520] border border-white/[0.08] rounded-3xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-white">Live Speech Recognition</h2>
              <p className="text-sm text-slate-400 mt-1">Real-time voice to text conversion</p>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${wsStatus === "connected" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/[0.04] border-white/10"}`}>
              <span className={`w-2 h-2 rounded-full ${wsStatus === "connected" ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`}/>
              <span className={`text-xs font-semibold ${wsStatus === "connected" ? "text-emerald-400" : "text-slate-400"}`}>{wsStatus === "connected" ? "Listening" : "Idle"}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-xs text-[#00d4ff] font-semibold mb-2">USER SPEECH</p>
              <p className="text-sm text-slate-200 leading-relaxed">
                {lastSent || <span className="text-slate-500 italic">Waiting for audio…</span>}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20">
              <p className="text-xs text-violet-300 font-semibold mb-2">AI RESPONSE (Groq)</p>
              <p className="text-sm text-violet-100 leading-relaxed">
                {lastResp?.text || <span className="text-slate-500 italic">Awaiting response…</span>}
              </p>
            </div>

            {lastResp && (
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                  <p className="text-xs text-slate-500 mb-1">Sentiment</p>
                  <p className="text-lg font-bold" style={{ color: sentimentColor(lastResp.sentiment) }}>{lastResp.sentiment}</p>
                </div>
                <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
                  <p className="text-xs text-slate-500 mb-1">Issue</p>
                  <p className="text-lg font-bold text-amber-400">{lastResp.issue || "—"}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

  


    </div>
  );
}
