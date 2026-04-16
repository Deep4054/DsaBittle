import os
import json
import re
import logging
from openai import AsyncOpenAI
from dotenv import load_dotenv
from models import ProblemInput

load_dotenv()
logger = logging.getLogger("dsa-engine")

_client: AsyncOpenAI | None = None

def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("NVIDIA_NIM_API_KEY")
        if not api_key:
            raise RuntimeError("NVIDIA_NIM_API_KEY is not set.")
        _client = AsyncOpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=api_key,
        )
    return _client

FAST_MODEL  = "meta/llama-3.1-8b-instruct"
POWER_MODEL = "meta/llama-3.3-70b-instruct"


# ─────────────────────────────────────────────
# MAIN PROMPT — ChatGPT casual, honest, no template
# ─────────────────────────────────────────────

ANALYZE_PROMPT = """You're explaining this problem to your friend who is coding with you.

Problem: "{title}"
Tags: {tags}
Description: {description}

Your goal: Make the user say — "haan bhai ab samajh aaya ye kyun kar rahe hai"

STRICT RULES:
- Talk ONLY about THIS problem (not generic patterns)
- Give REAL developer scenario (API, DB, frontend, logs, etc.)
- NO lines like "used in many systems", "general computation"
- NO fake scale drama (1M users, SLA) unless truly needed
- Keep it simple, practical, grounded
- Tone: like explaining to your friend (casual, direct)

Return ONLY JSON:
{{
  "whatIsThis": "Explain simply what we're doing here and why this even exists.",
  "realUse": "REAL dev use case. Example: backend to frontend mismatch, API rename, data cleaning, etc.",
  "whyThisApproach": "Why THIS method is used instead of something else. What makes it correct here?",
  "whatBreaks": "What exactly goes wrong in real code if you mess this up.",
  "pattern": "Short name",
  "difficulty": "{difficulty}"
}}"""


DEEPER_PROMPT = """Same vibe — casual dev explaining to another dev.

Problem: "{title}"
Pattern: {pattern}

Return ONLY valid JSON (no markdown, no backticks):
{{
  "timeComplexity": "Big-O with one casual line why.",
  "spaceComplexity": "Big-O with one line on why space matters here.",
  "systemDesignConnection": "2-3 casual sentences. Where does this show up in real system design?",
  "edgeCases": [
    "Write as a sentence, not a label. What actually breaks.",
    "Another real edge case for this specific problem.",
    "A constraint-specific case."
  ],
  "followUpProblems": ["Actual LeetCode problem names that extend this"],
  "mentalModel": "2-3 sentences. Core intuition, casual and visual."
}}"""


DAILY_REPORT_PROMPT = """You are a practical DSA coach. Be honest and data-driven.

Student Stats:
{stats}

Recent Problems (last {count}):
{recent_history}

Return ONLY valid JSON:
{{
  "overallAssessment": "2-3 sentences referencing their actual numbers.",
  "strongTopics": ["Most-solved topic", "Second", "Third if applicable"],
  "weakTopics": ["Least practiced", "Second weakest", "Third if applicable"],
  "insight": "One specific data-driven observation about their practice pattern.",
  "recommendation": "Specific next step — what to practice and why.",
  "motivationalMessage": "Short, genuine, references something specific from their data.",
  "predictedLevel": "Beginner / Apprentice / Intermediate / Advanced / Expert"
}}"""


# ─────────────────────────────────────────────
# JSON PARSER
# ─────────────────────────────────────────────

def parse_json_response(raw: str) -> dict:
    raw = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON. Raw (first 300): {raw[:300]}")


# ─────────────────────────────────────────────
# AI FUNCTIONS
# ─────────────────────────────────────────────

async def analyze_problem(data: ProblemInput) -> dict:
    tags_str = ", ".join(data.tags) if data.tags else "none"
    desc_str = (data.description or "")[:600]

    prompt = ANALYZE_PROMPT.format(
        title=data.title,
        difficulty=data.difficulty or "Unknown",
        tags=tags_str,
        description=desc_str,
    )

    try:
        response = await _get_client().chat.completions.create(
            model=POWER_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are a developer answering casually. Respond with valid JSON only. No markdown, no backticks.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            max_tokens=900,
        )
        raw = response.choices[0].message.content.strip()
        return parse_json_response(raw)

    except Exception as e:
        logger.warning(f"analyze_problem failed ({type(e).__name__}: {e}) — returning fallback")
        return _fallback_analysis(data)


async def get_deeper_explanation(title: str, pattern: str) -> dict:
    prompt = DEEPER_PROMPT.format(title=title, pattern=pattern or "General")

    try:
        response = await _get_client().chat.completions.create(
            model=FAST_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "Respond with valid JSON only. No markdown, no backticks.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=800,
        )
        raw = response.choices[0].message.content.strip()
        return parse_json_response(raw)

    except Exception as e:
        logger.warning(f"get_deeper_explanation failed ({type(e).__name__}: {e}) — returning fallback")
        return {
            "timeComplexity": "Unavailable — try again",
            "spaceComplexity": "Unavailable — try again",
            "systemDesignConnection": "AI temporarily unavailable. Refresh to retry.",
            "edgeCases": ["Empty input", "Single element", "Maximum constraint value"],
            "followUpProblems": ["Related problem on LeetCode"],
            "mentalModel": "Break the problem into its core constraint, then find the most direct path."
        }


async def generate_daily_report(history: list, stats: dict) -> dict:
    recent = history[:10]
    count = len(recent)

    stats_summary = {
        "totalSolved": stats.get("totalSolved", 0),
        "easy": stats.get("easy", 0),
        "medium": stats.get("medium", 0),
        "hard": stats.get("hard", 0),
        "streak": stats.get("streak", 0),
        "xp": stats.get("xp", 0),
        "level": stats.get("level", "Beginner"),
        "topTags": _get_top_tags(stats.get("tagStats", {})),
        "slowestTags": _get_slowest_tags(stats.get("tagStats", {})),
    }

    simple_history = [
        {
            "title": item.get("title"),
            "difficulty": item.get("difficulty"),
            "tags": item.get("tags", [])[:3],
            "timeSpentMinutes": round(item.get("timeSpent", 0) / 60, 1),
        }
        for item in recent
    ]

    prompt = DAILY_REPORT_PROMPT.format(
        stats=json.dumps(stats_summary, indent=2),
        recent_history=json.dumps(simple_history, indent=2),
        count=count,
    )

    try:
        response = await _get_client().chat.completions.create(
            model=FAST_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "Respond with valid JSON only. No markdown, no backticks.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.6,
            max_tokens=700,
        )
        raw = response.choices[0].message.content.strip()
        return parse_json_response(raw)

    except Exception as e:
        logger.warning(f"generate_daily_report failed ({type(e).__name__}: {e}) — returning fallback")
        total = stats_summary["totalSolved"]
        streak = stats_summary["streak"]
        return {
            "overallAssessment": f"You've solved {total} problems with a {streak}-day streak. Keep going.",
            "strongTopics": ["Array", "String", "Hash Map"],
            "weakTopics": ["Dynamic Programming", "Graph", "Tree"],
            "insight": "Consistency beats intensity — your streak shows you're building the habit.",
            "recommendation": "Try one medium problem per day in your weakest topic.",
            "motivationalMessage": f"{streak} day streak — that's real discipline.",
            "predictedLevel": stats_summary.get("level", "Beginner"),
        }


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _get_top_tags(tag_stats: dict, n: int = 3) -> list:
    sorted_tags = sorted(tag_stats.items(), key=lambda x: x[1].get("count", 0), reverse=True)
    return [{"tag": k, "count": v.get("count", 0)} for k, v in sorted_tags[:n]]


def _get_slowest_tags(tag_stats: dict, n: int = 3) -> list:
    sorted_tags = sorted(
        [(k, v) for k, v in tag_stats.items() if v.get("count", 0) >= 2],
        key=lambda x: x[1].get("avgTime", 0),
        reverse=True,
    )
    return [{"tag": k, "avgTimeMinutes": round(v.get("avgTime", 0) / 60, 1)} for k, v in sorted_tags[:n]]


def _fallback_analysis(data: ProblemInput) -> dict:
    title = (data.title or "").lower()
    tags = [t.lower() for t in (data.tags or [])]

    # Pandas / DataFrame
    if "rename columns" in title or "rename" in title or "pandas" in tags or "dataframe" in tags:
        return {
            "pattern": "Column Mapping",
            "difficulty": data.difficulty or "Easy",
            "whatIsThis": "You're just renaming columns in a table so the rest of your code understands the data properly.",
            "realUse": "Suppose your backend API sends 'first' and 'last', but your frontend or analytics expects 'first_name' and 'last_name'. You rename columns once so everything downstream works without breaking.",
            "whyThisApproach": "Direct renaming is clean and constant time. Alternative would be copying data or manually mapping everywhere, which is messy and error-prone.",
            "whatBreaks": "Wrong column names means your UI shows blank data, filters stop working, or joins fail silently. Debugging becomes painful because data exists but names don't match.",
        }

    # Binary search
    if "binary search" in tags or "search" in title:
        return {
            "pattern": "Binary Search",
            "difficulty": data.difficulty or "Medium",
            "whatIsThis": "You're cutting the search space in half each step instead of checking everything linearly.",
            "realUse": "Git bisect uses this to find which commit broke your build. Database indexes use it to find rows fast. Any sorted list lookup — package tracking, version history, finding thresholds.",
            "whyThisApproach": "On sorted data, binary search is O(log n) vs O(n) linear scan. That's 20 steps vs 1 million steps for a million items.",
            "whatBreaks": "Off-by-one errors cause subtle bugs that only appear at boundaries. Easy to miss in testing, shows up in production.",
        }

    # Hash table
    if any(t in tags for t in ["hash table", "hash map"]) or "two sum" in title:
        return {
            "pattern": "Hash Map Lookup",
            "difficulty": data.difficulty or "Easy",
            "whatIsThis": "You're trading memory for speed — store what you've seen so you can check it in O(1) instead of scanning again.",
            "realUse": "Checking if a user already exists, finding duplicate transactions, looking up config values — all hash maps under the hood. Session management, caching, deduplication.",
            "whyThisApproach": "Hash map gives O(1) lookup. Alternative is nested loop which is O(n²) — fine for 100 items, kills performance at 10K+.",
            "whatBreaks": "Naive O(n²) solution works fine in testing with small inputs, falls apart in production with real data volume. That's when it becomes a latency incident.",
        }

    # Two pointers / sliding window
    if any(t in tags for t in ["two pointers", "sliding window"]):
        return {
            "pattern": "Two Pointers" if "two pointers" in tags else "Sliding Window",
            "difficulty": data.difficulty or "Medium",
            "whatIsThis": "You're using two indices to avoid nested loops — one pass instead of checking every pair.",
            "realUse": "Rate limiting windows, finding subarrays in streaming data, deduplication in sorted lists. Anywhere you need to track a range or window of elements.",
            "whyThisApproach": "Single pass O(n) vs nested loop O(n²). Makes the difference between responsive and slow when data size grows.",
            "whatBreaks": "Nested loop alternative works on small inputs, kills performance at scale. Also easy to get pointer logic wrong and miss edge cases.",
        }

    # Dynamic programming
    if "dynamic programming" in tags or "dp" in tags:
        return {
            "pattern": "Dynamic Programming",
            "difficulty": data.difficulty or "Medium",
            "whatIsThis": "You're caching subproblem results so you don't recompute them — memoization to avoid exponential blowup.",
            "realUse": "Cost optimization, resource allocation, autocomplete suggestions, spell checkers. Anywhere you have overlapping subproblems.",
            "whyThisApproach": "Memoization turns exponential time into polynomial. Without it, recursive solution crashes on inputs larger than 20-30.",
            "whatBreaks": "Recursive solution without memoization hits exponential time — works on tiny inputs in testing, times out or crashes on real data.",
        }

    # Generic fallback — still honest
    return {
        "pattern": "Data Transformation",
        "difficulty": data.difficulty or "Unknown",
        "whatIsThis": f"This problem is about transforming data into the format you actually need before using it.",
        "realUse": "In real code, raw data rarely matches your expected format. You often need to rename, filter, or reshape it before using it in APIs, UI, or analytics.",
        "whyThisApproach": "Doing transformation once upfront keeps the rest of your code clean and consistent. Alternative is handling mismatches everywhere.",
        "whatBreaks": "If you skip this, you end up with mismatched data causing silent bugs — UI shows blanks, joins fail, filters break.",
    }
