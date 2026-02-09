import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, TrendingUp, Users, Video, ChevronDown, Filter, Store, BarChart3, AlertCircle, ThumbsUp, ArrowLeft, Download, Phone, Upload } from 'lucide-react';

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

const VideoAggregatedDashboard = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState('last30');
  const [view, setView] = useState('overall');
  const [selectedIntent, setSelectedIntent] = useState('All');
  const [selectedRegion, setSelectedRegion] = useState('South');
  const [selectedCity, setSelectedCity] = useState('Bangalore');
  const [selectedStore, setSelectedStore] = useState('');
  const [storePeriod, setStorePeriod] = useState('week');
  const [allCalls, setAllCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleDownloadReports = () => {
    exportReportsAsCsv(allCalls, 'video_reports.csv');
  };

  const navigateWithFilter = (predicate, description) => {
    const ids = filteredCalls.filter(predicate).map((c) => c.id || c.report_id).filter(Boolean);
    navigate('/popins-inbound', { state: { filterIds: ids, filterDescription: description } });
  };

  useEffect(() => {
    const fetchVideoCalls = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/api/video-reports`);
        const data = await response.json();
        if (data.status === 'success' && data.reports) {
          setAllCalls(data.reports);
        }
      } catch (error) {
        console.error('Error fetching video calls:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVideoCalls();
  }, []);

  const normalizeIntent = (rating) => {
    const val = (rating || 'Medium').toString().toUpperCase();
    if (val.includes('HIGH')) return 'High';
    if (val.includes('MEDIUM') || val.includes('MED')) return 'Medium';
    if (val.includes('LOW')) return 'Low';
    return 'Medium';
  };

  const normalizeExperience = (score) => {
    if (score === undefined || score === null || score === '') return 'Medium';
    if (typeof score === 'string') {
      const val = score.toUpperCase();
      if (val.includes('HIGH') || val.includes('5') || val.includes('EXCELLENT')) return 'High';
      if (val.includes('MEDIUM') || val.includes('3') || val.includes('GOOD')) return 'Medium';
      if (val.includes('LOW') || val.includes('1') || val.includes('POOR') || val.includes('FAIR')) return 'Low';
      const num = parseFloat(score);
      if (!Number.isNaN(num)) {
        if (num >= 4) return 'High';
        if (num >= 3) return 'Medium';
        return 'Low';
      }
      return 'Medium';
    }
    if (typeof score === 'number') {
      if (score >= 4) return 'High';
      if (score >= 3) return 'Medium';
      return 'Low';
    }
    return 'Medium';
  };

  const deriveType = (objective) => {
    const text = (objective || '').toLowerCase();
    const serviceKeywords = ['service', 'support', 'issue', 'complaint', 'warranty', 'return'];
    const isService = serviceKeywords.some((k) => text.includes(k));
    return isService ? 'Service' : 'Sales';
  };

  const ratingToScore = (value, fallback = 75) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'number') return Math.round(value * 20); // assume 1-5 scale
    const num = parseFloat(value);
    if (Number.isNaN(num)) return fallback;
    return Math.round(num * 20); // assume 1-5 scale
  };

  const videoCalls = useMemo(() => {
    return allCalls
      .filter((call) => call.analyzed && call.analysis_data)
      .map((call) => {
        const analysis = call.analysis_data || {};
        const functional = analysis.Functional || {};
        const customer = analysis.Customer_Information || {};
        const agentAreas = analysis.Agent_Areas || {};
        const productDemo = agentAreas.Product_Demonstration || {};
        const relaxFramework = agentAreas.RELAX_Framework || {};
        const softSkills = agentAreas.SoftSkills || {};
        const invitation = agentAreas.The_Invitation_to_Visit || {};

        // Extract store location properly
        const storeLocation = functional.Store_Location || call.store_name || 'Unknown Store';

        // Determine region based on store location
        const region = storeLocation.includes('Bangalore') || storeLocation.includes('INDIRANAGAR') || storeLocation.includes('Hyderabad') || storeLocation.includes('Chennai') || storeLocation.includes('ADYAR') || storeLocation.includes('COCHIN') ? 'South' :
                      storeLocation.includes('Mumbai') || storeLocation.includes('Pune') ? 'West' :
                      storeLocation.includes('Delhi') || storeLocation.includes('LAJPAT') ? 'North' :
                      storeLocation.includes('Kolkata') ? 'East' : 'South';

        const city = storeLocation.includes('Bangalore') || storeLocation.includes('INDIRANAGAR') ? 'Bangalore' :
                    storeLocation.includes('Mumbai') ? 'Mumbai' :
                    storeLocation.includes('Delhi') || storeLocation.includes('LAJPAT') ? 'Delhi' :
                    storeLocation.includes('Hyderabad') ? 'Hyderabad' :
                    storeLocation.includes('Chennai') || storeLocation.includes('ADYAR') ? 'Chennai' : 'Bangalore';

        // Calculate RELAX score with the same structure as audio
        const reach = relaxFramework.R_Reach_Out?.Rating;
        const explore = relaxFramework.E_Explore_Needs?.Rating;
        const link = relaxFramework.L_Link_Demo?.Rating;
        const add = relaxFramework.A_Add_Value?.Rating;
        const close = relaxFramework.X_Express_Offers?.Rating;

        const rapportScore = ratingToScore(reach, 75);
        const exploreScore = ratingToScore(explore, 75);
        const listenScore = ratingToScore(link, 75);
        const adviseScore = ratingToScore(add, 75);
        const executeScore = ratingToScore(close, 75);

        const relaxScores = [rapportScore, exploreScore, listenScore, adviseScore, executeScore];
        const availableRelax = relaxScores.filter((s) => s !== undefined && s !== null);
        const overallRelax = availableRelax.length
          ? Math.round(availableRelax.reduce((a, b) => a + b, 0) / availableRelax.length)
          : 75;

        // Calculate product demo score (similar to product knowledge)
        const demoRatings = [
          productDemo.Quality_Rating,
          productDemo.Relevance_Rating,
          productDemo.Video_Audio_Quality_Rating,
          productDemo.Effectiveness_Rating,
          productDemo.Customer_Engagement_Rating
        ].filter(r => typeof r === 'number');
        
        const productDemoScore = demoRatings.length > 0
          ? Math.round(demoRatings.reduce((sum, r) => sum + ratingToScore(r, 75), 0) / demoRatings.length)
          : 75;

        // Calculate soft skills score (average of all soft skill ratings)
        const softSkillRatings = [
          softSkills.Active_Listening_Rating,
          softSkills.Empathy_Rapport_Rating,
          softSkills.Clarity_Confidence_Rating,
          softSkills.Objection_Handling_Rating,
          softSkills.Hold_and_Dead_Air_Management_Rating
        ].filter(r => typeof r === 'number');
        
        const softSkillScore = softSkillRatings.length > 0
          ? Math.round(softSkillRatings.reduce((sum, r) => sum + ratingToScore(r, 75), 0) / softSkillRatings.length)
          : 75;

        const intent = normalizeIntent(customer.Intent_to_Purchase_Rating);
        const experience = normalizeExperience(customer.Customer_Satisfaction_Score);

        return {
          id: call.report_id,
          store: storeLocation,
          city: city,
          region: region,
          type: deriveType(functional.Call_Objective_Theme),
          intent,
          experience,
          scores: {
            overall: overallRelax,
            rapport: rapportScore,
            explore: exploreScore,
            listen: listenScore,
            advise: adviseScore,
            execute: executeScore,
            productKnowledge: productDemoScore,
            softSkills: softSkillScore,
          },
          invitationAttempted: invitation.Attempted || false,
          invitationQuality: invitation.Quality_Rating || 0,
        };
      });
  }, [allCalls]);

  const filteredCalls = useMemo(() => {
    let filtered = [...videoCalls];
    
    // Apply time range filter
    if (timeRange === 'last7') {
      filtered = filtered.slice(-7);
    } else if (timeRange === 'last30') {
      filtered = filtered.slice(-30);
    } else if (timeRange === 'last90') {
      filtered = filtered.slice(-90);
    } else if (timeRange === 'ytd') {
      // For YTD, just take all available calls (simplified implementation)
      filtered = filtered;
    }
    
    // Apply view-based filters
    if (view === 'region') {
      filtered = filtered.filter((call) => call.region === selectedRegion);
    } else if (view === 'city') {
      filtered = filtered.filter((call) => call.city === selectedCity);
    }

    if (selectedIntent !== 'All') {
      filtered = filtered.filter((call) => call.intent === selectedIntent);
    }
    
    return filtered;
  }, [videoCalls, view, selectedRegion, selectedCity, timeRange, selectedIntent]);

  const metrics = useMemo(() => {
    const total = filteredCalls.length;
    const salesCalls = filteredCalls.filter((c) => c.type === 'Sales').length;
    const serviceCalls = filteredCalls.filter((c) => c.type === 'Service').length;

    const matrix = {};
    ['High', 'Medium', 'Low'].forEach((intent) => {
      matrix[intent] = {};
      ['High', 'Medium', 'Low'].forEach((exp) => {
        matrix[intent][exp] = filteredCalls.filter((c) => c.intent === intent && c.experience === exp).length;
      });
    });

    const storeMetrics = {};
    filteredCalls.forEach((call) => {
      if (!storeMetrics[call.store]) {
        storeMetrics[call.store] = {
          storeName: call.store,
          city: call.city,
          region: call.region,
          calls: [],
        };
      }
      storeMetrics[call.store].calls.push(call);
    });

    const storePerformance = Object.values(storeMetrics)
      .map((store) => {
        const calls = store.calls;
        const avgScore = (metric) =>
          calls.length ? Math.round(calls.reduce((sum, c) => sum + c.scores[metric], 0) / calls.length) : 0;

        return {
          storeName: store.storeName,
          city: store.city,
          region: store.region,
          totalCalls: calls.length,
          overallScore: avgScore('overall'),
          rapport: avgScore('rapport'),
          explore: avgScore('explore'),
          listen: avgScore('listen'),
          advise: avgScore('advise'),
          execute: avgScore('execute'),
          productKnowledge: avgScore('productKnowledge'),
          softSkills: avgScore('softSkills'),
        };
      })
      .sort((a, b) => b.totalCalls - a.totalCalls);

    return {
      total,
      salesCalls,
      serviceCalls,
      matrix,
      storePerformance,
    };
  }, [filteredCalls]);

  const getScoreColor = (score) => {
    if (score >= 85) return 'text-emerald-600';
    if (score >= 70) return 'text-amber-600';
    return 'text-rose-600';
  };

  const getScoreBg = (score) => {
    if (score >= 85) return 'bg-emerald-50';
    if (score >= 70) return 'bg-amber-50';
    return 'bg-rose-50';
  };

  const intents = ['High', 'Medium', 'Low'];
  const experiences = ['High', 'Medium', 'Low'];

  const matrixPalette = {
    High: {
      High: 'from-[#059669] to-[#047857]',
      Medium: 'from-[#10b981] to-[#059669]',
      Low: 'from-[#dc2626] to-[#b91c1c]',
    },
    Medium: {
      High: 'from-[#84cc16] to-[#65a30d]',
      Medium: 'from-[#eab308] to-[#ca8a04]',
      Low: 'from-[#f97316] to-[#ea580c]',
    },
    Low: {
      High: 'from-[#eab308] to-[#ca8a04]',
      Medium: 'from-[#d97706] to-[#92400e]',
      Low: 'from-[#b91c1c] to-[#7f1d1d]',
    },
  };

  const matrixLabels = {
    High: { High: 'The Goal', Medium: 'Nurture', Low: 'CRITICAL RISK' },
    Medium: { High: 'Upsell', Medium: 'Neutral/Baseline', Low: 'Needs Attention' },
    Low: { High: 'Over-servicing?', Medium: 'Low Priority', Low: 'Inefficiency' },
  };

  const matrixLegend = [
    {
      title: 'Dark Green',
      desc: 'The Goal - High intent, excellent experience',
      gradient: 'from-[#059669] to-[#047857]',
      border: 'border-[#059669]',
    },
    {
      title: 'Light Green',
      desc: 'Nurture - High intent, room to improve experience',
      gradient: 'from-[#10b981] to-[#059669]',
      border: 'border-[#10b981]',
    },
    {
      title: 'Bright Red',
      desc: 'CRITICAL RISK - High intent, poor experience',
      gradient: 'from-[#dc2626] to-[#b91c1c]',
      border: 'border-[#dc2626]',
    },
    {
      title: 'Yellow-Green',
      desc: 'Upsell - Medium intent with great experience',
      gradient: 'from-[#84cc16] to-[#65a30d]',
      border: 'border-[#84cc16]',
    },
    {
      title: 'Yellow',
      desc: 'Neutral/Baseline - Average performance',
      gradient: 'from-[#eab308] to-[#ca8a04]',
      border: 'border-[#eab308]',
    },
    {
      title: 'Orange',
      desc: 'Needs Attention - Medium intent, poor experience',
      gradient: 'from-[#f97316] to-[#ea580c]',
      border: 'border-[#f97316]',
    },
    {
      title: 'Orange-Grey',
      desc: 'Low Priority - Low intent, medium experience',
      gradient: 'from-[#d97706] to-[#92400e]',
      border: 'border-[#d97706]',
    },
    {
      title: 'Muted Red',
      desc: 'Inefficiency - Low intent, poor experience',
      gradient: 'from-[#b91c1c] to-[#7f1d1d]',
      border: 'border-[#b91c1c]',
    },
  ];

  const storeAnalysis = useMemo(() => {
    if (!selectedStore || !metrics.storePerformance.length) {
      const firstStore = metrics.storePerformance[0]?.storeName;
      if (firstStore && selectedStore === '') {
        setSelectedStore(firstStore);
      }
      return null;
    }

    const storeCalls = videoCalls.filter((c) => c.store === selectedStore);
    const periods = [];
    const now = new Date();

    if (storePeriod === 'day') {
      for (let i = 6; i >= 0; i -= 1) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const dayCalls = storeCalls.slice(i * Math.ceil(storeCalls.length / 7), (i + 1) * Math.ceil(storeCalls.length / 7));

        periods.push({
          label: `${dayName} ${dateStr}`,
          calls: dayCalls,
          count: dayCalls.length,
        });
      }
    } else {
      for (let i = 3; i >= 0; i -= 1) {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() - i * 7);
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);

        const weekLabel = `Week ${4 - i}`;
        const dateRange = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

        const weekCalls = storeCalls.slice(i * Math.ceil(storeCalls.length / 4), (i + 1) * Math.ceil(storeCalls.length / 4));

        periods.push({
          label: weekLabel,
          dateRange,
          calls: weekCalls,
          count: weekCalls.length,
        });
      }
    }

    const temporalData = periods.map((period) => {
      if (period.count === 0) {
        return {
          ...period,
          overallScore: 0,
          rapport: 0,
          explore: 0,
          listen: 0,
          advise: 0,
          execute: 0,
          productKnowledge: 0,
          softSkills: 0,
        };
      }

      const avgScore = (metric) => Math.round(period.calls.reduce((sum, c) => sum + c.scores[metric], 0) / period.count);

      return {
        ...period,
        overallScore: avgScore('overall'),
        rapport: avgScore('rapport'),
        explore: avgScore('explore'),
        listen: avgScore('listen'),
        advise: avgScore('advise'),
        execute: avgScore('execute'),
        productKnowledge: avgScore('productKnowledge'),
        softSkills: avgScore('softSkills'),
      };
    });

    const storeData = metrics.storePerformance.find((s) => s.storeName === selectedStore);
    const avgOverall = storeData?.overallScore || 0;
    const totalStoreCalls = storeCalls.length;

    const scores = {
      'Rapport Building': storeData?.rapport || 0,
      Exploration: storeData?.explore || 0,
      'Active Listening': storeData?.listen || 0,
      Advisory: storeData?.advise || 0,
      Execution: storeData?.execute || 0,
      'Product Knowledge': storeData?.productKnowledge || 0,
      'Soft Skills': storeData?.softSkills || 0,
    };

    const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const strengths = sortedScores.slice(0, 2);
    const weaknesses = sortedScores.slice(-2).reverse();

    const highExpCalls = storeCalls.filter((c) => c.experience === 'High').length;
    const medExpCalls = storeCalls.filter((c) => c.experience === 'Medium').length;
    const lowExpCalls = storeCalls.filter((c) => c.experience === 'Low').length;
    const expPercentage = totalStoreCalls ? Math.round((highExpCalls / totalStoreCalls) * 100) : 0;

    const highIntentCalls = storeCalls.filter((c) => c.intent === 'High').length;
    const conversionPotential = totalStoreCalls ? Math.round((highIntentCalls / totalStoreCalls) * 100) : 0;

    const recentPeriods = temporalData.slice(-3);
    const trend = recentPeriods.length >= 2
      ? recentPeriods[recentPeriods.length - 1].overallScore - recentPeriods[0].overallScore
      : 0;

    const performanceSummary = avgOverall >= 85
      ? `${selectedStore} demonstrates excellent performance with an overall score of ${avgOverall}. The team consistently delivers high-quality customer interactions across all touchpoints.`
      : avgOverall >= 70
        ? `${selectedStore} shows good performance with an overall score of ${avgOverall}. Fundamentals are strong with room for optimization in specific areas.`
        : `${selectedStore} has an overall score of ${avgOverall}, indicating significant opportunities for improvement. Focused training and process refinement are recommended.`;

    const trendAnalysis = trend > 5
      ? ` Recent trends show positive momentum with a ${trend}-point improvement.`
      : trend < -5
        ? ` Recent performance has declined by ${Math.abs(trend)} points, requiring attention.`
        : ' Performance has remained stable in recent periods.';

    const improvementAreas = weaknesses.length > 0
      ? `Primary focus areas include ${weaknesses[0][0]} (${weaknesses[0][1]}/100) and ${weaknesses[1][0]} (${weaknesses[1][1]}/100). `
        + `${weaknesses[0][1] < 70 ? `${weaknesses[0][0]} needs targeted coaching and playbook reinforcement.` : 'Incremental improvements here will lift overall performance.'}`
      : 'Performance metrics are balanced. Focus on maintaining consistency and exploring advanced techniques.';

    const customerExpSummary = expPercentage >= 60
      ? `Customer experience is strong with ${expPercentage}% of interactions rated high quality. ${conversionPotential}% of calls show high purchase intent, representing solid conversion opportunities.`
      : expPercentage >= 40
        ? `Customer experience is moderate with ${expPercentage}% high-quality interactions. Elevating the ${medExpCalls + lowExpCalls} medium/low experience calls will lift satisfaction scores.`
        : `Customer experience needs improvement with only ${expPercentage}% high-quality interactions. ${highIntentCalls > 0 ? `Despite ${conversionPotential}% high-intent calls, experience gaps may be impacting conversions.` : 'Low intent signals suggest the need for better qualification and engagement strategies.'}`;

    return {
      temporalData,
      analysis: {
        performanceSummary: performanceSummary + trendAnalysis,
        improvementAreas,
        customerExpSummary,
        strengths: strengths.map((s) => ({ name: s[0], score: s[1] })),
        weaknesses: weaknesses.map((s) => ({ name: s[0], score: s[1] })),
        totalCalls: totalStoreCalls,
        avgScore: avgOverall,
        expBreakdown: { high: highExpCalls, medium: medExpCalls, low: lowExpCalls },
      },
    };
  }, [selectedStore, storePeriod, videoCalls, metrics.storePerformance]);

  const regions = useMemo(() => {
    const standardRegions = ['South', 'West', 'North', 'East'];
    const uniqueRegions = [...new Set(videoCalls.map(call => call.region).filter(Boolean))]
      .filter((r) => r !== 'Unknown');

    // Always include standard regions; keep order consistent
    const mergedRegions = [...new Set([...standardRegions, ...uniqueRegions])];
    return mergedRegions.length > 0 ? mergedRegions : standardRegions;
  }, [videoCalls]);

  const cities = useMemo(() => {
    const uniqueCities = [...new Set(videoCalls.map(call => call.city).filter(Boolean))];
    return uniqueCities.length > 0 ? uniqueCities : ['Bangalore', 'Mumbai', 'Hyderabad', 'Chennai', 'Delhi'];
  }, [videoCalls]);

  // Ensure selected city is valid when switching to city view
  useEffect(() => {
    if (view === 'city' && !cities.includes(selectedCity)) {
      setSelectedCity(cities[0] || 'Bangalore');
    }
  }, [view, cities, selectedCity]);

  // Ensure selected region is valid when switching to region view
  useEffect(() => {
    if (view === 'region' && !regions.includes(selectedRegion)) {
      setSelectedRegion(regions[0] || 'South');
    }
  }, [view, regions, selectedRegion]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading video analytics...</div>
      </div>
    );
  }

  if (!videoCalls.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No video call data available for aggregated view.</p>
          <Link to="/popins-inbound" className="text-blue-600 hover:text-blue-700 font-semibold">
            ← Back to Video Reports
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08080c] text-gray-100" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Grain texture overlay */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")"
      }}></div>

      {/* Header */}
      <div className="bg-gradient-to-br from-[#0f0f14] to-[#16161d] border-b border-white/6 shadow-2xl relative z-10">
        <div className="max-w-[1600px] mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/popins-inbound" className="p-2 hover:bg-white/5 rounded-lg transition">
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </Link>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight mb-1" style={{ fontFamily: "'Fraunces', serif", letterSpacing: '-0.02em' }}>
                  Video Call Analytics
                </h1>
                <p className="text-gray-400 text-sm">Aggregated insights across recorded video calls</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadReports}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-gray-900 px-4 py-2 rounded-lg font-semibold text-sm shadow-lg transition"
              >
                <Download className="w-4 h-4" />
                Download All Reports
              </button>
              <Link
                to="/popins-inbound/upload"
                className="flex items-center gap-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 px-4 py-2 rounded-lg font-semibold text-sm transition"
              >
                <Upload className="w-4 h-4" />
                Upload CSV
              </Link>
              <div className="flex items-center gap-3 bg-[#16161d] border border-white/6 rounded-lg px-4 py-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="bg-transparent text-sm font-medium cursor-pointer outline-none text-gray-200"
                  style={{ colorScheme: 'dark' }}
                >
                  <option value="last7" className="bg-[#1a1a1f] text-gray-200">Last 7 Days</option>
                  <option value="last30" className="bg-[#1a1a1f] text-gray-200">Last 30 Days</option>
                  <option value="last90" className="bg-[#1a1a1f] text-gray-200">Last 90 Days</option>
                  <option value="ytd" className="bg-[#1a1a1f] text-gray-200">Year to Date</option>
                </select>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <button
              onClick={() => setView('overall')}
              className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
                view === 'overall'
                  ? 'bg-amber-500 text-gray-900 shadow-lg'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              Overall Overview
            </button>
            <button
              onClick={() => setView('region')}
              className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
                view === 'region'
                  ? 'bg-amber-500 text-gray-900 shadow-lg'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              Region-wise
            </button>
            <button
              onClick={() => setView('city')}
              className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
                view === 'city'
                  ? 'bg-amber-500 text-gray-900 shadow-lg'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'
              }`}
            >
              City-wise
            </button>

            {view === 'region' && (
              <div className="flex items-center gap-2 ml-8 pl-8 border-l border-white/10">
                <Filter className="w-4 h-4 text-gray-500" />
                {regions.map((region) => (
                  <button
                    key={region}
                    onClick={() => setSelectedRegion(region)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                      selectedRegion === region
                        ? 'bg-amber-500 text-gray-900'
                        : 'bg-[#16161d] text-gray-400 hover:bg-white/5 hover:text-gray-100'
                    }`}
                  >
                    {region}
                  </button>
                ))}
              </div>
            )}

            {view === 'city' && (
              <div className="flex items-center gap-3 ml-8 pl-8 border-l border-white/10 bg-[#16161d] rounded-lg px-4 py-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="bg-transparent font-medium cursor-pointer outline-none text-gray-200"
                  style={{ colorScheme: 'dark' }}
                >
                  {cities.map((city) => (
                    <option key={city} value={city} className="bg-[#1a1a1f] text-gray-200">
                      {city}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </div>
            )}

            {/* Intent to Purchase Filter */}
            <div className="flex items-center gap-3 ml-8 pl-8 border-l border-white/10 bg-[#16161d] rounded-lg px-4 py-2">
              <span className="text-xs text-gray-400">Intent to Purchase</span>
              <select
                value={selectedIntent}
                onChange={(e) => setSelectedIntent(e.target.value)}
                className="bg-transparent font-medium cursor-pointer outline-none text-gray-200"
                style={{ colorScheme: 'dark' }}
              >
                {['All','High','Medium','Low'].map((opt) => (
                  <option key={opt} value={opt} className="bg-[#1a1a1f] text-gray-200">
                    {opt}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-8 py-8 relative z-10">
        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div
            onClick={() => navigateWithFilter(() => true, 'All calls (current filters)')}
            className="bg-[#0f0f14] border border-white/6 rounded-2xl p-6 hover:shadow-md transition-shadow relative overflow-hidden cursor-pointer"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-indigo-600 to-transparent"></div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-indigo-900/20 rounded-lg">
                <Video className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-gray-100">{metrics.total.toLocaleString()}</p>
                <p className="text-sm text-gray-400 mt-1">Total Calls Analyzed</p>
              </div>
            </div>
            <div className="pt-4 border-t border-white/6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Avg. per store</span>
                <span className="font-semibold text-gray-100">
                  {metrics.storePerformance.length ? Math.round(metrics.total / metrics.storePerformance.length) : 0}
                </span>
              </div>
            </div>
          </div>

          <div
            onClick={() => navigateWithFilter((c) => c.type === 'Sales', 'Sales calls')}
            className="bg-[#0f0f14] border border-white/6 rounded-2xl p-6 hover:shadow-md transition-shadow relative overflow-hidden cursor-pointer"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-600 to-transparent"></div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-900/20 rounded-lg">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-emerald-400">{metrics.salesCalls}</p>
                <p className="text-sm text-gray-400 mt-1">Sales Calls</p>
              </div>
            </div>
            <div className="pt-4 border-t border-white/6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Sales Ratio</span>
                <span className="font-semibold text-gray-100">
                  {metrics.total ? Math.round((metrics.salesCalls / metrics.total) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>

          <div
            onClick={() => navigateWithFilter((c) => c.type === 'Service', 'Service calls')}
            className="bg-[#0f0f14] border border-white/6 rounded-2xl p-6 hover:shadow-md transition-shadow relative overflow-hidden cursor-pointer"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-transparent"></div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-900/20 rounded-lg">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-blue-400">{metrics.serviceCalls}</p>
                <p className="text-sm text-gray-400 mt-1">Service Calls</p>
              </div>
            </div>
            <div className="pt-4 border-t border-white/6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Service Ratio</span>
                <span className="font-semibold text-gray-100">
                  {metrics.total ? Math.round((metrics.serviceCalls / metrics.total) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Intent × Customer Experience Matrix */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-6 sm:p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-xl shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
              🎯
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-white">Intent × Customer Experience Matrix</h2>
              <p className="text-sm text-slate-400">Click a cell to drill into matching calls</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#2a2a2a] bg-[#0f0f14] p-4 sm:p-6 overflow-x-auto">
            <div className="min-w-[900px] grid grid-cols-[170px_repeat(3,minmax(0,1fr))] gap-4">
              <div></div>
              {experiences.map((exp) => (
                <div key={`header-${exp}`} className="text-center font-semibold text-base text-slate-100 py-3">
                  {exp} Experience
                </div>
              ))}

              {intents.map((intent) => (
                <React.Fragment key={intent}>
                  <div className="flex items-center justify-end pr-4 text-right text-base font-semibold text-slate-100">
                    {intent} Intent
                  </div>
                  {experiences.map((exp) => (
                    <button
                      key={`${intent}-${exp}`}
                      type="button"
                      onClick={() => navigateWithFilter((c) => c.intent === intent && c.experience === exp, `${intent} intent × ${exp} experience`)}
                      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${matrixPalette[intent][exp]} p-6 sm:p-7 text-center transition transform hover:-translate-y-1 hover:scale-[1.02] shadow-[0_12px_40px_rgba(0,0,0,0.35)]`}
                    >
                      <div className="text-4xl font-bold tracking-tight text-white drop-shadow-sm">{metrics.matrix[intent][exp]}</div>
                      <div className="text-sm font-medium text-white/80">calls</div>
                      <div className="mt-3 inline-flex rounded-md bg-black/20 px-3 py-1 text-xs font-semibold text-white/90">
                        {matrixLabels[intent][exp]}
                      </div>
                    </button>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="mt-7 rounded-2xl border border-[#2a2a2a] bg-[#0f0f14] p-6">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Color Legend & Interpretation</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {matrixLegend.map((item) => (
                <div key={item.title} className="flex items-center gap-3 rounded-xl bg-[#0a0a0a] p-4">
                  <div className={`h-12 w-12 rounded-lg border-2 ${item.border} bg-gradient-to-br ${item.gradient}`}></div>
                  <div className="space-y-1 text-left">
                    <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                    <p className="text-xs text-slate-400 leading-snug">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Store Performance Table */}
        <div className="bg-[#0f0f14] border border-white/6 rounded-2xl overflow-hidden mb-8">
          <div className="p-8 border-b border-white/6">
            <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-3" style={{ fontFamily: "'Fraunces', serif" }}>
              <TrendingUp className="w-6 h-6 text-amber-400" />
              Store Performance Analysis
            </h2>
            <p className="text-sm text-gray-400 mt-1">RELAX Framework Scores & Key Metrics</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#16161d] border-b border-white/6">
                <tr>
                  <th className="text-left px-8 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Store Name
                  </th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    # Calls
                  </th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Overall Score
                  </th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-amber-400 uppercase tracking-wider border-l border-white/6">
                    R
                  </th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    E
                  </th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    L
                  </th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    A
                  </th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-amber-400 uppercase tracking-wider border-r border-white/6">
                    X
                  </th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Product Knowledge
                  </th>
                  <th className="text-center px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Soft Skills
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {metrics.storePerformance.map((store) => (
                  <tr
                    key={store.storeName}
                    onClick={() => navigateWithFilter((c) => c.store === store.storeName, `${store.storeName} store calls`)}
                    className="hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <td className="px-8 py-5">
                      <div>
                        <div className="font-semibold text-gray-100">{store.storeName}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{store.city}, {store.region}</div>
                      </div>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#16161d] text-gray-300">
                        {store.totalCalls}
                      </span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold ${getScoreBg(store.overallScore)} ${getScoreColor(store.overallScore)}`}>
                        {store.overallScore}
                      </span>
                    </td>
                    <td className="px-4 py-5 text-center border-l border-white/6">
                      <span className="font-semibold text-gray-300">{store.rapport}</span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <span className="font-semibold text-gray-300">{store.explore}</span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <span className="font-semibold text-gray-300">{store.listen}</span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <span className="font-semibold text-gray-300">{store.advise}</span>
                    </td>
                    <td className="px-4 py-5 text-center border-r border-white/6">
                      <span className="font-semibold text-gray-300">{store.execute}</span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <span className={`font-semibold ${getScoreColor(store.productKnowledge)}`}>
                        {store.productKnowledge}
                      </span>
                    </td>
                    <td className="px-4 py-5 text-center">
                      <span className={`font-semibold ${getScoreColor(store.softSkills)}`}>
                        {store.softSkills}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-8 py-4 bg-[#16161d] border-t border-white/6">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <div>
                <span className="font-semibold">RELAX Framework:</span>
                <span className="ml-2">R = Rapport | E = Explore | L = Listen | A = Advise | X = Execute</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span>85+ Excellent</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <span>70-84 Good</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <span>&lt;70 Needs Improvement</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Store-wise Deep Dive */}
        {storeAnalysis && metrics.storePerformance.length > 0 && (
          <div className="bg-[#0f0f14] border border-white/6 rounded-2xl overflow-hidden">
            <div className="p-8 border-b border-white/6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-3" style={{ fontFamily: "'Fraunces', serif" }}>
                    <Store className="w-6 h-6 text-amber-400" />
                    Store-wise Deep Dive
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">Temporal performance trends and detailed analytics</p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 bg-[#16161d] rounded-lg px-4 py-2.5 border border-white/6">
                    <Store className="w-4 h-4 text-gray-500" />
                    <select
                      value={selectedStore}
                      onChange={(e) => setSelectedStore(e.target.value)}
                      className="bg-transparent font-medium text-sm cursor-pointer outline-none text-gray-200 min-w-[200px]"
                      style={{ colorScheme: 'dark' }}
                    >
                      {metrics.storePerformance.map((store) => (
                        <option key={store.storeName} value={store.storeName} className="bg-[#1a1a1f] text-gray-200">
                          {store.storeName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </div>

                  <div className="flex items-center bg-[#16161d] border border-white/6 rounded-lg p-1">
                    <button
                      onClick={() => setStorePeriod('day')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                        storePeriod === 'day'
                          ? 'bg-amber-500 text-gray-900 shadow-sm'
                          : 'text-gray-400 hover:text-gray-100'
                      }`}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => setStorePeriod('week')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                        storePeriod === 'week'
                          ? 'bg-amber-500 text-gray-900 shadow-sm'
                          : 'text-gray-400 hover:text-gray-100'
                      }`}
                    >
                      Weekly
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 border-b border-white/6">
              <div className="flex items-center gap-2 mb-6">
                <BarChart3 className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-semibold text-gray-100" style={{ fontFamily: "'Fraunces', serif" }}>
                  Performance Over Time
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#16161d]">
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        {storePeriod === 'day' ? 'Day' : 'Week'}
                      </th>
                      <th className="text-center px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        # Calls
                      </th>
                      <th className="text-center px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Overall Score
                      </th>
                      <th className="text-center px-4 py-4 text-xs font-semibold text-amber-400 uppercase tracking-wider border-l border-white/6">
                        R
                      </th>
                      <th className="text-center px-4 py-4 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                        E
                      </th>
                      <th className="text-center px-4 py-4 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                        L
                      </th>
                      <th className="text-center px-4 py-4 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                        A
                      </th>
                      <th className="text-center px-4 py-4 text-xs font-semibold text-amber-400 uppercase tracking-wider border-r border-white/6">
                        X
                      </th>
                      <th className="text-center px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Product Knowledge
                      </th>
                      <th className="text-center px-4 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Soft Skills
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {storeAnalysis.temporalData.map((period, idx) => (
                      <tr key={idx} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <div className="font-semibold text-gray-100">{period.label}</div>
                            {period.dateRange && <div className="text-xs text-gray-400 mt-0.5">{period.dateRange}</div>}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#16161d] text-gray-300">
                            {period.count}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {period.count > 0 ? (
                            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold ${getScoreBg(period.overallScore)} ${getScoreColor(period.overallScore)}`}>
                              {period.overallScore}
                            </span>
                          ) : (
                            <span className="text-gray-500 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center border-l border-white/6">
                          <span className={`font-semibold ${period.count > 0 ? 'text-gray-300' : 'text-gray-500'}`}>
                            {period.count > 0 ? period.rapport : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`font-semibold ${period.count > 0 ? 'text-gray-300' : 'text-gray-500'}`}>
                            {period.count > 0 ? period.explore : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`font-semibold ${period.count > 0 ? 'text-gray-300' : 'text-gray-500'}`}>
                            {period.count > 0 ? period.listen : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`font-semibold ${period.count > 0 ? 'text-gray-300' : 'text-gray-500'}`}>
                            {period.count > 0 ? period.advise : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center border-r border-white/6">
                          <span className={`font-semibold ${period.count > 0 ? 'text-gray-300' : 'text-gray-500'}`}>
                            {period.count > 0 ? period.execute : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {period.count > 0 ? (
                            <span className={`font-semibold ${getScoreColor(period.productKnowledge)}`}>
                              {period.productKnowledge}
                            </span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {period.count > 0 ? (
                            <span className={`font-semibold ${getScoreColor(period.softSkills)}`}>
                              {period.softSkills}
                            </span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI-Powered Insights */}
            <div className="p-8 bg-gradient-to-br from-[#0f0f14] to-[#16161d]">
              <div className="flex items-center gap-2 mb-6">
                <TrendingUp className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-semibold text-gray-100" style={{ fontFamily: "'Fraunces', serif" }}>
                  AI-Powered Insights & Recommendations
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <div className="bg-[#16161d] border border-white/6 rounded-lg p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 bg-blue-900/20 rounded-lg">
                      <BarChart3 className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-100 mb-1">Store Performance Summary</h4>
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getScoreBg(storeAnalysis.analysis.avgScore)} ${getScoreColor(storeAnalysis.analysis.avgScore)}`}>
                          {storeAnalysis.analysis.avgScore}/100
                        </span>
                        <span className="text-gray-500">•</span>
                        <span className="text-gray-400">{storeAnalysis.analysis.totalCalls} calls analyzed</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{storeAnalysis.analysis.performanceSummary}</p>
                  <div className="mt-4 pt-4 border-t border-white/6">
                    <div className="text-xs font-semibold text-gray-400 mb-2">Top Strengths:</div>
                    <div className="flex flex-col gap-1">
                      {storeAnalysis.analysis.strengths.map((strength, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-300">{strength.name}</span>
                          <span className={`font-bold ${getScoreColor(strength.score)}`}>{strength.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-[#16161d] border border-white/6 rounded-lg p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 bg-amber-900/20 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-100 mb-1">Improvement Areas</h4>
                      <div className="text-xs text-gray-400">Priority focus recommendations</div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{storeAnalysis.analysis.improvementAreas}</p>
                  <div className="mt-4 pt-4 border-t border-white/6">
                    <div className="text-xs font-semibold text-gray-400 mb-2">Development Priorities:</div>
                    <div className="flex flex-col gap-1">
                      {storeAnalysis.analysis.weaknesses.map((weakness, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-300">{weakness.name}</span>
                          <span className={`font-bold ${getScoreColor(weakness.score)}`}>{weakness.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-[#16161d] border border-white/6 rounded-lg p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 bg-emerald-900/20 rounded-lg">
                      <ThumbsUp className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-100 mb-1">Customer Experience Summary</h4>
                      <div className="text-xs text-gray-400">Interaction quality & satisfaction</div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{storeAnalysis.analysis.customerExpSummary}</p>
                  <div className="mt-4 pt-4 border-t border-white/6">
                    <div className="text-xs font-semibold text-gray-400 mb-2">Experience Breakdown:</div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                          <span className="text-gray-300">High Quality</span>
                        </div>
                        <span className="font-bold text-gray-100">{storeAnalysis.analysis.expBreakdown.high}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                          <span className="text-gray-300">Medium Quality</span>
                        </div>
                        <span className="font-bold text-gray-100">{storeAnalysis.analysis.expBreakdown.medium}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                          <span className="text-gray-300">Low Quality</span>
                        </div>
                        <span className="font-bold text-gray-100">{storeAnalysis.analysis.expBreakdown.low}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoAggregatedDashboard;
