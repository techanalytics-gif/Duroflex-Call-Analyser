import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Upload, Users, TrendingUp, Building2, CheckCircle2, ArrowRight } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://duroflex-call-analyser.onrender.com';

// Flatten nested JSON objects into a single-level map suitable for CSV export
const flattenObject = (obj, prefix = '') => {
  const result = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else if (Array.isArray(value)) {
      const normalized = value.map((item) => (item && typeof item === 'object' ? JSON.stringify(item) : item));
      result[newKey] = normalized.join('; ');
    } else {
      result[newKey] = value;
    }
  });
  return result;
};

const toCsvValue = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/"/g, '""');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str}"`;
  }
  return str;
};

const exportReportsAsCsv = (reports, filename) => {
  if (!reports || !reports.length) {
    alert('No reports to download');
    return;
  }

  const flattened = reports.map((r) => flattenObject(r));
  const headers = Array.from(new Set(flattened.flatMap((item) => Object.keys(item))));

  const rows = [headers.join(',')];
  flattened.forEach((item) => {
    const row = headers.map((h) => toCsvValue(item[h]));
    rows.push(row.join(','));
  });

  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const AbcAggregatedDashboard = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState('30');
  const [selectedRegion, setSelectedRegion] = useState('Overall');
  const [selectedCity, setSelectedCity] = useState('All');
  const [selectedStoreExp, setSelectedStoreExp] = useState('All');
  const [selectedCallExp, setSelectedCallExp] = useState('All');
  const [selectedIntent, setSelectedIntent] = useState('All');
  const [allCalls, setAllCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleDownloadReports = () => {
    exportReportsAsCsv(allCalls, 'abc_cart_recovery_reports.csv');
  };

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/abc-calls/reports`);
        if (!res.ok) throw new Error('Failed to load ABC reports');
        const json = await res.json();
        setAllCalls(json.reports || []);
      } catch (err) {
        console.error('Error fetching ABC calls:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, []);

  const normalizeRating = (rating) => {
    if (!rating) return 'Medium';
    const val = String(rating).toUpperCase();
    if (val === 'H' || val.includes('HIGH')) return 'High';
    if (val === 'L' || val.includes('LOW')) return 'Low';
    return 'Medium';
  };

  const normalizeIntent = (rating) => normalizeRating(rating);

  const normalizeExperience = (rating) => {
    if (!rating) return 'Medium';
    if (typeof rating === 'number') {
      if (rating >= 4) return 'High';
      if (rating <= 2) return 'Low';
      return 'Medium';
    }
    return normalizeRating(rating);
  };

  const relaxScoreToNum = (score) => {
    if (!score) return 5;
    const s = String(score).toUpperCase();
    if (s === 'H' || s === 'HIGH') return 9;
    if (s === 'M' || s === 'MED' || s === 'MEDIUM') return 6.5;
    if (s === 'L' || s === 'LOW') return 4;
    const num = parseFloat(score);
    return isNaN(num) ? 5 : num;
  };

  const parseDurationToSeconds = (secondsValue, durationText) => {
    if (durationText) {
      const text = String(durationText).trim();
      if (text.includes(':')) {
        const parts = text.split(':').map(p => p.trim()).filter(Boolean);
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

  const parseReportDate = (report) => {
    const rawDate = report?.call_date || report?.raw_data?.Date || report?.processed_at || report?.raw_data?.CallStartDateTime || '';
    if (!rawDate) return null;
    try {
      if (String(rawDate).includes('T')) {
        const dt = new Date(rawDate);
        return isNaN(dt.getTime()) ? null : dt;
      }
      if (String(rawDate).includes('-')) {
        const parts = String(rawDate).split('-');
        if (parts[0].length === 2) {
          const dt = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          return isNaN(dt.getTime()) ? null : dt;
        }
        const dt = new Date(rawDate);
        return isNaN(dt.getTime()) ? null : dt;
      }
      const dt = new Date(rawDate);
      return isNaN(dt.getTime()) ? null : dt;
    } catch (err) {
      return null;
    }
  };

  // Map cities/states to regions - comprehensive mapping for all Indian states
  const getCityRegion = (cityName, report) => {
    const city = (cityName || '').toUpperCase();
    const location = (report?.analysis?.MetaData?.Customer_Location || '').toUpperCase();
    
    // South: Karnataka, Tamil Nadu, Andhra Pradesh, Telangana, Kerala
    if (city.includes('BANGALORE') || city.includes('BENGALURU') || city.includes('KARNATAKA') ||
        city.includes('CHENNAI') || city.includes('TAMIL NADU') ||
        city.includes('HYDERABAD') || city.includes('TELANGANA') ||
        city.includes('VIJAYAWADA') || city.includes('VISAKHAPATNAM') || city.includes('GUNTUR') ||
        city.includes('ANDHRA') || city.includes('GODAVARI') || location.includes('AP') || location.includes('ANDHRA') ||
        city.includes('KOCHI') || city.includes('KERALA') || city.includes('TRIVANDRUM')) {
      return 'South';
    }
    
    // West: Maharashtra, Gujarat, Goa, Rajasthan
    if (city.includes('MUMBAI') || city.includes('PUNE') || city.includes('NAGPUR') || city.includes('MAHARASHTRA') ||
        city.includes('AHMEDABAD') || city.includes('SURAT') || city.includes('GUJARAT') ||
        city.includes('GOA') || city.includes('JAIPUR') || city.includes('RAJASTHAN')) {
      return 'West';
    }
    
    // North: Delhi, UP, Punjab, Haryana, HP, J&K, Uttarakhand
    if (city.includes('DELHI') || city.includes('NOIDA') || city.includes('GURGAON') || city.includes('GURUGRAM') ||
        city.includes('FARIDABAD') || city.includes('GHAZIABAD') || city.includes('HARYANA') ||
        city.includes('LUCKNOW') || city.includes('KANPUR') || city.includes('AGRA') || city.includes('UTTAR PRADESH') || city.includes(' UP') ||
        city.includes('CHANDIGARH') || city.includes('PUNJAB') || city.includes('LUDHIANA') ||
        city.includes('HIMACHAL') || city.includes('JAMMU') || city.includes('KASHMIR') || city.includes('UTTARAKHAND')) {
      return 'North';
    }
    
    // East: West Bengal, Odisha, Bihar, Jharkhand, Assam, Northeast
    if (city.includes('KOLKATA') || city.includes('WEST BENGAL') ||
        city.includes('BHUBANESWAR') || city.includes('CUTTACK') || city.includes('ODISHA') || city.includes('ORISSA') ||
        city.includes('PATNA') || city.includes('BIHAR') ||
        city.includes('RANCHI') || city.includes('JHARKHAND') ||
        city.includes('GUWAHATI') || city.includes('ASSAM')) {
      return 'East';
    }
    
    return 'South'; // Default fallback
  };

  const abcCalls = useMemo(() => {
    if (!allCalls.length) return [];

    return allCalls.map((report) => {
      const analysis = report.analysis || {};
      const metaData = analysis.MetaData || {};
      const callObjective = analysis['1_Call_Objective'] || {};
      const intentData = analysis['2_Intent_to_Purchase'] || {};
      const customerExpData = analysis['3_Customer_Experience'] || {}; // Fixed: was 3_Store_Experience
      const funnelData = analysis['4_Funnel_Analysis'] || {}; // Fixed: was 5_Funnel_Analysis
      const relaxData = analysis['11_RELAX_Framework'] || {}; // Fixed: was 12_RELAX_Framework
      const npsData = analysis['15_End_to_End_NPS'] || {}; // Fixed: was 16_End_to_end_NPS
      const rawData = report.raw_data || {};

      const intent = normalizeIntent(intentData.Rating);
      const customerExp = normalizeExperience(customerExpData.Rating); // Use customer experience as both store and call

      // Check if already purchased - ONLY check funnel stage (bought BEFORE call)
      const funnelStage = String(funnelData.Stage || '').toLowerCase();
      const isAlreadyPurchased = funnelStage.includes('already purchased');

      const rawPrice = rawData['Lineitem price'] || rawData.Lineitem_price || 0;
      const cartAmount = typeof rawPrice === 'number' ? rawPrice : parseFloat(rawPrice) || 0;

      // RELAX scores
      const rScore = relaxScoreToNum(relaxData.R_Reach_Out?.Score);
      const eScore = relaxScoreToNum(relaxData.E_Explore_Needs?.Score);
      const lScore = relaxScoreToNum(relaxData.L_Link_Product?.Score);
      const aScore = relaxScoreToNum(relaxData.A_Add_Value?.Score);
      const xScore = relaxScoreToNum(relaxData.X_Express_Closing?.Score);
      const overallRelax = ((rScore + eScore + lScore + aScore + xScore) / 5).toFixed(1);

      const durationSeconds = parseDurationToSeconds(report.duration, metaData.Call_Duration);
      if (durationSeconds !== null && durationSeconds < 30) {
        return null;
      }
      const callDate = parseReportDate(report);

      // NPS
      const nps = npsData.Score !== undefined ? npsData.Score : 7;

      // Agent name
      const agentName = report.agent_name || rawData.AgentName || rawData.Agent_Name || 'Unknown';

      const city = (report.city || metaData.Customer_Location || 'Unknown').toUpperCase();
      const region = getCityRegion(city, report);
      
      return {
        id: report.call_id,
        city,
        region,
        intent,
        storeExp: customerExp, // Use same customer experience for both
        callExp: customerExp,
        isAlreadyPurchased,
        cartAmount,
        agentName,
        nps,
        overallRelax: parseFloat(overallRelax),
        callDate,
        scores: {
          r: rScore,
          e: eScore,
          l: lScore,
          a: aScore,
          x: xScore,
        },
      };
    }).filter(Boolean);
  }, [allCalls]);

  const cities = useMemo(() => {
    return [...new Set(abcCalls.map((c) => c.city))].filter(Boolean).sort();
  }, [abcCalls]);

  const filteredCalls = useMemo(() => {
    let filtered = [...abcCalls];

    // Region filter
    if (selectedRegion !== 'Overall') {
      filtered = filtered.filter((c) => c.region === selectedRegion);
    }

    // City filter
    if (selectedCity !== 'All') {
      filtered = filtered.filter((c) => c.city === selectedCity);
    }

    // Store Experience filter
    if (selectedStoreExp !== 'All') {
      filtered = filtered.filter((c) => c.storeExp === selectedStoreExp);
    }

    // Call Experience filter
    if (selectedCallExp !== 'All') {
      filtered = filtered.filter((c) => c.callExp === selectedCallExp);
    }

    // Intent filter
    if (selectedIntent !== 'All') {
      if (selectedIntent === 'Purchased') {
        filtered = filtered.filter((c) => c.isAlreadyPurchased);
      } else {
        filtered = filtered.filter((c) => c.intent === selectedIntent && !c.isAlreadyPurchased);
      }
    }

    // Time range filter (date-based)
    if (timeRange !== 'all') {
      const days = parseInt(timeRange, 10);
      const cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - days);

      filtered = filtered.filter((c) => {
        if (!c.callDate) return false;
        const dt = new Date(c.callDate);
        if (isNaN(dt.getTime())) return false;
        dt.setHours(0, 0, 0, 0);
        return dt >= cutoff;
      });
    }

    return filtered;
  }, [abcCalls, selectedRegion, selectedCity, selectedStoreExp, selectedCallExp, selectedIntent, timeRange]);

  const navigateWithFilter = (predicate, description) => {
    const ids = filteredCalls.filter(predicate).map((c) => c.id || c.call_id).filter(Boolean);
    navigate('/abc-outbound-calls', { state: { filterIds: ids, filterDescription: description } });
  };

  const metrics = useMemo(() => {
    const total = filteredCalls.length;
    const alreadyPurchased = filteredCalls.filter((c) => c.isAlreadyPurchased).length;
    const salesLeads = total - alreadyPurchased;

    // Matrix: Intent × Call Experience (including Already Purchased row)
    const intents = ['High', 'Medium', 'Low'];
    const callExps = ['High', 'Medium', 'Low'];

    const matrix = {};
    intents.forEach((intent) => {
      matrix[intent] = {};
      callExps.forEach((exp) => {
        matrix[intent][exp] = filteredCalls.filter(
          (c) => !c.isAlreadyPurchased && c.intent === intent && c.callExp === exp
        ).length;
      });
    });

    // Already Purchased row
    matrix['Purchased'] = {};
    callExps.forEach((exp) => {
      matrix['Purchased'][exp] = filteredCalls.filter(
        (c) => c.isAlreadyPurchased && c.callExp === exp
      ).length;
    });

    // Agent performance
    const agentMap = {};
    filteredCalls.forEach((call) => {
      if (!agentMap[call.agentName]) {
        agentMap[call.agentName] = {
          name: call.agentName,
          calls: [],
        };
      }
      agentMap[call.agentName].calls.push(call);
    });

    const agentPerformance = Object.values(agentMap)
      .map((agent) => {
        const calls = agent.calls;
        const count = calls.length;
        const avgNps = (calls.reduce((sum, c) => sum + c.nps, 0) / count).toFixed(1);
        const avgCallExp = (
          calls.reduce((sum, c) => sum + (c.callExp === 'High' ? 9 : c.callExp === 'Medium' ? 6.5 : 4), 0) / count
        ).toFixed(1);
        const avgOverall = (calls.reduce((sum, c) => sum + c.overallRelax, 0) / count).toFixed(1);
        const avgR = (calls.reduce((sum, c) => sum + c.scores.r, 0) / count).toFixed(1);
        const avgE = (calls.reduce((sum, c) => sum + c.scores.e, 0) / count).toFixed(1);
        const avgL = (calls.reduce((sum, c) => sum + c.scores.l, 0) / count).toFixed(1);
        const avgA = (calls.reduce((sum, c) => sum + c.scores.a, 0) / count).toFixed(1);
        const avgX = (calls.reduce((sum, c) => sum + c.scores.x, 0) / count).toFixed(1);

        return {
          name: agent.name,
          leads: count,
          nps: parseFloat(avgNps),
          callExp: parseFloat(avgCallExp),
          overall: parseFloat(avgOverall),
          r: parseFloat(avgR),
          e: parseFloat(avgE),
          l: parseFloat(avgL),
          a: parseFloat(avgA),
          x: parseFloat(avgX),
        };
      })
      .sort((a, b) => b.leads - a.leads);

    // City performance (intent distribution)
    const cityMap = {};
    filteredCalls.forEach((call) => {
      if (!cityMap[call.city]) {
        cityMap[call.city] = {
          name: call.city,
          total: 0,
          highIntent: 0,
          mediumIntent: 0,
          lowIntent: 0,
          purchased: 0,
        };
      }
      cityMap[call.city].total++;
      if (call.isAlreadyPurchased) {
        cityMap[call.city].purchased++;
      } else if (call.intent === 'High') {
        cityMap[call.city].highIntent++;
      } else if (call.intent === 'Medium') {
        cityMap[call.city].mediumIntent++;
      } else {
        cityMap[call.city].lowIntent++;
      }
    });

    const cityPerformance = Object.values(cityMap).sort((a, b) => b.total - a.total);

    return {
      total,
      salesLeads,
      alreadyPurchased,
      matrix,
      agentPerformance,
      cityPerformance,
    };
  }, [filteredCalls]);

  const getInitials = (name) => {
    if (!name || name === 'Unknown') return 'UK';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getScorePillClass = (score) => {
    if (score >= 8) return 'bg-green-100 text-green-700 border-green-200';
    if (score >= 6) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-red-100 text-red-700 border-red-200';
  };

  const getAvatarColor = (name) => {
    const colors = [
      'bg-indigo-100 text-indigo-700',
      'bg-emerald-100 text-emerald-700',
      'bg-orange-100 text-orange-700',
      'bg-blue-100 text-blue-700',
      'bg-red-100 text-red-700',
      'bg-purple-100 text-purple-700',
      'bg-pink-100 text-pink-700',
      'bg-teal-100 text-teal-700',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Matrix cell colors
  const matrixColors = {
    High: {
      High: 'bg-[#3b8766]',
      Medium: 'bg-[#5ab589]',
      Low: 'bg-[#b9362a]',
    },
    Medium: {
      High: 'bg-[#8cc63f]',
      Medium: 'bg-[#dcb336]',
      Low: 'bg-[#d97029]',
    },
    Low: {
      High: 'bg-[#dcb336]',
      Medium: 'bg-[#9e682e]',
      Low: 'bg-[#852b26]',
    },
    Purchased: {
      High: 'bg-[#6366f1]',
      Medium: 'bg-[#4f46e5]',
      Low: 'bg-[#4338ca]',
    },
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading call analytics...</p>
        </div>
      </div>
    );
  }

  if (!abcCalls.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No ABC call data available for aggregated view.</p>
          <Link to="/abc-outbound-calls" className="text-blue-600 hover:text-blue-700 font-semibold">
            ← Back to ABC Reports
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="max-w-[1600px] mx-auto px-8 py-8">
        {/* HEADER & FILTERS */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <Link 
                to="/abc-outbound-calls" 
                className="text-xs font-bold text-gray-500 hover:text-gray-900 transition tracking-wide mb-1 inline-flex items-center gap-1"
              >
                GO TO ANALYSED CALLS
                <ArrowRight className="w-3 h-3" />
              </Link>
              <h1
                className="text-3xl font-bold text-gray-900"
                style={{ fontFamily: "'Fraunces', serif" }}
              >
                ABC Cart Recovery Analytics
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Central Sales Follow-up on Abandoned Carts
              </p>
            </div>
            <div className="flex gap-3 mt-4 md:mt-0">
              <button
                onClick={handleDownloadReports}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export Report
              </button>
              <Link
                to="/abc-outbound-calls/upload"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload CSV
              </Link>
            </div>
          </div>

          {/* FILTER STRIP */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Location:
              </span>
              {/* Region */}
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition shadow-sm"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em',
                }}
              >
                <option value="Overall">Region: Overall</option>
                <option value="South">South</option>
                <option value="West">West</option>
                <option value="North">North</option>
                <option value="East">East</option>
              </select>

              {/* City */}
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition shadow-sm"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em',
                }}
              >
                <option value="All">City: All</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            <div className="h-8 w-px bg-gray-200 hidden lg:block"></div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Experience:
              </span>
              {/* Store Experience */}
              <select
                value={selectedStoreExp}
                onChange={(e) => setSelectedStoreExp(e.target.value)}
                className="bg-blue-50/50 border border-blue-200 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 transition shadow-sm"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em',
                }}
              >
                <option value="All">Store Exp: All</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              {/* Call Experience */}
              <select
                value={selectedCallExp}
                onChange={(e) => setSelectedCallExp(e.target.value)}
                className="bg-green-50/50 border border-green-200 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-500 transition shadow-sm"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em',
                }}
              >
                <option value="All">Call Exp: All</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div className="h-8 w-px bg-gray-200 hidden lg:block"></div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Intent */}
              <select
                value={selectedIntent}
                onChange={(e) => setSelectedIntent(e.target.value)}
                className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition shadow-sm"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em',
                }}
              >
                <option value="All">Intent: All</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
                <option value="Purchased">Already Purchased</option>
              </select>

              {/* Time */}
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition shadow-sm"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em',
                }}
              >
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="all">All Time</option>
              </select>
            </div>
          </div>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Card 1: Total */}
          <div
            onClick={() => navigateWithFilter(() => true, 'All calls (current filters)')}
            className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition cursor-pointer border-l-4 border-l-indigo-500"
          >
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                Total Outbound Calls
              </p>
              <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded">
                +{Math.round((metrics.total / Math.max(abcCalls.length, 1)) * 100)}%
              </span>
            </div>
            <h3 className="text-4xl font-bold text-gray-900 mb-1">{metrics.total}</h3>
            <p className="text-xs text-gray-400">
              Leads from {metrics.cityPerformance.length} Cities
            </p>
          </div>

          {/* Card 2: Sales Leads */}
          <div
            onClick={() =>
              navigateWithFilter((c) => !c.isAlreadyPurchased, 'Sales Leads (not yet purchased)')
            }
            className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition cursor-pointer border-l-4 border-l-emerald-500"
          >
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-bold text-emerald-700 uppercase tracking-wide">
                Sales Leads
              </p>
              <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-4xl font-bold text-emerald-600">{metrics.salesLeads}</h3>
            <p className="text-xs text-gray-400">
              {metrics.total > 0
                ? Math.round((metrics.salesLeads / metrics.total) * 100)
                : 0}
              % Recovery Potential
            </p>
          </div>

          {/* Card 3: Already Purchased */}
          <div
            onClick={() =>
              navigateWithFilter((c) => c.isAlreadyPurchased, 'Already Purchased')
            }
            className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition cursor-pointer border-l-4 border-l-purple-500"
          >
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-bold text-purple-700 uppercase tracking-wide">
                Already Purchased
              </p>
              <div className="p-1.5 bg-purple-50 rounded-lg text-purple-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-4xl font-bold text-purple-600">{metrics.alreadyPurchased}</h3>
            <p className="text-xs text-gray-400">
              {metrics.total > 0
                ? Math.round((metrics.alreadyPurchased / metrics.total) * 100)
                : 0}
              % Bought Elsewhere/Online
            </p>
          </div>
        </div>

        {/* MATRIX SECTION */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <h2
              className="text-2xl font-bold text-gray-900"
              style={{ fontFamily: "'Fraunces', serif" }}
            >
              Purchase Intent × Call Experience Matrix
            </h2>
            <div className="h-px bg-gray-300 flex-1 ml-4"></div>
          </div>

          <div className="overflow-x-auto pb-4">
            <div className="min-w-[900px] grid grid-cols-[140px_repeat(3,minmax(0,1fr))] gap-4">
              {/* Headers */}
              <div></div>
              <div className="text-center font-bold text-gray-500 text-sm uppercase tracking-wide pb-2">
                High Call Exp
              </div>
              <div className="text-center font-bold text-gray-500 text-sm uppercase tracking-wide pb-2">
                Medium Call Exp
              </div>
              <div className="text-center font-bold text-gray-500 text-sm uppercase tracking-wide pb-2">
                Low Call Exp
              </div>

              {/* Row 1: High Intent */}
              <div className="flex items-center justify-end pr-6 font-bold text-gray-800 text-sm">
                High Intent
              </div>
              {['High', 'Medium', 'Low'].map((exp) => (
                <button
                  key={`High-${exp}`}
                  onClick={() =>
                    navigateWithFilter(
                      (c) => !c.isAlreadyPurchased && c.intent === 'High' && c.callExp === exp,
                      `High Intent × ${exp} Call Exp`
                    )
                  }
                  className={`relative rounded-2xl p-6 text-center text-white cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg min-h-[140px] flex flex-col items-center justify-center ${matrixColors.High[exp]}`}
                >
                  <div className="text-5xl font-bold leading-none mb-1 drop-shadow-sm">
                    {metrics.matrix.High[exp]}
                  </div>
                  <div className="text-sm uppercase tracking-wide opacity-90 font-semibold">
                    Calls
                  </div>
                </button>
              ))}

              {/* Row 2: Medium Intent */}
              <div className="flex items-center justify-end pr-6 font-bold text-gray-800 text-sm">
                Medium Intent
              </div>
              {['High', 'Medium', 'Low'].map((exp) => (
                <button
                  key={`Medium-${exp}`}
                  onClick={() =>
                    navigateWithFilter(
                      (c) => !c.isAlreadyPurchased && c.intent === 'Medium' && c.callExp === exp,
                      `Medium Intent × ${exp} Call Exp`
                    )
                  }
                  className={`relative rounded-2xl p-6 text-center text-white cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg min-h-[140px] flex flex-col items-center justify-center ${matrixColors.Medium[exp]}`}
                >
                  <div className="text-5xl font-bold leading-none mb-1 drop-shadow-sm">
                    {metrics.matrix.Medium[exp]}
                  </div>
                  <div className="text-sm uppercase tracking-wide opacity-90 font-semibold">
                    Calls
                  </div>
                </button>
              ))}

              {/* Row 3: Low Intent */}
              <div className="flex items-center justify-end pr-6 font-bold text-gray-800 text-sm">
                Low Intent
              </div>
              {['High', 'Medium', 'Low'].map((exp) => (
                <button
                  key={`Low-${exp}`}
                  onClick={() =>
                    navigateWithFilter(
                      (c) => !c.isAlreadyPurchased && c.intent === 'Low' && c.callExp === exp,
                      `Low Intent × ${exp} Call Exp`
                    )
                  }
                  className={`relative rounded-2xl p-6 text-center text-white cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg min-h-[140px] flex flex-col items-center justify-center ${matrixColors.Low[exp]}`}
                >
                  <div className="text-5xl font-bold leading-none mb-1 drop-shadow-sm">
                    {metrics.matrix.Low[exp]}
                  </div>
                  <div className="text-sm uppercase tracking-wide opacity-90 font-semibold">
                    Calls
                  </div>
                </button>
              ))}

              {/* Row 4: Already Purchased */}
              <div className="flex items-center justify-end pr-6 font-bold text-purple-800 text-sm border-t pt-4 border-gray-200">
                Purchased
              </div>
              {['High', 'Medium', 'Low'].map((exp) => (
                <button
                  key={`Purchased-${exp}`}
                  onClick={() =>
                    navigateWithFilter(
                      (c) => c.isAlreadyPurchased && c.callExp === exp,
                      `Already Purchased × ${exp} Call Exp`
                    )
                  }
                  className={`relative rounded-2xl p-6 text-center text-white cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg min-h-[140px] flex flex-col items-center justify-center mt-4 ${matrixColors.Purchased[exp]}`}
                >
                  <div className="text-5xl font-bold leading-none mb-1 drop-shadow-sm">
                    {metrics.matrix.Purchased[exp]}
                  </div>
                  <div className="text-sm uppercase tracking-wide opacity-90 font-semibold">
                    Calls
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* AGENT PERFORMANCE MATRIX */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm mb-8">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-amber-500" />
              <h2
                className="text-xl font-bold text-gray-900"
                style={{ fontFamily: "'Fraunces', serif" }}
              >
                Central Agent Performance Matrix
              </h2>
            </div>
            <p className="text-sm text-gray-500 mt-1 ml-9">
              Effectiveness in recovering abandoned carts
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Agent Name
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-gray-900 uppercase tracking-wider bg-gray-100 border-l border-r border-gray-200">
                    Overall Score
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                    # Leads
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                    NPS
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Call CX
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-amber-600 uppercase tracking-wider border-l border-gray-200">
                    R
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-amber-600 uppercase tracking-wider">
                    E
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-amber-600 uppercase tracking-wider">
                    L
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-amber-600 uppercase tracking-wider">
                    A
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-amber-600 uppercase tracking-wider">
                    X
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {metrics.agentPerformance.map((agent) => (
                  <tr 
                    key={agent.name}
                    onClick={() => navigateWithFilter(
                      c => c.agentName === agent.name,
                      `Agent: ${agent.name}`
                    )}
                    className="hover:bg-blue-50 transition cursor-pointer"
                  >
                    <td className="p-4 flex items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mr-3 ${getAvatarColor(
                          agent.name
                        )}`}
                      >
                        {getInitials(agent.name)}
                      </div>
                      <div className="font-bold text-gray-900">{agent.name}</div>
                    </td>
                    <td className="p-4 text-center bg-gray-50 border-l border-r border-gray-200">
                      <span
                        className={`inline-flex items-center justify-center w-12 h-7 rounded-lg font-bold text-sm border ${getScorePillClass(
                          agent.overall
                        )}`}
                      >
                        {agent.overall}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">
                        {agent.leads}
                      </span>
                    </td>
                    <td className="p-4 text-center text-gray-900 font-bold">{agent.nps}</td>
                    <td className="p-4 text-center text-gray-900">{agent.callExp}</td>
                    <td className="p-4 text-center border-l border-gray-100 text-gray-600">
                      {agent.r}
                    </td>
                    <td className="p-4 text-center text-gray-600">{agent.e}</td>
                    <td className="p-4 text-center text-gray-600">{agent.l}</td>
                    <td className="p-4 text-center text-gray-600">{agent.a}</td>
                    <td className="p-4 text-center text-gray-600">{agent.x}</td>
                  </tr>
                ))}
                {metrics.agentPerformance.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-gray-500">
                      No agent data available for current filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* CITY PERFORMANCE MATRIX */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm mb-8">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Building2 className="w-6 h-6 text-blue-600" />
              <h2
                className="text-xl font-bold text-gray-900"
                style={{ fontFamily: "'Fraunces', serif" }}
              >
                City Performance Matrix
              </h2>
            </div>
            <p className="text-sm text-gray-500 mt-1 ml-9">Intent Distribution by Cities</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    City
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-gray-900 uppercase tracking-wider bg-gray-100">
                    Total Calls
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-green-700 uppercase tracking-wider">
                    High Intent
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-yellow-700 uppercase tracking-wider">
                    Medium Intent
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-red-700 uppercase tracking-wider">
                    Low Intent
                  </th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-blue-700 uppercase tracking-wider">
                    Already Purchased
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {metrics.cityPerformance.map((city) => (
                  <tr 
                    key={city.name}
                    onClick={() => navigateWithFilter(
                      c => c.city === city.name,
                      `City: ${city.name}`
                    )}
                    className="hover:bg-blue-50 transition cursor-pointer"
                  >
                    <td className="p-4">
                      <div className="font-bold text-gray-900">{city.name}</div>
                    </td>
                    <td className="p-4 text-center font-bold text-gray-900 bg-gray-50">
                      {city.total}
                    </td>
                    <td className="p-4 text-center">{city.highIntent}</td>
                    <td className="p-4 text-center">{city.mediumIntent}</td>
                    <td className="p-4 text-center">{city.lowIntent}</td>
                    <td className="p-4 text-center font-bold text-blue-600">{city.purchased}</td>
                  </tr>
                ))}
                {metrics.cityPerformance.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      No city data available for current filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* FOOTER */}
        <div className="text-center text-gray-400 text-sm mt-8 pb-8">
          Duroflex Analytics • Powered by AI Analysis
        </div>
      </div>
    </div>
  );
};

export default AbcAggregatedDashboard;
