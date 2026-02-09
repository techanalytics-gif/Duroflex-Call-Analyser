import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Download, FileDown } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://duroflex-call-analyser.onrender.com';

// Expandable Card Component
const ExpandableCard = ({ title, subtitle, rating, ratingColor, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const getRatingStyles = () => {
    const r = (rating || '').toString().toUpperCase();
    if (r === 'HIGH' || r === 'H' || parseInt(r) >= 4) return 'bg-green-100 text-green-700 border-green-300';
    if (r === 'MEDIUM' || r === 'M' || parseInt(r) >= 3) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    if (r === 'LOW' || r === 'L' || r === 'N/A') return 'bg-red-100 text-red-600 border-red-300';
    return 'bg-gray-100 text-gray-600 border-gray-300';
  };

  return (
    <div className="bg-gray-50 border-2 border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full p-6 text-left transition ${isOpen ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p className="text-lg font-bold text-gray-900">{title}</p>
            {subtitle && <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            {rating && (
              <span className={`text-base font-bold px-4 py-1.5 rounded-full border-2 ${getRatingStyles()}`}>
                {rating}
              </span>
            )}
            <span className="text-gray-400 text-xl font-bold">{isOpen ? '−' : '+'}</span>
          </div>
        </div>
      </button>
      {isOpen && (
        <div className="px-6 pb-6 text-base text-gray-700 border-t-2 border-gray-200 pt-4">
          {children}
        </div>
      )}
    </div>
  );
};

// Info Card with Tooltip
const InfoCard = ({ label, value, valueColor, tooltip, children }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  
  const getValueColor = () => {
    const v = (value || '').toString().toUpperCase();
    if (v === 'HIGH' || v === 'IMMEDIATE' || v === 'RECOVERED' || v === 'ACTION') return 'text-green-600';
    if (v === 'MEDIUM' || v === 'SHORT TERM' || v === 'DESIRE' || v === 'CONSIDERATION') return 'text-yellow-600';
    if (v === 'LOW' || v === 'AWARENESS') return 'text-red-600';
    return valueColor || 'text-blue-600';
  };

  const getScoreDot = () => {
    const v = (value || '').toString().toUpperCase();
    if (v === 'HIGH' || v === 'IMMEDIATE' || v === 'RECOVERED') return 'bg-green-500';
    if (v === 'MEDIUM' || v === 'SHORT TERM') return 'bg-yellow-500';
    if (v === 'LOW') return 'bg-red-500';
    return 'bg-blue-500';
  };

  return (
    <div 
      className="relative bg-gray-50 border-2 border-gray-200 rounded-xl p-6 hover:border-blue-400 transition cursor-pointer"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {tooltip && showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 -translate-y-3 bg-gray-800 border border-gray-700 px-4 py-3 rounded-lg text-sm text-gray-100 whitespace-normal w-max max-w-xs z-50 shadow-xl">
          {tooltip}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-8 border-transparent border-t-gray-800"></div>
        </div>
      )}
      <p className="text-sm text-gray-600 font-bold uppercase tracking-wider mb-3">{label}</p>
      {children || (
        <div className="flex items-center">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${getScoreDot()} mr-2`}></span>
          <span className={`text-2xl font-bold ${getValueColor()}`}>{value}</span>
        </div>
      )}
    </div>
  );
};

const AbcReportDetail = () => {
  const { callId } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandTranscript, setExpandTranscript] = useState(false);
  const [expandedHooks, setExpandedHooks] = useState({});

  useEffect(() => {
    fetchReport();
  }, [callId]);

  const fetchReport = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/abc-calls/${callId}`);
      if (!res.ok) throw new Error('Failed to load report');
      const data = await res.json();
      setReport(data.report);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const playAudio = () => {
    const recordingUrl = report?.driveLink || report?.audio_url;
    if (recordingUrl) {
      window.open(recordingUrl, '_blank');
    }
  };

  const downloadTranscript = () => {
    if (!report) return;
    const analysis = report.analysis || {};
    const transcript = analysis.Transcript_Log || [];
    const callDateDisplay = report.call_date || report.raw_data?.Date || report.processed_at;
    
    let textContent = `CALL TRANSCRIPT\n`;
    textContent += `${'='.repeat(80)}\n`;
    textContent += `Call ID: ${report.call_id}\n`;
    textContent += `Date: ${callDateDisplay || 'N/A'}\n\n`;
    
    if (typeof transcript === 'string') {
      textContent += transcript;
    } else if (Array.isArray(transcript)) {
      transcript.forEach((entry, index) => {
        textContent += `[${entry.Timestamp || index}] ${entry.Speaker || 'Unknown'}: ${entry.Text}\n\n`;
      });
    }

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `transcript_${report.call_id}.txt`;
    link.click();
  };

  // Download CSV function
  const downloadCSV = () => {
    if (!report) return;
    const analysis = report.analysis || {};
    const theVerdict = analysis.The_Verdict || {};
    const relaxFw = analysis.RELAX_Framework || {};
    const expSkills = analysis.Experience_and_Skills || {};
    
    const headers = [
      'Call ID', 'Agent Name', 'Phone', 'City', 'Consideration Value', 'Call Date',
      'Lead Status', 'Recovery Outcome', 'Primary Barrier', 'Purchase Intent', 'Funnel Stage',
      'RELAX R Score', 'RELAX E Score', 'RELAX L Score', 'RELAX A Score', 'RELAX X Score',
      'CSAT Score', 'Customer Sentiment'
    ];
    
    const row = [
      report.call_id || '',
      report.agent_name || '',
      report.phone || '',
      report.city || '',
      report.raw_data?.['Lineitem price'] || '',
      report.call_date || report.raw_data?.Date || report.processed_at || '',
      analysis.Header_Data?.Lead_Status_Label || '',
      theVerdict.Recovery_Outcome_Headline || '',
      theVerdict.Primary_Barrier || '',
      theVerdict.Purchase_Intent || '',
      theVerdict.Funnel_Stage_AIDA || '',
      relaxFw.R_Reach_Out?.Score || '',
      relaxFw.E_Explore?.Score || '',
      relaxFw.L_Link?.Score || '',
      relaxFw.A_Add_Value?.Score || '',
      relaxFw.X_Express?.Score || '',
      expSkills.CSAT_Score || '',
      expSkills.Customer_Sentiment || ''
    ];
    
    const escapeCSV = (val) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    const csvContent = [headers.map(escapeCSV).join(','), row.map(escapeCSV).join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `abc_report_${report.call_id}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Helper functions
  const getRatingText = (rating) => {
    if (rating === null || rating === undefined) return 'N/A';
    const numRating = parseInt(rating);
    if (!isNaN(numRating)) {
      if (numRating >= 4) return 'HIGH';
      if (numRating >= 3) return 'MEDIUM';
      return 'LOW';
    }
    const r = rating.toString().toUpperCase();
    if (r === 'H' || r === 'HIGH') return 'HIGH';
    if (r === 'M' || r === 'MEDIUM') return 'MEDIUM';
    if (r === 'L' || r === 'LOW') return 'LOW';
    return r;
  };

  const getRelaxOverallRating = (relaxObj) => {
    // Convert H/M/L score to numeric for average calculation
    const scoreToNumeric = (score) => {
      if (!score) return 0;
      const scoreUpper = String(score).toUpperCase();
      if (scoreUpper === 'H' || scoreUpper === 'HIGH') return 3;
      if (scoreUpper === 'M' || scoreUpper === 'MEDIUM') return 2;
      if (scoreUpper === 'L' || scoreUpper === 'LOW') return 1;
      // Handle numeric scores as fallback
      const numScore = parseInt(score);
      if (!isNaN(numScore)) {
        if (numScore >= 4) return 3;
        if (numScore >= 3) return 2;
        if (numScore >= 1) return 1;
      }
      return 0;
    };

    const scores = [
      scoreToNumeric(relaxObj?.R?.Score),
      scoreToNumeric(relaxObj?.E?.Score),
      scoreToNumeric(relaxObj?.L?.Score),
      scoreToNumeric(relaxObj?.A?.Score),
      scoreToNumeric(relaxObj?.X?.Score)
    ].filter(s => s > 0);
    
    if (scores.length === 0) return 'N/A';
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return avg.toFixed(2);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const getCartValueBracket = (value) => {
    if (!value || value === 'N/A') return 'N/A';
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return value;
    if (numValue < 15000) return 'Below 15k';
    if (numValue < 25000) return '15k to 25k';
    if (numValue < 50000) return '25k to 50k';
    return '50k+';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading ABC Report...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-xl mb-4">{error || 'Report not found'}</p>
          <Link to="/abc-outbound-calls" className="text-blue-600 hover:underline">← Back to ABC Reports</Link>
        </div>
      </div>
    );
  }

  // Extract data from analysis (NEW schema)
  const analysis = report.analysis || {};
  
  // New schema fields (ABC Cart Recovery)
  const metaData = analysis.MetaData || {};
  const callSummary = analysis.Call_Summary || '';
  const callObjective = analysis['1_Call_Objective'] || {};
  const intentToPurchase = analysis['2_Intent_to_Purchase'] || {};
  const customerExperience = analysis['3_Customer_Experience'] || {};
  const funnelAnalysis = analysis['4_Funnel_Analysis'] || {};
  const productIntelligence = analysis['5_Product_Intelligence'] || {};
  const customerNeeds = analysis['6_Customer_Needs'] || {};
  const purchaseBarrier = analysis['7_Purchase_Barrier'] || ''; // String, not object
  const decisionMaker = analysis['8_Decision_Maker'] || '';
  const invitations = analysis['9_Invitations'] || {};
  const conversionHooks = analysis['10_Conversion_Hooks'] || {};
  const relaxFramework = analysis['11_RELAX_Framework'] || {};
  const agentEvaluation = analysis['12_Agent_Evaluation'] || {};
  const agentLearnings = analysis['13_Agent_Learnings'] || [];
  const nextActions = analysis['14_Next_Actions'] || '';
  const npsData = analysis['15_End_to_End_NPS'] || {};
  const transcript = analysis.Transcript_Log || '';

  // Old schema fallback
  const headerData = analysis.Header_Data || {};
  const theVerdict = analysis.The_Verdict || {};
  const oldConversionAttempts = analysis.Conversion_Attempts || {};
  const oldRelaxFramework = analysis.RELAX_Framework || {};
  const experienceSkills = analysis.Experience_and_Skills || {};
  const oldNextActions = analysis.Next_Actions || [];
  const summaryNarrative = analysis.Summary_Narrative || '';

  // Get agent name
  const agentName = report.agent_name || 
    report.raw_data?.AgentName || 
    report.raw_data?.Agent_Name || 
    metaData.Agent_Name ||
    'Unknown Agent';

  // Get cart value - PRIORITIZE metadata.Consideration_Value over raw price
  const considerationValueFromMeta = metaData.Consideration_Value || '';
  const rawCartPrice = report.raw_data?.['Lineitem price'] || 0;
  
  // Use metadata if available and meaningful, otherwise use raw price
  let cartValue = 'N/A';
  let cartValueDisplay = 'N/A';
  
  if (considerationValueFromMeta && considerationValueFromMeta !== 'N/A' && considerationValueFromMeta.toLowerCase() !== 'unknown') {
    // Metadata has meaningful value - use it
    cartValue = considerationValueFromMeta;
    cartValueDisplay = considerationValueFromMeta;
  } else if (rawCartPrice > 0) {
    // Fallback to raw price
    cartValue = rawCartPrice;
    cartValueDisplay = getCartValueBracket(rawCartPrice);
  }

  // Get customer info
  const customerName = metaData.Customer_Name || theVerdict.Customer_Name || 'Customer';
  const customerLocation = metaData.Customer_Location || report.city || 'N/A';
  const customerLanguage = metaData.Customer_Language || 'N/A';
  const callDuration = metaData.Call_Duration || headerData.Call_Duration || 'N/A';
  const customerEnthusiasm = metaData.Customer_Enthusiasm || 'Medium';
  const callQuality = metaData.Call_Quality_Overall || 'Medium';
  const connectedToCustomer = metaData.Connected_to_Customer !== false;

  // Get lead status
  const leadStatusLabel = headerData.Lead_Status_Label || 
    (intentToPurchase.Rating === 'High' ? 'HOT LEAD' : 
     intentToPurchase.Rating === 'Low' ? 'COLD/LOST' : 'NURTURING');

  // Get summary
  const finalSummary = callSummary || summaryNarrative || theVerdict.Recovery_Outcome_Description || 'No summary available.';

  // Get call objective
  const objectiveType = callObjective.Type || theVerdict.Recovery_Outcome_Headline || 'Cart Recovery';

  // Get funnel stage
  const funnelStage = funnelAnalysis.Stage || theVerdict.Funnel_Stage_AIDA || 'Consideration';
  const timelineToPurchase = funnelAnalysis.Timeline_to_Purchase || 'Unknown';

  // Get barriers (7_Purchase_Barrier is a string in new schema)
  const primaryBarrier = purchaseBarrier || theVerdict.Primary_Barrier || 'Not Specified';

  // Get intent ratings
  const purchaseIntentRating = intentToPurchase.Rating || theVerdict.Purchase_Intent || 'MEDIUM';
  const purchaseIntentReason = intentToPurchase.Reason || theVerdict.Recovery_Outcome_Description || '';
  
  // Map Call Experience from schema
  const getExperienceRating = () => {
    if (customerExperience.Rating) return customerExperience.Rating;
    const csatScore = experienceSkills.CSAT_Score;
    if (csatScore) {
      if (csatScore >= 4) return 'High';
      if (csatScore >= 3) return 'Medium';
      return 'Low';
    }
    const sentiment = (experienceSkills.Customer_Sentiment || '').toLowerCase();
    if (sentiment.includes('positive') || sentiment.includes('satisfied')) return 'High';
    if (sentiment.includes('neutral')) return 'Medium';
    if (sentiment.includes('negative') || sentiment.includes('frustrated')) return 'Low';
    return 'Medium';
  };
  const experienceRating = getExperienceRating();
  const experienceReason = customerExperience.Reason || experienceSkills.Sentiment_Reason || '';

  // Get product info
  const narrowDownStage = productIntelligence.Narrow_Down_Stage || 'Category';
  const productOfInterest = productIntelligence.Product_of_Interest || 'N/A';
  const orderValue = productIntelligence.Approx_Order_Value || 'N/A';
  const needsDescription = customerNeeds.Description || theVerdict.Recovery_Outcome_Description || summaryNarrative || 'No details available.';

  // Get invitations - map from Conversion_Attempts in old schema
  const storeVisitData = invitations.Store_Visit || oldConversionAttempts.Store_Visit || {};
  const videoDemoData = invitations.Video_Demo || oldConversionAttempts.Video_Call || {};
  
  // Transform old schema Status to Rating format for display
  const getInvitationRating = (data) => {
    if (data.Rating) return data.Rating;
    const status = (data.Status || '').toLowerCase();
    if (status.includes('accepted') || status.includes('invited') || status.includes('offered')) return 'High';
    if (status.includes('discussed') || status.includes('mentioned')) return 'Medium';
    if (status.includes('not invited') || status.includes('not offered') || status.includes('not discussed')) return 'N/A';
    return 'N/A';
  };
  
  const storeVisit = {
    Rating: getInvitationRating(storeVisitData),
    Reason: storeVisitData.Reason || storeVisitData.Details || 'No details available.'
  };
  
  const videoDemo = {
    Rating: getInvitationRating(videoDemoData),
    Reason: videoDemoData.Reason || videoDemoData.Details || 'No details available.'
  };

  // Get RELAX scores (support both new and old schema)
  const relax = {
    R: relaxFramework.R_Reach_Out || oldRelaxFramework.R_Reach_Out || {},
    E: relaxFramework.E_Explore_Needs || oldRelaxFramework.E_Explore || {},
    L: relaxFramework.L_Link_Product || oldRelaxFramework.L_Link || {},
    A: relaxFramework.A_Add_Value || oldRelaxFramework.A_Add_Value || {},
    X: relaxFramework.X_Express_Closing || oldRelaxFramework.X_Express || {}
  };

  // Get agent evaluation (12_Agent_Evaluation)
  const softSkillsData = experienceSkills.Soft_Skills || {};
  const mainSkills = agentEvaluation.Main_Skills || {
    Product_Knowledge: softSkillsData.Objection_Handling_Score ? getRatingText(softSkillsData.Objection_Handling_Score) : 'Medium',
    Sales_Skills: softSkillsData.Objection_Handling_Score ? getRatingText(softSkillsData.Objection_Handling_Score) : 'Medium',
    Upsell_Revenue_Skills: 'Low'
  };
  const secondaryTraits = agentEvaluation.Secondary_Traits || {
    Need_Discovery: 'Medium',
    Objection_Handling: softSkillsData.Objection_Handling_Score ? getRatingText(softSkillsData.Objection_Handling_Score) : 'Medium',
    Agent_Nature: experienceSkills.Customer_Sentiment || 'Responsive'
  };

  const getSkillRating = (skillValue, fallback = 'N/A') => {
    if (!skillValue) return fallback;
    if (typeof skillValue === 'object') return skillValue.Rating || skillValue.rating || fallback;
    return skillValue;
  };

  const getSkillReason = (skillValue, explicitReason, fallback = 'No details available.') => {
    if (skillValue && typeof skillValue === 'object') {
      return skillValue.Reason || skillValue.reason || explicitReason || fallback;
    }
    return explicitReason || fallback;
  };

  // Get NPS
  const npsScore = npsData.Score !== undefined ? npsData.Score : (experienceSkills.CSAT_Score || 'N/A');
  const npsComment = npsData.Comment || experienceSkills.Sentiment_Reason || '';

  // Get next actions
  const finalNextActions = typeof nextActions === 'string' ? nextActions : 
    (Array.isArray(oldNextActions) ? oldNextActions.join('. ') : '');

  // Get learnings
  const learnings = Array.isArray(agentLearnings) ? agentLearnings : [];

  // Helper for lead status styling
  const getLeadStatusStyle = (status) => {
    const statusUpper = (status || '').toUpperCase();
    if (statusUpper.includes('HOT')) return { bg: 'bg-green-100', border: 'border-green-200', text: 'text-green-700' };
    if (statusUpper.includes('NURTURING')) return { bg: 'bg-yellow-100', border: 'border-yellow-200', text: 'text-yellow-700' };
    return { bg: 'bg-red-100', border: 'border-red-200', text: 'text-red-700' };
  };

  const leadStyle = getLeadStatusStyle(leadStatusLabel);

  // Funnel stages for ABC
  const getFunnelStages = () => {
    const stages = ['Awareness', 'Consideration', 'Action','Already Purchased'];
    const stageMap = {
      'awareness': 0,
      'consideration': 1,
      'action': 2,
      'already purchased': 3
    };
    const currentIndex = stageMap[funnelStage.toLowerCase()] || 1;
    return stages.map((stage, index) => ({
      name: stage,
      isActive: index <= currentIndex,
      isCurrent: index === currentIndex
    }));
  };

  const funnelStages = getFunnelStages();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="max-w-[1600px] mx-auto px-8 py-10 relative z-10">
        
        {/* Navigation */}
        <div className="flex items-center justify-between mb-10">
          <Link to="/abc-outbound-calls" className="text-base font-medium text-gray-600 hover:text-gray-900 transition tracking-wide">
            ← BACK TO ABC LEADS
          </Link>
          <div className="flex gap-3">
            <span className="inline-flex items-center px-5 py-2.5 bg-white rounded-lg text-sm text-gray-600 border border-gray-300 font-mono tracking-wider shadow-sm">
              ID: {report.call_id}
            </span>
            <span className={`inline-flex items-center px-5 py-2.5 bg-white rounded-lg text-sm border border-gray-300 shadow-sm ${
              report.call_type_detected === 'POST_PURCHASE' || funnelStage === 'Already Purchased' ? 'text-purple-700' : 'text-blue-700'
            }`}>
              <span className="font-semibold">Lead:</span>&nbsp;{report.call_type_detected === 'POST_PURCHASE' || funnelStage === 'Already Purchased' ? 'Post-Purchase' : 'Sales'}
            </span>
            <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white rounded-lg text-sm border border-gray-300 shadow-sm">
              <span className="font-semibold text-gray-600">Intent:</span>
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                purchaseIntentRating === 'High' ? 'bg-green-500' : 
                purchaseIntentRating === 'Medium' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></span>
              <span className={`font-bold ${
                purchaseIntentRating === 'High' ? 'text-green-700' : 
                purchaseIntentRating === 'Medium' ? 'text-yellow-700' : 'text-red-700'
              }`}>
                {purchaseIntentRating}
              </span>
            </span>
            <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white rounded-lg text-sm border border-gray-300 shadow-sm">
              <span className="font-semibold text-gray-600">Experience:</span>
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                experienceRating === 'High' ? 'bg-green-500' : 
                experienceRating === 'Medium' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></span>
              <span className={`font-bold ${
                experienceRating === 'High' ? 'text-green-700' : 
                experienceRating === 'Medium' ? 'text-yellow-700' : 'text-red-700'
              }`}>
                {experienceRating}
              </span>
            </span>
            <button 
              onClick={playAudio}
              className="inline-flex items-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition tracking-wide shadow-md"
            >
            LISTEN TO CALL
            </button>
          </div>
        </div>

        {/* HEADER: Metadata & Summary */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-10 mb-10 shadow-lg">
          <div className="border-l-4 border-blue-500 pl-5 mb-8">
            <h1 className="text-4xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
              Abandoned Cart Recovery
            </h1>
            <p className="text-base text-gray-500 mt-2">
              {objectiveType} • Agent: {agentName} • Consideration Value: ₹{Number(cartValue).toLocaleString('en-IN') || 'N/A'}
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Col 1: Identity & Metadata */}
            <div className="lg:col-span-4 border-r border-gray-200 pr-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="font-mono text-sm text-gray-500 tracking-widest uppercase">Customer</span>
                  <h2 className="text-3xl font-semibold text-gray-900 mt-1" style={{ fontFamily: "'Fraunces', serif" }}>
                    {customerName}
                  </h2>
                </div>
                <span className={`${connectedToCustomer ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'} text-sm font-bold px-4 py-1.5 rounded-full border uppercase`}>
                  {connectedToCustomer ? 'Connected' : 'Not Connected'}
                </span>
              </div>
              
              <div className="space-y-4 text-base">
                <div>
                  <span className="text-xs text-purple-600 uppercase tracking-wider font-bold block mb-1">Calling Agent</span>
                  <span className="text-purple-700 font-semibold text-lg">{agentName}</span>
                </div>

                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Location & Language</span>
                  <span className="text-gray-900 font-medium text-lg">{customerLocation} • {customerLanguage}</span>
                </div>
                
                <div>
                  <span className="text-xs text-blue-600 uppercase tracking-wider font-bold block mb-1">Consideration Value</span>
                  <span className="text-blue-600 text-3xl font-bold">{cartValueDisplay}</span>
                </div>
                
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Call Date</span>
                    <span className="font-mono text-lg text-gray-900">
                      {formatDate(report.call_date || report.raw_data?.Date || report.processed_at)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Duration</span>
                    <span className="font-mono text-lg text-gray-900">{callDuration}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Enthusiasm</span>
                    <span className={`text-lg font-bold ${
                      customerEnthusiasm === 'High' ? 'text-green-600' : 
                      customerEnthusiasm === 'Medium' ? 'text-yellow-600' : 'text-red-600'
                    }`}>{customerEnthusiasm}</span>
                  </div>
                </div>

                <div className="mt-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-bold block mb-1">Call Quality</span>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                      callQuality === 'High' ? 'bg-green-500' : 
                      callQuality === 'Medium' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></span>
                    <span className="text-base font-bold text-gray-700">{callQuality}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Col 2: Call Summary */}
            <div className="lg:col-span-8 pl-4 flex flex-col justify-center">
              <div className="mb-5">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Call Objective</span>
                <h3 className="text-2xl text-gray-900 font-semibold" style={{ fontFamily: "'Fraunces', serif" }}>
                  {objectiveType}
                </h3>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-8">
                <span className="text-xs font-bold text-blue-700 uppercase tracking-widest block mb-3">Executive Summary</span>
                <p className="text-lg text-gray-700 leading-relaxed font-medium">
                  {finalSummary}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 1: Abandonment Intelligence */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 mb-10 shadow-lg">
          <div className="mb-8 border-b-2 border-gray-200 pb-4">
            <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
              Abandonment Intelligence
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            <InfoCard 
              label="Intent to Purchase" 
              value={purchaseIntentRating}
              tooltip={purchaseIntentReason || 'No details available'}
            />
            <InfoCard 
              label="Customer Experience" 
              value={experienceRating}
              tooltip={experienceReason || 'No details available'}
            />
            <InfoCard 
              label="Purchase Timeline" 
              value={timelineToPurchase}
              tooltip={funnelAnalysis.Timeline_to_Purchase_Reason || "Customer's expected purchase timeframe"}
            />
            <InfoCard 
              label="Funnel Stage" 
              value={funnelStage}
              tooltip={funnelAnalysis.Reason || "Customer's position in the purchase funnel"}
            />
          </div>

          {/* Funnel Visual */}
          <div className="flex items-center gap-1 mb-8">
            {funnelStages.map((stage, i) => (
              <div 
                key={stage.name}
                className={`relative group flex items-center justify-center py-3 px-4 text-sm font-bold uppercase tracking-wider cursor-help
                  ${stage.isCurrent 
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md' 
                    : stage.isActive 
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-gray-100 text-gray-500 border border-gray-200'
                  }`}
                style={{
                  clipPath: i === 0 
                    ? 'polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%)'
                    : i === funnelStages.length - 1
                    ? 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 10% 50%)'
                    : 'polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%, 10% 50%)'
                }}
              >
                {stage.name}
                {stage.isCurrent && funnelAnalysis.Reason && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-80 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg z-10">
                    <div className="font-medium mb-1">Stage Reasoning:</div>
                    <div className="text-gray-200 font-normal normal-case tracking-normal">{funnelAnalysis.Reason}</div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Barrier Analysis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Abandonment Reason */}
            <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="text-base font-bold text-gray-600 uppercase tracking-wider mb-2">Abandonment Reason</p>
                  <p className="text-lg text-gray-900 font-medium">{primaryBarrier}</p>
                  <p className="text-base text-gray-600 mt-2">Primary barrier identified during recovery call.</p>
                </div>
              </div>
            </div>

            {/* Lead Status */}
            <div className={`${leadStyle.bg} border-2 ${leadStyle.border} rounded-xl p-6`}>
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className={`text-base font-bold ${leadStyle.text} uppercase tracking-wider mb-2`}>Lead Status</p>
                  <p className={`text-lg ${leadStyle.text} font-bold`}>{leadStatusLabel}</p>
                  <p className={`text-base ${leadStyle.text} mt-2 opacity-80`}>
                    {leadStatusLabel.includes('HOT') ? 'High probability of conversion.' : 
                     leadStatusLabel.includes('NURTURING') ? 'Needs follow-up and nurturing.' : 
                     'Low conversion probability.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Product Intelligence & Customer Context */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          {/* Product Intelligence */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-6 border-b-2 border-gray-200 pb-4">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
                Product Intelligence
              </h2>
            </div>

            <div className="space-y-6">
              {/* Narrow Down Stage */}
              <div>
                <p className="text-sm text-gray-600 font-bold uppercase tracking-wider mb-4">Narrow Down Stage</p>
                <div className="flex items-center gap-1">
                  {(() => {
                    const stages = ['Category', 'Range', 'Specific SKU'];
                    const stageMap = { 'category': 0, 'range': 1, 'specific sku': 2, 'na': -1 };
                    const currentStage = stageMap[narrowDownStage.toLowerCase()] ?? 0;
                    
                    return stages.map((stage, i) => (
                      <div 
                        key={stage}
                        className={`relative flex items-center justify-center py-3 px-6 text-sm font-bold uppercase tracking-wider border ${
                          currentStage >= i
                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-blue-600 shadow-md'
                            : 'bg-gray-100 text-gray-500 border-gray-300'
                        }`}
                        style={{
                          clipPath: i === 0 
                            ? 'polygon(0% 0%, 85% 0%, 100% 50%, 85% 100%, 0% 100%)'
                            : i === stages.length - 1
                            ? 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 15% 50%)'
                            : 'polygon(0% 0%, 85% 0%, 100% 50%, 85% 100%, 0% 100%, 15% 50%)'
                        }}
                      >
                        {stage}
                      </div>
                    ));
                  })()}
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-300 rounded-lg p-5">
                <p className="text-sm text-gray-600 font-bold uppercase tracking-wider mb-2">Product of Interest</p>
                <span className="text-lg font-semibold text-gray-900">{productOfInterest}</span>
              </div>

              <div className="bg-gray-50 border border-gray-300 rounded-lg p-5">
                <p className="text-sm text-gray-600 font-bold uppercase tracking-wider mb-2">Decision Maker</p>
                <span className="text-lg font-semibold text-gray-900">{decisionMaker || 'Unknown'}</span>
              </div>
            </div>
          </div>

          {/* Customer Context */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-6 border-b-2 border-gray-200 pb-4">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
                Customer Context
              </h2>
            </div>

            <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
              <p className="text-lg text-gray-700 leading-relaxed whitespace-pre-line">
                {needsDescription}
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 3: Recovery Hooks Utilized */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 mb-10 shadow-lg">
          <div className="mb-8 border-b-2 border-gray-200 pb-4">
            <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
              Recovery Hooks Utilized
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {(() => {
              const hooks = [
                { 
                  key: 'Offers_Discounts_EMI', 
                  label: 'DISCOUNT/EMI',
                  data: conversionHooks.Offers_Discounts_EMI || {}
                },
                { 
                  key: 'Product_Brochure', 
                  label: 'BROCHURE',
                  data: conversionHooks.Product_Brochure || {}
                },
                { 
                  key: 'Mattress_Measurement', 
                  label: 'MEASUREMENT',
                  data: conversionHooks.Mattress_Measurement || {}
                },
                { 
                  key: 'Brand_Legacy_Warranty', 
                  label: 'WARRANTY',
                  data: conversionHooks.Brand_Legacy_Warranty || {}
                },
                { 
                  key: 'Sleep_Trial', 
                  label: 'SLEEP TRIAL',
                  data: conversionHooks.Sleep_Trial || {}
                }
              ];

              return hooks.map((hook) => {
                const isYes = hook.data.Status === 'Yes';
                const isExpanded = expandedHooks[hook.key] || false;
                
                return (
                  <div key={hook.key} className={`${isYes ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'} border-2 rounded-lg overflow-hidden`}>
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`${isYes ? 'text-green-600' : 'text-red-600'} font-bold text-xl`}>
                            {isYes ? '✓' : '✗'}
                          </span>
                          <p className="text-sm text-gray-600 font-bold uppercase">{hook.label}</p>
                        </div>
                        <button 
                          className="text-gray-400 hover:text-gray-600 text-xl font-bold transition"
                          onClick={() => setExpandedHooks(prev => ({
                            ...prev,
                            [hook.key]: !prev[hook.key]
                          }))}
                        >
                          {isExpanded ? '−' : '+'}
                        </button>
                      </div>
                      <p className={`text-lg font-semibold ${isYes ? 'text-green-600' : 'text-red-600'}`}>
                        {isYes ? 'YES' : 'NO'}
                      </p>
                    </div>
                    {isExpanded && (
                      <div className={`px-6 pb-6 pt-2 border-t-2 ${isYes ? 'border-green-200' : 'border-gray-200'}`}>
                        <p className="text-sm text-gray-700">
                          {hook.data.Comment || 'No details available.'}
                        </p>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* SECTION 5: RELAX Framework & Agent Scorecard */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
          
          {/* RELAX Framework */}
          <div className="lg:col-span-7 bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-8 border-b-2 border-gray-200 pb-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
                RELAX Framework
              </h2>
              <div className="text-right">
                <span className={`text-4xl font-bold ${
                  parseFloat(getRelaxOverallRating(relax)) >= 2.5 ? 'text-green-600' : 
                  parseFloat(getRelaxOverallRating(relax)) >= 1.5 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {getRelaxOverallRating(relax) !== 'N/A' ? `${Math.round((parseFloat(getRelaxOverallRating(relax)) / 3) * 100)}%` : 'N/A'}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {[
                { key: 'R', title: 'R — Reach Out', subtitle: 'Cart Context', data: relax.R },
                { key: 'E', title: 'E — Explore Needs', subtitle: 'Probing Abandonment Reason', data: relax.E },
                { key: 'L', title: 'L — Link Product', subtitle: 'Re-affirming Choice', data: relax.L },
                { key: 'A', title: 'A — Add Value', subtitle: 'Assistance Hook', data: relax.A },
                { key: 'X', title: 'X — Express Closing', subtitle: 'Confirmation', data: relax.X },
              ].map((item) => (
                <ExpandableCard
                  key={item.key}
                  title={item.title}
                  subtitle={item.subtitle}
                  rating={getRatingText(item.data?.Score)}
                >
                  <strong className={`text-sm uppercase block mb-1 ${
                    getRatingText(item.data?.Score) === 'HIGH' ? 'text-green-700' :
                    getRatingText(item.data?.Score) === 'MEDIUM' ? 'text-yellow-700' : 'text-red-700'
                  }`}>Reason:</strong>
                  {item.data?.Reason || 'No details available.'}
                </ExpandableCard>
              ))}
            </div>
          </div>

          {/* Agent Scorecard */}
          <div className="lg:col-span-5 bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-8 border-b-2 border-gray-200 pb-4">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
                Agent Scorecard
              </h2>
            </div>

            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Recovery Skills</h3>
            <div className="space-y-4 mb-8">
              <ExpandableCard
                title="Sales Skills"
                rating={getSkillRating(mainSkills.Sales_Skills, 'N/A')}
              >
                <strong className="text-sm uppercase block mb-1 text-gray-600">Reason:</strong>
                {getSkillReason(mainSkills.Sales_Skills, mainSkills.Sales_Skills_Reason)}
              </ExpandableCard>

              <ExpandableCard
                title="Product Knowledge"
                rating={getSkillRating(mainSkills.Product_Knowledge, 'N/A')}
              >
                <strong className="text-sm uppercase block mb-1 text-gray-600">Reason:</strong>
                {getSkillReason(mainSkills.Product_Knowledge, mainSkills.Product_Knowledge_Reason)}
              </ExpandableCard>

              <ExpandableCard
                title="Upsell Skills"
                rating={getSkillRating(mainSkills.Upsell_Revenue_Skills, 'N/A')}
              >
                <strong className="text-sm uppercase block mb-1 text-gray-600">Reason:</strong>
                {getSkillReason(mainSkills.Upsell_Revenue_Skills, mainSkills.Upsell_Revenue_Skills_Reason)}
              </ExpandableCard>
            </div>

            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 pt-4 border-t border-gray-200">
              Traits
            </h3>
            <div className="space-y-4">
              <ExpandableCard
                title="Agent Nature"
                rating={getSkillRating(secondaryTraits.Agent_Nature, 'N/A')}
              >
                <strong className="text-sm uppercase block mb-1 text-gray-600">Reason:</strong>
                {getSkillReason(secondaryTraits.Agent_Nature, secondaryTraits.Agent_Nature_Reason)}
              </ExpandableCard>

              <ExpandableCard
                title="Objection Handling"
                rating={getSkillRating(secondaryTraits.Objection_Handling, 'N/A')}
              >
                <strong className="text-sm uppercase block mb-1 text-gray-600">Reason:</strong>
                {getSkillReason(secondaryTraits.Objection_Handling, secondaryTraits.Objection_Handling_Reason)}
              </ExpandableCard>
            </div>
          </div>
        </div>

        {/* SECTION 6: Agent Learnings & Closing Intelligence */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          
          {/* Agent Learnings */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-8 border-b-2 border-gray-200 pb-4">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
                Agent Learnings
              </h2>
            </div>

            <div className="space-y-4">
              {learnings.length > 0 ? learnings.map((learning, index) => (
                <ExpandableCard
                  key={index}
                  title={`${index + 1}. ${learning.substring(0, 50)}${learning.length > 50 ? '...' : ''}`}
                >
                  <strong className="text-green-700 block mb-1 text-sm uppercase tracking-wide">Feedback:</strong>
                  {learning}
                </ExpandableCard>
              )) : (
                <p className="text-gray-500 text-center py-4">No specific learnings recorded.</p>
              )}
            </div>
          </div>

          {/* Closing Intelligence */}
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
            <div className="mb-8 border-b-2 border-gray-200 pb-4">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
                Closing Intelligence
              </h2>
            </div>

            <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-6 mb-8">
              <p className="text-sm text-blue-700 font-bold uppercase tracking-wider mb-4">Next Actions</p>
              <p className="text-lg text-gray-700 leading-relaxed font-semibold">
                {finalNextActions || 'No specific actions recorded.'}
              </p>
            </div>

            <div className={`bg-gradient-to-br ${
              parseInt(npsScore) >= 8 ? 'from-green-100 to-green-50 border-green-400' : 
              parseInt(npsScore) >= 6 ? 'from-yellow-100 to-yellow-50 border-yellow-400' : 
              'from-red-100 to-red-50 border-red-400'
            } border-2 rounded-xl p-8 text-center`}>
              <p className={`text-sm font-bold uppercase tracking-wider mb-4 ${
                parseInt(npsScore) >= 8 ? 'text-green-700' : 
                parseInt(npsScore) >= 6 ? 'text-yellow-700' : 'text-red-700'
              }`}>End-to-End NPS</p>
              <div className={`text-6xl font-bold mb-4 ${
                parseInt(npsScore) >= 8 ? 'text-green-700' : 
                parseInt(npsScore) >= 6 ? 'text-yellow-700' : 'text-red-700'
              }`}>{npsScore}</div>
              <p className={`text-base font-bold uppercase tracking-wide mb-4 ${
                parseInt(npsScore) >= 8 ? 'text-green-700' : 
                parseInt(npsScore) >= 6 ? 'text-yellow-700' : 'text-red-700'
              }`}>
                {parseInt(npsScore) >= 9 ? 'PROMOTER' : 
                 parseInt(npsScore) >= 7 ? 'PASSIVE' : 'DETRACTOR'}
              </p>
              {npsComment && (
                <p className="text-base text-gray-700 italic leading-relaxed">
                  "{npsComment}"
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden mb-10 shadow-lg">
          <div className="flex justify-between items-center p-8 border-b-2 border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Fraunces', serif" }}>
              Call Transcript
            </h2>
            <div className="flex gap-3">
              <button
                onClick={downloadTranscript}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition"
              >
                Download
              </button>
              <button
                onClick={() => setExpandTranscript(!expandTranscript)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition"
              >
                {expandTranscript ? '− Collapse' : '+ Expand'}
              </button>
            </div>
          </div>

          {expandTranscript && (
            <div className="max-h-[600px] overflow-y-auto p-8 space-y-4 bg-white">
              {typeof transcript === 'string' ? (
                (() => {
                  // Helper to format timestamp from MM:SS to readable format
                  const formatTimestamp = (timeStr) => {
                    if (!timeStr) return '';
                    const parts = timeStr.split(':');
                    const minutes = parseInt(parts[0]);
                    const seconds = parseInt(parts[1]);
                    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                  };

                  // Parse transcript string with format: [Speaker](MM:SS): Message
                  let lines = [];
                  
                  // Parse using regex to extract [Speaker](timestamp): message
                  const timestampRegex = /\[(\w+)\]\(([^)]+)\):\s*(.+?)(?=\[(?:Agent|Customer)\]|$)/gs;
                  let match;
                  
                  while ((match = timestampRegex.exec(transcript)) !== null) {
                    const speaker = match[1]; // Agent or Customer
                    const timestamp = match[2]; // MM:SS
                    const message = match[3].trim();
                    
                    if (message) {
                      lines.push({
                        speaker: speaker,
                        timestamp: formatTimestamp(timestamp),
                        text: message
                      });
                    }
                  }
                  
                  // Fallback: if regex doesn't work, use old method
                  if (lines.length === 0) {
                    if (transcript.includes(' / ')) {
                      lines = transcript.split(' / ').filter(line => line.trim()).map((line, i) => ({
                        text: line.trim(),
                        speaker: i % 2 === 0 ? 'Agent' : 'Customer',
                        timestamp: ''
                      }));
                    }
                  }
                  
                  // Render parsed lines
                  return lines.map((line, i) => {
                    const isAgent = line.speaker === 'Agent';
                    
                    return (
                      <div key={i} className={`flex ${isAgent ? 'justify-start' : 'justify-end'} mb-3 px-2`}>
                        <div className={`max-w-[75%] ${
                          isAgent 
                            ? 'bg-white border border-gray-200' 
                            : 'bg-green-100 border border-green-200'
                        } rounded-2xl px-4 py-2 shadow-sm`}>
                          <p className={`text-xs font-semibold mb-1.5 ${
                            isAgent ? 'text-gray-600' : 'text-green-800'
                          }`}>{line.speaker}</p>
                          <p className={`text-base ${
                            isAgent ? 'text-gray-800' : 'text-gray-900'
                          } leading-relaxed`}>{line.text}</p>
                          {line.timestamp && (
                            <p className={`text-xs mt-1.5 ${
                              isAgent ? 'text-gray-500' : 'text-green-700'
                            }`}>{line.timestamp}</p>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()
              ) : Array.isArray(transcript) && transcript.length > 0 ? (
                transcript.map((msg, i) => {
                  const isAgent = msg.Speaker === 'Agent';
                  
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
                        {msg.Timestamp && (
                          <p className={`text-xs mt-1.5 ${
                            isAgent ? 'text-gray-500' : 'text-green-700'
                          }`}>{msg.Timestamp}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-8">No transcript available for this call.</p>
              )}
            </div>
          )}
        </div>

        {/* Download Section */}
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
          <p className="text-base text-gray-500">Duroflex ABC Intelligence • Powered by AI Analysis</p>
        </div>

      </div>
    </div>
  );
};

export default AbcReportDetail;
