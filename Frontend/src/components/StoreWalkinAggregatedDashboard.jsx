import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Users, LogOut, Upload, ArrowLeft, Download, CheckCircle, Building2, ArrowRight } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://duroflex-call-analyser.onrender.com';

// Helper function to safely get nested values
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

const isConvertedValue = (value) => {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === 'number') return value > 0;
  const str = String(value).trim().toLowerCase();
  if (str === 'true' || str === 'yes' || str === 'y' || str === '1') return true;
  const num = parseFloat(str);
  if (!Number.isNaN(num)) return num > 0;
  return false;
};

// Flatten nested JSON objects for CSV export
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

// Get city region from store name or city
const getCityRegion = (storeName, city) => {
  const text = `${storeName || ''} ${city || ''}`.toUpperCase();
  
  // South India
  if (text.includes('BANGALORE') || text.includes('BENGALURU') || text.includes('BLR') ||
      text.includes('CHENNAI') || text.includes('MADRAS') || text.includes('TN') ||
      text.includes('HYDERABAD') || text.includes('HYD') || text.includes('SECUNDERABAD') ||
      text.includes('TELANGANA') || text.includes('KERALA') || text.includes('KOCHI') ||
      text.includes('COCHIN') || text.includes('TRIVANDRUM') || text.includes('THRISSUR') ||
      text.includes('KARNATAKA') || text.includes('MYSORE') || text.includes('MANGALORE') ||
      text.includes('COIMBATORE') || text.includes('MADURAI') || text.includes('VIZAG') ||
      text.includes('VISAKHAPATNAM') || text.includes('VIJAYAWADA') || text.includes('GUNTUR') ||
      text.includes('ANDHRA') || text.includes('AP') || text.includes('GODAVARI') ||
      text.includes('NELLORE') || text.includes('TIRUPATI') || text.includes('RAJAHMUNDRY') ||
      text.includes('KAKINADA') || text.includes('WARANGAL') || text.includes('NIZAMABAD') ||
      text.includes('PONDICHERRY') || text.includes('PUDUCHERRY') || text.includes('SALEM') ||
      text.includes('TIRUCHI') || text.includes('VELLORE') || text.includes('ERODE') ||
      text.includes('KOZHIKODE') || text.includes('CALICUT') || text.includes('KANNUR') ||
      text.includes('HUBLI') || text.includes('BELGAUM') || text.includes('BELLARY') ||
      text.includes('DAVANGERE') || text.includes('SHIMOGA') || text.includes('TUMKUR')) {
    return 'South';
  }
  
  // West India
  if (text.includes('MUMBAI') || text.includes('BOMBAY') || text.includes('THANE') ||
      text.includes('PUNE') || text.includes('NAGPUR') || text.includes('NASHIK') ||
      text.includes('MAHARASHTRA') || text.includes('MH') || text.includes('AHMEDABAD') ||
      text.includes('SURAT') || text.includes('VADODARA') || text.includes('BARODA') ||
      text.includes('RAJKOT') || text.includes('GUJARAT') || text.includes('GJ') ||
      text.includes('GOA') || text.includes('PANAJI') || text.includes('MARGAO') ||
      text.includes('RAJASTHAN') || text.includes('JAIPUR') || text.includes('JODHPUR') ||
      text.includes('UDAIPUR') || text.includes('KOTA') || text.includes('AJMER') ||
      text.includes('INDORE') || text.includes('BHOPAL') || text.includes('MADHYA PRADESH') ||
      text.includes('MP') || text.includes('AURANGABAD') || text.includes('KOLHAPUR') ||
      text.includes('SOLAPUR') || text.includes('SANGLI') || text.includes('NAVI MUMBAI') ||
      text.includes('KALYAN') || text.includes('DOMBIVLI') || text.includes('VASAI') ||
      text.includes('VIRAR') || text.includes('MIRA') || text.includes('BHIWANDI')) {
    return 'West';
  }
  
  // North India
  if (text.includes('DELHI') || text.includes('NCR') || text.includes('NOIDA') ||
      text.includes('GURGAON') || text.includes('GURUGRAM') || text.includes('FARIDABAD') ||
      text.includes('GHAZIABAD') || text.includes('GREATER NOIDA') || text.includes('CHANDIGARH') ||
      text.includes('PUNJAB') || text.includes('LUDHIANA') || text.includes('AMRITSAR') ||
      text.includes('JALANDHAR') || text.includes('HARYANA') || text.includes('PANIPAT') ||
      text.includes('KARNAL') || text.includes('AMBALA') || text.includes('ROHTAK') ||
      text.includes('HIMACHAL') || text.includes('SHIMLA') || text.includes('DEHRADUN') ||
      text.includes('UTTARAKHAND') || text.includes('UTTAR PRADESH') || text.includes('UP') ||
      text.includes('LUCKNOW') || text.includes('KANPUR') || text.includes('AGRA') ||
      text.includes('VARANASI') || text.includes('ALLAHABAD') || text.includes('PRAYAGRAJ') ||
      text.includes('MEERUT') || text.includes('ALIGARH') || text.includes('BAREILLY') ||
      text.includes('MORADABAD') || text.includes('SAHARANPUR') || text.includes('JAMMU') ||
      text.includes('KASHMIR') || text.includes('SRINAGAR')) {
    return 'North';
  }
  
  // East India
  if (text.includes('KOLKATA') || text.includes('CALCUTTA') || text.includes('WEST BENGAL') ||
      text.includes('WB') || text.includes('HOWRAH') || text.includes('DURGAPUR') ||
      text.includes('SILIGURI') || text.includes('ASANSOL') || text.includes('ODISHA') ||
      text.includes('ORISSA') || text.includes('BHUBANESWAR') || text.includes('CUTTACK') ||
      text.includes('BIHAR') || text.includes('PATNA') || text.includes('GAYA') ||
      text.includes('MUZAFFARPUR') || text.includes('JHARKHAND') || text.includes('RANCHI') ||
      text.includes('JAMSHEDPUR') || text.includes('DHANBAD') || text.includes('BOKARO') ||
      text.includes('ASSAM') || text.includes('GUWAHATI') || text.includes('NORTHEAST') ||
      text.includes('NE') || text.includes('MANIPUR') || text.includes('MEGHALAYA') ||
      text.includes('TRIPURA') || text.includes('NAGALAND') || text.includes('MIZORAM') ||
      text.includes('ARUNACHAL') || text.includes('SIKKIM')) {
    return 'East';
  }
  
  return 'Other';
};

// Extract city from store name
const extractCity = (storeName) => {
  if (!storeName) return 'Unknown';
  const name = storeName.toUpperCase();
  
  // Common city patterns
  const cityPatterns = [
    { pattern: /BANGALORE|BENGALURU|BLR/i, city: 'Bangalore' },
    { pattern: /MUMBAI|BOMBAY/i, city: 'Mumbai' },
    { pattern: /THANE/i, city: 'Thane' },
    { pattern: /PUNE/i, city: 'Pune' },
    { pattern: /DELHI|NCR/i, city: 'Delhi NCR' },
    { pattern: /HYDERABAD|HYD/i, city: 'Hyderabad' },
    { pattern: /CHENNAI|MADRAS/i, city: 'Chennai' },
    { pattern: /KOLKATA|CALCUTTA/i, city: 'Kolkata' },
    { pattern: /AHMEDABAD/i, city: 'Ahmedabad' },
    { pattern: /JAIPUR/i, city: 'Jaipur' },
    { pattern: /LUCKNOW/i, city: 'Lucknow' },
    { pattern: /CHANDIGARH/i, city: 'Chandigarh' },
    { pattern: /KOCHI|COCHIN/i, city: 'Kochi' },
    { pattern: /COIMBATORE/i, city: 'Coimbatore' },
    { pattern: /INDORE/i, city: 'Indore' },
    { pattern: /NAGPUR/i, city: 'Nagpur' },
    { pattern: /VIZAG|VISAKHAPATNAM/i, city: 'Visakhapatnam' },
    { pattern: /MYSORE|MYSURU/i, city: 'Mysore' },
    { pattern: /MANGALORE|MANGALURU/i, city: 'Mangalore' },
    { pattern: /BHOPAL/i, city: 'Bhopal' },
    { pattern: /PATNA/i, city: 'Patna' },
    { pattern: /GURGAON|GURUGRAM/i, city: 'Gurugram' },
    { pattern: /NOIDA/i, city: 'Noida' },
    { pattern: /GHAZIABAD/i, city: 'Ghaziabad' },
    { pattern: /FARIDABAD/i, city: 'Faridabad' },
    { pattern: /SURAT/i, city: 'Surat' },
    { pattern: /VADODARA|BARODA/i, city: 'Vadodara' },
    { pattern: /RAJKOT/i, city: 'Rajkot' },
  ];
  
  for (const { pattern, city } of cityPatterns) {
    if (pattern.test(name)) return city;
  }
  
  // Fallback: extract first word that might be city
  const parts = storeName.split(/[\s_-]+/).filter(p => p.length > 2);
  if (parts.length > 0) {
    // Skip common prefixes like "COCO", "DUROFLEX", etc.
    const skipWords = ['COCO', 'DUROFLEX', 'STORE', 'OUTLET', 'SHOP', 'MART', 'CENTER', 'CENTRE'];
    for (const part of parts) {
      if (!skipWords.includes(part.toUpperCase())) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
    }
  }
  
  return 'Unknown';
};

const StoreWalkinAggregatedDashboard = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [selectedRegion, setSelectedRegion] = useState('Overall');
  const [selectedCity, setSelectedCity] = useState('All');
  const [selectedStoreExp, setSelectedStoreExp] = useState('All');
  const [selectedCallExp, setSelectedCallExp] = useState('All');
  const [selectedIntent, setSelectedIntent] = useState('All');
  const [timeRange, setTimeRange] = useState('30');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/outbound-calls`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  // Normalize rating values
  const normalizeRating = (val) => {
    if (!val) return 'Medium';
    const str = String(val).toUpperCase().trim();
    if (str.includes('HIGH') || str === 'H') return 'High';
    if (str.includes('LOW') || str === 'L') return 'Low';
    return 'Medium';
  };

  // Get intent rating from report
  const getIntentRating = (report) => {
    const analysis = report.analysis || {};
    return getField(analysis,
      '2_Intent_to_Purchase.Rating',
      'Pillar_1_Customer_Intent_and_Barriers.Intent_to_Purchase_Rating',
      'PILLAR_1_INTENT_BARRIERS.Intent_to_Purchase_Rating'
    ) || 'Medium';
  };

  // Get store experience rating
  const getStoreExpRating = (report) => {
    const analysis = report.analysis || {};
    return getField(analysis,
      '3_Store_Experience.Rating',
      'Store_Experience.Rating'
    ) || 'Medium';
  };

  // Get call experience rating
  const getCallExpRating = (report) => {
    const analysis = report.analysis || {};
    return getField(analysis,
      '4_Call_Experience.Rating',
      'Call_Experience.Rating'
    ) || 'Medium';
  };

  // Get NPS score
  const getNpsScore = (report) => {
    const analysis = report.analysis || {};
    return getField(analysis,
      '16_End_to_End_NPS.Score',
      'End_to_End_NPS.Score',
      'NPS.Score'
    ) || 0;
  };

  // Get RELAX scores
  const getRelaxScores = (report) => {
    const analysis = report.analysis || {};
    const relax = getField(analysis,
      '12_RELAX_Framework',
      'RELAX_Framework',
      'Pillar_3_RELAX_Framework'
    ) || {};
    
    const scoreToNum = (val) => {
      if (!val) return 5;
      const str = String(val).toUpperCase().trim();
      if (str === 'H' || str === 'HIGH') return 9;
      if (str === 'L' || str === 'LOW') return 4;
      return 6.5;
    };
    
    return {
      R: scoreToNum(relax.R_Reach_Out?.Score || relax.R_Reach_Out?.Rating),
      E: scoreToNum(relax.E_Explore_Needs?.Score || relax.E_Explore_Needs?.Rating),
      L: scoreToNum(relax.L_Link_Product?.Score || relax.L_Link_Product?.Rating || relax.L_Link_Experience?.Score),
      A: scoreToNum(relax.A_Add_Value?.Score || relax.A_Add_Value?.Rating),
      X: scoreToNum(relax.X_Express_Closing?.Score || relax.X_Express_Closing?.Rating)
    };
  };

  // Get agent name
  const getAgentName = (report) => {
    const analysis = report.analysis || {};
    return getField(analysis,
      'MetaData.Agent_Name',
      'Functional.Agent_Name',
      'Agent_Name'
    ) || 'Unknown Agent';
  };

  const parseDurationToSeconds = (secondsValue, durationText) => {
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
  };

  // Transform reports to calls with normalized data
  const outboundCalls = useMemo(() => {
    return reports.map(report => {
      const analysis = report.analysis || {};
      const metaData = analysis.MetaData || {};
      const storeName = report.store_name || 'Unknown Store';
      const city = extractCity(storeName);
      const region = getCityRegion(storeName, city);
      const intent = normalizeRating(getIntentRating(report));
      const storeExp = normalizeRating(getStoreExpRating(report));
      const callExp = normalizeRating(getCallExpRating(report));
      const nps = getNpsScore(report);
      const relax = getRelaxScores(report);
      const agentName = getAgentName(report);
      
      // Check if already purchased (align with list logic)
      const intentRating = String(getIntentRating(report) || '').toLowerCase();
      const funnelStage = String(getField(analysis, '5_Funnel_Analysis.Stage') || '').toLowerCase();
      const callObjectiveType = String(getField(analysis, '1_Call_Objective.Type') || '').toLowerCase();
      const isPurchased = 
        intentRating.includes('already purchased') || 
        intentRating.includes('purchased') ||
        funnelStage.includes('already purchased') || 
        callObjectiveType.includes('already purchased') ||
        callObjectiveType.includes('post purchase') ||
        callObjectiveType.includes('service') ||
        callObjectiveType.includes('complaint');

      // Lead type (align with list logic)
      let leadType = 'Sales Lead';
      if (callObjectiveType.includes('post') || callObjectiveType.includes('service') || callObjectiveType.includes('complaint') ||
          intentRating.includes('purchased') || intentRating.includes('already')) {
        leadType = 'Post Purchase';
      }
      
      const durationSeconds = parseDurationToSeconds(report.duration, metaData.Call_Duration);
      if (durationSeconds !== null && durationSeconds < 30) {
        return null;
      }

      // Calculate overall score (average of NPS and RELAX)
      const relaxAvg = (relax.R + relax.E + relax.L + relax.A + relax.X) / 5;
      const overallScore = nps > 0 ? ((nps + relaxAvg) / 2).toFixed(1) : relaxAvg.toFixed(1);
      
      // Parse call date with fallbacks
      let callDate = new Date();
      if (report.call_date) {
        const parsed = new Date(report.call_date);
        if (!isNaN(parsed.getTime())) {
          callDate = parsed;
        } else if (report.analyzed_at) {
          const analyzedDate = new Date(report.analyzed_at);
          if (!isNaN(analyzedDate.getTime())) {
            callDate = analyzedDate;
          }
        }
      } else if (report.analyzed_at) {
        const analyzedDate = new Date(report.analyzed_at);
        if (!isNaN(analyzedDate.getTime())) {
          callDate = analyzedDate;
        }
      }
      
      return {
        ...report,
        storeName,
        city,
        region,
        intent,
        storeExp,
        callExp,
        nps,
        relax,
        agentName,
        isPurchased,
        leadType,
        overallScore: parseFloat(overallScore),
        callDate
      };
    }).filter(Boolean);
  }, [reports]);

  // Get unique cities
  const cities = useMemo(() => {
    const citySet = new Set(outboundCalls.map(c => c.city).filter(c => c && c !== 'Unknown'));
    return Array.from(citySet).sort();
  }, [outboundCalls]);

  // Apply all filters
  const filteredCalls = useMemo(() => {
    let result = outboundCalls;
    
    // Region filter
    if (selectedRegion !== 'Overall') {
      result = result.filter(c => c.region === selectedRegion);
    }
    
    // City filter
    if (selectedCity !== 'All') {
      result = result.filter(c => c.city === selectedCity);
    }
    
    // Store Experience filter
    if (selectedStoreExp !== 'All') {
      result = result.filter(c => c.storeExp === selectedStoreExp);
    }
    
    // Call Experience filter
    if (selectedCallExp !== 'All') {
      result = result.filter(c => c.callExp === selectedCallExp);
    }
    
    // Intent filter
    if (selectedIntent !== 'All') {
      result = result.filter(c => c.intent === selectedIntent);
    }
    
    // Time filter
    if (timeRange !== 'all') {
      const days = parseInt(timeRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      result = result.filter(c => c.callDate >= cutoff);
    }
    
    return result;
  }, [outboundCalls, selectedRegion, selectedCity, selectedStoreExp, selectedCallExp, selectedIntent, timeRange]);

  // Navigate with filter
  const navigateWithFilter = (predicate, description) => {
    const ids = filteredCalls.filter(predicate).map(r => r.call_id).filter(Boolean);
    navigate('/storewalkin-outbound-calls', { state: { filterIds: ids, filterDescription: description } });
  };

  // Calculate metrics
  const metrics = useMemo(() => {
    const calls = filteredCalls;
    const totalCalls = calls.length;
    const purchasedCalls = calls.filter(c => c.leadType === 'Post Purchase' || c.isPurchased);
    const salesLeadsCalls = calls.filter(c => c.leadType === 'Sales Lead');
    const highIntentCalls = calls.filter(c => c.intent === 'High' && !c.isPurchased);
    
    // Matrix: Intent × Call Experience (excluding purchased)
    const matrix = {
      High: { High: 0, Medium: 0, Low: 0 },
      Medium: { High: 0, Medium: 0, Low: 0 },
      Low: { High: 0, Medium: 0, Low: 0 },
      Purchased: { High: 0, Medium: 0, Low: 0 }
    };
    
    calls.forEach(call => {
      if (call.isPurchased) {
        matrix.Purchased[call.callExp]++;
      } else {
        matrix[call.intent][call.callExp]++;
      }
    });
    
    // Agent performance
    const agentMap = {};
    calls.forEach(call => {
      const name = call.agentName;
      if (!agentMap[name]) {
        agentMap[name] = {
          name,
          calls: [],
          totalLeads: 0,
          totalNps: 0,
          totalCallCx: 0,
          totalR: 0, totalE: 0, totalL: 0, totalA: 0, totalX: 0
        };
      }
      agentMap[name].calls.push(call);
      agentMap[name].totalLeads++;
      agentMap[name].totalNps += call.nps;
      agentMap[name].totalCallCx += call.overallScore;
      agentMap[name].totalR += call.relax.R;
      agentMap[name].totalE += call.relax.E;
      agentMap[name].totalL += call.relax.L;
      agentMap[name].totalA += call.relax.A;
      agentMap[name].totalX += call.relax.X;
    });
    
    const agentPerformance = Object.values(agentMap).map(agent => {
      const count = agent.calls.length;
      return {
        name: agent.name,
        leads: count,
        nps: count > 0 ? (agent.totalNps / count).toFixed(1) : 0,
        callCx: count > 0 ? (agent.totalCallCx / count).toFixed(1) : 0,
        overallScore: count > 0 ? (agent.totalCallCx / count).toFixed(1) : 0,
        R: count > 0 ? (agent.totalR / count).toFixed(1) : 0,
        E: count > 0 ? (agent.totalE / count).toFixed(1) : 0,
        L: count > 0 ? (agent.totalL / count).toFixed(1) : 0,
        A: count > 0 ? (agent.totalA / count).toFixed(1) : 0,
        X: count > 0 ? (agent.totalX / count).toFixed(1) : 0
      };
    }).sort((a, b) => b.leads - a.leads);
    
    // City performance
    const cityMap = {};
    calls.forEach(call => {
      const city = call.city;
      if (!cityMap[city]) {
        cityMap[city] = { city, total: 0, high: 0, medium: 0, low: 0, purchased: 0 };
      }
      cityMap[city].total++;
      if (call.isPurchased) {
        cityMap[city].purchased++;
      } else {
        if (call.intent === 'High') cityMap[city].high++;
        else if (call.intent === 'Medium') cityMap[city].medium++;
        else cityMap[city].low++;
      }
    });
    
    const cityPerformance = Object.values(cityMap)
      .filter(c => c.city !== 'Unknown')
      .sort((a, b) => b.total - a.total);
    
    // Count unique stores
    const uniqueStores = new Set(calls.map(c => c.storeName)).size;
    
    return {
      totalCalls,
      purchasedCount: purchasedCalls.length,
      salesLeadsCount: salesLeadsCalls.length,
      highIntentCount: highIntentCalls.length,
      uniqueStores,
      matrix,
      agentPerformance,
      cityPerformance
    };
  }, [filteredCalls]);

  // UI Helper functions
  const getInitials = (name) => {
    if (!name || name === 'Unknown Agent') return 'UA';
    const words = name.split(' ').filter(w => w.length > 0);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
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
      'bg-teal-100 text-teal-700'
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getScorePillClass = (score) => {
    const num = parseFloat(score);
    if (num >= 8) return 'bg-green-100 text-green-700 border-green-200';
    if (num >= 6) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-red-100 text-red-700 border-red-200';
  };

  const handleDownloadReports = () => {
    exportReportsAsCsv(filteredCalls, 'storewalkin_call_reports.csv');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('admin_email');
    navigate('/');
  };

  // Matrix colors matching HTML
  const matrixColors = {
    High: {
      High: 'bg-[#3b8766]',
      Medium: 'bg-[#5ab589]',
      Low: 'bg-[#b9362a]'
    },
    Medium: {
      High: 'bg-[#8cc63f]',
      Medium: 'bg-[#dcb336]',
      Low: 'bg-[#d97029]'
    },
    Low: {
      High: 'bg-[#dcb336]',
      Medium: 'bg-[#9e682e]',
      Low: 'bg-[#852b26]'
    },
    Purchased: {
      High: 'bg-[#6366f1]',
      Medium: 'bg-[#4f46e5]',
      Low: 'bg-[#4338ca]'
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading walk-in recovery analytics...</div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Phone className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 mb-4">No store walk-in call data available.</p>
          <Link to="/storewalkin-outbound-calls" className="text-indigo-600 hover:text-indigo-500 font-semibold">
            ← Back to Store Walk-in Calls
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="max-w-[1600px] mx-auto px-8 py-8">
        
        {/* HEADER & FILTERS */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <Link 
                to="/storewalkin-outbound-calls" 
                className="text-xs font-bold text-gray-500 hover:text-gray-900 transition tracking-wide mb-1 inline-flex items-center gap-1"
              >
                GO TO ANALYSED CALLS
                <ArrowRight className="w-3 h-3" />
              </Link>
              <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
                Store Walk-in Recovery Analytics
              </h1>
              <p className="text-sm text-gray-500 mt-1">Central Sales Follow-up on Store Walk-outs</p>
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
                to="/storewalkin-outbound-calls/upload"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload CSV
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-red-600 text-sm font-semibold transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* FILTER STRIP */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">Location:</span>
              
              {/* Region */}
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 min-w-[140px]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em'
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
                className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 min-w-[140px]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em'
                }}
              >
                <option value="All">City: All</option>
                {cities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>

            <div className="h-8 w-px bg-gray-200 hidden md:block"></div>

            <div className="flex flex-wrap gap-3 items-center">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-1">Experience:</span>
              
              {/* Store Experience */}
              <select
                value={selectedStoreExp}
                onChange={(e) => setSelectedStoreExp(e.target.value)}
                className="bg-blue-50/50 border border-blue-200 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-blue-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 min-w-[140px]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em'
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
                className="bg-green-50/50 border border-green-200 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-green-300 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 min-w-[140px]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em'
                }}
              >
                <option value="All">Call Exp: All</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div className="h-8 w-px bg-gray-200 hidden md:block"></div>

            <div className="flex flex-wrap gap-3 items-center">
              {/* Intent */}
              <select
                value={selectedIntent}
                onChange={(e) => setSelectedIntent(e.target.value)}
                className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 min-w-[130px]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em'
                }}
              >
                <option value="All">Intent: All</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              {/* Time */}
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 pr-8 rounded-lg appearance-none cursor-pointer shadow-sm hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 min-w-[130px]"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 0.5rem center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '1.25em 1.25em'
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
          <div 
            onClick={() => navigateWithFilter(() => true, 'All walk-in recovery calls')}
            className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition border-l-4 border-l-indigo-500 cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Total Follow-ups</p>
              <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded">
                {metrics.uniqueStores} Stores
              </span>
            </div>
            <h3 className="text-4xl font-bold text-gray-900 mb-1">{metrics.totalCalls}</h3>
            <p className="text-xs text-gray-400">Leads from {metrics.uniqueStores} Stores</p>
          </div>

          <div 
            onClick={() => navigateWithFilter((c) => c.intent === 'High' && !c.isPurchased, 'High intent walk-in recovery calls')}
            className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition border-l-4 border-l-emerald-500 cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Sales Leads (Hot)</p>
              <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-4xl font-bold text-emerald-600">{metrics.salesLeadsCount}</h3>
            <p className="text-xs text-gray-400">
              {metrics.totalCalls > 0 ? Math.round((metrics.highIntentCount / metrics.totalCalls) * 100) : 0}% High Intent Leads
            </p>
          </div>

          <div 
            onClick={() => navigateWithFilter((c) => c.isPurchased, 'Already purchased calls')}
            className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition border-l-4 border-l-orange-500 cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2">
              <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Already Purchased</p>
              <div className="p-1.5 bg-orange-50 rounded-lg text-orange-600">
                <CheckCircle className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-4xl font-bold text-orange-600">{metrics.purchasedCount}</h3>
            <p className="text-xs text-gray-400">
              {metrics.totalCalls > 0 ? Math.round((metrics.purchasedCount / metrics.totalCalls) * 100) : 0}% of Walk-outs
            </p>
          </div>
        </div>

        {/* MATRIX SECTION */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
              Purchase Intent × Call Experience Matrix
            </h2>
            <div className="h-px bg-gray-300 flex-1 ml-4"></div>
          </div>

          <div className="overflow-x-auto pb-4">
            <div className="min-w-[1000px] grid grid-cols-[140px_repeat(3,minmax(0,1fr))] gap-4">
              {/* Headers */}
              <div></div>
              <div className="text-center font-bold text-gray-500 text-sm uppercase tracking-wide pb-2">High Call Exp</div>
              <div className="text-center font-bold text-gray-500 text-sm uppercase tracking-wide pb-2">Medium Call Exp</div>
              <div className="text-center font-bold text-gray-500 text-sm uppercase tracking-wide pb-2">Low Call Exp</div>

              {/* Row 1: High Intent */}
              <div className="flex items-center justify-end pr-6 font-bold text-gray-800 text-sm">High Intent</div>
              {['High', 'Medium', 'Low'].map(exp => (
                <button
                  key={`High-${exp}`}
                  onClick={() => navigateWithFilter(
                    c => c.intent === 'High' && c.callExp === exp && !c.isPurchased,
                    `High Intent × ${exp} Call Experience`
                  )}
                  className={`${matrixColors.High[exp]} relative rounded-2xl p-6 text-center text-white cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg min-h-[140px] flex flex-col items-center justify-center`}
                >
                  <div className="text-5xl font-bold mb-1">{metrics.matrix.High[exp]}</div>
                  <div className="text-sm uppercase tracking-wide opacity-90 font-semibold">Calls</div>
                </button>
              ))}

              {/* Row 2: Medium Intent */}
              <div className="flex items-center justify-end pr-6 font-bold text-gray-800 text-sm">Medium Intent</div>
              {['High', 'Medium', 'Low'].map(exp => (
                <button
                  key={`Medium-${exp}`}
                  onClick={() => navigateWithFilter(
                    c => c.intent === 'Medium' && c.callExp === exp && !c.isPurchased,
                    `Medium Intent × ${exp} Call Experience`
                  )}
                  className={`${matrixColors.Medium[exp]} relative rounded-2xl p-6 text-center text-white cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg min-h-[140px] flex flex-col items-center justify-center`}
                >
                  <div className="text-5xl font-bold mb-1">{metrics.matrix.Medium[exp]}</div>
                  <div className="text-sm uppercase tracking-wide opacity-90 font-semibold">Calls</div>
                </button>
              ))}

              {/* Row 3: Low Intent */}
              <div className="flex items-center justify-end pr-6 font-bold text-gray-800 text-sm">Low Intent</div>
              {['High', 'Medium', 'Low'].map(exp => (
                <button
                  key={`Low-${exp}`}
                  onClick={() => navigateWithFilter(
                    c => c.intent === 'Low' && c.callExp === exp && !c.isPurchased,
                    `Low Intent × ${exp} Call Experience`
                  )}
                  className={`${matrixColors.Low[exp]} relative rounded-2xl p-6 text-center text-white cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg min-h-[140px] flex flex-col items-center justify-center`}
                >
                  <div className="text-5xl font-bold mb-1">{metrics.matrix.Low[exp]}</div>
                  <div className="text-sm uppercase tracking-wide opacity-90 font-semibold">Calls</div>
                </button>
              ))}

              {/* Row 4: Purchased */}
              <div className="flex items-center justify-end pr-6 font-bold text-purple-800 text-sm border-t pt-4 border-gray-200">Purchased</div>
              {['High', 'Medium', 'Low'].map(exp => (
                <button
                  key={`Purchased-${exp}`}
                  onClick={() => navigateWithFilter(
                    c => c.isPurchased && c.callExp === exp,
                    `Purchased × ${exp} Call Experience`
                  )}
                  className={`${matrixColors.Purchased[exp]} relative rounded-2xl p-6 text-center text-white cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg min-h-[140px] flex flex-col items-center justify-center mt-4`}
                >
                  <div className="text-5xl font-bold mb-1">{metrics.matrix.Purchased[exp]}</div>
                  <div className="text-sm uppercase tracking-wide opacity-90 font-semibold">Calls</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* AGENT PERFORMANCE MATRIX */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-amber-500" />
              <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
                Central Agent Performance Matrix
              </h2>
            </div>
            <p className="text-sm text-gray-500 mt-1 ml-9">Effectiveness in recovering store walk-outs</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">Agent Name</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-gray-900 uppercase tracking-wider bg-gray-100 border-l border-r border-gray-200">Overall Score</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-gray-500 uppercase tracking-wider"># Leads</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">NPS</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Call CX</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-amber-600 uppercase tracking-wider border-l border-gray-200">R</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-amber-600 uppercase tracking-wider">E</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-amber-600 uppercase tracking-wider">L</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-amber-600 uppercase tracking-wider">A</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-amber-600 uppercase tracking-wider">X</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {metrics.agentPerformance.slice(0, 10).map((agent) => (
                  <tr 
                    key={agent.name} 
                    onClick={() => navigateWithFilter(
                      c => c.agentName === agent.name,
                      `Agent: ${agent.name}`
                    )}
                    className="hover:bg-blue-50 transition cursor-pointer"
                  >
                    <td className="p-4 flex items-center">
                      <div className={`w-8 h-8 rounded-full ${getAvatarColor(agent.name)} flex items-center justify-center font-bold text-xs mr-3`}>
                        {getInitials(agent.name)}
                      </div>
                      <div className="font-bold text-gray-900">{agent.name}</div>
                    </td>
                    <td className="p-4 text-center bg-gray-50 border-l border-r border-gray-100">
                      <span className={`inline-flex items-center justify-center w-12 h-7 rounded-lg font-bold text-sm border ${getScorePillClass(agent.overallScore)}`}>
                        {agent.overallScore}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">{agent.leads}</span>
                    </td>
                    <td className="p-4 text-center text-gray-900 font-bold">{agent.nps}</td>
                    <td className="p-4 text-center text-gray-900">{agent.callCx}</td>
                    <td className="p-4 text-center border-l border-gray-100 text-gray-600">{agent.R}</td>
                    <td className="p-4 text-center text-gray-600">{agent.E}</td>
                    <td className="p-4 text-center text-gray-600">{agent.L}</td>
                    <td className="p-4 text-center text-gray-600">{agent.A}</td>
                    <td className="p-4 text-center text-gray-600">{agent.X}</td>
                  </tr>
                ))}
                {metrics.agentPerformance.length === 0 && (
                  <tr>
                    <td colSpan="10" className="p-8 text-center text-gray-400">
                      No agent data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* CITY PERFORMANCE MATRIX */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <Building2 className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
                City Performance Matrix
              </h2>
            </div>
            <p className="text-sm text-gray-500 mt-1 ml-9">Intent Distribution by Metro Cities (Walk-ins)</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">Metro City</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-gray-900 uppercase tracking-wider bg-gray-100">Total Leads</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-green-700 uppercase tracking-wider">High Intent</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-yellow-700 uppercase tracking-wider">Medium Intent</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-red-700 uppercase tracking-wider">Low Intent</th>
                  <th className="p-4 border-b border-gray-200 text-center text-xs font-bold text-blue-700 uppercase tracking-wider">Already Purchased</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {metrics.cityPerformance.slice(0, 10).map((city) => (
                  <tr 
                    key={city.city}
                    onClick={() => navigateWithFilter(
                      c => c.city === city.city,
                      `City: ${city.city}`
                    )}
                    className="hover:bg-blue-50 transition cursor-pointer"
                  >
                    <td className="p-4">
                      <div className="font-bold text-gray-900">{city.city}</div>
                    </td>
                    <td className="p-4 text-center font-bold text-gray-900 bg-gray-50">{city.total}</td>
                    <td className="p-4 text-center">{city.high}</td>
                    <td className="p-4 text-center">{city.medium}</td>
                    <td className="p-4 text-center">{city.low}</td>
                    <td className="p-4 text-center font-bold text-blue-600">{city.purchased}</td>
                  </tr>
                ))}
                {metrics.cityPerformance.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-gray-400">
                      No city data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-400 text-sm mt-8 pb-8">
          Duroflex Analytics • Powered by AI Analysis
        </div>
      </div>
    </div>
  );
};

export default StoreWalkinAggregatedDashboard;
