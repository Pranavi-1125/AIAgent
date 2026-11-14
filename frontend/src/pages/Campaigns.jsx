import { useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WS_URL } from "../api";
import {
  Upload,
  Play,
  User,
  FileText,
  Activity,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function validateCSV(rows) {
  if (rows.length < 2) {
    return {
      ok: false,
      error: "CSV must contain at least one contact.",
    };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());

  const nameIdx = header.indexOf("name");
  const phoneIdx = header.indexOf("phone");
  const areaIdx = header.indexOf("area");

  if (nameIdx === -1 || phoneIdx === -1) {
    return {
      ok: false,
      error: "CSV requires columns: name, phone",
    };
  }

  const contacts = [];
  const warnings = [];

  rows.slice(1).forEach((row, index) => {
    const name = (row[nameIdx] || "").trim();
    const phone = (row[phoneIdx] || "").trim();
    const area = (row[areaIdx] || "").trim();

    if (!name || !phone) {
      warnings.push(`Row ${index + 2} skipped`);
      return;
    }

    contacts.push({
      name,
      phone,
      area,
    });
  });

  return {
    ok: true,
    contacts,
    warnings,
  };
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
        <Icon size={18} className="text-cyan-400" />
      </div>

      <div>
        <h2 className="text-white font-semibold text-lg">{title}</h2>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    idle: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    running: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    paused: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    stopped: "bg-red-500/10 text-red-400 border-red-500/20",
    completed: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  };
  console.log("STATUS =", status);
  return (
    <span
      className={`px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export default function Campaigns() {
  const [campaignName, setCampaignName] = useState("");
  const [description, setDescription] = useState("");
  const [script, setScript] = useState("");
  // const [language, setLanguage] = useState("English");
  // const [voiceType, setVoiceType] = useState("Female");

  const [contacts, setContacts] = useState([]);
  const [csvPreview, setCsvPreview] = useState([]);
  const [fileName, setFileName] = useState("");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);

const [campaignState, setCampaignState] = useState(() => {
  const saved = localStorage.getItem("campaignState");

  return saved
    ? JSON.parse(saved)
    : {
        status: "idle",
        currentContact: null,
        completed: 0,
        failed: 0,
      };
});

useEffect(() => {
  localStorage.setItem(
    "campaignState",
    JSON.stringify(campaignState)
  );
}, [campaignState]);

  const [campaignHistory, setCampaignHistory] = useState([]);
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
  const [wsStatus, setWsStatus] = useState("disconnected");

  const chatRef = useRef(null);
  const wsRef = useRef(null);

  const totalContacts = contacts.length;

  const progress = useMemo(() => {
    if (!totalContacts) return 0;

    return Math.round(
      ((campaignState.completed + campaignState.failed) / totalContacts) *
        100
    );
  }, [campaignState, totalContacts]);

  useEffect(() => {
    fetchCampaigns();

    const interval = setInterval(fetchCampaigns, 10000);

    return () => clearInterval(interval);
  }, []);

useEffect(() => {
  const connect = () => {
    const ws = new WebSocket(WS_URL);

    wsRef.current = ws;

 ws.onopen = () => {
  console.log("WS Opened");
  setWsStatus("connected");

  // 👇 SEND PAGE पहचान FIRST (IMPORTANT)
  ws.send(JSON.stringify({
    page: "campaign"
  }));

  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send("ping");
    }
  }, 30000);

  ws.pingInterval = pingInterval;
};

    ws.onclose = () => {
      console.log("WS CLOSED");
      setWsStatus("disconnected");

      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      setWsStatus("error");
    };

    ws.onmessage = (evt) => {
      console.log("WS MESSAGE", evt.data);
      try {
        const data = JSON.parse(evt.data);

        if (data.type === "transcript") {
          setMessages((m) => [
            ...m,
            {
              role: "User",
              text: data.text,
              ts: new Date(),
            },
          ]);
        }

        else if (data.type === "ai_response") {
          setMessages((m) => [
            ...m,
            {
              role: "AI",
              text: data.text,
              ts: new Date(),
            },
          ]);
        }

        else if (data.type === "status") {
          setMessages((m) => [
            ...m,
            {
              role: "System",
              text: data.message,
              ts: new Date(),
            },
          ]);
        }

        else if (data.type === "campaign_update") {

          console.log("CAMPAIGN UPDATE RECEIVED:", data);

          setCampaignState(prev => ({
            ...prev,
            status: data.status ?? prev.status,
            completed: data.completed ?? prev.completed,
            failed: data.failed ?? prev.failed,
            currentContact:
              data.currentContact !== undefined
                ? data.currentContact
                : prev.currentContact,
          }));
        }

      } catch (err) {
        console.log(err);
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
  if (chatRef.current) {
    chatRef.current.scrollTop =
      chatRef.current.scrollHeight;
  }
}, [messages]);

async function fetchCampaigns() {
  try {
    const token = localStorage.getItem("token");

    const res = await fetch(`${API}/campaigns`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    console.log("Campaign API returned:", data);

    setCampaignHistory(Array.isArray(data) ? data : []);
  } catch (err) {
    console.log(err);
  }
}

  function handleFile(e) {
    const file = e.target.files[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Only CSV files are allowed");
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target.result;

      const rows = text
        .split("\n")
        .map((line) => line.replace(/\r/g, "").split(","))
        .filter((row) => row.some((cell) => cell.trim() !== ""));

      const result = validateCSV(rows);

      setCsvPreview(rows.slice(0, 6));

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setContacts(result.contacts);

      if (result.warnings?.length) {
        toast(`${result.warnings.length} invalid rows skipped`, {
          icon: "⚠️",
        });
      }

      toast.success(`${result.contacts.length} contacts loaded`);
    };

    reader.readAsText(file);
  }

  async function handleStart() {
    if (!campaignName.trim()) {
      toast.error("Campaign name required");
      return;
    }

    if (!description.trim()) {
      toast.error("Description required");
      return;
    }

    if (!script.trim()) {
      toast.error("Agent script required");
      return;
    }

    if (!contacts.length) {
      toast.error("Upload contacts CSV first");
      return;
    }

    setLoading(true);

    try {
      const csvContent =
        "name,phone,area\n" +
        contacts
          .map((c) => `${c.name},${c.phone},${c.area || ""}`)
          .join("\n");

      const formData = new FormData();

      formData.append("campaign_name", campaignName);
      formData.append("description", description);
      formData.append("script", script);
      // formData.append("language", language);
      // formData.append("voice_type", voiceType);

      formData.append(
        "file",
        new Blob([csvContent], { type: "text/csv" }),
        fileName || "contacts.csv"
      );

      const token = localStorage.getItem("token");

// STEP 1 - Create Campaign

const createRes = await fetch(`${API}/campaigns/`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    name: campaignName,
    script_text: script,
    // language: language,
    created_by: "Pranavi",
  }),
});

if (!createRes.ok) {
  throw new Error(
    `Campaign Creation Failed: ${await createRes.text()}`
  );
}

const campaign = await createRes.json();

console.log("Campaign Created:", campaign);

const campaignId = campaign.id;


// STEP 2 - Upload CSV

const uploadForm = new FormData();

uploadForm.append(
  "file",
  new Blob([csvContent], { type: "text/csv" }),
  fileName || "contacts.csv"
);

const uploadRes = await fetch(
  `${API}/campaigns/${campaignId}/upload-voters`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: uploadForm,
  }
);

if (!uploadRes.ok) {
  throw new Error(
    `CSV Upload Failed: ${await uploadRes.text()}`
  );
}

const uploadData = await uploadRes.json();

console.log("Upload:", uploadData);


// STEP 3 - Start Calls

const startRes = await fetch(
  `${API}/calls/start/${campaignId}`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
);

if (!startRes.ok) {
  throw new Error(
    `Call Start Failed: ${await startRes.text()}`
  );
}

const startData = await startRes.json();

console.log("Start:", startData);

toast.success("Campaign started");

fetchCampaigns();
} catch (err) {
  console.error("Campaign Error:", err);

  toast.error(
    err.message || "Failed to start campaign"
  );
} finally {
  setLoading(false);
}
  }

  async function handlePause() {
    try {
      await fetch(`${API}/campaign/pause`, {
        method: "POST",
      });

      setCampaignState((prev) => ({
        ...prev,
        status: "paused",
      }));

      toast("Campaign paused", {
        icon: "⏸️",
      });
    } catch (err) {
      toast.error("Failed to pause campaign");
    }
  }

  async function handleResume() {
    try {
      await fetch(`${API}/campaign/resume`, {
        method: "POST",
      });

      setCampaignState((prev) => ({
        ...prev,
        status: "running",
      }));

      toast.success("Campaign resumed");
    } catch (err) {
      toast.error("Failed to resume campaign");
    }
  }

  async function handleStop() {
    try {
      await fetch(`${API}/campaign/stop`, {
        method: "POST",
      });

      setCampaignState((prev) => ({
        ...prev,
        status: "stopped",
      }));

      toast.error("Campaign stopped");
    } catch (err) {
      toast.error("Failed to stop campaign");
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Campaign Control Center
          </h1>

          <p className="text-slate-500 text-sm mt-1">
            Upload contacts, run AI calls, monitor conversations.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-6">

          {/* Create campaign */}
          <div className="grid xl:grid-cols-[1.3fr_0.7fr] gap-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#0d1520] border border-white/[0.07] rounded-3xl p-6"
          >
            <SectionTitle
              icon={FileText}
              title="Create Campaign"
              subtitle="Configure your AI calling workflow"
            />

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-2 block uppercase tracking-wide">
                  Campaign Name
                </label>

                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Voter Outreach 2026"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 text-white outline-none focus:border-cyan-500/40"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-2 block uppercase tracking-wide">
                  Description
                </label>

                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Purpose of this campaign"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 text-white outline-none resize-none focus:border-cyan-500/40"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-2 block uppercase tracking-wide">
                  AI Agent Script
                </label>

                <textarea
                  rows={8}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Hello, may I speak with [Contact Name]?"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 text-white outline-none resize-none font-mono focus:border-cyan-500/40"
                />

                <p className="text-xs text-slate-500 mt-2">
                  Use [Contact Name] placeholder to personalize calls.
                </p>
              </div>
            </div>
          </motion.div>

{/* Live Campaign status */}

 <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#0d1520] border border-cyan-500/20 rounded-3xl p-6"
          >
            <SectionTitle
              icon={Activity}
              title="Live Campaign Status"
              subtitle="Real operational state from backend"
            />

            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Progress</span>
                  <span className="text-sm text-white font-semibold">
                    {progress}%
                  </span>
                </div>

                <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white/[0.03] p-4 border border-white/[0.05]">
                  <p className="text-slate-500 text-xs uppercase tracking-wide">
                    Completed
                  </p>

                  <p className="text-3xl font-bold text-emerald-400 mt-2">
                    {campaignState.completed}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/[0.03] p-4 border border-white/[0.05]">
                  <p className="text-slate-500 text-xs uppercase tracking-wide">
                    Failed
                  </p>

                  <p className="text-3xl font-bold text-red-400 mt-2">
                    {campaignState.failed}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-cyan-500/5 border border-cyan-500/10 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <User size={16} className="text-cyan-400" />

                  <h3 className="text-white font-semibold">
                    Current Contact
                  </h3>
                </div>

                {campaignState.currentContact ? (
                  <div className="space-y-2 text-sm">
                    <p className="text-white">
                      {campaignState.currentContact.name}
                    </p>

                    <p className="text-slate-400">
                      {campaignState.currentContact.phone}
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">
                    No active call currently.
                  </p>
                )}
              </div>

              <div className="flex justify-center gap-4 mt-4">

                {campaignState.status === "running" ? (
                <button
                  onClick={handlePause}
                  className="px-6 py-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all font-semibold"
                >
                  ⏸ Pause
                </button>
                ) : (
                  <button
                    onClick={handleResume}
                    className="px-6 py-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all font-semibold"
                  >
                    ▶ Resume
                  </button>
                )}

                <button
                  onClick={handleStop}
                  className="px-6 py-3 rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all font-semibold"
                >
                  ■ Stop
                </button>
              </div>
            </div>
          </motion.div>
          {/* Campaign History */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#0d1520] border border-white/[0.07] rounded-3xl p-6"
          >
           <div className="flex items-center justify-between mb-5">
            <SectionTitle
              icon={CheckCircle2}
              title="Campaign History"
              subtitle="Latest campaign"
            />

            <button
              onClick={() => navigate("/campaign-history")}
              className="p-2 rounded-xl border border-white/10 hover:bg-white/5"
            >
              <ArrowUpRight
                size={18}
                className={`text-cyan-400 transition-transform ${showAllCampaigns ? "rotate-180" : ""}`}
              />
            </button>
          </div>

            {campaignHistory.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">
                No campaigns found yet.
              </div>
            ) : (
              <div className="space-y-3">
                {(showAllCampaigns ? campaignHistory : campaignHistory.slice(0, 1)).map((campaign) => (
                  <div
                    key={campaign.id}
                    className="rounded-2xl border border-white/[0.05] bg-white/[0.03] p-4"
                  >
                    <div className="flex items-start justify-between mb-3 gap-3">
                      <div>
                        <h3 className="text-white font-medium">
                          {campaign.name}
                        </h3>

                        <p className="text-slate-500 text-xs mt-1">
                          {campaign.date}
                        </p>
                      </div>

                      <StatusBadge status={campaign.status} />
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <p className="text-slate-500 text-xs uppercase">
                          Total
                        </p>

                        <p className="text-white font-semibold mt-1">
                          {campaign.total ?? "-"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <p className="text-slate-500 text-xs uppercase">
                          Completed
                        </p>

                        <p className="text-emerald-400 font-semibold mt-1">
                          {campaign.completed ?? "-"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <p className="text-slate-500 text-xs uppercase">
                          Failed
                        </p>

                        <p className="text-red-400 font-semibold mt-1">
                          {campaign.failed ?? "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
          </div>
 </div>
{/* Upload Contacts */}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#0d1520] border border-white/[0.07] rounded-3xl p-6"
          >
            <SectionTitle
              icon={Upload}
              title="Upload Contacts"
              subtitle="CSV requires: name, phone"
            />

            <label className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-white/10 hover:border-cyan-500/30 transition-all p-10 cursor-pointer bg-white/[0.02]">
              <Upload size={36} className="text-cyan-400 mb-4" />

              <p className="text-white font-semibold text-sm">
                {fileName || "Upload CSV file"}
              </p>

              <p className="text-slate-500 text-xs mt-2">
                {contacts.length
                  ? `${contacts.length} contacts validated and ready`
                  : "Upload and validate voter/contact data"}
              </p>

              {contacts.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mt-6 w-full">
                  <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-left">
                    <p className="text-emerald-400 text-xs uppercase tracking-wide">
                      Contacts
                    </p>
                    <p className="text-2xl font-bold text-white mt-2">
                      {contacts.length}
                    </p>
                  </div>
                </div>
              )}

              <input
                type="file"
                accept=".csv"
                onChange={handleFile}
                className="hidden"
              />
            </label>

            {csvPreview.length > 0 && (
              <div className="mt-6 overflow-auto rounded-2xl border border-white/[0.06]">
                <table className="w-full text-sm">
                  <tbody>
                    {csvPreview.map((row, ri) => (
                      <tr
                        key={ri}
                        className={`border-b border-white/[0.05] ${
                          ri === 0
                            ? "bg-cyan-500/5 text-cyan-400 font-semibold"
                            : "text-slate-300"
                        }`}
                      >
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-4 py-3 whitespace-nowrap">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <div className="pt-4">
              <button
                onClick={handleStart}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 bg-gradient-to-r from-cyan-400 to-violet-500 text-black font-bold hover:scale-[1.01] transition-all disabled:opacity-50"
              >
                <Play size={18} />
                {loading ? "Starting Campaign..." : "Start Campaign"}
              </button>
            </div>
          </motion.div>


       {/* Live Conversation */}    
        <motion.div
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.1 }}
  className="bg-[#0d1520] border border-white/[0.07] rounded-3xl p-6"
>
  <div className="flex items-center justify-between mb-5">
    <div>
      <h2 className="text-2xl font-bold text-white">
        Live Conversation
      </h2>

      <p className="text-slate-400 text-sm mt-1">
        Real-time AI interaction transcript
      </p>
    </div>

    <button
      onClick={() => setMessages([])}
      className="text-xs text-slate-500 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 transition-all"
    >
      Clear
    </button>
  </div>

  <div
    ref={chatRef}
    className="space-y-4 max-h-[420px] overflow-y-auto pr-2"
  >
    {messages.length === 0 ? (
      <p className="text-slate-500 text-sm text-center py-12">
        Waiting for live events...
        (WebSocket {wsStatus})
      </p>
    ) : (
      <AnimatePresence>
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`flex ${
              msg.role === "AI" ||
              msg.role === "System"
                ? "justify-start"
                : "justify-end"
            }`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 border ${
                msg.role === "AI"
                  ? "bg-[#00d4ff]/10 border-[#00d4ff]/20 text-cyan-100"
                  : msg.role === "System"
                  ? "bg-white/[0.03] border-white/[0.08] text-slate-400"
                  : "bg-violet-500/10 border-violet-500/20 text-violet-100"
              }`}
            >
              <p className="text-xs font-bold mb-1 opacity-70">
                {msg.role}
              </p>

              <p className="text-sm leading-relaxed">
                {msg.text}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    )}
  </div>
</motion.div>
       
        
        </div>
      </div>
    </div>
  );
}