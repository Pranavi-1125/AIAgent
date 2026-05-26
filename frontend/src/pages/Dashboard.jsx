import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis,
} from "recharts";
import StatCard, { CustomBar, TooltipStyle } from "../components/StatCard";
import { SENT_COLORS, STATUS_BADGE } from "../data/data";
import { api } from "../api";

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats,      setStats]      = useState(null);
  const [sentiment,  setSentiment]  = useState([]);
  const [issues,     setIssues]     = useState([]);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, sent, iss, rec] = await Promise.all([
          api.dashboardStats(),
          api.dashboardSentiment(),
          api.dashboardIssues(),
          api.dashboardRecent(4),
        ]);
        setStats(s);
        setSentiment(sent.length ? sent : []);
        setIssues(iss.length ? iss : []);
        setRecentCalls(rec);
      } catch (e) {
        console.error("Dashboard load:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const fmtNum = n => n >= 1000 ? (n/1000).toFixed(1)+"k" : String(n);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Campaign overview & live monitoring</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate("/campaigns")}
            className="px-4 py-2 text-sm rounded-xl border border-white/10 text-slate-300 hover:border-[#00d4ff]/40 hover:text-[#00d4ff] transition-all">
            + New Campaign
          </button>
          <button onClick={() => navigate("/agent")}
            className="px-4 py-2 text-sm rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/20 transition-all flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-pulse"/>Live Monitor
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Calls"       value={loading ? "…" : fmtNum(stats?.total_calls || 0)}     sub={`${stats?.connect_rate || "0%"} connect rate`} accent="#00d4ff" icon="📞"/>
        <StatCard title="Active Campaigns"  value={loading ? "…" : String(stats?.active_campaigns || 0)} sub="Currently running"  accent="#7c3aed" icon="📡"/>
        <StatCard title="Answered Calls"    value={loading ? "…" : fmtNum(stats?.answered_calls || 0)}   sub="Completed"         accent="#10b981" icon="✅"/>
        <StatCard title="Avg Duration"      value={loading ? "…" : (stats?.avg_duration || "0m 0s")}     sub="Per connected call" accent="#f59e0b" icon="⏱️"/>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Live Sentiment Analysis</h2>
          {sentiment.length === 0
            ? <p className="text-sm text-slate-500 text-center py-12">No sentiment data yet</p>
            : <div className="flex items-center gap-6">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={sentiment} dataKey="value" outerRadius={80} innerRadius={45} paddingAngle={3} label={false}>
                      {sentiment.map((_, i) => <Cell key={i} fill={SENT_COLORS[i % SENT_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip {...TooltipStyle} formatter={(v, n) => [`${v}%`, n]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3 shrink-0">
                  {sentiment.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: SENT_COLORS[i % SENT_COLORS.length] }}/>
                      <div>
                        <p className="text-xs text-slate-300">{d.name}</p>
                        <p className="text-xs font-bold" style={{ color: SENT_COLORS[i % SENT_COLORS.length] }}>{d.value}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
          }
        </div>

        <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Top Public Issues</h2>
          {issues.length === 0
            ? <p className="text-sm text-slate-500 text-center py-12">No issue data yet</p>
            : <ResponsiveContainer width="100%" height={200}>
                <BarChart data={issues} barSize={32}>
                  <XAxis dataKey="name" stroke="#475569" tick={{ fontSize: 11 }}/>
                  <YAxis stroke="#475569" tick={{ fontSize: 11 }}/>
                  <Tooltip {...TooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }}/>
                  <Bar dataKey="value" shape={<CustomBar/>} label={{ position: "top", fill: "#94a3b8", fontSize: 10 }}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
      </div>

      {/* Recent Calls */}
      <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Recent Calls</h2>
          <button onClick={() => navigate("/calls")} className="text-xs text-[#00d4ff] hover:underline">View All →</button>
        </div>
        {recentCalls.length === 0
          ? <p className="text-sm text-slate-500 text-center py-8">No calls yet. Start a campaign to see data.</p>
          : <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {["Name","Status","Sentiment","Time"].map(h => (
                    <th key={h} className="pb-3 text-left text-[10px] tracking-widest text-slate-500 uppercase font-semibold px-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((c, i) => (
                  <motion.tr key={c.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-2 text-sm font-medium text-white">{c.name}</td>
                    <td className="py-3 px-2">
                      <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_BADGE[c.status] || "text-slate-400"}`}>{c.status}</span>
                    </td>
                    <td className={`py-3 px-2 text-sm font-semibold ${c.sentiment === "Supporter" ? "text-emerald-400" : c.sentiment === "Opposed" ? "text-red-400" : c.sentiment === "Neutral" ? "text-amber-400" : "text-slate-500"}`}>{c.sentiment}</td>
                    <td className="py-3 px-2 text-xs text-slate-500">{c.date}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
        }
      </div>
    </div>
  );
}
