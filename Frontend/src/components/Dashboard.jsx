import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Video, Headset, Sparkles, PhoneOff } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://duroflex-call-analyser.onrender.com';

const formatNumber = (value = 0) => new Intl.NumberFormat('en-US').format(value || 0);

const normalizeIntent = (rating) => {
  const val = (rating || '').toString().toUpperCase();
  if (!val) return 'Medium';
  if (val.includes('HIGH') || val.includes('5')) return 'High';
  if (val.includes('LOW') || val.includes('1')) return 'Low';
  return 'Medium';
};

const parseDurationToSeconds = (secondsValue, durationText) => {
  if (durationText) {
    const text = String(durationText).trim();
    if (text.includes(':')) {
      const parts = text.split(':').map((p) => p.trim()).filter(Boolean);
      if (parts.length === 3) {
        return (parseInt(parts[0], 10) * 3600) + (parseInt(parts[1], 10) * 60) + parseInt(parts[2], 10);
      }
      if (parts.length === 2) {
        return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
      }
    }
    if (text.match(/^\d+$/)) return parseInt(text, 10);
  }
  if (typeof secondsValue === 'number' && !Number.isNaN(secondsValue)) return secondsValue;
  if (typeof secondsValue === 'string' && secondsValue.trim().match(/^\d+$/)) return parseInt(secondsValue, 10);
  return null;
};

const getReportDurationSeconds = (report) => {
  const analysis = report?.analysis || report?.analysis_data || {};
  const metaData = analysis.MetaData || analysis.metaData || {};
  const durationText = metaData.Call_Duration || report?.call_duration || report?.Call_Duration || null;
  const secondsValue = report?.duration_seconds ?? report?.duration ?? report?.durationSeconds ?? report?.duration_sec ?? null;
  return parseDurationToSeconds(secondsValue, durationText);
};

const filterByDuration = (reports) =>
  (reports || []).filter((report) => {
    const durationSeconds = getReportDurationSeconds(report);
    if (durationSeconds === null || durationSeconds === undefined) return true;
    return durationSeconds >= 30;
  });

const deriveType = (objective) => {
  const text = (objective || '').toLowerCase();
  const serviceKeywords = ['service', 'support', 'issue', 'complaint', 'warranty', 'return'];
  return serviceKeywords.some((k) => text.includes(k)) ? 'Service' : 'Sales';
};

// Helpers to extract/format latest datetime from a report list
const extractDateFromReport = (r) => {
  if (!r) return null;
  const tryParse = (v) => {
    if (!v && v !== 0) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'number') {
      const d = new Date(v);
      return isNaN(d) ? null : d;
    }
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!trimmed) return null;
      const direct = new Date(trimmed);
      if (!isNaN(direct)) return direct;

      const dashMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(.*)$/);
      if (dashMatch) {
        const [, day, month, year, rest] = dashMatch;
        const timePart = rest.replace(/\./g, ':').trim();
        const iso = `${year}-${month}-${day}${timePart ? `T${timePart}` : ''}`;
        const isoDate = new Date(iso);
        if (!isNaN(isoDate)) return isoDate;
      }
    }
    return null;
  };

  const candidates = [
    r.created_at,
    r.createdAt,
    r.uploaded_at,
    r.uploadedAt,
    r.Call_Time,
    r.call_time,
    r.Timestamp,
    r.timestamp,
    r.analysis && r.analysis.Functional && r.analysis.Functional.Call_Time,
    r.analysis_data && r.analysis_data.Functional && r.analysis_data.Functional.Call_Time,
    r.Functional && r.Functional.Call_Time,
    r.processed_at,
    r.upload_timestamp,
    r.driveSyncedAt,
    r.metadata && r.metadata.date,
    r.metadata && r.metadata.clean_datetime,
    r.analyzed_at,
    r.created_date,
    r.call_date,
  ];

  for (const c of candidates) {
    const dt = tryParse(c);
    if (dt) return dt;
  }
  return null;
};

const getLatestDateStr = (reports) => {
  if (!Array.isArray(reports) || reports.length === 0) return null;
  const dates = reports.map(extractDateFromReport).filter(Boolean);
  if (!dates.length) return null;
  const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
  return latest.toLocaleString();
};

const Dashboard = () => {
  const navigate = useNavigate();
  const adminEmail = localStorage.getItem('admin_email') || 'admin@duroflex.com';

  const [hoveredCard, setHoveredCard] = useState(null);
  const [audioReports, setAudioReports] = useState([]);
  const [videoReports, setVideoReports] = useState([]);
  const [outboundReports, setOutboundReports] = useState([]);
  const [abcReports, setAbcReports] = useState([]);
  const [callStats, setCallStats] = useState(null);
  const [outboundStats, setOutboundStats] = useState(null);
  const [abcStats, setAbcStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const [audioRes, videoRes, statsRes, outboundRes, outboundStatsRes, abcRes, abcStatsRes] = await Promise.all([
          fetch(`${API_BASE}/api/GmbCalls`),
          fetch(`${API_BASE}/api/video-reports`),
          fetch(`${API_BASE}/api/GmbCalls/stats/overview`).catch(() => null),
          fetch(`${API_BASE}/api/outbound-calls`).catch(() => null),
          fetch(`${API_BASE}/api/outbound-calls/stats/overview`).catch(() => null),
          fetch(`${API_BASE}/api/abc-calls/reports`).catch(() => null),
          fetch(`${API_BASE}/api/abc-calls/stats/overview`).catch(() => null),
        ]);

        if (audioRes.ok) {
          const audioJson = await audioRes.json();
          setAudioReports(audioJson.reports || []);
        }

        if (videoRes.ok) {
          const videoJson = await videoRes.json();
          if (videoJson.status === 'success' && Array.isArray(videoJson.reports)) {
            setVideoReports(videoJson.reports);
          }
        }

        if (statsRes && statsRes.ok) {
          const statsJson = await statsRes.json();
          setCallStats(statsJson.stats || null);
        }

        if (outboundRes && outboundRes.ok) {
          const outboundJson = await outboundRes.json();
          setOutboundReports(outboundJson.reports || []);
        }

        if (outboundStatsRes && outboundStatsRes.ok) {
          const outboundStatsJson = await outboundStatsRes.json();
          setOutboundStats(outboundStatsJson.stats || null);
        }

        if (abcRes && abcRes.ok) {
          const abcJson = await abcRes.json();
          setAbcReports(abcJson.reports || []);
        }

        if (abcStatsRes && abcStatsRes.ok) {
          const abcStatsJson = await abcStatsRes.json();
          setAbcStats(abcStatsJson.stats || null);
        }
      } catch (err) {
        setError('Unable to load dashboard metrics right now.');
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  const audioMetrics = useMemo(() => {
    const visibleReports = filterByDuration(audioReports);
    const calls = visibleReports.map((report) => {
      const analysis = report.analysis || {};
      const functional = analysis.Functional || {};
      const customer = analysis.Customer_Information || {};

      return {
        type: deriveType(functional.Call_Objective_Theme),
        intent: normalizeIntent(
          customer.Intent_to_Purchase_Rating || customer.Intent_to_Visit_Rating || customer.Purchase_Intent_Rating
        ),
        analyzed: Boolean(report.analysis && !report.analysis.error),
        store: report.store_name || 'Unknown Store',
      };
    });

    const total = calls.length;
    const analyzed = calls.filter((c) => c.analyzed).length;
    const sales = calls.filter((c) => c.type === 'Sales').length;
    const service = calls.filter((c) => c.type === 'Service').length;
    const highIntent = calls.filter((c) => c.intent === 'High').length;
    const stores = new Set(calls.map((c) => c.store));

    return {
      total,
      analyzed,
      sales,
      service,
      highIntent,
      coverage: total ? Math.round((analyzed / total) * 100) : 0,
      salesShare: total ? Math.round((sales / total) * 100) : 0,
      serviceShare: total ? Math.round((service / total) * 100) : 0,
      storeList: Array.from(stores),
      latest: getLatestDateStr(visibleReports),
    };
  }, [audioReports]);

  const videoMetrics = useMemo(() => {
    const visibleReports = filterByDuration(videoReports);
    const calls = visibleReports.map((report) => {
      const analysis = report.analysis_data || {};
      const functional = analysis.Functional || {};
      const customer = analysis.Customer_Information || {};

      return {
        type: deriveType(functional.Call_Objective_Theme),
        intent: normalizeIntent(customer.Intent_to_Purchase_Rating),
        analyzed: Boolean(report.analyzed && report.analysis_data),
        store: functional.Store_Location || report.store_name || 'Unknown Store',
      };
    });

    const total = calls.length;
    const analyzed = calls.filter((c) => c.analyzed).length;
    const sales = calls.filter((c) => c.type === 'Sales').length;
    const service = calls.filter((c) => c.type === 'Service').length;
    const highIntent = calls.filter((c) => c.intent === 'High').length;
    const stores = new Set(calls.map((c) => c.store));

    return {
      total,
      analyzed,
      sales,
      service,
      highIntent,
      coverage: total ? Math.round((analyzed / total) * 100) : 0,
      salesShare: total ? Math.round((sales / total) * 100) : 0,
      serviceShare: total ? Math.round((service / total) * 100) : 0,
      storeList: Array.from(stores),
      latest: getLatestDateStr(visibleReports),
    };
  }, [videoReports]);

  const outboundMetrics = useMemo(() => {
    const visibleReports = filterByDuration(outboundReports);
    const calls = visibleReports.map((report) => {
      const analysis = report.analysis || {};
      const pillar1 = analysis.Pillar_1_Customer_Intent_and_Barriers || {};
      
      return {
        intent: pillar1.Intent_to_Purchase_Rating || 'MEDIUM',
        analyzed: Boolean(report.analysis),
        store: report.store_name || 'Unknown Store',
      };
    });

    const total = calls.length;
    const analyzed = calls.filter((c) => c.analyzed).length;
    const highIntent = calls.filter((c) => c.intent === 'HIGH').length;
    const stores = new Set(calls.map((c) => c.store));

    return {
      total,
      analyzed,
      highIntent,
      coverage: total ? Math.round((analyzed / total) * 100) : 0,
      conversionRate: outboundStats?.conversion_rate || 0,
      storeList: Array.from(stores),
      latest: getLatestDateStr(visibleReports),
    };
  }, [outboundReports, outboundStats]);

  const abcMetrics = useMemo(() => {
    // Only count analysed calls (pre-purchase) in the main metrics?
    // Or users want to see total coverage including discarded ones?
    // The previous modules calculate coverage as Analyzed / Total.
    // Here total includes Post-Purchase (discarded) calls?
    // Let's assume total is all reports returned (which are all analysed ones right now based on Get All filtering for pre-purchase + discarded count if we want).
    // Actually, backend /api/abc-calls returns all reports from `abc_call_reports` collection (Analysed ones).
    // The stats endpoint returns total_processed, total_analysed (Pre-Purchase), total_discarded (Post-Purchase).
    
    // So `abcReports` state contains only ANALYSED calls (Pre-Purchase).
    // But `abcStats` contains the counts for both.

    const visibleReports = filterByDuration(abcReports);
    const totalAnalysed = visibleReports.length; // Visible (>=30s)
    const totalProcessed = totalAnalysed;

    return {
      total: totalProcessed,
      analyzed: totalAnalysed,
      discarded: abcStats?.total_discarded || 0,
      coverage: totalProcessed ? Math.round((totalAnalysed / totalProcessed) * 100) : 0,
      conversionRate: abcStats?.conversion_rate || 0, // Placeholder if we had conversion logic
      latest: getLatestDateStr(visibleReports),
    };
  }, [abcReports, abcStats]);

  const combinedMetrics = useMemo(() => {
    const total = (audioMetrics?.total || 0) + (videoMetrics?.total || 0);
    const analyzed = (audioMetrics?.analyzed || 0) + (videoMetrics?.analyzed || 0);
    const sales = (audioMetrics?.sales || 0) + (videoMetrics?.sales || 0);
    const service = (audioMetrics?.service || 0) + (videoMetrics?.service || 0);
    const highIntent = (audioMetrics?.highIntent || 0) + (videoMetrics?.highIntent || 0);
    const uniqueStores = new Set([...(audioMetrics?.storeList || []), ...(videoMetrics?.storeList || [])]);

    return {
      total,
      analyzed,
      sales,
      service,
      highIntent,
      coverage: total ? Math.round((analyzed / total) * 100) : 0,
      salesShare: total ? Math.round((sales / total) * 100) : 0,
      serviceShare: total ? Math.round((service / total) * 100) : 0,
      highIntentShare: total ? Math.round((highIntent / total) * 100) : 0,
      uniqueStores: uniqueStores.size,
    };
  }, [audioMetrics, videoMetrics]);

  const moduleCards = [
{
      id: 'gmb',
      title: 'Google My Business Calls',
      badge: 'Inbound',
      description: "When Customers Call to Duroflex Stores' Phone number",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          <path d="M14.05 2a9 9 0 0 1 8 7.94" opacity="0.5"/>
          <path d="M14.05 6A5 5 0 0 1 18 10" opacity="0.5"/>
        </svg>
      ),
      stats: { calls: formatNumber(audioMetrics.total), analyzed: formatNumber(audioMetrics.analyzed), latest: audioMetrics.latest },
      onClick: () => navigate('/Gmb_Inbound/analytics')
    },
    {
      id: 'popin',
      title: 'Popin Video Calls',
      badge: 'Inbound',
      description: 'When Customers Request Video Call Demo from Top Stores',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
          <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>
          <rect x="2" y="6" width="14" height="12" rx="2"/>
        </svg>
      ),
      stats: { calls: formatNumber(videoMetrics.total), analyzed: formatNumber(videoMetrics.analyzed), latest: videoMetrics.latest },
      onClick: () => navigate('/popins-inbound/analytics')
    },
    {
      id: 'walkin',
      title: 'Store Walkin Leads Recovery',
      badge: 'Outbound',
      description: "When Central CX team calls Consumer who visited Store but didn't Purchase",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
      stats: { calls: formatNumber(outboundMetrics.total), analyzed: formatNumber(outboundMetrics.analyzed), latest: outboundMetrics.latest },
      onClick: () => navigate('/storewalkin-outbound-calls/analytics')
    },
    {
      id: 'abc',
      title: 'ABC Leads Recovery',
      badge: 'Outbound',
      description: 'When Central CX team calls Consumer who abandoned Online purchase post Checkout',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
          <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
        </svg>
      ),
      stats: { calls: formatNumber(abcMetrics.total), analyzed: formatNumber(abcMetrics.analyzed), latest: abcMetrics.latest },
      onClick: () => navigate('/abc-outbound-calls/analytics')
    }
  ];

  const headlineMetrics = [
    { value: formatNumber(combinedMetrics.analyzed), label: 'Calls Analyzed' },
    { value: `${callStats?.conversion_rate ?? 0}%`, label: 'Audio Conversion Rate' },
    { value: `${combinedMetrics.salesShare}%`, label: 'Sales Interaction Mix' },
    { value: formatNumber(combinedMetrics.uniqueStores), label: 'Stores Covered' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('admin_email');
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white via-gray-50/50 to-white text-gray-600">
        <div className="text-sm font-semibold tracking-wide">Loading dashboard metrics…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-gray-50/50 to-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Subtle background pattern */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-red-50 to-transparent rounded-full blur-3xl opacity-60" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-red-50/50 to-transparent rounded-full blur-3xl opacity-40" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 md:px-12 py-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-16">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-500 flex items-center justify-center shadow-lg shadow-red-200">
                <span className="text-white font-bold text-xl">D</span>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                Duroflex <span className="text-red-600">Interactions</span> Analyzer
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Powered by <span className="font-semibold text-red-500">Beyond AI</span>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-medium">Logged in as</p>
              <p className="text-sm font-semibold text-gray-700">{adminEmail}</p>
            </div>
            <button
              onClick={handleLogout}
              className="group flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-red-100 hover:border-red-200 bg-white hover:bg-red-50 text-red-600 font-semibold text-sm transition-all duration-300 shadow-sm hover:shadow-md"
            >
              <span>Logout</span>
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="text-center max-w-3xl mx-auto mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 border border-red-100 mb-6">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-red-700">AI-Powered Analytics Platform</span>
            <span className="text-xs text-gray-500">{combinedMetrics.coverage}% of conversations analyzed</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Transform Every <span className="text-red-600">Conversation</span> Into Insight
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
            Convert unstructured call data into actionable intelligence. Understand customer needs, evaluate team performance, and drive conversions with precision.
          </p>
        </section>

        {/* Value Props - Compact Horizontal Strip */}
        <section className="mb-16">
          <div className="flex flex-col sm:flex-row items-stretch justify-center gap-0 rounded-2xl bg-gradient-to-r from-gray-50 via-white to-gray-50 border border-gray-100 overflow-hidden shadow-sm">
            {[ 
              { 
                title: 'Customer Intent', 
                desc: 'Decode why customers call',
                icon: (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/>
                    <circle cx="12" cy="12" r="6" stroke="#f87171" strokeWidth="2"/>
                    <circle cx="12" cy="12" r="2" fill="#ef4444"/>
                  </svg>
                )
              },
              { 
                title: 'Performance Metrics', 
                desc: 'Evaluate agent effectiveness',
                icon: (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="10" width="4" height="10" rx="1" fill="#10b981"/>
                    <rect x="10" y="6" width="4" height="14" rx="1" fill="#f59e0b"/>
                    <rect x="17" y="2" width="4" height="18" rx="1" fill="#ef4444"/>
                  </svg>
                )
              },
              { 
                title: 'Conversion Insights', 
                desc: 'Boost satisfaction & sales',
                icon: (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L8 10H4L10 22L9 13H14L12 2Z" fill="url(#rocket)" stroke="#ef4444" strokeWidth="1"/>
                    <defs>
                      <linearGradient id="rocket" x1="4" y1="2" x2="14" y2="22">
                        <stop stopColor="#fca5a5"/>
                        <stop offset="1" stopColor="#ef4444"/>
                      </linearGradient>
                    </defs>
                  </svg>
                )
              }
            ].map((item, i, arr) => (
              <div 
                key={item.title} 
                className={`group flex-1 flex items-center gap-4 px-6 py-4 hover:bg-red-50/50 transition-all duration-300 cursor-default ${
                  i < arr.length - 1 ? 'sm:border-r border-b sm:border-b-0 border-gray-100' : ''
                }`}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center group-hover:scale-110 group-hover:border-red-200 group-hover:shadow-md transition-all duration-300">
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 group-hover:text-red-700 transition-colors">{item.title}</h3>
                  <p className="text-xs text-gray-500 truncate">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section Header */}
        <section className="text-center mb-12">
          <h3 className="text-2xl md:text-3xl font-bold text-gray-900">
            Select Analysis Module
          </h3>
          <p className="text-gray-500 mt-2">Choose a channel to explore detailed insights</p>
        </section>

        {/* Module Cards */}
        <section className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-16">
          {moduleCards.map((module, index) => (
            <button
              key={module.id}
              className="group relative text-left rounded-3xl bg-white border-2 border-gray-100 hover:border-red-300 p-8 transition-all duration-500 hover:shadow-2xl hover:shadow-red-100/40 hover:-translate-y-1 overflow-hidden"
              onMouseEnter={() => setHoveredCard(module.id)}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={module.onClick}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Animated top border */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 via-red-400 to-red-600 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
              
              {/* Background glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-red-50/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="relative">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                      hoveredCard === module.id 
                        ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-200 scale-110 rotate-3' 
                        : 'bg-red-50 text-red-600'
                    }`}>
                      {module.icon}
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-gray-900 group-hover:text-red-700 transition-colors">
                        {module.title}
                      </h4>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold mt-1 px-2.5 py-1 rounded-full ${
                        module.badge === 'Inbound' 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          module.badge === 'Inbound' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                        {module.badge}
                      </span>
                    </div>
                  </div>
                  
                  {/* Stats */}
                  <div className="text-right">
                    <p className="text-3xl font-bold text-gray-900">{module.stats.calls}</p>
                    <p className="text-xs text-gray-500 mt-1">{module.stats.analyzed ? `${module.stats.analyzed} analysed` : '0 analysed'}</p>
                    <p className="text-xs font-semibold text-emerald-600 mt-1">Latest: {module.stats.latest || '—'}</p>
                  </div>
                </div>
                
                {/* Description */}
                <p className="text-gray-500 leading-relaxed mb-6 pr-4">
                  {module.description}
                </p>
                
                {/* CTA */}
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold text-sm shadow-lg shadow-red-200/50 group-hover:shadow-red-300/50 transition-all duration-300">
                    <span>Explore Reports</span>
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </span>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="w-2 h-2 rounded-full bg-red-300 animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </button>
          ))}
        </section>

        {/* Error Banner */}
        {error && (
          <div className="mt-8 text-center text-sm text-red-500 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-gray-100 text-center">
          <p className="text-sm text-gray-400">
            © 2026 Duroflex. All rights reserved. Built with ❤️ by <span className="text-red-500 font-medium">Beyond AI</span>
          </p>
        </footer>
      </div>

      {/* Google Fonts Import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        
        * {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        button {
          animation: fadeInUp 0.6s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
