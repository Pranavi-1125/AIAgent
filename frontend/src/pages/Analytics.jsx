import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, LineChart, Line, CartesianGrid,
} from "recharts";
import StatCard, { TooltipStyle, CustomBar } from "../components/StatCard";
import { SENT_COLORS, INTENT_COLORS } from "../data/data";
import { api } from "../api";

export default function Analytics() {
  const [stats,      setStats]     = useState(null);
  const [sentiment,  setSentiment] = useState([]);
  const [intent,     setIntent]    = useState([]);
  const [issues,     setIssues]    = useState([]);
  const [trends,     setTrends]    = useState([]);
  const [loading,    setLoading]   = useState(true);

  async function load() {
    try {
      const [s, sent, int_, iss, tr] = await Promise.all([
        api.analyticsStats(),
        api.analyticsSentiment(),
        api.analyticsIntent(),
        api.analyticsIssues(),
        api.analyticsTrends(),
      ]);
      setStats(s);
      setSentiment(sent);
      setIntent(int_);
      setIssues(iss);
      setTrends(tr);
    } catch (e) {
      toast.error("Failed to load analytics: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const exportReport = () => {
    window.open(api.exportCallsCSV(), "_blank");
    toast.success("Report exported!");
  };

  const noData = v => !v || v.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Sentiment, intent & issue analysis</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportReport}
            className="px-4 py-2 text-sm rounded-xl border border-white/[0.08] text-slate-300 hover:border-[#00d4ff]/40 hover:text-[#00d4ff] transition-all">
            ⬇ Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Supporters"    value={loading ? "…" : (stats?.supporters_pct || "0%")}  sub="of analysed calls"     accent="#10b981" icon="👍"/>
        <StatCard title="Neutral"       value={loading ? "…" : (stats?.neutral_pct || "0%")}     sub="Undecided voters"      accent="#f59e0b" icon="😐"/>
        <StatCard title="Opposed"       value={loading ? "…" : (stats?.opposed_pct || "0%")}     sub="of analysed calls"     accent="#ef4444" icon="👎"/>
        <StatCard title="Avg Confidence" value={loading ? "…" : String(stats?.avg_confidence || 0)} sub="Groq LLM score"     accent="#00d4ff" icon="🎯"/>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Trends */}
        <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Call Trends</h2>
          {noData(trends)
            ? <p className="text-sm text-slate-500 text-center py-16">No trend data yet</p>
            : <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trends}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3"/>
                  <XAxis dataKey="day" stroke="#475569" tick={{ fontSize: 11 }}/>
                  <YAxis stroke="#475569" tick={{ fontSize: 11 }}/>
                  <Tooltip {...TooltipStyle}/>
                  <Legend wrapperStyle={{ fontSize: "11px" }}/>
                  <Line type="monotone" dataKey="calls"     stroke="#00d4ff" strokeWidth={2.5} dot={false} name="Total"/>
                  <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2.5} dot={false} name="Completed"/>
                </LineChart>
              </ResponsiveContainer>
          }
        </div>

        {/* Intent */}
        <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Call Intent Breakdown</h2>
          {noData(intent)
            ? <p className="text-sm text-slate-500 text-center py-16">No intent data yet</p>
            : <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={intent} dataKey="value" outerRadius={80} innerRadius={40} paddingAngle={3} label={false}>
                    {intent.map((_, i) => <Cell key={i} fill={INTENT_COLORS[i % INTENT_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip {...TooltipStyle} formatter={(v, n) => [`${v}%`, n]}/>
                  <Legend wrapperStyle={{ fontSize: "11px" }}/>
                </PieChart>
              </ResponsiveContainer>
          }
        </div>

        {/* Sentiment Pie */}
        <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Sentiment Distribution</h2>
          {noData(sentiment)
            ? <p className="text-sm text-slate-500 text-center py-16">No sentiment data yet</p>
            : <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={sentiment} dataKey="value" outerRadius={80} innerRadius={40} paddingAngle={3}>
                    {sentiment.map((_, i) => <Cell key={i} fill={SENT_COLORS[i % SENT_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip {...TooltipStyle} formatter={(v, n) => [`${v}%`, n]}/>
                  <Legend wrapperStyle={{ fontSize: "11px" }}/>
                </PieChart>
              </ResponsiveContainer>
          }
        </div>

        {/* Issues Bar */}
        <div className="bg-[#0d1520] border border-white/[0.07] rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Top Issues Mentioned</h2>
          {noData(issues)
            ? <p className="text-sm text-slate-500 text-center py-16">No issue data yet</p>
            : <ResponsiveContainer width="100%" height={220}>
                <BarChart data={issues} barSize={28}>
                  <XAxis dataKey="name" stroke="#475569" tick={{ fontSize: 10 }}/>
                  <YAxis stroke="#475569" tick={{ fontSize: 10 }}/>
                  <Tooltip {...TooltipStyle}/>
                  <Bar dataKey="value" shape={<CustomBar/>}/>
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
      </div>
    </div>
  );
}
