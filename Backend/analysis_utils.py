from typing import Any


def is_failed_analysis(analysis: Any) -> bool:
    """Return True if analysis is missing or indicates a failed/partial result."""
    if analysis is None or not isinstance(analysis, dict):
        return True

    if analysis.get("error"):
        return True

    if analysis.get("parse_error"):
        return True

    if analysis.get("error_details"):
        return True

    overall = analysis.get("Overall_Summary")
    if isinstance(overall, dict):
        summary = overall.get("Chronological_Call_Summary")
        if isinstance(summary, str) and summary.strip().lower().startswith("failed:"):
            return True

    summary = analysis.get("Chronological_Call_Summary")
    if isinstance(summary, str) and summary.strip().lower().startswith("failed:"):
        return True

    return False
