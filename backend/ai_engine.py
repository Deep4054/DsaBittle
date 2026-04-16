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

ANALYZE_PROMPT = """You're a friendly engineer explaining things to a developer friend.

Problem: "{title}"
Tags: {tags}
Description: {description}

Be conversational and helpful. Give enough detail to be useful, but stay grounded.

RULES:
- If simple problem → keep it practical, 3-4 lines per field
- No generic filler like "used in many systems" or "general computation"
- No fake scale drama (1M users, SLA) unless truly relevant
- Be specific to THIS problem
- Friendly tone: "You're basically...", "This shows up when...", "If you get this wrong..."

Return ONLY valid JSON (no markdown, no backticks):
{{
  "whatIsThis": "3-4 friendly lines. Explain what this problem is actually about in plain terms.",
  "realUse": "3-5 lines. Where does this show up in real development work? Be specific and conversational.",
  "whatBreaks": "2-3 lines. What actually goes wrong if you mess this up? Be honest and specific.",
  "pattern": "Short name — e.g. Column Renaming, Hash Lookup, Binary Search",
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
    title = data.title or "this problem"
    tags_lower = [t.lower() for t in (data.tags or [])]

    if any(t in tags_lower for t in ["pandas", "dataframe", "database", "sql"]):
        return {
            "pattern": "Schema Transformation",
            "difficulty": data.difficulty or "Easy",
            "whatIsThis": "You're just renaming fields so systems stay consistent.",
            "realUse": "Happens when your backend sends one format and your frontend or analytics expects another. You map field names so everything downstream works.",
            "whatBreaks": "Wrong column name = missing or blank data in your UI or reports. Nothing crashes, but everything looks broken.",
        }

    if "binary search" in tags_lower:
        return {
            "pattern": "Binary Search",
            "difficulty": data.difficulty or "Medium",
            "whatIsThis": "You're cutting the search space in half each step instead of checking everything.",
            "realUse": "Git bisect uses this to find which commit broke your build. Database indexes use it to find rows fast. Any sorted list lookup.",
            "whatBreaks": "Off-by-one errors cause subtle bugs that only appear at boundaries — easy to miss in testing.",
        }

    if any(t in tags_lower for t in ["hash table", "hash map"]):
        return {
            "pattern": "Hash Map Lookup",
            "difficulty": data.difficulty or "Easy",
            "whatIsThis": "You're trading memory for speed — store what you've seen so you can check it in O(1) instead of scanning again.",
            "realUse": "Checking if a user already exists, finding duplicate transactions, looking up config values — all hash maps under the hood.",
            "whatBreaks": "Naive O(n²) solution works fine at 1K inputs, falls apart at 100K. That's when it becomes a production incident.",
        }

    if any(t in tags_lower for t in ["two pointers", "sliding window"]):
        return {
            "pattern": "Two Pointers" if "two pointers" in tags_lower else "Sliding Window",
            "difficulty": data.difficulty or "Medium",
            "whatIsThis": "You're using two indices to avoid nested loops — one pass instead of checking every pair.",
            "realUse": "Rate limiting windows, finding subarrays in streaming data, deduplication in sorted lists.",
            "whatBreaks": "Nested loop alternative is O(n²) — fine for small inputs, kills performance at scale.",
        }

    if "dynamic programming" in tags_lower:
        return {
            "pattern": "Dynamic Programming",
            "difficulty": data.difficulty or "Medium",
            "whatIsThis": "You're caching subproblem results so you don't recompute them — memoization.",
            "realUse": "Cost optimization, resource allocation, autocomplete suggestions, spell checkers.",
            "whatBreaks": "Recursive solution without memoization hits exponential time — works on small inputs, crashes on real data.",
        }

    return {
        "pattern": "Algorithm",
        "difficulty": data.difficulty or "Unknown",
        "whatIsThis": f"This is a {(data.tags or ['general'])[0].lower()} problem — a building block that shows up in real codebases.",
        "realUse": "You'll hit variations of this in data processing, API design, and system utilities.",
        "whatBreaks": "Getting the logic wrong causes subtle bugs that are hard to trace back to the source.",
    }
