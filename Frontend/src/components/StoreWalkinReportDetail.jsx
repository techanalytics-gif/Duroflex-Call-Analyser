import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Phone, ChevronDown, ChevronUp, Download, FileDown } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://duroflex-call-analyser.onrender.com';

const StoreWalkinReportDetail = () => {
  const { callId } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandTranscript, setExpandTranscript] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`${API_BASE}/api/outbound-calls/${encodeURIComponent(callId)}`);
        if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
        const data = await res.json();
        setReport(data?.report || data);
      } catch (e) {
        setError(e?.message || 'Failed to load store walk-in call report');
        setReport(null);
      } finally {
        setLoading(false);
      }
    };
    if (callId) fetchReport();
  }, [callId]);

  const playRecording = () => {
    const url = report?.driveLink || report?.recording_url;
    if (url) window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading call report...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || 'Report not found'}</p>
          <Link to="/storewalkin-outbound-calls" className="text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Calls
          </Link>
        </div>
      </div>
    );
  }

  const analysis = report.analysis || {};

  // ========== NEW ABC-STYLE SCHEMA MAPPING ==========
  const metaData = analysis.MetaData || {};
  const callSummary = analysis.Call_Summary || '';
  const callObjective = analysis['1_Call_Objective'] || {};
  const intentToPurchase = analysis['2_Intent_to_Purchase'] || {};
  const storeExperience = analysis['3_Store_Experience'] || {};
  const callExperience = analysis['4_Call_Experience'] || {};
  const funnelAnalysis = analysis['5_Funnel_Analysis'] || {};
  const productIntelligence = analysis['6_Product_Intelligence'] || {};
  const customerNeeds = analysis['7_Customer_Needs'] || {};
  const purchaseBarriers = analysis['8_Purchase_Barriers'] || {};
  const decisionMaker = analysis['9_Decision_Maker'] || 'Unknown';
  const invitations = analysis['10_Invitations'] || {};
  const conversionHooks = analysis['11_Conversion_Hooks'] || {};
  const relaxFramework = analysis['12_RELAX_Framework'] || {};
  const agentEvaluation = analysis['13_Agent_Evaluation'] || {};
  const agentLearnings = analysis['14_Agent_Learnings'] || [];
  const nextActions = analysis['15_Next_Actions'] || '';
  const npsData = analysis['16_End_to_End_NPS'] || {};
  const transcriptLog = analysis.Transcript_Log || '';

  // ========== FALLBACK TO OLD PILLAR SCHEMA ==========
  const pillar1Double = analysis.Pillar_1_Double_Audit || {};
  const pillar2Diag = analysis.Pillar_2_Diagnosis || {};
  const pillar3Hooks = analysis.Pillar_3_Recovery_Hooks || {};
  const pillar4Health = analysis.Pillar_4_Lead_Health || {};
  const pillar5Method = analysis.Pillar_5_Methodology || {};
  const summaryOld = analysis.Summary || {};

  function maskPhoneNumber(value) {
    if (!value) return '';
    const digits = String(value).replace(/\D/g, '');
    if (digits.length < 4) return String(value);
    return `****${digits.slice(-4)}`;
  }

  // Customer Name
  const customerName = pickMeaningful(metaData.Customer_Name, maskPhoneNumber(report.customer_phone), 'Walk-in Customer');
  const customerLocation = pickMeaningful(metaData.Customer_Location, report.store_name, 'Unknown Store');
  const customerLanguage = pickMeaningful(metaData.Customer_Language, 'English');
  // Keep "Unknown" and "N/A" for Consideration Value (don't filter them out)
  const considerationValue = metaData.Consideration_Value || 'Not Specified';
  const callQuality = pickMeaningful(metaData.Call_Quality_Overall, 'Medium');
  const callDuration = pickMeaningful(metaData.Call_Duration, formatDuration(report.duration || 0));
  const customerEnthusiasm = pickMeaningful(metaData.Customer_Enthusiasm, 'Medium');
  const connectedToCustomer = metaData.Connected_to_Customer !== false;

  // Intent
  const intentRating = pickMeaningful(intentToPurchase.Rating, 'Medium');
  const intentReason = pickMeaningful(intentToPurchase.Reason, '');

  // Store Experience
  const storeExpRating = pickMeaningful(storeExperience.Rating, pillar1Double.Store_Audit?.Sentiment_Label, 'Medium');
  const storeExpReason = pickMeaningful(storeExperience.Reason, pillar1Double.Store_Audit?.Specific_Feedback, '');

  // Call Experience
  const callExpRating = pickMeaningful(callExperience.Rating, pillar1Double.Call_Audit?.Sentiment_Label, 'Medium');
  const callExpReason = pickMeaningful(callExperience.Reason, pillar1Double.Call_Audit?.Skill_Highlight, '');

  // Funnel
  const funnelStage = pickMeaningful(funnelAnalysis.Stage, pillar4Health.AIDA_Stage, 'Consideration');
  const funnelReason = pickMeaningful(funnelAnalysis.Reason, funnelAnalysis.reason, '');
  const timelineToPurchase = pickMeaningful(funnelAnalysis.Timeline_to_Purchase, pillar2Diag.Timeline_Label, 'Not Specified');
  const timelineToPurchaseReason = pickMeaningful(funnelAnalysis.Timeline_to_Purchase_Reason, '');

  // Product Intelligence
  const narrowDownStage = pickMeaningful(productIntelligence.Narrow_Down_Stage, 'Category');
  const productOfInterest = pickMeaningful(productIntelligence.Product_of_Interest, 'Not Specified');

  // Customer Needs
  const needsDescription = pickMeaningful(customerNeeds.Description, '');

  // Barriers
  const barrierAtStore = pickMeaningful(purchaseBarriers.At_Store, pillar2Diag.Primary_WalkOut_Reason, '');
  const barrierOnCall = pickMeaningful(purchaseBarriers.On_Call, '');

  // Home Measurement Invitation
  const homeMeasurement = invitations.Home_Measurement || {};
  const homeMeasureRating = homeMeasurement.Rating || 'Low';
  const homeMeasureReason = homeMeasurement.Reason || pillar3Hooks.Home_Measure_Hook?.Reasoning || '';
  const homeMeasureOffered = normalizeRating(homeMeasureRating) === 'High' || normalizeRating(homeMeasureRating) === 'Medium' || pillar3Hooks.Home_Measure_Hook?.Offered;

  // Conversion Hooks
  const hookOffers = conversionHooks.Offers_Discounts_EMI || {};
  const hookWarranty = conversionHooks.Brand_Legacy_Warranty || {};
  const hookSleepTrial = conversionHooks.Sleep_Trial || {};

  // RELAX Framework
  const relaxR = relaxFramework.R_Reach_Out || pillar5Method.RELAX_Scores?.R || {};
  const relaxE = relaxFramework.E_Explore_Needs || pillar5Method.RELAX_Scores?.E || {};
  const relaxL = relaxFramework.L_Link_Product || pillar5Method.RELAX_Scores?.L || {};
  const relaxA = relaxFramework.A_Add_Value || pillar5Method.RELAX_Scores?.A || {};
  const relaxX = relaxFramework.X_Express_Closing || pillar5Method.RELAX_Scores?.X || {};

  // Agent Evaluation - handle both string and object ratings
  const mainSkills = agentEvaluation.Main_Skills || {};
  const secondaryTraits = agentEvaluation.Secondary_Traits || {};
  
  // Extract ratings (handle both {Rating: "High", Reason: "..."} and "High" formats)
  const getSkillRating = (skill) => {
    if (!skill) return 'Medium';
    if (typeof skill === 'string') return skill;
    return skill.Rating || 'Medium';
  };
  
  const getSkillReason = (skill) => {
    if (!skill || typeof skill === 'string') return '';
    return skill.Reason || '';
  };

  // NPS
  const npsScore = npsData.Score !== undefined ? npsData.Score : '';
  const npsComment = npsData.Comment || '';

  // Next Actions (fallback)
  const nextActionsText = pickMeaningful(nextActions, pillar4Health.Next_Action_Text, summaryOld.Call_Synopsis, '');

  // Call Objective
  const objectiveType = pickMeaningful(callObjective.Type, 'Store Walk-in Recovery');

  // ========== HELPER FUNCTIONS ==========
  function isMeaningful(value) {
    if (value === null || value === undefined) return false;

    if (typeof value === 'string') {
      const v = value.trim();
      if (!v) return false;
      const lower = v.toLowerCase();
      const placeholders = new Set([
        'na',
        'n/a',
        'n.a',
        'none',
        'null',
        'undefined',
        'unknown',
        'not specified',
        'not available',
      ]);
      if (placeholders.has(lower)) return false;
    }

    return true;
  }

  function pickMeaningful(...values) {
    for (const value of values) {
      if (isMeaningful(value)) return value;
    }
    return '';
  }

  function formatDuration(seconds) {
    if (typeof seconds === 'string') return seconds;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function normalizeRating(rating) {
    if (!rating) return 'Medium';
    // Handle object with Rating property (new schema)
    if (typeof rating === 'object' && rating.Rating) {
      rating = rating.Rating;
    }
    const r = String(rating).trim().toLowerCase();
    if (r === 'h' || r === 'high') return 'High';
    if (r === 'm' || r === 'med' || r === 'medium') return 'Medium';
    if (r === 'l' || r === 'low') return 'Low';
    if (r === 'positive' || r === 'excellent') return 'High';
    if (r === 'neutral') return 'Medium';
    if (r === 'negative') return 'Low';
    return String(rating);
  }

  function getScoreDotClass(rating) {
    const norm = normalizeRating(rating);
    if (norm === 'High') return 'bg-emerald-500';
    if (norm === 'Medium') return 'bg-amber-500';
    return 'bg-red-500';
  }

  function getRatingTextClass(rating) {
    const norm = normalizeRating(rating);
    if (norm === 'High') return 'text-emerald-600';
    if (norm === 'Medium') return 'text-amber-600';
    return 'text-red-600';
  }

  function getRatingBadgeClass(rating) {
    const norm = normalizeRating(rating);
    if (norm === 'High') return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    if (norm === 'Medium') return 'bg-amber-100 text-amber-700 border-amber-300';
    return 'bg-red-100 text-red-700 border-red-300';
  }

  function getNPSLabel(score) {
    const s = Number(score);
    if (s >= 9) return 'PROMOTER';
    if (s >= 7) return 'PASSIVE';
    return 'DETRACTOR';
  }

  function getNPSColorClass(score) {
    const s = Number(score);
    if (s >= 9) return 'text-emerald-700';
    if (s >= 7) return 'text-amber-700';
    return 'text-red-700';
  }

  function getRelaxScore(item) {
    if (!item) return 'M';
    if (item.Score) return item.Score;
    if (typeof item === 'object' && item.Rating) return item.Rating;
    return 'M';
  }

  function getRelaxReason(item) {
    if (!item) return '';
    return item.Reason || item.Reasons?.[0] || '';
  }

  // Calculate overall RELAX adherence
  function getOverallRelaxAdherence() {
    const scores = [relaxR, relaxE, relaxL, relaxA, relaxX].map(item => {
      const s = normalizeRating(getRelaxScore(item));
      if (s === 'High') return 3;
      if (s === 'Medium') return 2;
      return 1;
    });
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg >= 2.5) return 'High';
    if (avg >= 1.5) return 'Medium';
    return 'Low';
  }

  function getRelaxAverageScore() {
    const scoreToNumeric = (score) => {
      if (!score) return null;
      const scoreUpper = String(score).trim().toUpperCase();
      if (scoreUpper === 'H' || scoreUpper === 'HIGH') return 3;
      if (scoreUpper === 'M' || scoreUpper === 'MED' || scoreUpper === 'MEDIUM') return 2;
      if (scoreUpper === 'L' || scoreUpper === 'LOW') return 1;
      return null;
    };

    const nums = [relaxR, relaxE, relaxL, relaxA, relaxX]
      .map((item) => scoreToNumeric(getRelaxScore(item)))
      .filter((n) => typeof n === 'number');

    if (nums.length === 0) return 'N/A';
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    return avg.toFixed(2);
  }

  // Funnel stages
  const funnelStages = ['Awareness', 'Consideration', 'Action', 'Purchased'];
  const currentFunnelIndex = funnelStages.findIndex(s => 
    s.toLowerCase() === String(funnelStage).toLowerCase() ||
    String(funnelStage).toLowerCase().includes(s.toLowerCase().replace('purchased', 'already purchased'))
  );

  // Narrow down stages
  const narrowStages = ['Category', 'Range', 'Specific SKU'];
  const currentNarrowIndex = narrowStages.findIndex(s => 
    String(narrowDownStage).toLowerCase().includes(s.toLowerCase().replace(' ', ''))
  );

  // Parse transcript - Format: [Speaker](MM:SS): message\n[Speaker](MM:SS): message
  let transcriptItems = [];
  if (typeof transcriptLog === 'string' && transcriptLog.trim()) {
    const timestampRegex = /\[(\w+)\]\(([^)]+)\):\s*(.+?)(?=\[(?:Agent|Customer|System)\]|$)/gs;
    let match;
    while ((match = timestampRegex.exec(transcriptLog)) !== null) {
      transcriptItems.push({
        Speaker: match[1],
        Timestamp: match[2],
        Text: match[3].trim()
      });
    }
  } else if (Array.isArray(transcriptLog)) {
    transcriptItems = transcriptLog.map(item => ({
      Speaker: item.Speaker || item.speaker || 'Unknown',
      Timestamp: item.Timestamp || item.timestamp || '',
      Text: item.Text || item.text || String(item),
    }));
  }

  // ========== EXPANDABLE DETAILS COMPONENT ==========
  const ExpandableDetail = ({ title, subtitle, rating, reason, variant = 'default' }) => {
    const [open, setOpen] = useState(false);
    const badgeClass = getRatingBadgeClass(rating);
    
    return (
      <div className={`rounded-lg overflow-hidden border-2 ${variant === 'green' ? 'bg-emerald-50 border-emerald-200' : variant === 'yellow' ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
        <button
          onClick={() => setOpen(!open)}
          className={`w-full p-6 text-left transition ${variant === 'green' ? 'hover:bg-emerald-100' : variant === 'yellow' ? 'hover:bg-amber-100' : 'hover:bg-gray-100'}`}
        >
          <div className="flex justify-between items-center">
            <div>
              <p className="text-lg font-bold text-gray-900">{title}</p>
              {subtitle && <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-bold px-4 py-1.5 rounded-full border-2 ${badgeClass}`}>
                {normalizeRating(rating).toUpperCase()}
              </span>
              <span className="text-gray-400 text-xl font-bold">{open ? '−' : '+'}</span>
            </div>
          </div>
        </button>
        {open && (
          <div className={`px-6 pb-6 text-base text-gray-700 border-t-2 pt-4 ${variant === 'green' ? 'border-emerald-200' : variant === 'yellow' ? 'border-amber-300' : 'border-gray-200'}`}>
            {reason ? (
              <>
                <strong className={`text-sm uppercase ${variant === 'green' ? 'text-emerald-700' : variant === 'yellow' ? 'text-amber-700' : 'text-gray-500'}`}>Reason:</strong> {reason}
              </>
            ) : (
              <span className="text-sm text-gray-500 italic">No additional details available for this metric.</span>
            )}
          </div>
        )}
      </div>
    );
  };

  // ========== HOOK CARD COMPONENT ==========
  const HookCard = ({ title, status, comment, isPrimary = false }) => {
    const [open, setOpen] = useState(false);
    const isYes = String(status).toLowerCase() === 'yes';
    
    return (
      <div className={`rounded-lg overflow-hidden border-2 relative ${isPrimary ? 'bg-emerald-50 border-emerald-200 md:col-span-2' : 'bg-gray-50 border-gray-200'}`}>
        <button
          onClick={() => setOpen(!open)}
          className={`w-full p-6 text-left transition ${isPrimary ? 'hover:bg-emerald-100' : isYes ? 'hover:bg-emerald-50' : 'hover:bg-red-50'}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className={`font-bold text-xl ${isYes ? 'text-emerald-600' : 'text-red-600'}`}>
              {isPrimary ? '★' : isYes ? '✓' : '✗'}
            </span>
            <p className={`text-sm font-bold uppercase ${isPrimary ? 'text-emerald-800' : 'text-gray-600'}`}>{title}</p>
          </div>
          <p className={`text-lg font-semibold ${isYes ? 'text-emerald-600' : 'text-red-600'}`}>
            {isPrimary && isYes ? 'OFFERED & ACCEPTED' : isYes ? 'YES' : 'NO'}
          </p>
          <span className="absolute right-6 top-6 text-gray-400 text-xl font-bold">{open ? '−' : '+'}</span>
        </button>
        {open && comment && (
          <div className={`px-6 pb-6 text-sm border-t-2 pt-4 ${isPrimary ? 'text-emerald-800 border-emerald-200' : 'text-gray-700 border-gray-200'}`}>
            {comment}
          </div>
        )}
      </div>
    );
  };

  // ========== INFO CARD WITH TOOLTIP ==========
  const InfoCard = ({ label, value, reason, valueClass = '' }) => {
    const [hovered, setHovered] = useState(false);
    
    return (
      <div 
        className="relative bg-gray-50 border-2 border-gray-200 rounded-xl p-6 hover:border-emerald-400 transition cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {reason && hovered && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 -translate-y-3 bg-gray-800 border border-gray-700 px-4 py-3 rounded-lg text-sm text-gray-100 whitespace-normal w-max max-w-85 z-50 shadow-xl">
            {reason}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-8 border-transparent border-t-gray-800"></div>
          </div>
        )}
        <p className="text-sm text-gray-600 font-bold uppercase tracking-wider mb-3">{label}</p>
        <div className="flex items-center">
          <span className={`w-2.5 h-2.5 rounded-full mr-2 ${getScoreDotClass(value)}`}></span>
          <span className={`text-2xl font-bold ${valueClass || getRatingTextClass(value)}`}>
            {normalizeRating(value).toUpperCase()}
          </span>
        </div>
      </div>
    );
  };

  // ========== DOWNLOAD FUNCTIONS ==========
  const downloadCSV = () => {
    if (!report || !analysis) return;

    const rows = [
      ['Store Walk-in Call Report - CSV Export'],
      [''],
      ['METADATA'],
      ['Call ID', report.call_id],
      ['Store Name', report.store_name || 'N/A'],
      ['Customer Phone', report.customer_phone || 'N/A'],
      ['Call Date', report.call_date || 'N/A'],
      ['Duration (s)', report.duration || 'N/A'],
      [''],
      ['ANALYSIS DATA'],
      ['Customer Name', metaData.Customer_Name || 'N/A'],
      ['Customer Location', metaData.Customer_Location || 'N/A'],
      ['Call Summary', callSummary || 'N/A'],
      ['Funnel Stage', funnelStage || 'N/A'],
      ['Funnel Reason', funnelReason || 'N/A'],
      ['Intent to Purchase', intentRating || 'N/A'],
      ['Store Experience', storeExpRating || 'N/A'],
      ['Call Experience', callExpRating || 'N/A'],
      ['Product of Interest', productOfInterest || 'N/A'],
      ['Customer Needs', needsDescription || 'N/A'],
      ['Decision Maker', decisionMaker || 'N/A'],
      ['Walk-out Reason (Store)', barrierAtStore || 'N/A'],
      ['Current Barrier', barrierOnCall || 'N/A'],
      ['Next Actions', nextActionsText || 'N/A'],
      ['NPS Score', npsScore !== '' ? npsScore : 'N/A'],
      ['NPS Comment', npsComment || 'N/A'],
      [''],
      ['RELAX FRAMEWORK'],
      ['R - Reach Out', getRelaxScore(relaxR)],
      ['E - Explore Needs', getRelaxScore(relaxE)],
      ['L - Link Product', getRelaxScore(relaxL)],
      ['A - Add Value', getRelaxScore(relaxA)],
      ['X - Express Closing', getRelaxScore(relaxX)],
    ];

    const csvContent = rows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `storewalkin-call-${report.call_id}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const downloadTranscript = () => {
    if (!report || !transcriptLog) return;

    let transcriptContent = `STORE WALK-IN CALL TRANSCRIPT\n`;
    transcriptContent += `Call ID: ${report.call_id}\n`;
    transcriptContent += `Store: ${report.store_name || 'N/A'}\n`;
    transcriptContent += `Date: ${report.call_date || 'N/A'}\n`;
    transcriptContent += `Duration: ${formatDuration(report.duration || 0)}\n`;
    transcriptContent += `\n${'='.repeat(80)}\n\n`;

    if (typeof transcriptLog === 'string') {
      transcriptContent += transcriptLog;
    } else if (Array.isArray(transcriptLog)) {
      transcriptContent += transcriptLog.map(item => {
        if (typeof item === 'string') return item;
        return `${item.Speaker}: ${item.Text}`;
      }).join('\n');
    } else {
      transcriptContent += 'No transcript available.';
    }

    const blob = new Blob([transcriptContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `storewalkin-transcript-${report.call_id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="max-w-400 mx-auto px-8 py-10 relative z-10">
        
        {/* Navigation */}
        <div className="flex items-center justify-between mb-10">
          <Link to="/storewalkin-outbound-calls" className="text-base font-medium text-gray-600 hover:text-gray-900 transition tracking-wide">
            ← BACK TO WALK-IN LEADS
          </Link>
          <div className="flex gap-3">
            <span className="inline-flex items-center px-5 py-2.5 bg-white rounded-lg text-sm text-gray-600 border border-gray-300 font-mono tracking-wider shadow-sm">
              ID: {report.call_id}
            </span>
            <span className={`inline-flex items-center px-5 py-2.5 bg-white rounded-lg text-sm border border-gray-300 shadow-sm ${
              report.call_type === 'POST_PURCHASE' ? 'text-purple-700' : 'text-blue-700'
            }`}>
              <span className="font-semibold">Lead:</span>&nbsp;{report.call_type === 'POST_PURCHASE' ? 'Post-Purchase' : 'Sales'}
            </span>
            <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white rounded-lg text-sm border border-gray-300 shadow-sm">
              <span className="font-semibold text-gray-600">Intent:</span>
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                normalizeRating(intentRating) === 'High' ? 'bg-green-500' : 
                normalizeRating(intentRating) === 'Medium' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></span>
              <span className={`font-bold ${
                normalizeRating(intentRating) === 'High' ? 'text-green-700' : 
                normalizeRating(intentRating) === 'Medium' ? 'text-yellow-700' : 'text-red-700'
              }`}>
                {normalizeRating(intentRating)}
              </span>
            </span>
            <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white rounded-lg text-sm border border-gray-300 shadow-sm">
              <span className="font-semibold text-gray-600">Experience:</span>
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                normalizeRating(callExpRating) === 'High' ? 'bg-green-500' : 
                normalizeRating(callExpRating) === 'Medium' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></span>
              <span className={`font-bold ${
                normalizeRating(callExpRating) === 'High' ? 'text-green-700' : 
                normalizeRating(callExpRating) === 'Medium' ? 'text-yellow-700' : 'text-red-700'
              }`}>
                {normalizeRating(callExpRating)}
              </span>
            </span>
            <button 
              onClick={playRecording}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition tracking-wide shadow-md"
            >
              <Phone className="w-4 h-4" /> LISTEN TO CALL
            </button>
          </div>
        </div>

        {/* HEADER: Metadata & Summary */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-10 mb-10 shadow-lg">
          <div className="border-l-4 border-blue-500 pl-5 mb-8">
            <h1 className="text-4xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Walk-in Recovery Analysis</h1>
            <p className="text-base text-gray-500 mt-2">Store Visit Follow-up • {customerLocation} • Agent: Central Sales</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Col 1: Identity & Metadata */}
            <div className="lg:col-span-4 border-r border-gray-200 pr-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="font-mono text-sm text-gray-500 tracking-widest uppercase">Customer</span>
                  <h2 className="text-3xl font-semibold text-gray-900 mt-1" style={{ fontFamily: 'Fraunces, serif' }}>{customerName}</h2>
                </div>
                <span className={`text-sm font-bold px-4 py-1.5 rounded-full border uppercase ${connectedToCustomer ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                  {connectedToCustomer ? 'Connected' : 'Not Connected'}
                </span>
              </div>
              
              <div className="space-y-4 text-base">
                <div>
                  <span className="text-xs text-purple-600 uppercase tracking-wider font-bold block mb-1">Calling Agent</span>
                  <span className="text-purple-700 font-semibold text-lg">{metaData.Agent_Name || 'Unknown Agent'}</span>
                </div>

                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Location & Language</span>
                  <span className="text-gray-900 font-medium text-lg">{customerLocation} • {customerLanguage}</span>
                </div>
                
                <div>
                  <span className="text-xs text-blue-600 uppercase tracking-wider font-bold block mb-1">Consideration Value</span>
                  <span className="text-blue-600 text-3xl font-bold">{considerationValue}</span>
                </div>
                
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Call Date</span>
                    <span className="font-mono text-lg text-gray-900">
                      {formatDate(report.call_date || report.created_date)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Duration</span>
                    <span className="font-mono text-lg text-gray-900">{callDuration}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Enthusiasm</span>
                    <span className={`text-lg font-bold ${getRatingTextClass(customerEnthusiasm)}`}>{normalizeRating(customerEnthusiasm)}</span>
                  </div>
                </div>

                <div className="mt-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Call Quality</span>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${getScoreDotClass(callQuality)}`}></span>
                    <span className="text-base font-bold text-gray-700">{normalizeRating(callQuality)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Col 2: Call Summary */}
            <div className="lg:col-span-8 pl-4 flex flex-col justify-center">
              <div className="mb-5">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Call Objective</span>
                <h3 className="text-2xl text-gray-900 font-semibold" style={{ fontFamily: 'Fraunces, serif' }}>{objectiveType}</h3>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-8">
                <span className="text-xs font-bold text-blue-700 uppercase tracking-widest block mb-3">Executive Summary</span>
                <p className="text-lg text-gray-700 leading-relaxed font-medium">
                  {callSummary || summaryOld.Call_Synopsis || 'No summary available for this call.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 1: Recovery & Experience Audit */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 mb-10 shadow-lg">
          <div className="mb-8 border-b-2 border-gray-200 pb-4">
            <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Recovery & Experience Audit</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-8">
            <InfoCard label="Intent to Purchase" value={intentRating} reason={intentReason} />
            <InfoCard label="Store Experience" value={storeExpRating} reason={storeExpReason} />
            <InfoCard label="Call Experience" value={callExpRating} reason={callExpReason} />
            <div className="relative group bg-gray-50 border-2 border-gray-200 rounded-xl p-6 hover:border-blue-400 transition cursor-pointer">
              {funnelReason && (
                <div className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 -translate-y-3 bg-gray-800 border border-gray-700 px-4 py-3 rounded-lg text-sm text-gray-100 whitespace-normal w-max max-w-85 z-50 shadow-xl">
                  {funnelReason}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-8 border-transparent border-t-gray-800"></div>
                </div>
              )}
              <p className="text-sm text-gray-600 font-bold uppercase tracking-wider mb-3">Funnel Stage</p>
              <span className="text-2xl font-bold text-blue-600">{String(funnelStage || '').toUpperCase()}</span>
            </div>
            <div className="relative group bg-gray-50 border-2 border-gray-200 rounded-xl p-6 hover:border-blue-400 transition cursor-pointer">
              {timelineToPurchaseReason && (
                <div className="hidden group-hover:block absolute bottom-full left-1/2 transform -translate-x-1/2 -translate-y-3 bg-gray-800 border border-gray-700 px-4 py-3 rounded-lg text-sm text-gray-100 whitespace-normal w-max max-w-xs z-50 shadow-xl">
                  {timelineToPurchaseReason}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-8 border-transparent border-t-gray-800"></div>
                </div>
              )}
              <p className="text-sm text-gray-600 font-bold uppercase tracking-wider mb-3">Timeline to Purchase</p>
              <span className="text-2xl font-bold text-purple-600">{String(timelineToPurchase || 'Not Specified').toUpperCase()}</span>
            </div>
          </div>

          {/* Funnel Visual - Compact */}
          <div className="flex items-center gap-0 mb-8" style={{ maxWidth: '500px' }}>
            {funnelStages.map((stage, index) => (
              <div
                key={stage}
                className={`relative font-bold uppercase text-xs tracking-wider flex items-center justify-center py-2 px-2 border whitespace-nowrap overflow-hidden ${
                  index === 0 
                    ? 'rounded-l-sm' 
                    : ''
                } ${
                  index === funnelStages.length - 1 
                    ? 'rounded-r-sm' 
                    : ''
                } ${
                  index <= currentFunnelIndex
                    ? 'bg-linear-to-r from-emerald-500 to-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-gray-100 text-gray-400 border-gray-200'
                }`}
                style={{
                  clipPath: index === 0 
                    ? 'polygon(0% 0%, 85% 0%, 100% 50%, 85% 100%, 0% 100%)' 
                    : 'polygon(0% 0%, 85% 0%, 100% 50%, 85% 100%, 0% 100%, 15% 50%)',
                  flex: 1,
                  fontSize: '10px',
                }}
              >
                {stage}
              </div>
            ))}
          </div>

          {/* Barrier Analysis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="text-base font-bold text-gray-600 uppercase tracking-wider mb-2">Walk-out Reason (Store)</p>
                  <p className="text-lg text-gray-900 font-medium">{barrierAtStore || 'Not specified'}</p>
                </div>
              </div>
            </div>

            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="text-base font-bold text-emerald-700 uppercase tracking-wider mb-2">Current Barrier / Recovery</p>
                  <p className="text-lg text-emerald-900 font-medium">{barrierOnCall || homeMeasureReason || 'Addressed via follow-up call'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Product Intelligence & Customer Needs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          {/* Product Intelligence */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-6 border-b-2 border-gray-200 pb-4">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Product Intelligence</h2>
            </div>

            <div className="space-y-6">
              {/* Narrow Down Stage */}
              <div>
                <p className="text-sm text-gray-600 font-bold uppercase tracking-wider mb-4">Narrow Down Stage</p>
                <div className="flex items-center gap-2">
                  {narrowStages.map((stage, index) => (
                    <div
                      key={stage}
                      className={`font-semibold text-sm tracking-wide flex items-center justify-center py-3 px-5 border ${
                        index <= currentNarrowIndex
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}
                      style={{
                        clipPath: index === 0 
                          ? 'polygon(0% 0%, 85% 0%, 100% 50%, 85% 100%, 0% 100%)' 
                          : 'polygon(0% 0%, 85% 0%, 100% 50%, 85% 100%, 0% 100%, 15% 50%)',
                        flex: 1,
                      }}
                    >
                      {stage}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-300 rounded-lg p-5">
                <p className="text-sm text-gray-600 font-bold uppercase tracking-wider mb-2">Product of Interest</p>
                <span className="text-lg font-semibold text-gray-900">{productOfInterest}</span>
              </div>

              <div className="bg-gray-50 border border-gray-300 rounded-lg p-5">
                <p className="text-sm text-gray-600 font-bold uppercase tracking-wider mb-2">Decision Maker</p>
                <span className="text-lg font-semibold text-gray-900">{decisionMaker}</span>
              </div>
            </div>
          </div>

          {/* Customer Needs */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-6 border-b-2 border-gray-200 pb-4">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Customer Needs Profile</h2>
            </div>

            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <p className="text-lg text-gray-700 leading-relaxed whitespace-pre-wrap">
                {needsDescription || 'No detailed needs description captured for this call.'}
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 3: Recovery Tactics */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 mb-10 shadow-lg">
          <div className="mb-8 border-b-2 border-gray-200 pb-4">
            <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Recovery Tactics Utilized</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <HookCard 
              title="Home Measurement" 
              status={homeMeasureOffered ? 'Yes' : 'No'} 
              comment={homeMeasureReason}
              isPrimary={true}
            />
            <HookCard 
              title="Discount/EMI" 
              status={hookOffers.Status} 
              comment={hookOffers.Comment}
            />
            <HookCard 
              title="Warranty" 
              status={hookWarranty.Status} 
              comment={hookWarranty.Comment}
            />
            <HookCard 
              title="Sleep Trial" 
              status={hookSleepTrial.Status} 
              comment={hookSleepTrial.Comment}
            />
          </div>
        </div>

        {/* SECTION 4: RELAX Framework & Agent Scorecard */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
          
          {/* RELAX Framework */}
          <div className="lg:col-span-7 bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-8 border-b-2 border-gray-200 pb-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>RELAX Framework</h2>
              <div className="text-right">
                <div className={`text-4xl font-bold ${
                  parseFloat(getRelaxAverageScore()) >= 2.5 ? 'text-emerald-600' : 
                  parseFloat(getRelaxAverageScore()) >= 1.5 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {getRelaxAverageScore() !== 'N/A' ? `${Math.round((parseFloat(getRelaxAverageScore()) / 3) * 100)}%` : 'N/A'}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <ExpandableDetail 
                title="R — Reach Out" 
                subtitle="Context Setting" 
                rating={getRelaxScore(relaxR)} 
                reason={getRelaxReason(relaxR)}
              />
              <ExpandableDetail 
                title="E — Explore Needs" 
                subtitle="Probing Walk-out Reason" 
                rating={getRelaxScore(relaxE)} 
                reason={getRelaxReason(relaxE)}
              />
              <ExpandableDetail 
                title="L — Link Product" 
                subtitle="Re-affirm Store Demo" 
                rating={getRelaxScore(relaxL)} 
                reason={getRelaxReason(relaxL)}
              />
              <ExpandableDetail 
                title="A — Add Value" 
                subtitle="Recovery Hook" 
                rating={getRelaxScore(relaxA)} 
                reason={getRelaxReason(relaxA)}
              />
              <ExpandableDetail 
                title="X — Express Closing" 
                subtitle="Appointment Setting" 
                rating={getRelaxScore(relaxX)} 
                reason={getRelaxReason(relaxX)}
              />
            </div>
          </div>

          {/* Agent Scorecard */}
          <div className="lg:col-span-5 bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-8 border-b-2 border-gray-200 pb-4">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Agent Scorecard</h2>
            </div>

            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Recovery Skills</h3>
            <div className="space-y-4 mb-8">
              <ExpandableDetail 
                title="Sales Skills" 
                rating={getSkillRating(mainSkills.Sales_Skills)} 
                reason={getSkillReason(mainSkills.Sales_Skills)}
              />
              <ExpandableDetail 
                title="Objection Handling" 
                rating={getSkillRating(secondaryTraits.Objection_Handling)} 
                reason={getSkillReason(secondaryTraits.Objection_Handling)}
              />
              <ExpandableDetail 
                title="Upsell Skills" 
                rating={getSkillRating(mainSkills.Upsell_Revenue_Skills)} 
                reason={getSkillReason(mainSkills.Upsell_Revenue_Skills)}
              />
            </div>

            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 pt-4 border-t border-gray-200">Traits</h3>
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-300 rounded-lg p-5">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-600 font-bold uppercase tracking-wider">Agent Nature</p>
                  <span className={`text-sm font-bold px-3 py-1.5 rounded border-2 ${
                    String(secondaryTraits.Agent_Nature || '').toLowerCase() === 'proactive' 
                      ? 'bg-blue-100 text-blue-700 border-blue-300' 
                      : 'bg-gray-100 text-gray-700 border-gray-300'
                  }`}>
                    {secondaryTraits.Agent_Nature || 'Responsive'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 5: Learnings & Closing Intelligence */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          
          {/* Agent Learnings */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-8 border-b-2 border-gray-200 pb-4">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Agent Learnings</h2>
            </div>

            <div className="space-y-4">
              {agentLearnings.length > 0 ? agentLearnings.map((learning, index) => (
                <div key={index} className={`p-5 rounded-lg border-2 ${index === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-300'}`}>
                  <span className={`text-base font-bold ${index === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {index + 1}. {learning}
                  </span>
                </div>
              )) : (
                <div className="p-5 rounded-lg border-2 bg-gray-50 border-gray-200">
                  <span className="text-base text-gray-600">No specific learnings captured for this call.</span>
                </div>
              )}
            </div>
          </div>

          {/* Closing Intelligence */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-8 border-b-2 border-gray-200 pb-4">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Closing Intelligence</h2>
            </div>

            <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-6 mb-8">
              <p className="text-sm text-blue-700 font-bold uppercase tracking-wider mb-4">Next Actions</p>
              <p className="text-lg text-gray-700 leading-relaxed font-semibold">
                {nextActionsText || 'No specific next actions captured.'}
              </p>
            </div>

            {(npsScore !== '' && npsScore !== undefined) && (
              <div className="bg-linear-to-br from-emerald-100 to-emerald-50 border-2 border-emerald-400 rounded-xl p-8 text-center">
                <p className="text-sm text-emerald-700 font-bold uppercase tracking-wider mb-4">End-to-End NPS</p>
                <div className={`text-6xl font-bold mb-4 ${getNPSColorClass(npsScore)}`}>{npsScore}</div>
                <p className={`text-base font-bold uppercase tracking-wide mb-4 ${getNPSColorClass(npsScore)}`}>{getNPSLabel(npsScore)}</p>
                {npsComment && (
                  <p className="text-base text-gray-700 italic leading-relaxed">"{npsComment}"</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Transcript */}
        {transcriptItems.length > 0 && (
          <div className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden shadow-lg mb-10">
            <div className="flex justify-between items-center p-8 border-b-2 border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>Call Transcript</h2>
              <button
                onClick={() => setExpandTranscript(!expandTranscript)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg text-sm text-gray-700 hover:bg-gray-200 transition font-semibold"
              >
                <span>{expandTranscript ? 'Collapse' : 'Expand'}</span>
                {expandTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {expandTranscript && (
              <div className="max-h-125 overflow-y-auto p-8 bg-gray-50 space-y-4">
                {transcriptItems.map((msg, i) => {
                  const isAgent = msg.Speaker?.toLowerCase().includes('agent');
                  const formatTimestamp = (timeStr) => {
                    if (!timeStr) return '';
                    // Handle format like "0:06" or "1:30"
                    if (typeof timeStr === 'string' && timeStr.includes(':')) {
                      return timeStr;
                    }
                    return '';
                  };
                  
                  return (
                    <div key={i} className={`flex ${isAgent ? 'justify-start' : 'justify-end'} mb-3 px-2`}>
                      <div className={`max-w-[75%] ${
                        isAgent 
                          ? 'bg-white border border-gray-200' 
                          : 'bg-green-100 border border-green-200'
                      } rounded-2xl px-4 py-2 shadow-sm`}>
                        <p className={`text-xs font-semibold mb-1.5 ${
                          isAgent ? 'text-gray-600' : 'text-green-800'
                        }`}>{msg.Speaker}</p>
                        <p className={`text-base ${
                          isAgent ? 'text-gray-800' : 'text-gray-900'
                        } leading-relaxed`}>{msg.Text}</p>
                        {msg.Timestamp && formatTimestamp(msg.Timestamp) && (
                          <p className={`text-xs mt-1.5 ${
                            isAgent ? 'text-gray-500' : 'text-green-700'
                          }`}>{formatTimestamp(msg.Timestamp)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* Download Actions */}
        <div className="flex justify-center gap-4 mb-10">
          <button
            onClick={downloadCSV}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-base font-bold transition shadow-md"
          >
            <Download className="w-5 h-5" />
            Download Full Report (CSV)
          </button>
          <button
            onClick={downloadTranscript}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-base font-bold transition shadow-md"
          >
            <FileDown className="w-5 h-5" />
            Download Transcript (TXT)
          </button>
        </div>

        {/* Footer */}
        <div className="text-center pt-8 border-t-2 border-gray-200">
          <p className="text-base text-gray-500">Duroflex Store Recovery Intelligence • Powered by AI Analysis</p>
        </div>

      </div>
    </div>
  );
};

export default StoreWalkinReportDetail;
