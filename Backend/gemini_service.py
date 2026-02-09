import google.generativeai as genai
import os
import json
import time
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
load_dotenv()

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL_NAME = os.getenv("MODEL", "gemini-1.5-flash")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file")

genai.configure(api_key=GEMINI_API_KEY)


# The comprehensive analysis prompt
ANALYSIS_PROMPT = """You are an expert Assisted Sales Call Analyst specializing in consumer durables and kitchen appliances. You will analyze a video-recorded sales interaction between a Beyond Appliances sales agent and a customer.

Your Task: Watch the entire video carefully and provide a comprehensive analysis following the framework below. Be specific, objective, and provide actionable feedback.

VIDEO ANALYSIS INSTRUCTIONS

Step 1: Watch & Observe
- Watch the video from start to finish without pausing
- Note timestamps for critical moments
- Pay attention to both verbal and non-verbal communication
- Observe technical quality (video, audio, lighting)
- Track customer reactions and engagement levels

Step 2: Analyze Against Framework
Evaluate the call across these dimensions:

A. FUNCTIONAL METADATA
- Extract call details (date, time, duration, participants)
- Rate technical quality (1-5 scale):
  * Agent video quality (resolution, lighting, framing)
  * Agent audio quality (clarity, background noise)
  * Customer audio quality
  * Agent presentability (grooming, attire, posture)
- Note any technical disruptions and how they were handled

B. CUSTOMER INFORMATION
Profile:
- Location (city/region if mentioned)
- Customer type (first-time buyer, repeat, upgrader)
- Kitchen type (modular, traditional, compact)
- Household size and primary cook

Product Interest:
- Primary category (Cooking, Food Prep, Beverage, Cleaning, Storage)
- Specific products discussed
- Primary focus vs secondary exploration

Purchase Intent (HIGH/MEDIUM/LOW):
- HIGH indicators: Transactional language ("How much?", "When delivery?"), urgency, asks about warranty/EMI/payment
- MEDIUM indicators: Feature validation, competitor comparison, budget discussion, taking notes
- LOW indicators: Broad questions, minimal follow-up, vague responses, just browsing

Needs & Pain Points:
- Primary need/problem being solved
- Specific pain points expressed
- Key decision factors (price, energy efficiency, space, brand, service)
- Objections raised

Competitor Mentions:
- Which brands were mentioned?
- Context (price/feature comparison)

Customer Satisfaction (1-5):
- 5: Explicit satisfaction, positive language, warm tone
- 4: Engaged, cooperative, pleasant
- 3: Neutral, transactional
- 2: Impatient, mildly frustrated
- 1: Explicit dissatisfaction, frustrated

C. AGENT PERFORMANCE

Product Demonstration:
If performed, rate (1-5):
- Relevance to customer needs
- Video/audio quality during demo
- Feature highlighting effectiveness
- Benefit translation (feature → benefit)
- Customer engagement during demo

SCRIPT Framework (Rate each 1-5):
- S - Solution Finding (Greeting & Initial Discovery)
  * Professional introduction?
  * Rapport building?
  * Open-ended questions about needs?

- C - Connect (Building Relationship)
  * Asked about kitchen setup/lifestyle?
  * Identified primary user and usage?
  * Built trust through personalization?

- R - Research (Deep Discovery)
  * Probing questions for pain points?
  * Identified must-have vs nice-to-have features?
  * Understood budget and timeline?
  * Asked about decision-makers?

- I - Inform (Product Education)
  * Presented 2-3 relevant options?
  * Explained features simply (no jargon)?
  * Connected features to needs?
  * Provided comparisons when appropriate?

- P - Persuade (Value Proposition)
  * Emphasized Beyond Appliances' unique value?
  * Addressed price objections with ROI?
  * Handled competitor comparisons confidently?
  * Used social proof?

- T - Transact (Closing)
  * Asked for the sale?
  * Explained purchase process/payment/EMI?
  * Discussed delivery and installation?
  * Set clear next steps?

Product Knowledge (Rate 1-5 each):
- Technical knowledge (wattage, capacity, energy ratings)
- Feature-benefit translation
- Competitive knowledge
- After-sales service knowledge (warranty, installation, support)

Cross-Sell/Upsell:
- Was it attempted?
- Was it appropriate and well-timed?
- What products were suggested?
- Customer interest level?

Soft Skills (Rate 1-5 each):
- Active Listening: Didn't interrupt, follow-up questions, paraphrased, good talk-listen ratio
- Empathy & Rapport: Validated concerns, used customer name, genuine interest
- Communication Clarity: Clear pace, avoided jargon, structured info, checked understanding
- Confidence: Knowledge confidence, professional demeanor, handled uncertainty honestly
- Objection Handling: Acknowledged without defensiveness, reframed positively, provided solutions
- Adaptability: Adjusted to customer style, handled issues gracefully, pivoted when needed

Safety & Installation:
- Discussed safety features (ISI mark, auto shut-off, child locks)?
- Explained installation process, charges, timeline, technical requirements?

D. BUSINESS INTELLIGENCE
- Call outcome (Sale closed, Follow-up scheduled, Info provided, Customer declined, etc.)
- Conversion probability (1-5)
- Key selling points that resonated
- Missed opportunities
- Product feedback for product team
- Process improvement suggestions

E. COACHING & DEVELOPMENT
- Top 3 strengths
- Top 3 improvement areas (with specific actionable advice)
- Training needs:
  * Product knowledge gap?
  * Soft skills coaching needed?
  * Demo technique improvement?
  * Objection handling training?
- Immediate follow-up actions for agent

F. SUMMARIES
- Chronological Summary: 4-6 sentences on how the call unfolded
- Agent Performance Summary: 3-4 sentences on strengths and gaps
- Customer Journey Summary: 3-4 sentences on customer experience
- Business Recommendation: Strategic next step based on this interaction

G. AGGREGATE SCORES
- Overall Call Quality Score (1-5)
- Agent Performance Score (1-5)
- Customer Experience Score (1-5)

OUTPUT FORMAT
Provide your analysis as a valid JSON object following this exact structure. Use specific observations and timestamps where possible:

{
  "Functional_Metadata": {
    "Call_ID": "",
    "Call_Date": "",
    "Call_Time": "",
    "Call_Duration_Minutes": 0,
    "Customer_Name": "",
    "Agent_Name": "",
    "Agent_ID": "",
    "Store_Location": "",
    "Technical_Quality": {
      "Agent_Video_Quality_Rating": 0,
      "Agent_Audio_Quality_Rating": 0,
      "Customer_Audio_Quality_Rating": 0,
      "Agent_Presentability_Rating": 0,
      "Agent_Presentability_Reasons": [""],
      "Technical_Issues_Encountered": "",
      "Technical_Issues_Details": ""
    },
    "Call_Objective_Theme": ""
  },
  "Customer_Information": {
    "Type_of_Call": "",
    "Customer_Profile": {
      "Location": "",
      "Customer_Type": "",
      "Kitchen_Type": "",
      "Household_Size": "",
      "Primary_Cook": ""
    },
    "Product_Interest": {
      "Primary_Category": "",
      "Specific_Products_Discussed": [""],
      "Primary_Product_Focus": "",
      "Secondary_Products_Explored": [""]
    },
    "Purchase_Intent_Analysis": {
      "Intent_to_Buy_Rating": "",
      "Intent_to_Buy_Reasons": [""],
      "Purchase_Timeline": "",
      "Budget_Discussion": {
        "Budget_Mentioned": false,
        "Budget_Range": "",
        "Price_Sensitivity_Rating": 0,
        "Price_Sensitivity_Indicators": ""
      }
    },
    "Customer_Needs_Pain_Points": {
      "Primary_Need": "",
      "Pain_Points_Expressed": [""],
      "Key_Decision_Factors": [""],
      "Objections_Raised": [""]
    },
    "Competitor_Mentions": {
      "Competitors_Discussed": false,
      "Competitor_Brands": [""],
      "Comparison_Context": ""
    },
    "Customer_Satisfaction_Score": 0,
    "Customer_Satisfaction_Reasons": [""],
    "Top_Customer_Questions": [""]
  },
  "Agent_Performance": {
    "Product_Demonstration": {
      "Done": false,
      "Quality_Rating": 0,
      "Quality_Reasons": [""],
      "Demonstration_Execution": {
        "Relevance_Rating": 0,
        "Relevance_Reason": "",
        "Video_Audio_Quality_During_Demo": 0,
        "Video_Audio_Quality_Reason": "",
        "Feature_Highlighting_Rating": 0,
        "Feature_Highlighting_Reason": "",
        "Effectiveness_Rating": 0,
        "Effectiveness_Reason": "",
        "Customer_Engagement_Rating": 0,
        "Customer_Engagement_Reason": ""
      },
      "Props_Aids_Used": [""],
      "Props_Effectiveness_Rating": 0
    },
    "SCRIPT_Framework": {
      "S_Solution_Finding": {
        "Attempted": false,
        "Rating": 0,
        "Reasons": [""]
      },
      "C_Connect": {
        "Attempted": false,
        "Rating": 0,
        "Reasons": [""]
      },
      "R_Research": {
        "Attempted": false,
        "Rating": 0,
        "Reasons": [""]
      },
      "I_Inform": {
        "Attempted": false,
        "Rating": 0,
        "Reasons": [""]
      },
      "P_Persuade": {
        "Attempted": false,
        "Rating": 0,
        "Reasons": [""]
      },
      "T_Transact": {
        "Attempted": false,
        "Rating": 0,
        "Reasons": [""]
      }
    },
    "Product_Knowledge_Assessment": {
      "Technical_Knowledge_Rating": 0,
      "Technical_Knowledge_Reasons": [""],
      "Feature_Benefit_Translation_Rating": 0,
      "Feature_Benefit_Translation_Reasons": [""],
      "Competitive_Knowledge_Rating": 0,
      "Competitive_Knowledge_Reasons": [""],
      "After_Sales_Service_Knowledge_Rating": 0,
      "After_Sales_Service_Knowledge_Reasons": [""]
    },
    "Cross_Sell_Upsell_Performance": {
      "Attempted": false,
      "Appropriateness_Rating": 0,
      "Appropriateness_Reason": "",
      "Products_Suggested": [""],
      "Success": ""
    },
    "Soft_Skills_Evaluation": {
      "Active_Listening_Rating": 0,
      "Active_Listening_Reasons": [""],
      "Empathy_Rapport_Rating": 0,
      "Empathy_Rapport_Reasons": [""],
      "Communication_Clarity_Rating": 0,
      "Communication_Clarity_Reasons": [""],
      "Confidence_Professionalism_Rating": 0,
      "Confidence_Professionalism_Reasons": [""],
      "Objection_Handling_Rating": 0,
      "Objection_Handling_Reasons": [""],
      "Adaptability_Rating": 0,
      "Adaptability_Reasons": [""]
    },
    "Safety_Compliance_Mentions": {
      "Discussed": false,
      "Details": "",
      "Rating": 0
    },
    "Installation_Service_Discussion": {
      "Discussed": false,
      "Details": "",
      "Rating": 0
    }
  },
  "Business_Intelligence": {
    "Call_Outcome": "",
    "Conversion_Probability_Rating": 0,
    "Conversion_Probability_Reason": "",
    "Key_Selling_Points_That_Resonated": [""],
    "Missed_Opportunities": [""],
    "Product_Feedback": [""],
    "Process_Improvement_Suggestions": [""]
  },
  "Coaching_Development": {
    "Top_3_Strengths": [""],
    "Top_3_Improvement_Areas": [""],
    "Training_Needs_Identified": {
      "Product_Knowledge": false,
      "Soft_Skills": false,
      "Technical_Demo": false,
      "Objection_Handling": false,
      "Specific_Focus_Areas": [""]
    },
    "Follow_Up_Actions": [""]
  },
  "Overall_Summary": {
    "Chronological_Call_Summary": "",
    "Agent_Performance_Summary": "",
    "Customer_Journey_Summary": "",
    "Business_Recommendation": ""
  },
  "Aggregate_Scores": {
    "Overall_Call_Quality_Score": 0,
    "Agent_Performance_Score": 0,
    "Customer_Experience_Score": 0
  }
}

CRITICAL RULES:
1. Be Specific: Every rating must be justified with specific observations from the video
2. Use Timestamps: Reference specific moments when noting strengths or issues
3. Actionable Feedback: Provide concrete, actionable recommendations
4. Objective Tone: Focus on observable behaviors
5. Valid JSON: Ensure all JSON syntax is correct
6. Complete Analysis: Fill all sections; use null or "Not Applicable" if information unavailable
7. Rating Consistency: Use 1-5 scale consistently (1=Poor, 2=Below Average, 3=Average, 4=Good, 5=Excellent)

Return ONLY the JSON object, no additional text."""


def upload_video_to_gemini(video_path: str):
    """
    Upload video file to Gemini API
    
    Args:
        video_path: Path to video file
    
    Returns:
        Uploaded file object
    """
    print(f"Uploading video to Gemini: {video_path}")
    
    # Upload the file
    video_file = genai.upload_file(path=video_path)
    print(f"Upload complete! File URI: {video_file.uri}")
    
    # Wait for the file to be processed
    print("Waiting for video processing...")
    while video_file.state.name == "PROCESSING":
        time.sleep(2)
        video_file = genai.get_file(video_file.name)
    
    if video_file.state.name == "FAILED":
        raise ValueError(f"Video processing failed: {video_file.state.name}")
    
    print(f"Video processed successfully! State: {video_file.state.name}")
    return video_file


def analyze_video_with_gemini(video_path: str) -> dict:
    """
    Analyze video using Gemini API
    
    Args:
        video_path: Path to video file
    
    Returns:
        Analysis result as dictionary
    """
    try:
        # Upload video to Gemini
        video_file = upload_video_to_gemini(video_path)
        
        # Create the model
        model = genai.GenerativeModel(model_name=MODEL_NAME)
        
        print("Sending analysis request to Gemini...")
        
        # Generate content with video and prompt
        response = model.generate_content(
            [video_file, ANALYSIS_PROMPT],
            request_options={"timeout": 600}  # 10 minute timeout
        )
        
        print("Analysis complete! Processing response...")
        
        # Extract JSON from response
        response_text = response.text
        
        # Clean up response (remove markdown code blocks if present)
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        
        # Parse JSON
        analysis_result = json.loads(response_text)
        
        print("✓ Analysis successful!")
        return analysis_result
        
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON response: {e}")
        print(f"Response text: {response_text[:500]}...")
        raise Exception(f"Failed to parse Gemini response as JSON: {str(e)}")
    
    except Exception as e:
        print(f"Error during Gemini analysis: {str(e)}")
        raise Exception(f"Gemini analysis failed: {str(e)}")


if __name__ == "__main__":
    # Test configuration
    print("Testing Gemini API configuration...")
    print(f"API Key configured: {bool(GEMINI_API_KEY)}")
    print(f"Model: {MODEL_NAME}")
    
    # List available models
    try:
        print("\nAvailable models:")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"  - {m.name}")
    except Exception as e:
        print(f"Could not list models: {e}")
