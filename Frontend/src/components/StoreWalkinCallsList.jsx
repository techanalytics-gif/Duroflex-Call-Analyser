import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LogOut, BarChart3, Upload, Download, Users, DollarSign, CheckCircle } from 'lucide-react';

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

const StoreWalkinCallsList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter states
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [selectedStore, setSelectedStore] = useState('All');
  const [selectedValue, setSelectedValue] = useState('All');
  const [selectedIntent, setSelectedIntent] = useState('All');
  const [selectedCallExp, setSelectedCallExp] = useState('All');
  const [selectedStoreExp, setSelectedStoreExp] = useState('All');
  const [timeRange, setTimeRange] = useState('30');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 999999; // Show all records

  // External filter from aggregated dashboard
  const filterIds = location.state?.filterIds;
  const filterDescription = location.state?.filterDescription;

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/outbound-calls`);
      const data = await res.json();
      setReports(data.reports || []);
    } catch (err) {
      setError('Failed to load store walk-in call reports');
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
      const metadata = analysis.MetaData || {};
      
      // Extract fields using new schema paths
      const callObjectiveType = getField(analysis, '1_Call_Objective.Type') || '';
      const intentRating = getField(analysis, '2_Intent_to_Purchase.Rating') || 'Medium';
      const storeExp = getField(analysis, '3_Store_Experience.Rating') || 'Medium';
      const callExp = getField(analysis, '4_Call_Experience.Rating') || 'Medium';
      
      // Normalize region: West/Central → West, N/A or unknown → South, standardize to North/South/East/West
      // First check if MetaData.Call_Region is usable (not N/A, not null, not empty)
      let regionSource = metadata.Call_Region;
      if (!regionSource || regionSource === 'N/A' || regionSource.toString().trim() === '') {
        regionSource = report.region;
      }
      
      let region = 'South'; // Default to South if no valid region
      if (regionSource && typeof regionSource === 'string') {
        const regionStr = regionSource.trim();
        const regionUpper = regionStr.toUpperCase();
        
        // Check exact matches first, then substring matches
        if (regionUpper === 'NORTH' || regionUpper.includes('NORTH')) {
          region = 'North';
        } else if (regionUpper === 'SOUTH' || regionUpper.includes('SOUTH')) {
          region = 'South';
        } else if (regionUpper === 'EAST' || regionUpper.includes('EAST')) {
          region = 'East';
        } else if (regionUpper === 'WEST' || regionUpper.includes('WEST')) {
          region = 'West';
        } else if (regionUpper === 'NA' || regionUpper === 'N/A' || regionUpper === 'NONE' || regionUpper === '') {
          region = 'South';
        } else {
          // Unknown region format, default to South
          region = 'South';
        }
      }
      
      const storeName = report.store_name || 'Unknown';
      
      // Get consideration value from metadata
      const considerationValue = metadata.Consideration_Value || 'N/A';
      
      // Duration from metadata or report
      const durationSeconds = parseDurationToSeconds(report.duration, metadata.Call_Duration);
      if (durationSeconds !== null && durationSeconds < 30) {
        return null;
      }
      const duration = metadata.Call_Duration || formatDurationSeconds(report.duration);
      
      // Home Measurement Hook
      const homeMeasurementRating = getField(analysis, '10_Invitations.Home_Measurement.Rating') || 'Low';
      
      // Determine lead type from call objective or intent
      let leadType = 'Sales Lead';
      const objType = callObjectiveType.toLowerCase();
      const intentLower = intentRating.toLowerCase();
      if (objType.includes('post') || objType.includes('service') || objType.includes('complaint') || 
          intentLower.includes('purchased') || intentLower.includes('already')) {
        leadType = 'Post Purchase';
      }
      
      // Check if already purchased
      const isPurchased = intentLower.includes('purchased') || intentLower.includes('already') || 
                          objType.includes('post purchase');
      
      // Normalize intent for display
      let intent = normalizeRating(intentRating);
      if (isPurchased) {
        intent = 'Already Purchased';
      }
      
      // Determine measurement hook used (High/Medium = Yes, Low = No)
      let measurementHookUsed = 'No';
      if (leadType === 'Post Purchase') {
        measurementHookUsed = 'N/A';
      } else if (typeof homeMeasurementRating === 'string') {
        const rating = homeMeasurementRating.toLowerCase();
        measurementHookUsed = (rating === 'high' || rating === 'medium' || rating === 'h' || rating === 'm') ? 'Yes' : 'No';
      }
      
      // Parse call date
      let callDate = null;
      const dateStr = report.call_date || report.created_date || report.analyzed_at || '';
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
          // Validate the date
          if (isNaN(callDate.getTime())) {
            callDate = null;
          }
        } catch (e) {
          callDate = null;
        }
      }
      
      // Format consideration value for display
      let valueDisplay = considerationValue;
      let valueBucket = 'low';
      const valLower = considerationValue.toLowerCase();
      // "Unknown" and "N/A" go to 'low' bucket (Below 15k)
      if (valLower === 'unknown' || considerationValue === 'N/A') {
        valueBucket = 'low';
        valueDisplay = considerationValue;
      }
      // 50k+ bucket: check for exact "50k+", "50k", or patterns matching 50k
      else if (valLower === '50k+' || valLower === '50k' || valLower.startsWith('50') || valLower.includes('premium') || valLower.includes('king')) {
        valueBucket = '50k';
        if (!considerationValue.includes('k')) valueDisplay = '50k+';
      }
      // 25k-50k bucket: check for exact "25k-50k" (has both 25 and 50), or just "25k"
      else if (valLower === '25k-50k' || (valLower.includes('25') && valLower.includes('50')) || valLower === '25k' || valLower.includes('queen')) {
        valueBucket = '25k';
        if (!considerationValue.includes('k')) valueDisplay = '25k to 50k';
      }
      // 15k-25k bucket: check for exact "15k-25k" (has both 15 and 25), or just "15k"
      else if (valLower === '15k-25k' || (valLower.includes('15') && valLower.includes('25')) || valLower === '15k' || valLower.includes('double')) {
        valueBucket = '15k';
        if (!considerationValue.includes('k')) valueDisplay = '15k to 25k';
      }
      // Below 15k bucket: single/budget keywords
      else if (valLower.includes('single') || valLower.includes('budget') || valLower.includes('below')) {
        valueBucket = 'low';
        if (!considerationValue.includes('k')) valueDisplay = 'Below 15k';
      }
      // Default: any other unrecognized value goes to low
      else {
        valueBucket = 'low';
        valueDisplay = considerationValue;
      }
      
      // Extract city from store name or use region
      let city = '';
      if (storeName.includes(' ')) {
        const parts = storeName.split(' ');
        city = parts[parts.length - 1];
      } else {
        city = region !== 'Unknown' ? region : '';
      }
      
      return {
        ...report,
        callObjectiveType,
        intent,
        intentRaw: intentRating,
        storeExp: normalizeExperience(storeExp),
        callExp: normalizeRating(callExp),
        region,
        storeName,
        city,
        duration,
        leadType,
        isPurchased,
        measurementHookUsed,
        callDate,
        valueDisplay,
        valueBucket
      };
    }).filter(Boolean);
  }, [reports]);

  // Get unique regions and stores for filters
  const regions = useMemo(() => {
    // Always show all four regions in fixed order
    return ['All', 'North', 'South', 'East', 'West'];
  }, []);

  const stores = useMemo(() => {
    const uniqueStores = [...new Set(processedReports.map(r => r.storeName).filter(Boolean))];
    return ['All', ...uniqueStores.sort()];
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

    // Store filter
    if (selectedStore !== 'All') {
      result = result.filter(r => r.storeName === selectedStore);
    }

    // Consideration value filter
    if (selectedValue !== 'All') {
      result = result.filter(r => r.valueBucket === selectedValue);
    }

    // Call Experience filter
    if (selectedCallExp !== 'All') {
      result = result.filter(r => r.callExp === selectedCallExp);
    }

    // Store Visit Experience filter
    if (selectedStoreExp !== 'All') {
      result = result.filter(r => r.storeExp === selectedStoreExp);
    }

    // Time filter
    if (timeRange !== 'all') {
      const days = parseInt(timeRange, 10);
      const cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - days);
      
      result = result.filter(r => {
        if (!r.callDate) return false;
        const reportDate = new Date(r.callDate);
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
  }, [processedReports, filterIds, selectedRegion, selectedStore, selectedValue, selectedCallExp, selectedStoreExp, timeRange, selectedIntent]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    const total = filteredReports.length;
    const highIntent = filteredReports.filter(r => r.intent === 'High' && !r.isPurchased).length;
    const salesLeads = filteredReports.filter(r => r.leadType === 'Sales Lead').length;
    const postPurchase = filteredReports.filter(r => r.leadType === 'Post Purchase' || r.isPurchased).length;
    
    return {
      total,
      highIntentPercent: total > 0 ? Math.round((highIntent / total) * 100) : 0,
      salesLeads,
      postPurchase
    };
  }, [filteredReports]);

  // Pagination
  const paginatedReports = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredReports.slice(start, start + itemsPerPage);
  }, [filteredReports, currentPage]);

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);

  // Reset filters
  const handleResetFilters = () => {
    setSelectedRegion('All');
    setSelectedStore('All');
    setSelectedValue('All');
    setSelectedCallExp('All');
    setSelectedStoreExp('All');
    setTimeRange('30');
    setSelectedIntent('All');
    setCurrentPage(1);
    // Clear external filter
    if (filterIds) {
      navigate('/storewalkin-outbound-calls', { replace: true });
    }
  };

  // Helper functions
  function normalizeRating(val) {
    if (!val) return 'Medium';
    const str = String(val).toUpperCase().trim();
    if (str.includes('HIGH') || str === 'H') return 'High';
    if (str.includes('LOW') || str === 'L') return 'Low';
    if (str.includes('MEDIUM') || str === 'M') return 'Med';
    return 'Med';
  }

  function normalizeExperience(val) {
    if (!val) return 'Avg';
    const str = String(val).toUpperCase().trim();
    if (str.includes('HIGH') || str.includes('GOOD') || str.includes('EXCELLENT')) return 'Good';
    if (str.includes('LOW') || str.includes('POOR') || str.includes('BAD')) return 'Poor';
    return 'Avg';
  }

  function formatDurationSeconds(seconds) {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function parseDurationToSeconds(secondsValue, durationText) {
    // Prioritize Call_Duration (formatted string) over raw duration field for accuracy
    if (durationText) {
      const text = String(durationText).trim();
      if (text.includes(':')) {
        const parts = text.split(':').map(p => p.trim()).filter(Boolean);
        if (parts.length === 3) {
          // HH:MM:SS format
          return (parseInt(parts[0], 10) * 3600) + (parseInt(parts[1], 10) * 60) + parseInt(parts[2], 10);
        }
        if (parts.length === 2) {
          // MM:SS format
          return (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
        }
      }
      if (text.match(/^\d+$/)) return parseInt(text, 10);
    }
    // Fallback to raw duration value
    if (typeof secondsValue === 'number' && !Number.isNaN(secondsValue)) return secondsValue;
    if (typeof secondsValue === 'string' && secondsValue.trim().match(/^\d+$/)) return parseInt(secondsValue, 10);
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
    if (intent === 'Med' || intent === 'Medium') return 'bg-amber-500';
    return 'bg-red-500';
  }

  function getExpColor(exp) {
    if (exp === 'High' || exp === 'Good') return 'text-emerald-600 font-bold';
    if (exp === 'Med' || exp === 'Medium' || exp === 'Avg') return 'text-gray-600 font-bold';
    return 'text-red-600 font-bold';
  }

  function getCallExpColor(exp) {
    if (exp === 'High') return 'text-emerald-600 font-bold';
    if (exp === 'Med' || exp === 'Medium') return 'text-yellow-600 font-bold';
    return 'text-gray-600 font-bold';
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading store walk-in call reports...</div>
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
              Store Walk-in Follow-up
            </h1>
            <p className="text-sm text-gray-500 mt-1">Central Sales outreach to customers who visited but didn't buy</p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => exportReportsAsCsv(filteredReports, 'store_walkin_calls_report.csv')}
              className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-bold transition shadow-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <Link
              to="/storewalkin-outbound-calls/upload"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-bold transition shadow-sm flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload CSV
            </Link>
            <Link
              to="/storewalkin-outbound-calls/analytics"
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
              <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Leads</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.total}</p>
            </div>
            <div className="p-2 bg-gray-50 text-gray-600 rounded-lg">
              <Users className="w-5 h-5" />
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
              <DollarSign className="w-5 h-5" />
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
              onChange={(e) => { setSelectedRegion(e.target.value); setCurrentPage(1); }}
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

            {/* Store */}
            <select
              value={selectedStore}
              onChange={(e) => { setSelectedStore(e.target.value); setCurrentPage(1); }}
              className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 max-w-[200px]"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                backgroundPosition: 'right 0.5rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.5em 1.5em'
              }}
            >
              {stores.map(s => (
                <option key={s} value={s}>{s === 'All' ? 'Store: All Stores' : s}</option>
              ))}
            </select>

            {/* Consideration Value */}
            <select
              value={selectedValue}
              onChange={(e) => { setSelectedValue(e.target.value); setCurrentPage(1); }}
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
              onChange={(e) => { setSelectedIntent(e.target.value); setCurrentPage(1); }}
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
              <option value="Med">Medium</option>
              <option value="Low">Low</option>
              <option value="Purchased">Already Purchased</option>
            </select>

            {/* Call Experience */}
            <select
              value={selectedCallExp}
              onChange={(e) => { setSelectedCallExp(e.target.value); setCurrentPage(1); }}
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
              <option value="Med">Medium</option>
              <option value="Low">Low</option>
            </select>

            {/* Store Visit Experience */}
            <select
              value={selectedStoreExp}
              onChange={(e) => { setSelectedStoreExp(e.target.value); setCurrentPage(1); }}
              className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
                backgroundPosition: 'right 0.5rem center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1.5em 1.5em'
              }}
            >
              <option value="All">Store Visit Exp: All</option>
              <option value="Good">Good</option>
              <option value="Avg">Average</option>
              <option value="Poor">Poor</option>
            </select>

            {/* Time */}
            <select
              value={timeRange}
              onChange={(e) => { setTimeRange(e.target.value); setCurrentPage(1); }}
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
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Store Name</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Duration</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Lead Type</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider leading-tight">Consideration<br/>Value</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider leading-tight">Purchase<br/>Intent</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider leading-tight">Store Visit<br/>Experience</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider leading-tight">Call<br/>Experience</th>
                  <th className="sticky top-0 z-20 bg-gray-50 px-4 py-3 text-center text-[0.7rem] font-bold text-gray-500 uppercase tracking-wider leading-tight">Measurement<br/>Hook Used?</th>
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
                        onClick={() => navigate(`/storewalkin-outbound-calls/${report.call_id}`)}
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
                        
                        {/* Store Name */}
                        <td className="px-4 py-3 text-center">
                          <div className="font-bold text-gray-900">{report.storeName}</div>
                          <div className="text-xs text-gray-500">{report.city}</div>
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
                              : 'bg-blue-100 text-blue-700 border border-blue-200'
                          }`}>
                            {report.leadType}
                          </span>
                        </td>
                        
                        {/* Consideration Value */}
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm ${report.valueDisplay === 'N/A' || report.valueDisplay === 'Unknown' ? 'text-gray-400' : 'font-bold text-gray-900'}`}>
                            {report.valueDisplay}
                          </span>
                        </td>
                        
                        {/* Purchase Intent */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center">
                            <span className={`h-2 w-2 rounded-full mr-2 ${report.isPurchased ? 'bg-red-500' : getIntentDotColor(report.intent)}`}></span>
                            <span className="font-bold text-gray-700 text-sm">{report.intent}</span>
                          </div>
                        </td>
                        
                        {/* Store Visit Experience */}
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm ${getExpColor(report.storeExp)}`}>
                            {report.storeExp}
                          </span>
                        </td>
                        
                        {/* Call Experience */}
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm ${getCallExpColor(report.callExp)}`}>
                            {report.callExp}
                          </span>
                        </td>
                        
                        {/* Measurement Hook Used */}
                        <td className="px-4 py-3 text-center">
                          {report.measurementHookUsed === 'Yes' ? (
                            <span className="text-sm font-bold text-green-600 flex items-center justify-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                              Yes
                            </span>
                          ) : report.measurementHookUsed === 'N/A' ? (
                            <span className="text-sm font-bold text-gray-400">N/A</span>
                          ) : (
                            <span className="text-sm font-bold text-gray-400">No</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          
          {/* Pagination */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Showing <span className="font-bold">all {filteredReports.length}</span> results
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default StoreWalkinCallsList;
