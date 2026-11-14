import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { toast } from "react-hot-toast";   // ← WAS MISSING
import {
  PasswordField,
  InputField,
} from "../components/StatCard";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function SettingsPage() {
  const [twilio, setTwilio] = useState({
  sid: "",
  token: "",
  phone: ""
});
  const [groq, setGroq] = useState({
  key: "",
  model: "llama-3.3-70b-versatile"
});
  const [script, setScript] = useState("");
  // const [notifs, setNotifs] = useState({ email: true, webhook: false, slack: false, sms: false });
  // const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [voice, setVoice] = useState("Polly.Aditi");

  const handleSaveAll = async () => {
    setSaving(true);
    try {
        const token = localStorage.getItem("token");

        await fetch(`${API}/settings/save`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            twilio_sid: twilio.sid,
            twilio_token: twilio.token,
            twilio_phone: twilio.phone,

            groq_key: groq.key,
            groq_model: groq.model,

            script,
            voice,
          }),
        });
      toast.success("All settings saved!");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

const testTwilio = async () => {
  const token = localStorage.getItem("token");

  const r = await fetch(`${API}/settings/test-twilio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const d = await r.json();
  d.ok
    ? toast.success("Twilio connection verified! ✓")
    : toast.error(`Twilio error: ${d.error}`);
};

const testGroq = async () => {
  const token = localStorage.getItem("token");

  const r = await fetch(`${API}/settings/test-groq`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const d = await r.json();
  d.ok
    ? toast.success("Groq API key verified! ✓")
    : toast.error(`Groq error: ${d.error}`);
};

  useEffect(() => {
  const loadSettings = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/settings`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();

      setTwilio({
        sid: data.twilio?.sid || "",
        token: data.twilio?.token || "",
        phone: data.twilio?.phone || ""
      });

      setGroq({
        key: data.groq?.key || "",
        model: data.groq?.model || "llama-3.3-70b-versatile"
      });

      setScript(data.script || "");

      setVoice(
        data.voice || "Polly.Aditi"
      );

    } catch (err) {
      console.error(err);
    }
  };

  loadSettings();
}, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">System configuration & API credentials</p>
        </div>
        <button onClick={handleSaveAll} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-xl bg-gradient-to-r from-[#00d4ff] to-violet-500 text-black font-bold hover:scale-[1.02] hover:shadow-lg hover:shadow-[#00d4ff]/20 transition-all disabled:opacity-60">
          <Save size={14} /> {saving ? "Saving…" : "Save All Settings"}
        </button>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Twilio */}
        <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
            <span className="text-2xl">📞</span>
            <div><h2 className="text-base font-semibold text-white">Twilio Configuration</h2><p className="text-xs text-slate-500">Outbound call settings</p></div>
          </div>
          <InputField label="Account SID" value={twilio.sid} onChange={v => setTwilio({ ...twilio, sid: v })} placeholder="ACxxxxxxxxxxxxxxxx" />
          <PasswordField label="Auth Token" value={twilio.token} onChange={v => setTwilio({ ...twilio, token: v })} placeholder="Auth token" />
          <InputField label="Phone Number" value={twilio.phone} onChange={v => setTwilio({ ...twilio, phone: v })} placeholder="+1 555 000 0000" />
          <button onClick={testTwilio}
            className="w-full py-2.5 text-sm rounded-xl border border-white/[0.08] text-slate-300 hover:border-[#00d4ff]/40 hover:text-[#00d4ff] transition-all">🔌 Test Connection</button>
        </div>
        {/* Groq */}
        <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
            <span className="text-2xl">🤖</span>
            <div><h2 className="text-base font-semibold text-white">Groq LLM Configuration</h2><p className="text-xs text-slate-500">AI analysis & response</p></div>
          </div>
          <PasswordField label="API Key" value={groq.key} onChange={v => setGroq({ ...groq, key: v })} placeholder="gsk_xxxxxxxxxxxx" />
          <div>
            <label className="text-[10px] tracking-widest text-slate-500 uppercase font-semibold block mb-1.5">Model</label>
            <p className="text-sm text-gray-500 mt-2">
  Select the Groq model used for AI voice conversations.
</p>
            <select value={groq.model} onChange={e => setGroq({ ...groq, model: e.target.value })}
              className="w-full bg-[#111827] border border-white/[0.08] px-4 py-3 rounded-xl text-white">
              <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
              <option value="llama3-8b-8192">llama3-8b-8192</option>
            </select>
          </div>
          <button onClick={testGroq}
            className="w-full py-2.5 text-sm rounded-xl border border-white/[0.08] text-slate-300 hover:border-[#00d4ff]/40 hover:text-[#00d4ff] transition-all">🔌 Test API Key</button>
        </div>

        

          {/* Voice Choice */}
  <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6 space-y-5">

  <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
    <span className="text-2xl">🎙️</span>

    <div>
      <h2 className="text-base font-semibold text-white">
        Voice Configuration
      </h2>

      <p className="text-xs text-slate-500">
        Configure the AI calling voice
      </p>
    </div>
  </div>

  {/* Voice Selection */}
  <div>
    <p className="text-[10px] tracking-widest text-slate-500 uppercase font-semibold mb-3">
      Voice Selection
    </p>

    <select
      value={voice}
      onChange={(e) => setVoice(e.target.value)}
      className="w-full bg-[#111827] border border-white/[0.08] px-4 py-3 rounded-xl text-white"
    >
      <option value="Polly.Aditi">Aditi (Female)</option>
      <option value="Polly.Raveena">Raveena (Female)</option>
      <option value="Polly.Joanna">Joanna (Female)</option>
      <option value="Polly.Matthew">Matthew (Male)</option>
      <option value="Polly.Brian">Brian (Male)</option>
    </select>

    <p className="text-xs text-slate-500 mt-2">
      Select the voice used by the AI agent during outbound calls.
    </p>
  </div>

  {/* Current Voice Technology */}
  <div className="border-t border-white/[0.06] pt-4 space-y-3">

    <div>
      <p className="text-[10px] tracking-widest text-slate-500 uppercase font-semibold">
        Speech-to-Text
      </p>

      <p className="text-sm text-white mt-1">
        Twilio Speech Recognition
      </p>

      <p className="text-xs text-slate-500">
        Converts voter speech into text during calls.
      </p>
    </div>

    <div>
      <p className="text-[10px] tracking-widest text-slate-500 uppercase font-semibold">
        Text-to-Speech
      </p>

      <p className="text-sm text-white mt-1">
        Amazon Polly
      </p>

      <p className="text-xs text-slate-500">
        Converts AI responses into natural voice audio.
      </p>
    </div>

  </div>

</div>

 {/* Script editor */}
      <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📝</span>
            <div><h2 className="text-base font-semibold text-white">Default Campaign Script</h2><p className="text-xs text-slate-500">Use <code className="text-[#00d4ff]">[Contact Name]</code> as placeholder</p></div>
          </div>
          <button onClick={() => toast("Script reset to default.")} className="text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] text-slate-400 hover:text-white transition-colors">↺ Reset</button>
        </div>
        <textarea rows={7} value={script} onChange={e => setScript(e.target.value)}
          className="w-full bg-white/[0.04] border border-white/[0.08] px-4 py-3 rounded-xl outline-none text-sm text-white focus:border-[#00d4ff]/40 transition-colors resize-none font-mono leading-relaxed" />
        <div className="flex gap-3">
          <button onClick={async () => {
            await fetch(`${API}/settings/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script }) });
            toast.success("Script saved!");
          }}
            className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-xl bg-gradient-to-r from-[#00d4ff] to-violet-500 text-black font-bold hover:scale-[1.02] transition-all">
            <Save size={13} /> Save Script
          </button>
          <button onClick={() => toast.success("TTS preview playing...")}
            className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl border border-white/[0.08] text-slate-300 hover:border-[#00d4ff]/40 hover:text-[#00d4ff] transition-all">
            🔊 Preview TTS
          </button>
        </div>
      </div>

      </div>
     
    </div>
  );
}
