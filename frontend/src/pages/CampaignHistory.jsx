import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function CampaignHistory() {
  const navigate = useNavigate();

  const [campaignHistory, setCampaignHistory] = useState([]);
  const [search, setSearch] = useState("");

useEffect(() => {
  async function load() {
    try {
      const res = await api.campaigns(); // real campaigns only
      console.log("CAMPAIGNS RESPONSE:", res);
      const sorted = (res || []).sort(
  (a, b) => new Date(b.date) - new Date(a.date)
);

setCampaignHistory(sorted);
    } catch (e) {
      console.error("Campaign load error:", e);
      setCampaignHistory([]);
    }
  }

  load(console.log("FETCHING CAMPAIGNS..."));
}, []);

  const filteredCampaigns = campaignHistory.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-white text-xl font-bold">
          Campaign History
        </h1>
      </div>

      {/* Search Bar */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search campaigns..."
        className="w-full p-3 rounded-xl bg-[#0d1520] border border-white/10 text-white outline-none focus:border-cyan-400"
      />

      {/* List */}
      {filteredCampaigns.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm">
          No campaigns found.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCampaigns.map((campaign) => (
            <div
              key={campaign.id}
              onClick={() => navigate(`/campaign/${campaign.id}`)}
              className="cursor-pointer rounded-2xl border border-white/[0.05] bg-white/[0.03] p-6 hover:bg-white/[0.05] transition"
            >
              {/* Top */}
              <div className="flex items-start justify-between mb-3 gap-3">
                <div>
                  <h3 className="text-white font-bold text-xl mt-1">
                    {campaign.name}
                  </h3>

                  <p className="text-sm text-slate-400 mt-1">
                    {new Date(campaign.date).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                <span className="text-sm px-3 py-1 rounded-full border border-white/10 text-slate-200 font-medium">
                  {campaign.status}
                </span>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl bg-white/[0.03] p-4 flex flex-col items-center justify-center text-center">
                  <p className="text-white font-bold text-xl mt-1">
                    Total
                  </p>
                  <p className="text-white font-bold text-xl mt-1">
                    {campaign.total}
                  </p>
                </div>

                <div className="rounded-xl bg-white/[0.03] p-4 flex flex-col items-center justify-center text-center">
                  <p className="text-white font-bold text-xl mt-1">
                    Completed
                  </p>
                  <p className="text-white font-bold text-xl mt-1">
                    {campaign.completed}
                  </p>
                </div>

                <div className="rounded-xl bg-white/[0.03] p-4 flex flex-col items-center justify-center text-center">
                  <p className="text-white font-bold text-xl mt-1">
                    Failed
                  </p>
                  <p className="text-white font-bold text-xl mt-1">
                    {campaign.failed}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}