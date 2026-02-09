// Utility to map backend API response to frontend-friendly shape

const joinReasons = (list) => {
  if (Array.isArray(list) && list.length) return list;
  return [];
};

const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const getDemo = (demo = {}) => ({
  Done: Boolean(demo.Done),
  Quality_Rating: safeNumber(demo.Quality_Rating),
  Quality_Reasons: joinReasons(demo.Quality_Reasons),
  Relevance_Rating: safeNumber(demo.Demonstration_Execution?.Relevance_Rating ?? demo.Relevance_Rating),
  Relevance_Rating_Reason:
    demo.Demonstration_Execution?.Relevance_Reason ?? demo.Relevance_Rating_Reason ?? "",
  Video_Audio_Quality_Rating: safeNumber(
    demo.Demonstration_Execution?.Video_Audio_Quality_During_Demo ?? demo.Video_Audio_Quality_During_Demo
  ),
  Video_Audio_Quality_Reason:
    demo.Demonstration_Execution?.Video_Audio_Quality_Reason ?? demo.Video_Audio_Quality_Reason ?? "",
  Effectiveness_Rating: safeNumber(demo.Demonstration_Execution?.Effectiveness_Rating ?? demo.Effectiveness_Rating),
  Effectiveness_Rating_Reason:
    demo.Demonstration_Execution?.Effectiveness_Reason ?? demo.Effectiveness_Rating_Reason ?? "",
  Customer_Engagement_Rating: safeNumber(
    demo.Demonstration_Execution?.Customer_Engagement_Rating ?? demo.Customer_Engagement_Rating
  ),
  Customer_Engagement_Reason:
    demo.Demonstration_Execution?.Customer_Engagement_Reason ?? demo.Customer_Engagement_Reason ?? "",
});

const mapRelax = (script = {}) => ({
  R_Reach_Out: script.S_Solution_Finding ?? {},
  E_Explore_Needs: script.C_Connect ?? {},
  L_Link_Demo: script.R_Research ?? {},
  A_Add_Value: script.P_Persuade ?? {},
  X_Express_Offers: script.T_Transact ?? {},
});

export const transformApiData = (apiData = {}, videoId = "") => {
  const functional = apiData.Functional_Metadata ?? {};
  const technical = functional.Technical_Quality ?? {};
  const customer = apiData.Customer_Information ?? {};
  const profile = customer.Customer_Profile ?? {};
  const interest = customer.Product_Interest ?? {};
  const intent = customer.Purchase_Intent_Analysis ?? {};
  const budget = intent.Budget_Discussion ?? {};
  const perf = apiData.Agent_Performance ?? {};
  const demo = getDemo(perf.Product_Demonstration ?? {});
  const script = mapRelax(perf.SCRIPT_Framework ?? {});
  const soft = perf.Soft_Skills_Evaluation ?? {};
  const summary = apiData.Overall_Summary ?? {};

  const presentabilityReasons = Array.isArray(technical.Agent_Presentability_Reasons)
    ? technical.Agent_Presentability_Reasons.join("; ")
    : technical.Agent_Presentability_Reasons || "";

  return {
    Functional: {
      Call_ID: functional.Call_ID || videoId || "NA",
      Call_Time: functional.Call_Time || "NA",
      Customer_Name: functional.Customer_Name || "NA",
      Agent_Name: functional.Agent_Name || "NA",
      Store_Location: functional.Store_Location || "NA",
      Agent_Presentability: {
        Score: safeNumber(technical.Agent_Presentability_Rating),
        Reason_for_Score: presentabilityReasons,
      },
      Agent_Video_Quality_Rating: safeNumber(technical.Agent_Video_Quality_Rating),
      Agent_Audio_Quality_Rating: safeNumber(technical.Agent_Audio_Quality_Rating),
      Customer_Audio_Quality_Rating: safeNumber(technical.Customer_Audio_Quality_Rating),
      Call_Objective_Theme: functional.Call_Objective_Theme || "",
    },
    Customer_Information: {
      Type_of_Call: customer.Type_of_Call || "NA",
      Interest_Category: interest.Primary_Category || "NA",
      Interest_Product:
        interest.Primary_Product_Focus || interest.Specific_Products_Discussed?.[0] || "NA",
      Intent_to_Buy_Rating: intent.Intent_to_Buy_Rating || "NA",
      Intent_to_Buy_Rating_Reasons: joinReasons(intent.Intent_to_Buy_Reasons),
      Location: profile.Location || "NA",
      Customer_Satisfaction_Score: safeNumber(customer.Customer_Satisfaction_Score),
      Customer_Satisfaction_Score_Reasons: joinReasons(customer.Customer_Satisfaction_Reasons),
    },
    Agent_Areas: {
      Product_Demonstration: demo,
      RELAX_Framework: Object.fromEntries(
        Object.entries(script).map(([key, value]) => [
          key,
          {
            Attempted: Boolean(value.Attempted),
            Rating: safeNumber(value.Rating),
            Reasons: joinReasons(value.Reasons),
          },
        ])
      ),
      SoftSkills: {
        Active_Listening_Rating: safeNumber(soft.Active_Listening_Rating),
        Active_Listening_Reasons: joinReasons(soft.Active_Listening_Reasons),
        Empathy_Rapport_Rating: safeNumber(soft.Empathy_Rapport_Rating),
        Empathy_Rapport_Reasons: joinReasons(soft.Empathy_Rapport_Reasons),
        Clarity_Confidence_Rating: safeNumber(soft.Communication_Clarity_Rating),
        Clarity_Confidence_Reasons: joinReasons(soft.Communication_Clarity_Reasons),
        Objection_Handling_Rating: safeNumber(soft.Objection_Handling_Rating),
        Objection_Handling_Reasons: joinReasons(soft.Objection_Handling_Reasons),
        Top_3_Improvement_Areas: joinReasons(soft.Top_3_Improvement_Areas ?? soft.Adaptability_Reasons),
      },
      Overall_Summary: {
        Chronological_Call_Summary: summary.Chronological_Call_Summary || "",
        Agent_Handling_Summary: summary.Agent_Performance_Summary || "",
        Customer_Satisfaction_Summary: summary.Customer_Journey_Summary || "",
      },
    },
  };
};
