import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronDown, Download, FileDown } from 'lucide-react';

const getScoreColor = (score) => {
  if (score === 5) return 'text-green-500';
  if (score === 4) return 'text-emerald-400';
  if (score === 3) return 'text-amber-400';
  if (score === 2) return 'text-orange-400';
  return 'text-red-400';
};

const getIntentBadgeColor = (intent) => {
  if ((intent || '').toUpperCase() === 'HIGH') return 'bg-green-500/15 text-green-300 border-green-500/30';
  if ((intent || '').toUpperCase() === 'MED' || (intent || '').toUpperCase() === 'MEDIUM') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-red-500/15 text-red-300 border-red-500/30';
};

const getAidaSteps = (currentStage) => {
  const stages = ['Awareness', 'Interest', 'Desire', 'Action'];
  const currentIndex = stages.findIndex((s) => s.toLowerCase() === (currentStage || '').toLowerCase());
  return stages.map((stage, index) => ({
    letter: stage[0],
    active: index <= currentIndex && currentIndex !== -1
  }));
};

const intentClass = (value) => {
  if ((value || '').toUpperCase() === 'HIGH') return 'high';
  if ((value || '').toUpperCase() === 'MED') return 'medium';
  return 'low';
};

const firstDefined = (...values) => values.find((v) => v !== undefined && v !== null && v !== '');

const normalizeAnalysis = (raw, reportId) => {
  if (!raw || typeof raw !== 'object') return {};

  // Extract nested structures from the MongoDB document
  const metadata = raw.metadata || raw.MetaData || {};
  const callAnalysis = raw.call_analysis || raw.callAnalysis || {};
  const agentDetails = callAnalysis.agent_details || raw.agent_details || raw.agentDetails || {};
  const customerInfo = callAnalysis.customer_info || raw.Customer_Information || raw.customer_info || raw.customerInfo || {};
  const performance = callAnalysis.performance_ratings || raw.performance_ratings || raw.performance || {};

  const functional = { ...(raw.Functional || {}) };
  functional.Call_ID = firstDefined(functional.Call_ID, raw.report_id, callAnalysis.report_id, metadata.report_id, reportId);
  if (!functional.Call_ID || functional.Call_ID === 'N/A') {
    functional.Call_ID = reportId;
  }
  functional.Call_Time = firstDefined(functional.Call_Time, callAnalysis.call_time, metadata.clean_datetime, metadata.date, raw.clean_datetime, raw.date);
  functional.Store_Location = firstDefined(functional.Store_Location, callAnalysis.store_location, raw.store_location, agentDetails.store_location, metadata.store_name);
  functional.Customer_Name = firstDefined(functional.Customer_Name, customerInfo.customer_name, customerInfo.name, agentDetails.customer_name);
  functional.Agent_Name = firstDefined(functional.Agent_Name, agentDetails.agent_name, agentDetails.name);
  functional.Customer_Location = firstDefined(functional.Customer_Location, customerInfo.customer_location, customerInfo.location);
  functional.Customer_Language = firstDefined(functional.Customer_Language, customerInfo.language, customerInfo.customer_language);
  functional.Call_Objective_Theme = firstDefined(functional.Call_Objective_Theme, callAnalysis.call_type, callAnalysis.intent, callAnalysis.category, customerInfo.query_product);
  functional.Product_of_Interest = firstDefined(functional.Product_of_Interest, callAnalysis.product_of_interest, customerInfo.product_of_interest, customerInfo.product, customerInfo.query_product);
  functional.Agent_Video_Quality_Rating = firstDefined(functional.Agent_Video_Quality_Rating, performance.agent_video_quality, performance.agent_video_quality_rating);
  functional.Agent_Audio_Quality_Rating = firstDefined(functional.Agent_Audio_Quality_Rating, performance.agent_audio_quality, performance.agent_audio_quality_rating);
  functional.Customer_Audio_Quality_Rating = firstDefined(functional.Customer_Audio_Quality_Rating, performance.customer_audio_quality, performance.customer_audio_quality_rating);

  const customer = { ...(raw.Customer_Information || {}) };
  if (Object.keys(customer).length === 0) Object.assign(customer, customerInfo);
  customer.Type_of_Call = firstDefined(customer.Type_of_Call, callAnalysis.call_type, callAnalysis.type_of_call);
  customer.Intent_to_Visit_Rating = firstDefined(customer.Intent_to_Visit_Rating, performance.intent_to_visit, performance.intent_to_visit_rating, callAnalysis.intent_to_visit, 'LOW');
  customer.Intent_to_Purchase_Rating = firstDefined(customer.Intent_to_Purchase_Rating, performance.intent_to_purchase, performance.intent_to_purchase_rating, callAnalysis.intent_to_purchase, 'N/A');
  customer.Customer_Stage_AIDA = firstDefined(customer.Customer_Stage_AIDA, callAnalysis.customer_stage, performance.customer_stage);
  customer.Timeline_to_Purchase = firstDefined(customer.Timeline_to_Purchase, callAnalysis.purchase_timeline, performance.purchase_timeline, 'N/A');
  customer.Barriers_to_Conversion = firstDefined(customer.Barriers_to_Conversion, callAnalysis.barriers_to_conversion, performance.barriers_to_conversion, callAnalysis.barriers, 'None identified');
  customer.Customer_Satisfaction_Score = firstDefined(customer.Customer_Satisfaction_Score, performance.customer_satisfaction, performance.customer_satisfaction_score, 0);
  customer.Business_Satisfaction_Score = firstDefined(customer.Business_Satisfaction_Score, performance.business_satisfaction, performance.business_satisfaction_score, 0);
  customer.Primary_Questions_Asked = customer.Primary_Questions_Asked || callAnalysis.primary_questions || customerInfo.primary_questions || customerInfo.key_interests || [];

  const agentAreas = { ...(raw.Agent_Areas || {}) };
  agentAreas.Product_Demonstration = agentAreas.Product_Demonstration || agentDetails.product_demonstration || {};
  agentAreas.The_Invitation_to_Visit = agentAreas.The_Invitation_to_Visit || agentDetails.invitation || {};
  agentAreas.RELAX_Framework = agentAreas.RELAX_Framework || agentDetails.relax_framework || {};
  agentAreas.SoftSkills = agentAreas.SoftSkills || agentAreas.SoftSkills_Etiquette || agentAreas.SoftSkills_Rating || {};
  agentAreas.Agent_Language_Fluency = agentAreas.Agent_Language_Fluency || agentDetails.language_fluency || {};
  agentAreas.Transcript = agentAreas.Transcript || raw.Transcript_Log || raw.transcript || callAnalysis.transcript || agentDetails.transcript || {};

  const overallSummary = { ...(raw.Overall_Summary || {}) };
  overallSummary.Chronological_Call_Summary = firstDefined(
    overallSummary.Chronological_Call_Summary,
    raw.summary,
    callAnalysis.summary,
    callAnalysis.call_summary
  );
  overallSummary.Agent_Handling_Summary = firstDefined(
    overallSummary.Agent_Handling_Summary,
    agentDetails.performance_notes
  );

  return {
    ...raw,
    Functional: functional,
    Customer_Information: customer,
    Agent_Areas: agentAreas,
    Overall_Summary: overallSummary,
    metadata,
  };
};

const VideoCallDetail = () => {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [driveLink, setDriveLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'https://duroflex-call-analyser.onrender.com'}/api/video-reports/${reportId}`);
        if (!response.ok) throw new Error('Failed to fetch report');
        const data = await response.json();
        setAnalysis(normalizeAnalysis(data.analysis || data, reportId));
        setDriveLink(data.driveLink || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [reportId]);

  const downloadCSV = () => {
    if (!analysis) return;

    const functional = analysis.Functional || {};
    const customer = analysis.Customer_Information || {};
    const agentAreas = analysis.Agent_Areas || {};
    const overall = analysis.Overall_Summary || {};
    const relax = agentAreas.RELAX_Framework || {};
    const softSkills = agentAreas.SoftSkills || agentAreas.SoftSkills_Etiquette || {};
    const invitation = agentAreas.The_Invitation_to_Visit || {};
    const demo = agentAreas.Product_Demonstration || {};

    const callId = functional.Call_ID || reportId;

    const headers = [
      'Call_ID', 'Store_Location', 'Call_Time', 'Customer_Name', 'Agent_Name', 'Customer_Location', 'Customer_Language',
      'Call_Objective', 'Intent_to_Visit', 'Intent_to_Purchase', 'Customer_Stage_AIDA', 'Purchase_Timeline', 'Barriers_to_Conversion',
      'Customer_Satisfaction_Score', 'Business_Satisfaction_Score',
      'Demo_Done', 'Demo_Quality', 'Invitation_Attempted', 'Invitation_Quality',
      'R_Reach_Out', 'E_Explore', 'L_Link_Demo', 'A_Add_Value', 'X_Express_Offers',
      'Active_Listening', 'Empathy_Rapport', 'Clarity_Confidence', 'Objection_Handling', 'Hold_Dead_Air', 'Language_Fluency_Score',
      'Chronological_Summary', 'Agent_Handling_Summary', 'Next_Action'
    ];

    const row = [
      callId,
      functional.Store_Location || '',
      functional.Call_Time || '',
      functional.Customer_Name || '',
      functional.Agent_Name || '',
      functional.Customer_Location || '',
      functional.Customer_Language || '',
      functional.Call_Objective_Theme || '',
      customer.Intent_to_Visit_Rating || '',
      customer.Intent_to_Purchase_Rating || '',
      customer.Customer_Stage_AIDA || '',
      customer.Timeline_to_Purchase || '',
      customer.Barriers_to_Conversion || '',
      customer.Customer_Satisfaction_Score || '',
      typeof customer.Business_Satisfaction_Score === 'object'
        ? customer.Business_Satisfaction_Score.Score || ''
        : customer.Business_Satisfaction_Score || '',
      demo.Done ? 'Yes' : 'No',
      demo.Quality_Rating || '',
      invitation.Attempted ? 'Yes' : 'No',
      invitation.Quality_Rating || '',
      relax.R_Reach_Out?.Rating || '',
      relax.E_Explore_Needs?.Rating || relax.E_Explore?.Rating || '',
      relax.L_Link_Demo?.Rating || relax.L_Link_Experience?.Rating || '',
      relax.A_Add_Value?.Rating || '',
      relax.X_Express_Offers?.Rating || relax.X_Express_Closing?.Rating || '',
      softSkills.Active_Listening_Rating || '',
      softSkills.Empathy_Rapport_Rating || '',
      softSkills.Clarity_Confidence_Rating || '',
      softSkills.Objection_Handling_Rating || '',
      softSkills.Hold_and_Dead_Air_Management_Rating || '',
      softSkills.Agent_Language_Fluency?.Score || softSkills.Agent_Language_Fluency_Score || '',
      overall.Chronological_Call_Summary || '',
      overall.Agent_Handling_Summary || '',
      overall.Next_Action || ''
    ];

    const escapeCSVField = (field) => {
      const str = String(field ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const csvContent = [
      headers.join(','),
      row.map(escapeCSVField).join(',')
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `video_report_${callId}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadTranscript = () => {
    if (!analysis) return;

    const functional = analysis.Functional || {};
    const agentAreas = analysis.Agent_Areas || {};
    const transcriptRaw = analysis.Transcript_Log || agentAreas.Transcript || [];
    const messages = Array.isArray(transcriptRaw)
      ? transcriptRaw
      : Array.isArray(transcriptRaw.messages)
        ? transcriptRaw.messages
        : [];

    if (!messages || messages.length === 0) {
      alert('No transcript available for this video');
      return;
    }

    const callId = functional.Call_ID || reportId;

    let textContent = `VIDEO CALL TRANSCRIPT\n`;
    textContent += `${'='.repeat(80)}\n\n`;
    textContent += `Call ID: ${callId}\n`;
    textContent += `Store: ${functional.Store_Location || 'Unknown'}\n`;
    textContent += `Call Time: ${functional.Call_Time || 'N/A'}\n`;
    textContent += `Customer: ${functional.Customer_Name || 'Unknown'}\n`;
    textContent += `Agent: ${functional.Agent_Name || 'Unknown'}\n`;
    textContent += `Customer Location: ${functional.Customer_Location || 'N/A'}\n`;
    textContent += `Language: ${functional.Customer_Language || 'N/A'}\n\n`;
    textContent += `${'='.repeat(80)}\n\n`;

    messages.forEach((entry, index) => {
      const ts = entry.Timestamp || entry.time || entry.Time || entry.timestamp || `${index + 1}`;
      const speaker = entry.Speaker || entry.speaker_name || entry.speaker || entry.role || 'Unknown';
      const text = entry.Text || entry.text || entry.message || entry.content || '';
      textContent += `[${ts}] ${speaker}:\n${text}\n\n`;
    });

    textContent += `${'='.repeat(80)}\nEnd of Transcript\n`;

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `video_transcript_${callId}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08080c] flex items-center justify-center text-white text-lg">Loading report...</div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#08080c] flex items-center justify-center text-red-400 text-lg">Error: {error}</div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen bg-[#08080c] flex items-center justify-center text-white text-lg">No report found</div>
    );
  }

  const functional = analysis.Functional || {};
  const customer = analysis.Customer_Information || {};
  const agentAreas = analysis.Agent_Areas || {};
  const productDemo = agentAreas.Product_Demonstration || {};
  const relaxFramework = agentAreas.RELAX_Framework || {};
  const softSkills = agentAreas.SoftSkills || {};
  const invitation = agentAreas.The_Invitation_to_Visit || {};
  const languageFluency = agentAreas.Agent_Language_Fluency || {};
  const overallSummary = analysis.Overall_Summary || {};
  const transcript = agentAreas.Transcript || {};
  const presentability = functional.Agent_Presentability || {};

  // Derived customer satisfaction fields
  const businessSatisfactionRaw = customer.Business_Satisfaction_Score;
  const businessSatisfactionValue = typeof businessSatisfactionRaw === 'object' && businessSatisfactionRaw !== null
    ? businessSatisfactionRaw.Score
    : businessSatisfactionRaw;
  const businessSatisfactionReason = typeof businessSatisfactionRaw === 'object' && businessSatisfactionRaw !== null
    ? businessSatisfactionRaw.Reason
    : undefined;

  const purchaseIntent = customer.Intent_to_Purchase_Rating || 'LOW';
  const customerSatisfactionScore = customer.Customer_Satisfaction_Score || 0;

  const getScoreTheme = (score) => {
    if (score >= 4) return { valueClass: 'text-green-400', badgeClass: 'bg-green-500/15 text-green-300' };
    if (score >= 3) return { valueClass: 'text-amber-300', badgeClass: 'bg-amber-500/15 text-amber-300' };
    return { valueClass: 'text-red-400', badgeClass: 'bg-red-500/15 text-red-300' };
  };

  const noiseBg = "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")";

  return (
    <div className="min-h-screen bg-[#08080c] text-white relative">
      <div
        className="pointer-events-none fixed inset-0 opacity-10 mix-blend-soft-light"
        style={{ backgroundImage: noiseBg }}
      />
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6 relative z-10">

        {/* Back and Download Buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back to Reports</span>
          </button>

          <div className="flex items-center gap-3">
            {driveLink && (
              <a
                href={driveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition shadow-sm"
                title="View recording on Google Drive"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 5.23 11.08 5 12 5c3.04 0 5.5 2.46 5.5 5.5v.5H19c2.21 0 4 1.79 4 4 0 2.05-1.53 3.76-3.56 3.97l1.07-1.07c.21-.2.33-.48.33-.79V10.04zM3 5.5h3v3H3V5.5zm6 0h3v3H9V5.5zM3 11.5h3v3H3v-3zm6 0h3v3H9v-3z"/>
                </svg>
                Access Recording
              </a>
            )}
            <button
              onClick={downloadCSV}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition shadow-sm"
              title="Download Video Report"
            >
              <Download className="w-4 h-4" />
              Download Report
            </button>
            <button
              onClick={downloadTranscript}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition shadow-sm"
              title="Download Video Transcript as TXT"
            >
              <FileDown className="w-4 h-4" />
              Download Transcript
            </button>
          </div>
        </div>

        {/* Section 1: Call Metadata */}
        <header className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f0f14] to-[#16161d] p-8 shadow-2xl">
          <div className="flex flex-col lg:flex-row gap-6 justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full border border-purple-500/40 bg-purple-500/10 text-xs font-mono text-purple-200 tracking-wide">
                  CALL ID: {functional.Call_ID || 'N/A'}
                </span>
                <span className="px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/15 text-[11px] font-semibold uppercase tracking-wide text-purple-200">
                  Video Call
                </span>
              </div>
              <h1 className="text-3xl font-['Fraunces',serif] font-semibold tracking-tight">
                {functional.Store_Location || 'Store Location'}
              </h1>
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm font-medium">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-amber-300">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {functional.Call_Objective_Theme || 'Product Inquiry'}
              </span>
            </div>

            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-5">
                {[{
                  label: 'Agent Video',
                  value: functional.Agent_Video_Quality_Rating,
                  active: 'bg-purple-400'
                }, {
                  label: 'Agent Audio',
                  value: functional.Agent_Audio_Quality_Rating,
                  active: 'bg-green-400'
                }, {
                  label: 'Customer Audio',
                  value: functional.Customer_Audio_Quality_Rating,
                  active: 'bg-amber-400'
                }].map((q, idx) => (
                  <div key={idx} className="flex flex-col items-end gap-1">
                    <span className="text-[10px] uppercase tracking-[0.08em] text-gray-400">{q.label}</span>
                    <div className="flex items-end gap-1 h-5">
                      {[0, 1, 2, 3, 4].map((bar) => (
                        <span
                          key={bar}
                          className={`w-1.5 rounded-sm ${bar < (q.value || 0) ? q.active : 'bg-gray-700'}`}
                          style={{ height: `${6 + bar * 4}px` }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[{
              label: 'Call Time', value: functional.Call_Time
            }, {
              label: 'Store Location', value: functional.Store_Location
            }, {
              label: 'Customer', value: functional.Customer_Name
            }, {
              label: 'Customer Location', value: functional.Customer_Location
            }, {
              label: 'Agent', value: functional.Agent_Name
            }, {
              label: 'Customer Language', value: functional.Customer_Language
            }, {
              label: 'Call Type', value: customer.Type_of_Call
            }, {
              label: 'Product of Interest', value: functional.Product_of_Interest
            }].map((item, idx) => (
              <div key={idx} className="flex flex-col gap-1 rounded-lg bg-[#16161d] border border-white/5 p-4">
                <span className="text-[11px] uppercase tracking-[0.08em] text-gray-500">{item.label}</span>
                <span className="text-sm font-medium text-white/90">{item.value || 'N/A'}</span>
              </div>
            ))}
          </div>
        </header>

        {/* Section 2: Customer Insights */}
        <section className="rounded-2xl border border-white/10 bg-[#0f0f14] p-7 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-['Fraunces',serif] font-semibold">Customer Insights</h2>
            <span className="text-sm text-gray-500">Intent & Satisfaction</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {(() => {
              const purchaseIntentClass = intentClass(purchaseIntent);
              const csatTheme = getScoreTheme(customerSatisfactionScore);
              const bsatTheme = getScoreTheme(businessSatisfactionValue || 0);

              return ([
                {
                  label: 'Intent to Purchase',
                  value: purchaseIntent,
                  valueClass: purchaseIntentClass === 'high' ? 'text-green-400' : purchaseIntentClass === 'medium' ? 'text-amber-300' : 'text-red-400',
                  badgeClass: purchaseIntentClass === 'high'
                    ? 'bg-green-500/15 text-green-300'
                    : purchaseIntentClass === 'medium'
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-red-500/15 text-red-300',
                  badge: purchaseIntent,
                  subtext: null
                },
                {
                  label: 'Customer Satisfaction',
                  value: `${customerSatisfactionScore}/5`,
                  valueClass: csatTheme.valueClass,
                  badgeClass: csatTheme.badgeClass,
                  badge: 'Satisfied',
                  subtext: null
                },
                {
                  label: 'Business Satisfaction',
                  value: `${businessSatisfactionValue || 0}/5`,
                  valueClass: bsatTheme.valueClass,
                  badgeClass: bsatTheme.badgeClass,
                  badge: 'Reason',
                  subtext: businessSatisfactionReason
                },
                {
                  label: 'Intent to Visit',
                  value: customer.Intent_to_Visit_Rating || 'LOW',
                  valueClass: 'text-amber-300',
                  badgeClass: getIntentBadgeColor(customer.Intent_to_Visit_Rating || 'LOW'),
                  badge: customer.Intent_to_Visit_Rating || 'LOW',
                  subtext: null
                },
                {
                  label: 'Purchase Timeline',
                  value: customer.Timeline_to_Purchase || 'N/A',
                  valueClass: 'text-amber-200',
                  badgeClass: 'bg-amber-500/10 text-amber-200 border border-amber-500/20',
                  badge: customer.Timeline_to_Purchase || 'N/A',
                  subtext: null
                },
                {
                  label: 'Customer Stage (AIDA)',
                  value: customer.Customer_Stage_AIDA || 'Awareness',
                  valueClass: 'text-amber-300',
                  badgeClass: 'bg-amber-500/15 text-amber-200',
                  badge: customer.Customer_Stage_AIDA || 'A',
                  subtext: null,
                  render: (
                    <div className="flex items-center gap-1 justify-center">
                      {getAidaSteps(customer.Customer_Stage_AIDA).map((step, idx) => (
                        <React.Fragment key={idx}>
                          <span className={`px-3 py-2 rounded-md text-[11px] font-semibold tracking-wide ${step.active ? 'bg-amber-500 text-[#0b0b10]' : 'bg-[#1f1f29] text-gray-500'}`}>
                            {step.letter}
                          </span>
                          {idx < 3 && <span className="w-3 h-0.5 bg-white/10" />}
                        </React.Fragment>
                      ))}
                    </div>
                  )
                },
                {
                  label: 'Barriers',
                  value: customer.Barriers_to_Conversion || 'None identified',
                  valueClass: 'text-orange-200',
                  badgeClass: customer.Barriers_to_Conversion ? 'bg-orange-500/10 text-orange-300 border border-orange-500/30' : 'bg-white/5 text-gray-300 border border-white/10',
                  badge: null,
                  subtext: null,
                  isLong: true
                }
              ]);
            })().map((card, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-white/10 bg-[#16161d] px-6 py-5 text-center flex flex-col gap-3 min-h-[180px]"
              >
                <p className="text-[11px] uppercase tracking-[0.08em] text-gray-500">{card.label}</p>
                <div className={`${card.isLong ? 'text-base font-semibold leading-snug line-clamp-2 text-amber-200 min-h-[48px]' : `text-3xl font-['Fraunces',serif] font-semibold ${card.valueClass}`}`}>
                  {card.value || 'N/A'}
                </div>
                {card.render ? (
                  card.render
                ) : card.badge !== null ? (
                  <span className={`inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${card.badgeClass} max-w-full whitespace-nowrap overflow-hidden text-ellipsis mx-auto`}>
                    <span className="w-2 h-2 rounded-full bg-current" />
                    <span className="truncate">{card.badge || 'LOW'}</span>
                  </span>
                ) : null}
                {card.subtext && (
                  <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">{card.subtext}</p>
                )}
              </div>
            ))}
          </div>

          {customer.Primary_Questions_Asked && customer.Primary_Questions_Asked.length > 0 && (
            <div className="border-t border-white/5 pt-5">
              <p className="text-[11px] uppercase tracking-[0.08em] text-gray-500 mb-3">Primary Questions Asked</p>
              <div className="flex flex-wrap gap-3">
                {customer.Primary_Questions_Asked.map((q, idx) => (
                  <span key={idx} className="px-4 py-2 rounded-md bg-[#16161d] border-l-4 border-amber-500 text-sm text-gray-100 italic">
                    "{q}"
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Section 3: Product Demonstration */}
        <section className="rounded-2xl border border-white/10 bg-[#0f0f14] p-7 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-['Fraunces',serif] font-semibold">Product Demonstration</h2>
              <p className="text-sm text-gray-500">Visual Demo Quality</p>
            </div>
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${productDemo.Done ? 'bg-green-500/10 border-green-500/40 text-green-300' : 'bg-red-500/10 border-red-500/40 text-red-300'}`}>
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                <path d={productDemo.Done ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} />
              </svg>
              {productDemo.Done ? 'Demo Done' : 'Demo Not Done'}
            </span>
          </div>

          <div className="flex flex-col xl:flex-row gap-5">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {[{
                label: 'Quality', value: productDemo.Quality_Rating
              }, {
                label: 'Relevance', value: productDemo.Relevance_Rating
              }, {
                label: 'Video/Audio', value: productDemo.Video_Audio_Quality_Rating
              }, {
                label: 'Effectiveness', value: productDemo.Effectiveness_Rating
              }, {
                label: 'Engagement', value: productDemo.Customer_Engagement_Rating
              }].map((metric, idx) => {
                const score = metric.value || 0;
                const scoreClass = score >= 5 ? 'text-green-400 border-green-500/50' : score === 4 ? 'text-emerald-300 border-emerald-500/40' : score === 3 ? 'text-amber-300 border-amber-500/40' : score === 2 ? 'text-orange-300 border-orange-500/40' : 'text-red-300 border-red-500/40';
                return (
                  <div key={idx} className={`rounded-xl bg-[#16161d] border-l-4 ${scoreClass} p-4 text-center`}>
                    <div className={`text-3xl font-['Fraunces',serif] font-semibold ${scoreClass.split(' ')[0]}`}>
                      {score}<span className="text-sm text-gray-500">/5</span>
                    </div>
                    <p className="text-xs uppercase tracking-[0.08em] text-gray-400 mt-1">{metric.label}</p>
                  </div>
                );
              })}
            </div>

            {productDemo.Demo_Observations && productDemo.Demo_Observations.length > 0 && (
              <div className="min-w-[260px] rounded-xl bg-[#16161d] border border-white/10 p-5">
                <p className="text-[11px] uppercase tracking-[0.08em] text-gray-500 mb-3">Observations</p>
                <ul className="space-y-2 text-sm text-gray-300">
                  {productDemo.Demo_Observations.map((obs, idx) => (
                    <li key={idx} className="flex gap-2 leading-relaxed">
                      <span className="text-amber-400 mt-1">•</span>
                      <span>{obs}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Section 4: RELAX Framework */}
        <section className="rounded-2xl border border-white/10 bg-[#0f0f14] p-7 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-['Fraunces',serif] font-semibold">RELAX Framework Performance</h2>
            <span className="text-sm text-gray-500">Sales Methodology</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[{
              key: 'R', label: 'Reach Out', data: relaxFramework.R_Reach_Out
            }, {
              key: 'E', label: 'Explore Needs', data: relaxFramework.E_Explore_Needs
            }, {
              key: 'L', label: 'Link Demo', data: relaxFramework.L_Link_Demo
            }, {
              key: 'A', label: 'Add Value', data: relaxFramework.A_Add_Value
            }, {
              key: 'X', label: 'Express Offers', data: relaxFramework.X_Express_Offers
            }].map((pillar, idx) => {
              const score = pillar.data?.Rating || 0;
              const scoreClass = score >= 5 ? 'text-green-400 border-green-500/50' : score === 4 ? 'text-emerald-300 border-emerald-500/40' : score === 3 ? 'text-amber-300 border-amber-500/40' : score === 2 ? 'text-orange-300 border-orange-500/40' : 'text-red-300 border-red-500/40';
              return (
                <div key={idx} className={`rounded-xl bg-[#16161d] border-t-4 ${scoreClass} p-5 flex flex-col gap-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-['Fraunces',serif] font-semibold">{pillar.key}</span>
                    <span className={`text-2xl font-['Fraunces',serif] font-semibold ${scoreClass.split(' ')[0]}`}>{score}<span className="text-sm text-gray-500">/5</span></span>
                  </div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-gray-500">{pillar.label}</p>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {Array.isArray(pillar.data?.Reasons) ? pillar.data.Reasons.join(' | ') : (pillar.data?.Reasons || 'N/A')}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 5: Soft Skills */}
        <section className="rounded-2xl border border-white/10 bg-[#0f0f14] p-7 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-['Fraunces',serif] font-semibold">Soft Skills & Etiquette</h2>
            <span className="text-sm text-gray-500">Communication</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[{
              label: 'Active Listening', value: softSkills.Active_Listening_Rating
            }, {
              label: 'Empathy & Rapport', value: softSkills.Empathy_Rapport_Rating
            }, {
              label: 'Clarity & Confidence', value: softSkills.Clarity_Confidence_Rating
            }, {
              label: 'Objection Handling', value: softSkills.Objection_Handling_Rating
            }, {
              label: 'Dead Air Mgmt', value: softSkills.Hold_and_Dead_Air_Management_Rating
            }].map((skill, idx) => {
              const score = skill.value || 0;
              const scoreClass = score >= 5 ? 'text-green-400' : score === 4 ? 'text-emerald-300' : score === 3 ? 'text-amber-300' : 'text-red-300';
              return (
                <div key={idx} className="rounded-xl bg-[#16161d] border border-white/5 p-5 text-center">
                  <div className={`text-4xl font-['Fraunces',serif] font-semibold ${scoreClass}`}>
                    {score}<span className="text-lg text-gray-500">/5</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2 uppercase tracking-[0.08em]">{skill.label}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 6: Agent Assessment */}
        <section className="rounded-2xl border border-white/10 bg-[#0f0f14] p-7 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-['Fraunces',serif] font-semibold">Agent Assessment</h2>
            <span className="text-sm text-gray-500">Presentation · Language · Invitation</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Presentability */}
            <div className="rounded-xl bg-[#16161d] border border-white/5 p-5">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
                <span className="text-base font-semibold">Agent Presentability</span>
                <span className={`text-3xl font-['Fraunces',serif] ${getScoreColor(presentability.Score || 0)}`}>
                  {presentability.Score || 0}<span className="text-sm text-gray-500">/5</span>
                </span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed mb-3">{presentability.Reason_for_Score || 'N/A'}</p>
              {Array.isArray(presentability.Checklist) && (
                <div className="flex flex-wrap gap-2">
                  {presentability.Checklist.map((item, idx) => (
                    <span key={idx} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-300 text-xs border border-green-500/30">
                      <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Language */}
            <div className="rounded-xl bg-[#16161d] border border-white/5 p-5">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
                <span className="text-base font-semibold">Agent Language Fluency</span>
                <span className={`text-3xl font-['Fraunces',serif] ${getScoreColor(languageFluency.Score || 0)}`}>
                  {languageFluency.Score || 0}<span className="text-sm text-gray-500">/5</span>
                </span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed mb-3">{languageFluency.Comment || 'No comments available'}</p>
            </div>

            {/* Invitation */}
            <div className="rounded-xl bg-[#16161d] border border-white/5 p-5">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
                <span className="text-base font-semibold">Invitation to Visit</span>
                <span className={`text-3xl font-['Fraunces',serif] ${getScoreColor(invitation.Quality_Rating || 0)}`}>
                  {invitation.Quality_Rating || 0}<span className="text-sm text-gray-500">/5</span>
                </span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${invitation.Attempted ? 'bg-green-500/10 text-green-300 border border-green-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'}`}>
                  {invitation.Attempted ? 'Attempted' : 'Not Attempted'}
                </span>
                <span className="text-xs text-gray-400">{invitation.Attempted ? 'Store visit pitched' : 'No invitation'}</span>
              </div>
              {invitation.Reasons && invitation.Reasons.length > 0 && (
                <ul className="space-y-2 text-sm text-gray-300">
                  {invitation.Reasons.map((reason, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="text-amber-400 mt-1">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Section 7: Improvement Areas */}
        {/* {softSkills.Top_3_Improvement_Areas && softSkills.Top_3_Improvement_Areas.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-[#0f0f14] p-7 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-['Fraunces',serif] font-semibold">Top 3 Improvement Areas</h2>
              <span className="text-sm text-gray-500">Actionable coaching</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {softSkills.Top_3_Improvement_Areas.map((area, idx) => (
                <div key={idx} className="flex gap-3 rounded-xl bg-[#16161d] border border-white/10 p-4 hover:border-amber-500/40 transition-colors">
                  <div className="w-9 h-9 flex items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-300 font-mono text-sm font-semibold">
                    {idx + 1}
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-white text-sm">{area.title || area.Area || `Area ${idx + 1}`}</p>
                    <p className="text-sm text-gray-300 leading-relaxed">{area.description || area.Description || ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )} */}

        {/* Section 8: Summary */}
        <section className="rounded-2xl border border-white/10 bg-[#0f0f14] p-7 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-['Fraunces',serif] font-semibold">Call Summary</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[{
              icon: '📋', label: 'Call Synopsis', value: overallSummary.Chronological_Call_Summary
            }, {
              icon: '👤', label: 'Agent Performance', value: overallSummary.Agent_Handling_Summary
            }, {
              icon: '😊', label: 'Customer Satisfaction', value: overallSummary.Customer_Satisfaction_Summary
            }, {
              icon: '➡️', label: 'Next Action', value: overallSummary.Next_Action
            }].map((summary, idx) => (
              <div key={idx} className="rounded-xl bg-[#16161d] border border-white/5 p-5 space-y-3">
                <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.08em] text-gray-400">
                  <span>{summary.icon}</span>
                  <span>{summary.label}</span>
                </div>
                {summary.label === 'Next Action' ? (
                  <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-green-500/10 text-green-300 border border-green-500/30 text-sm font-semibold">
                    <span className="text-lg">📍</span>
                    {summary.value || 'Follow-up Required'}
                  </span>
                ) : (
                  <p className="text-sm text-gray-200 leading-relaxed">{summary.value || 'No details available'}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Section 9: Transcript */}
        {transcript && transcript.messages && transcript.messages.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-[#0f0f14] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h2 className="text-xl font-['Fraunces',serif] font-semibold">Call Transcript</h2>
              <button
                onClick={() => setTranscriptExpanded(!transcriptExpanded)}
                className="flex items-center gap-2 text-amber-400 hover:text-amber-300 text-sm px-3 py-2 rounded-md hover:bg-amber-500/10"
              >
                <ChevronDown className={`w-5 h-5 transition-transform ${transcriptExpanded ? 'rotate-180' : ''}`} />
                <span>{transcriptExpanded ? 'Collapse' : 'Expand'}</span>
              </button>
            </div>
            {transcriptExpanded && (
              <div className="px-6 py-5 max-h-[420px] overflow-y-auto space-y-3">
                {transcript.messages.map((message, idx) => (
                  <div key={idx} className="flex gap-3 rounded-lg bg-[#16161d] border border-white/5 p-3">
                    <span className="text-[11px] font-mono text-gray-400 min-w-[48px] pt-1">{message.time || '00:00'}</span>
                    <div className="flex-1 space-y-1">
                      <div className={`text-[11px] uppercase tracking-[0.08em] font-semibold ${message.speaker?.toLowerCase().includes('agent') ? 'text-amber-300' : 'text-green-300'}`}>
                        {message.speaker_name || message.speaker || 'Unknown'}
                      </div>
                      <p className="text-sm text-gray-200 leading-relaxed">{message.text || ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default VideoCallDetail;

