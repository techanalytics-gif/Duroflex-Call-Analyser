import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LogOut, BarChart3, Upload, Download, ShoppingCart, Users, CheckCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://duroflex-call-analyser.onrender.com';

// Helper to safely get nested values
const getField = (obj, ...paths) => {
  for (const path of paths) {
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        value = undefined;
        break;
      }
    }
    if (value !== undefined && value !== null) return value;
  }
  return null;
};

// Flatten nested JSON objects for CSV export
const flattenObject = (obj, prefix = '') => {
  const result = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else if (Array.isArray(value)) {
      result[newKey] = value.join('; ');
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
  const flattened = reports.map(r => flattenObject(r));
  const headers = Array.from(new Set(flattened.flatMap(item => Object.keys(item))));
  const rows = [headers.join(',')];
  flattened.forEach(item => {
    const row = headers.map(h => toCsvValue(item[h]));
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

const AbcReportsList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter states
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [selectedCartValue, setSelectedCartValue] = useState('All');
  const [selectedIntent, setSelectedIntent] = useState('All');
  const [selectedCallExp, setSelectedCallExp] = useState('All');
  const [timeRange, setTimeRange] = useState('30');

  // External filter from aggregated dashboard
  const filterIds = location.state?.filterIds;
  const filterDescription = location.state?.filterDescription;

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/abc-calls/reports`);
      const data = await res.json();
      setReports(data.reports || []);
    } catch (err) {
      setError('Failed to load ABC call reports');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('admin_email');
    navigate('/');
  };

  // Process reports with extracted fields
  const processedReports = useMemo(() => {
    return reports.map(report => {
      const analysis = report.analysis || {};
      const rawData = report.raw_data || {};
      const metadata = analysis.MetaData || {};
      
      // Extract fields using new schema paths with fallbacks
      const callObjectiveType = getField(analysis, '1_Call_Objective.Type') || '';
      const intent = getField(analysis, '2_Intent_to_Purchase.Rating') || 'Medium';
      const customerExp = getField(analysis, '3_Customer_Experience.Rating') || 'Medium';
      const funnelStage = getField(analysis, '4_Funnel_Analysis.Stage') || '';
      const region = metadata.Call_Region || report.region || 'Unknown';
      const customerCity = metadata.Customer_Location || report.city || 'Unknown';
      
      // Get cart value from raw_data or metadata
      const rawCartValue = rawData['Lineitem price'] || rawData.Lineitem_price || 0;
      const considerationValue = metadata.Consideration_Value || '';
      
      // Duration from metadata
      const durationSeconds = parseDurationToSeconds(report.duration, metadata.Call_Duration);
      if (durationSeconds !== null && durationSeconds < 30) {
        return null;
      }
      const duration = metadata.Call_Duration || '00:00';
      
      // Invitations
      const storeVisitRating = getField(analysis, '9_Invitations.Store_Visit.Rating') || 'Low';
      const videoDemoRating = getField(analysis, '9_Invitations.Video_Demo.Rating') || 'Low';
      
      // Determine lead type from call objective
      let leadType = 'Sales Lead';
      const objType = callObjectiveType.toLowerCase();
      if (objType.includes('post') || objType.includes('service') || objType.includes('complaint') || objType.includes('delivery')) {
        leadType = 'Post-Sales';
      } else if (objType.includes('recovery')) {
        leadType = 'Recovery';
      }
      
      // Check if already purchased - ONLY check funnel stage (bought BEFORE call), NOT is_Converted (bought AFTER call)
      const funnelStageLower = funnelStage.toLowerCase();
      const isPurchased = funnelStageLower.includes('already purchased');
      
      // Determine invited to store (High/Medium = Yes, Low = No)
      let invitedToStore = 'No';
      if (typeof storeVisitRating === 'string') {
        const rating = storeVisitRating.toLowerCase();
        invitedToStore = (rating === 'high' || rating === 'medium' || rating === 'h' || rating === 'm') ? 'Yes' : 'No';
      }
      
      // Determine invited for video demo
      let invitedForVideo = 'No';
      if (typeof videoDemoRating === 'string') {
        const rating = videoDemoRating.toLowerCase();
        invitedForVideo = (rating === 'high' || rating === 'medium' || rating === 'h' || rating === 'm') ? 'Yes' : 'No';
      }
      
      // Parse call date
      let callDate = null;
      const dateStr = report.call_date || rawData.Date || report.processed_at || rawData.CallStartDateTime || '';
      if (dateStr) {
        try {
          if (dateStr.includes('T')) {
            callDate = new Date(dateStr);
          } else if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            if (parts[0].length === 2) {
              // DD-MM-YYYY format
              callDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            } else {
              callDate = new Date(dateStr);
            }
          } else {
            callDate = new Date(dateStr);
          }
          // Validate the date is valid
          if (isNaN(callDate.getTime())) {
            callDate = null;
          }
        } catch (e) {
          callDate = null;
        }
      }
      
      // Format cart value for display - PRIORITIZE metadata.Consideration_Value over raw price
      let cartValueDisplay = 'N/A';
      if (considerationValue && considerationValue !== 'N/A' && considerationValue.toLowerCase() !== 'unknown') {
        // Use metadata Consideration_Value if available and meaningful
        cartValueDisplay = considerationValue;
      } else if (rawCartValue > 0) {
        // Fallback to calculating from raw price
        if (rawCartValue >= 50000) cartValueDisplay = '50k+';
        else if (rawCartValue >= 25000) cartValueDisplay = '25k - 50k';
        else if (rawCartValue >= 15000) cartValueDisplay = '15k to 25k';
        else cartValueDisplay = 'Below 15k';
      }
      
      // Cart value bucket for filtering - PRIORITIZE metadata over raw price
      let cartValueBucket = 'low';
      const valLower = considerationValue.toLowerCase();
      
      // If we have a meaningful Consideration_Value from metadata, use it for bucketing
      if (considerationValue && valLower !== 'unknown' && considerationValue !== 'N/A') {
        // 50k+ bucket: check for exact "50k+", "50k"
        if (valLower === '50k+' || valLower === '50k' || valLower.includes('premium') || valLower.includes('king')) {
          cartValueBucket = '50k';
        }
        // 25k-50k bucket: check for exact "25k-50k" (has both 25 and 50)
        else if (valLower === '25k-50k' || (valLower.includes('25') && valLower.includes('50')) || valLower.includes('queen')) {
          cartValueBucket = '25k';
        }
        // 15k-25k bucket: check for exact "15k-25k" (has both 15 and 25)
        else if (valLower === '15k-25k' || (valLower.includes('15') && valLower.includes('25')) || valLower.includes('double')) {
          cartValueBucket = '15k';
        }
        // Below 15k bucket: keywords
        else if (valLower.includes('single') || valLower.includes('budget') || valLower.includes('below')) {
          cartValueBucket = 'low';
        }
        // Default for unrecognized metadata values
        else {
          cartValueBucket = 'low';
        }
      } else {
        // Fallback to raw numeric value if no meaningful metadata
        if (rawCartValue >= 50000) {
          cartValueBucket = '50k';
        } else if (rawCartValue >= 25000 && rawCartValue < 50000) {
          cartValueBucket = '25k';
        } else if (rawCartValue >= 15000 && rawCartValue < 25000) {
          cartValueBucket = '15k';
        } else {
          cartValueBucket = 'low';
        }
      }
      
      // Determine display intent - show "Already Purchased" for those calls
      let intentDisplay = normalizeRating(intent);
      if (funnelStageLower.includes('already purchased')) {
        intentDisplay = 'Already Purchased';
      }
      
      return {
        ...report,
        callObjectiveType,
        intent: normalizeRating(intent),
        intentDisplay, // Use intentDisplay for rendering (shows "Already Purchased" when applicable)
        customerExp: normalizeRating(customerExp),
        region,
        customerCity,
        duration,
        leadType,
        isPurchased,
        invitedToStore,
        invitedForVideo,
        callDate,
        cartValueDisplay,
        cartValueBucket,
        rawCartValue
      };
    }).filter(Boolean);
  }, [reports]);

  // Get unique regions for filter
  const regions = useMemo(() => {
    const uniqueRegions = [...new Set(processedReports.map(r => r.region).filter(r => r && r !== 'Unknown'))];
    return ['All', ...uniqueRegions.sort()];
  }, [processedReports]);

  // Apply filters
  const filteredReports = useMemo(() => {
    let result = processedReports;

    // External filter from aggregated dashboard
    if (filterIds && Array.isArray(filterIds) && filterIds.length > 0) {
      result = result.filter(r => filterIds.includes(r.call_id));
    }

    // Region filter
    if (selectedRegion !== 'All') {
      result = result.filter(r => r.region === selectedRegion);
    }

    // Cart value filter
    if (selectedCartValue !== 'All') {
      result = result.filter(r => r.cartValueBucket === selectedCartValue);
    }

    // Call Experience filter
    if (selectedCallExp !== 'All') {
      result = result.filter(r => r.customerExp === selectedCallExp);
    }

    // Time filter (skip when external filterIds are provided)
    if (timeRange !== 'all' && !(filterIds && Array.isArray(filterIds) && filterIds.length > 0)) {
      const days = parseInt(timeRange, 10);
      const cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - days);
      
      result = result.filter(r => {
        if (!r.callDate) return false;
        const reportDate = new Date(r.callDate);
        // Validate the report date is valid
        if (isNaN(reportDate.getTime())) return false;
        reportDate.setHours(0, 0, 0, 0);
        return reportDate >= cutoff;
      });
    }

    // Intent filter
    if (selectedIntent !== 'All') {
      if (selectedIntent === 'Purchased') {
        result = result.filter(r => r.isPurchased);
      } else {
        result = result.filter(r => r.intent === selectedIntent && !r.isPurchased);
      }
    }

    return result;
  }, [processedReports, filterIds, selectedRegion, selectedCartValue, selectedCallExp, timeRange, selectedIntent]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const total = filteredReports.length;
    const highIntent = filteredReports.filter(r => r.intent === 'High' && !r.isPurchased).length;
    
    // Count post-purchase calls (already purchased before the call)
    const postPurchase = filteredReports.filter(r => r.isPurchased).length;
    
    // Count sales leads (all calls that are NOT already purchased)
    const salesLeads = filteredReports.filter(r => !r.isPurchased).length;
    
    return {
      total,
      highIntentPercent: total > 0 ? Math.round((highIntent / total) * 100) : 0,
      salesLeads,
      postPurchase
    };
  }, [filteredReports]);

  // Show all reports without pagination
  const paginatedReports = useMemo(() => {
    return filteredReports;
  }, [filteredReports]);

  // Reset filters
  const handleResetFilters = () => {
    setSelectedRegion('All');
    setSelectedCartValue('All');
    setSelectedCallExp('All');
    setTimeRange('30');
    setSelectedIntent('All');
    // Clear external filter
    if (filterIds) {
      navigate('/abc-outbound-calls', { replace: true });
    }
  };

  // Helper functions
  function normalizeRating(val) {
    if (!val) return 'Medium';
    const str = String(val).toUpperCase().trim();
    if (str.includes('HIGH') || str === 'H') return 'High';
    if (str.includes('LOW') || str === 'L') return 'Low';
    return 'Medium';
  }

  function parseDurationToSeconds(secondsValue, durationText) {
    if (typeof secondsValue === 'number' && !Number.isNaN(secondsValue)) return secondsValue;
    if (typeof secondsValue === 'string' && secondsValue.trim().match(/^\d+$/)) return parseInt(secondsValue, 10);
    if (!durationText) return null;
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
    return null;
  }

  function formatDate(date) {
    if (!date) return { date: 'N/A', time: '' };
    const d = new Date(date);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const hours = d.getHours();
    const mins = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return {
      date: `${month} ${day}`,
      time: `${hour12.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`
    };
  }

  function getIntentDotColor(intent) {
    if (intent === 'High') return 'bg-emerald-500';
    if (intent === 'Medium') return 'bg-amber-500';
    return 'bg-red-500';
  }

  function getExpColor(exp) {
    if (exp === 'High') return 'text-emerald-600 font-bold';
    if (exp === 'Medium') return 'text-yellow-600 font-bold';
    return 'text-gray-600 font-bold';
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading ABC call reports...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="max-w-[1800px] mx-auto px-8 py-8">
        
        {/* HEADER */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <Link 
              to="/dashboard" 
              className="text-xs font-bold text-gray-500 hover:text-gray-900 transition tracking-wide mb-1 inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              BACK TO DASHBOARD
            </Link>
            <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
              ABC Outbound Calls
            </h1>
            <p className="text-sm text-gray-500 mt-1">Recovery attempts for abandoned website checkouts</p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => exportReportsAsCsv(filteredReports, 'abc_calls_report.csv')}
              className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-bold transition shadow-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <Link
              to="/abc-outbound-calls/upload"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition shadow-sm flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload CSV
            </Link>
            <Link
              to="/abc-outbound-calls/analytics"
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition shadow-sm flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              Analytics
            </Link>
            <button
              onClick={handleLogout}
              className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 px-3 py-2.5 rounded-lg text-sm font-bold transition shadow-sm flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* KPI SUMMARY ROW */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Abandoned Carts</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.total}</p>
            </div>
            <div className="p-2 bg-gray-50 text-gray-600 rounded-lg">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">High Intent %</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{kpis.highIntentPercent}%</p>
            </div>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Sales Leads</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{kpis.salesLeads}</p>
            </div>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Post Purchase</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{kpis.postPurchase}</p>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* External Filter Banner */}
        {filterIds && (
          <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">
            <div className="text-sm font-semibold">
              Showing filtered results{filterDescription ? `: ${filterDescription}` : ''} ({filteredReports.length} of {reports.length})
            </div>
            <button
              onClick={handleResetFilters}
              className="text-xs font-bold px-3 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* FILTER STRIP */}
        {!filterIds && (
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-4 items-center mb-8">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Filters:</span>
            
            {/* Region */}
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                backgroundPosition: 'right 0.5rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.5em 1.5em'
              }}
            >
              {regions.map(r => (
                <option key={r} value={r}>{r === 'All' ? 'Region: All' : r}</option>
              ))}
            </select>

            {/* Consideration Value */}
            <select
              value={selectedCartValue}
              onChange={(e) => setSelectedCartValue(e.target.value)}
              className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                backgroundPosition: 'right 0.5rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.5em 1.5em'
              }}
            >
              <option value="All">Consideration Value: All</option>
              <option value="50k">50k+</option>
              <option value="25k">25k to 50k</option>
              <option value="15k">15k to 25k</option>
              <option value="low">Below 15k</option>
            </select>

            {/* Purchase Intent */}
            <select
              value={selectedIntent}
              onChange={(e) => setSelectedIntent(e.target.value)}
              className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                backgroundPosition: 'right 0.5rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.5em 1.5em'
              }}
            >
              <option value="All">Purchase Intent: All</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
              <option value="Purchased">Already Purchased</option>
            </select>

            {/* Call Experience */}
            <select
              value={selectedCallExp}
              onChange={(e) => setSelectedCallExp(e.target.value)}
              className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                backgroundPosition: 'right 0.5rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.5em 1.5em'
              }}
            >
              <option value="All">Call Experience: All</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>

            {/* Time */}
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                backgroundPosition: 'right 0.5rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.5em 1.5em'
              }}
            >
              <option value="7">Time: Last 7 Days</option>
              <option value="30">Time: Last 30 Days</option>
              <option value="90">Time: Last 3 Months</option>
              <option value="all">Time: All Time</option>
            </select>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-400 font-medium">Showing {filteredReports.length} Results</span>
              <button
                onClick={handleResetFilters}
                className="text-xs text-red-500 hover:text-red-700 font-bold uppercase tracking-wider"
              >
                Reset
              </button>
            </div>
          </div>
        )}

        {/* TABLE SECTION */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
          <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-left text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Call ID</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Date & Time</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Customer City</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Duration</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Lead Type</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Consideration Value</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Purchase Intent</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider leading-tight">Call<br/>Experience</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider leading-tight">Invited to<br/>Store</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider leading-tight">Invited for<br/>Video Demo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedReports.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="px-4 py-8 text-center text-gray-400">
                      No calls match the current filters.
                    </td>
                  </tr>
                ) : (
                  paginatedReports.map((report) => {
                    const dateInfo = formatDate(report.callDate);
                    return (
                      <tr 
                        key={report.call_id} 
                        onClick={() => navigate(`/abc-outbound-calls/${report.call_id}`)}
                        className="hover:bg-gray-50 transition cursor-pointer"
                      >
                        {/* Call ID */}
                        <td className="px-4 py-3 text-left">
                          <span className="font-mono text-xs font-bold text-gray-500">
                            {report.call_id ? report.call_id.slice(-8).toUpperCase() : 'N/A'}
                          </span>
                        </td>
                        
                        {/* Date & Time */}
                        <td className="px-4 py-3 text-center">
                          <div className="text-sm font-semibold text-gray-900">{dateInfo.date}</div>
                          <div className="text-xs text-gray-500">{dateInfo.time}</div>
                        </td>
                        
                        {/* Customer City */}
                        <td className="px-4 py-3 text-center">
                          <div className="font-bold text-gray-900">{report.customerCity}</div>
                          <div className="text-xs text-gray-500">{report.region !== 'Unknown' ? report.region.slice(0, 2).toUpperCase() : ''}</div>
                        </td>
                        
                        {/* Duration */}
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono text-sm text-gray-600">{report.duration}</span>
                        </td>
                        
                        {/* Lead Type */}
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase whitespace-nowrap ${
                            report.leadType === 'Sales Lead' 
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                              : report.leadType === 'Recovery'
                              ? 'bg-blue-100 text-blue-700 border border-blue-200'
                              : 'bg-blue-100 text-blue-700 border border-blue-200'
                          }`}>
                            {report.leadType}
                          </span>
                        </td>
                        
                        {/* Consideration Value */}
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm ${report.cartValueDisplay === 'N/A' ? 'text-gray-400' : 'font-bold text-gray-900'}`}>
                            {report.cartValueDisplay}
                          </span>
                        </td>
                        
                        {/* Purchase Intent */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center">
                            <span className={`h-2 w-2 rounded-full mr-2 ${report.intentDisplay === 'Already Purchased' ? 'bg-purple-500' : getIntentDotColor(report.intent)}`}></span>
                            <span className="font-bold text-gray-700 text-sm">{report.intentDisplay}</span>
                          </div>
                        </td>
                        
                        {/* Call Experience */}
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm ${getExpColor(report.customerExp)}`}>
                            {report.customerExp === 'Medium' ? 'Med' : report.customerExp}
                          </span>
                        </td>
                        
                        {/* Invited to Store */}
                        <td className="px-4 py-3 text-center">
                          {report.invitedToStore === 'Yes' ? (
                            <span className="text-sm font-bold text-green-600 flex items-center justify-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                              Yes
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-red-400">No</span>
                          )}
                        </td>
                        
                        {/* Invited for Video Demo */}
                        <td className="px-4 py-3 text-center">
                          {report.invitedForVideo === 'Yes' ? (
                            <span className="text-sm font-bold text-green-600 flex items-center justify-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                              Yes
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-red-400">No</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          
          {/* Results count */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">
              Showing <span className="font-bold">{filteredReports.length}</span> {filteredReports.length === 1 ? 'result' : 'results'}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AbcReportsList;
