const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function req(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, opts);
  if (!r.ok) {
    const txt = await r.text().catch(() => r.statusText);
    throw new Error(txt || `HTTP ${r.status}`);
  }
  return r.json();
}

export const api = {
  // Dashboard
  dashboardStats:   ()            => req("/dashboard/stats"),
  dashboardSentiment: ()          => req("/dashboard/sentiment"),
  dashboardIssues:  ()            => req("/dashboard/issues"),
  dashboardRecent:  (limit = 5)   => req(`/dashboard/recent-calls?limit=${limit}`),

  // Analytics
  analyticsStats:   ()            => req("/analytics/stats"),
  analyticsSentiment: ()          => req("/analytics/sentiment"),
  analyticsIntent:  ()            => req("/analytics/intent"),
  analyticsIssues:  ()            => req("/analytics/issues"),
  analyticsTrends:  (period)      => req(`/analytics/trends?period=${period}`),

  // Calls
  calls: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/calls${q ? "?" + q : ""}`);
  },
  exportCallsCSV: () => `${BASE}/calls/export/csv`,

  // Campaigns
  campaigns:      ()  => req("/campaigns"),
  startCampaign:  (fd) => req("/campaign/start", { method: "POST", body: fd }),
  stopCampaign:   ()  => req("/campaign/stop",   { method: "POST" }),
  pauseCampaign:  ()  => req("/campaign/pause",  { method: "POST" }),
  resumeCampaign: ()  => req("/campaign/resume", { method: "POST" }),

  // Settings
  loadSettings:   ()    => req("/settings"),
  saveSettings:   (body) => req("/settings/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  testTwilio: () => req("/settings/test-twilio", { method: "POST" }),
  testGroq:   () => req("/settings/test-groq",   { method: "POST" }),
};

export const WS_URL = BASE.replace(/^http/, "ws") + "/ws";
