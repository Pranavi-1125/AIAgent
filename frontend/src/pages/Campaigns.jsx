import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Upload,
  Play,
  Pause,
  Square,
  Phone,
  User,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";

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
  const [language, setLanguage] = useState("English");
  const [voiceType, setVoiceType] = useState("Female");

  const [contacts, setContacts] = useState([]);
  const [csvPreview, setCsvPreview] = useState([]);
  const [fileName, setFileName] = useState("");

  const [loading, setLoading] = useState(false);

  const [campaignState, setCampaignState] = useState({
    status: "idle",
    currentContact: null,
    completed: 0,
    failed: 0,
    transcript: "",
    sentiment: "",
  });

  const [campaignHistory, setCampaignHistory] = useState([]);

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

  async function fetchCampaigns() {
    try {
      const res = await fetch(`${API}/campaigns`);
      const data = await res.json();
      setCampaignHistory(data || []);
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
      formData.append("language", language);
      formData.append("voice_type", voiceType);

      formData.append(
        "file",
        new Blob([csvContent], { type: "text/csv" }),
        fileName || "contacts.csv"
      );

      const response = await fetch(`${API}/campaign/start`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();

      setCampaignState((prev) => ({
        ...prev,
        status: "running",
      }));

      toast.success(
        `Campaign started with ${data.total_contacts} contacts`
      );

      fetchCampaigns();
    } catch (err) {
      toast.error(err.message || "Failed to start campaign");
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

        <StatusBadge status={campaignState.status} />
      </div>

      <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="space-y-6">
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
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-2 block uppercase tracking-wide">
                    Language
                  </label>

                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 text-white outline-none focus:border-cyan-500/40"
                  >
                    <option className="bg-[#0d1520]" value="English">English</option>
                    <option className="bg-[#0d1520]" value="Hindi">Hindi</option>
                    <option className="bg-[#0d1520]" value="Telugu">Telugu</option>
                    <option className="bg-[#0d1520]" value="Tamil">Tamil</option>
                    <option className="bg-[#0d1520]" value="Malayalam">Malayalam</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-2 block uppercase tracking-wide">
                    Voice Type
                  </label>

                  <select
                    value={voiceType}
                    onChange={(e) => setVoiceType(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 text-white outline-none focus:border-cyan-500/40"
                  >
                    <option className="bg-[#0d1520]" value="Female">Female Voice</option>
                    <option className="bg-[#0d1520]" value="Male">Male Voice</option>
                    <option className="bg-[#0d1520]" value="Natural">Natural AI Voice</option>
                  </select>
                </div>
              </div>
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
        </div>

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

              <div className="flex gap-3">
                <button
                  onClick={handleStart}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl py-3 bg-gradient-to-r from-cyan-400 to-violet-500 text-black font-bold hover:scale-[1.02] transition-all disabled:opacity-50"
                >
                  <Play size={16} />
                  {loading ? "Starting..." : "Start Campaign"}
                </button>

                {campaignState.status === "running" ? (
                  <button
                    onClick={handlePause}
                    className="px-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all"
                  >
                    <Pause size={18} />
                  </button>
                ) : (
                  <button
                    onClick={handleResume}
                    className="px-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all"
                  >
                    <Play size={18} />
                  </button>
                )}

                <button
                  onClick={handleStop}
                  className="px-5 rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                >
                  <Square size={18} />
                </button>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#0d1520] border border-white/[0.07] rounded-3xl p-6"
          >
            <SectionTitle
              icon={Phone}
              title="Live Transcript Feed"
              subtitle="Realtime AI conversation logs"
            />

            <div className="space-y-4 max-h-[320px] overflow-auto pr-1">
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.05] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-white font-medium text-sm">
                      Demo Transcript
                    </p>

                    <p className="text-slate-500 text-xs mt-1">
                      Waiting for backend websocket events...
                    </p>
                  </div>

                  <StatusBadge status={campaignState.status} />
                </div>

                <div className="space-y-3 text-sm">
                  <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-3">
                    <p className="text-cyan-400 text-xs mb-1">AI AGENT</p>

                    <p className="text-slate-300">
                      Hello, may I speak with Ravi Kumar?
                    </p>
                  </div>

                  <div className="bg-white/[0.03] rounded-xl p-3">
                    <p className="text-emerald-400 text-xs mb-1">CONTACT</p>

                    <p className="text-slate-300">
                      Yes, speaking. What is this regarding?
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#0d1520] border border-white/[0.07] rounded-3xl p-6"
          >
            <SectionTitle
              icon={CheckCircle2}
              title="Campaign History"
              subtitle="Previously executed campaigns"
            />

            {campaignHistory.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">
                No campaigns found yet.
              </div>
            ) : (
              <div className="space-y-3">
                {campaignHistory.map((campaign) => (
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
                          {campaign.total}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <p className="text-slate-500 text-xs uppercase">
                          Completed
                        </p>

                        <p className="text-emerald-400 font-semibold mt-1">
                          {campaign.completed}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <p className="text-slate-500 text-xs uppercase">
                          Failed
                        </p>

                        <p className="text-red-400 font-semibold mt-1">
                          {campaign.failed || 0}
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
    </div>
  );
}




// import { useState, useEffect } from "react";
// import { motion } from "framer-motion";
// import { toast } from "react-hot-toast";
// import { Upload, Play, Pause, Square, RotateCcw } from "lucide-react";
// import { InputField } from "../components/StatCard";
// import { api } from "../api";

// const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// // ── CSV Validation ──────────────────────────────────────────
// function validateCSV(rows) {
//   if (rows.length < 2) return { ok: false, error: "CSV must have a header row + at least 1 data row." };
//   const header = rows[0].map(h => h.trim().toLowerCase());
//   const nameIdx  = header.indexOf("name");
//   const phoneIdx = header.indexOf("phone");
//   if (nameIdx === -1 || phoneIdx === -1)
//     return { ok: false, error: `Missing required columns.\nFound: ${rows[0].join(", ")}\nRequired: name, phone` };

//   const contacts = [];
//   const errors   = [];
//   rows.slice(1).forEach((row, i) => {
//     const name  = (row[nameIdx]  || "").trim();
//     const phone = (row[phoneIdx] || "").trim();
//     if (!name || !phone) { errors.push(`Row ${i + 2}: missing name or phone`); return; }
//     contacts.push({ name, phone, area: (row[header.indexOf("area")] || "").trim() });
//   });

//   if (!contacts.length) return { ok: false, error: errors.join("\n") || "No valid contacts found." };
//   return { ok: true, contacts, warnings: errors };
// }

// export default function Campaigns() {
//   const [name,        setName]        = useState("");
//   const [description, setDescription] = useState("");
//   const [script,      setScript]      = useState("");
//   const [fileName,    setFileName]    = useState("");
//   const [csvContacts, setCsvContacts] = useState([]);
//   const [csvRaw,      setCsvRaw]      = useState([]);
//   const [csvError,    setCsvError]    = useState("");
//   const [running,     setRunning]     = useState(false);
//   const [loading,     setLoading]     = useState(false);
//   const [campaigns,   setCampaigns]   = useState([]);

//   useEffect(() => {
//     api.campaigns().then(setCampaigns).catch(() => {});
//     const t = setInterval(() => api.campaigns().then(setCampaigns).catch(() => {}), 10000);
//     return () => clearInterval(t);
//   }, []);

//   // ── API Calls ─────────────────────────────────────────────
//   const handleStart = async () => {
//     if (!name.trim())        { toast.error("Campaign name is required"); return; }
//     if (!description.trim()) { toast.error("Description is required");   return; }
//     if (!script.trim())      { toast.error("Agent script is required");  return; }
//     if (!csvContacts.length) { toast.error("Please upload a valid CSV"); return; }

//     setLoading(true);
//     try {
//       // Re-build FormData with the original file blob
//       const fd = new FormData();
//       fd.append("campaign_name", name);
//       fd.append("description",   description);
//       fd.append("script",        script);
//       // Rebuild CSV from validated contacts for the backend
//       const csvContent = "name,phone,area\n" + csvContacts.map(c => `${c.name},${c.phone},${c.area}`).join("\n");
//       fd.append("file", new Blob([csvContent], { type: "text/csv" }), fileName || "contacts.csv");

//       const r = await fetch(`${API}/campaign/start`, { method: "POST", body: fd });
//       if (!r.ok) throw new Error(await r.text());
//       const d = await r.json();
//       setRunning(true);
//       toast.success(`Campaign started with ${d.total_contacts} contacts!`);
//     } catch (e) {
//       toast.error(`Failed to start campaign: ${e.message}`);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleStop = async () => {
//     await fetch(`${API}/campaign/stop`, { method: "POST" });
//     setRunning(false);
//     toast.error("Campaign stopped.");
//   };

//   const handlePause = async () => {
//     await fetch(`${API}/campaign/pause`, { method: "POST" });
//     setRunning(false);
//     toast("Campaign paused.", { icon: "⏸" });
//   };

//   const handleResume = async () => {
//     await fetch(`${API}/campaign/resume`, { method: "POST" });
//     setRunning(true);
//     toast.success("Campaign resumed!");
//   };

//   // ── CSV File ──────────────────────────────────────────────
//   const handleFile = (e) => {
//     const file = e.target.files[0];
//     if (!file) return;
//     if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("Only .csv files are accepted."); return; }
//     setFileName(file.name);
//     setCsvError("");
//     setCsvContacts([]);
//     setCsvRaw([]);

//     const reader = new FileReader();
//     reader.onload = (ev) => {
//       const text = ev.target.result;
//       const rows = text.split("\n").map(l => l.replace(/\r/g, "").split(",")).filter(r => r.some(c => c.trim() !== ""));
//       const result = validateCSV(rows);
//       setCsvRaw(rows.slice(0, 7));
//       if (!result.ok) {
//         setCsvError(result.error);
//         toast.error("CSV has errors — check the preview below.");
//       } else {
//         setCsvContacts(result.contacts);
//         if (result.warnings?.length) toast(`${result.warnings.length} row(s) skipped.`, { icon: "⚠️" });
//         toast.success(`CSV loaded — ${result.contacts.length} valid contacts found!`);
//       }
//     };
//     reader.readAsText(file);
//   };

//   // ── Render ────────────────────────────────────────────────
//   return (
//     <div className="space-y-6">
//       <div className="flex items-center justify-between">
//         <div>
//           <h1 className="text-2xl font-bold text-white">Campaigns</h1>
//           <p className="text-sm text-slate-500 mt-0.5">Create & manage outreach campaigns</p>
//         </div>
//       </div>

//       <div className="grid lg:grid-cols-2 gap-6">
//         {/* ── CREATE FORM ── */}
//         <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6 space-y-4">
//           <h2 className="text-lg font-semibold text-white">Create Campaign</h2>
//           <InputField label="Campaign Name *" value={name} onChange={setName} placeholder="e.g. Voter Awareness Drive 2026" />
//           <div>
//             <label className="text-[10px] tracking-widest text-slate-500 uppercase font-semibold block mb-1.5">Description *</label>
//             <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
//               placeholder="What is the purpose of this campaign?"
//               className="w-full bg-white/[0.04] border border-white/[0.08] px-4 py-3 rounded-xl outline-none text-sm text-white placeholder-slate-600 focus:border-[#00d4ff]/40 transition-colors resize-none" />
//           </div>
//           <div>
//             <label className="text-[10px] tracking-widest text-slate-500 uppercase font-semibold block mb-1.5">Agent Script *</label>
//             <textarea rows={5} value={script} onChange={e => setScript(e.target.value)}
//               placeholder={"Hello, may I speak with [Contact Name]?\n\nI am calling regarding the upcoming elections..."}
//               className="w-full bg-white/[0.04] border border-white/[0.08] px-4 py-3 rounded-xl outline-none text-sm text-white placeholder-slate-600 focus:border-[#00d4ff]/40 transition-colors resize-none font-mono" />
//             <p className="text-[10px] text-slate-600 mt-1">Tip: Use <code className="text-[#00d4ff]">[Contact Name]</code> — the agent substitutes the actual name.</p>
//           </div>
//           <div>
//             <label className="text-[10px] tracking-widest text-slate-500 uppercase font-semibold block mb-1.5">Contact List (CSV) *</label>
//             <div className="mb-2 px-3 py-2 rounded-lg bg-[#00d4ff]/5 border border-[#00d4ff]/10 text-[10px] text-slate-400">
//               <span className="text-[#00d4ff] font-semibold">Required CSV columns:</span>{" "}
//               <code>name, phone</code> — optional: <code>area</code><br />
//               Example row: <code>Ravi Kumar, +91 9876543210, Hyderabad</code>
//             </div>
//             <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all
//               ${csvError ? "border-red-500/40 bg-red-500/5" : csvContacts.length ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/[0.1] hover:border-[#00d4ff]/30 hover:bg-white/[0.02]"}`}>
//               <Upload size={28} className={`mb-3 ${csvError ? "text-red-400" : csvContacts.length ? "text-emerald-400" : "text-[#00d4ff]"}`} />
//               <p className="text-sm font-semibold text-white">{fileName ? fileName : "Click to upload CSV"}</p>
//               <p className={`text-xs mt-1 ${csvError ? "text-red-400" : csvContacts.length ? "text-emerald-400" : "text-slate-500"}`}>
//                 {csvContacts.length ? `✓ ${csvContacts.length} valid contacts loaded` : fileName ? "Processing…" : "Accepts .csv files only"}
//               </p>
//               <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
//             </label>
//             {csvError && (
//               <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 whitespace-pre-line">⚠️ {csvError}</div>
//             )}
//           </div>
//           <div className="flex gap-3 pt-2">
//             <button onClick={handleStart} disabled={loading}
//               className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#00d4ff] to-violet-500 text-black font-bold text-sm hover:scale-[1.02] hover:shadow-lg hover:shadow-[#00d4ff]/20 transition-all disabled:opacity-60">
//               <Play size={14} /> {loading ? "Starting…" : "Start Campaign"}
//             </button>
//             <button onClick={handleStop}
//               className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-semibold text-sm hover:bg-red-500/20 transition-all">
//               <Square size={13} /> Stop
//             </button>
//           </div>
//         </div>

//         {/* ── RIGHT PANEL ── */}
//         <div className="space-y-5">
//           {/* Active Campaign */}
//           <div className="bg-[#0d1520] border border-[#00d4ff]/20 rounded-2xl p-5">
//             <div className="flex items-start justify-between mb-3">
//               <div>
//                 <div className="flex items-center gap-2 mb-1">
//                   <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
//                   <h2 className="text-base font-semibold text-white">Active Campaign</h2>
//                   <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${running ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
//                     {running ? "RUNNING" : "PAUSED"}
//                   </span>
//                 </div>
//                 <p className="text-sm text-slate-300">Election Awareness Drive</p>
//                 <p className="text-xs text-slate-500 mt-0.5">Started: May 10, 2026</p>
//               </div>
//               {running
//                 ? <button onClick={handlePause} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-all"><Pause size={12} /> Pause</button>
//                 : <button onClick={handleResume} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-all"><RotateCcw size={12} /> Resume</button>
//               }
//             </div>
//             <div className="h-2 rounded-full bg-white/[0.06] mb-1.5">
//               <div className="h-2 rounded-full bg-gradient-to-r from-[#00d4ff] to-violet-500" style={{ width: "78%" }} />
//             </div>
//             <div className="flex justify-between text-xs text-slate-500"><span>9,840 / 12,540 contacts</span><span>78%</span></div>
//             <div className="grid grid-cols-3 gap-3 mt-3">
//               {[{ l: "Completed", v: "7,200", c: "#10b981" }, { l: "No Answer", v: "1,840", c: "#f59e0b" }, { l: "Remaining", v: "2,700", c: "#00d4ff" }].map(s => (
//                 <div key={s.l} className="text-center p-2 rounded-xl bg-white/[0.03]">
//                   <p className="text-base font-bold" style={{ color: s.c }}>{s.v}</p>
//                   <p className="text-[10px] text-slate-500 mt-0.5">{s.l}</p>
//                 </div>
//               ))}
//             </div>
//           </div>

//           {/* Campaign Status */}
//           <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-5">
//             <h2 className="text-base font-semibold text-white mb-4">All Campaign Status</h2>
//             <div className="grid grid-cols-3 gap-3">
//               {[{ l: "Running", v: 12, c: "#10b981", bg: "bg-emerald-500/10" }, { l: "Paused", v: 4, c: "#f59e0b", bg: "bg-amber-500/10" }, { l: "Done", v: 6, c: "#00d4ff", bg: "bg-cyan-500/10" }].map(s => (
//                 <div key={s.l} className={`${s.bg} p-4 rounded-xl text-center`}>
//                   <p className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</p>
//                   <p className="text-xs text-slate-400 mt-0.5">{s.l}</p>
//                 </div>
//               ))}
//             </div>
//           </div>

//           {/* Past Campaigns */}
//           <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-5">
//             <h2 className="text-base font-semibold text-white mb-4">All Campaigns</h2>
//             {campaigns.length === 0
//               ? <p className="text-xs text-slate-500 text-center py-4">No campaigns yet</p>
//               : <div className="space-y-3">
//                   {campaigns.map((c, i) => {
//                     const pct = c.total > 0 ? Math.round(c.completed / c.total * 100) : 0;
//                     const statusColor = { running: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", done: "text-[#00d4ff] bg-cyan-500/10 border-cyan-500/20", paused: "text-amber-400 bg-amber-500/10 border-amber-500/20" }[c.status] || "text-slate-400 bg-white/5 border-white/10";
//                     return (
//                       <div key={c.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
//                         <div className="flex justify-between items-start mb-2">
//                           <p className="text-sm font-medium text-white">{c.name}</p>
//                           <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold capitalize ${statusColor}`}>{c.status}</span>
//                         </div>
//                         <div className="h-1.5 rounded-full bg-white/[0.06]">
//                           <div className="h-1.5 rounded-full bg-gradient-to-r from-[#00d4ff] to-violet-500" style={{ width: `${pct}%` }}/>
//                         </div>
//                         <div className="flex justify-between text-[10px] text-slate-500 mt-1">
//                           <span>{c.completed.toLocaleString()} / {c.total.toLocaleString()} contacts</span>
//                           <span>{c.date}</span>
//                         </div>
//                       </div>
//                     );
//                   })}
//                 </div>
//             }
//           </div>

//           {/* CSV Preview */}
//           {csvRaw.length > 0 && (
//             <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-5 overflow-auto">
//               <h2 className="text-base font-semibold text-white mb-3">CSV Preview</h2>
//               <table className="w-full text-xs">
//                 <tbody>
//                   {csvRaw.map((row, ri) => (
//                     <tr key={ri} className={`border-b border-white/[0.05] ${ri === 0 ? "text-[#00d4ff] font-semibold" : "text-slate-300"}`}>
//                       {row.map((cell, ci) => <td key={ci} className="py-2 px-2">{cell.trim()}</td>)}
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//               {csvContacts.length > 0 && (
//                 <p className="text-[10px] text-emerald-400 mt-2">✓ {csvContacts.length} contacts validated</p>
//               )}
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }
