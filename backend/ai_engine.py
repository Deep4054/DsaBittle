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

ANALYZE_PROMPT = """You are a developer answering a friend's question: "why would I actually need to solve this problem in real life?"

Problem: "{title}"
Tags: {tags}
Description: {description}

Answer like you're chatting — casual, honest, specific. Think about what this problem is ACTUALLY about:
- Is it about renaming/mapping data? Talk about schema mismatches, broken dashboards, API contracts.
- Is it about searching efficiently? Talk about where search actually matters.
- Is it about counting/grouping? Talk about analytics, reporting, aggregation.
- Is it a simple utility? Keep it simple. Don't invent drama.

RULES:
- Do NOT mention 1M inputs, SLA, latency unless it genuinely applies
- Do NOT say "general computation" or "core problem solving" — that's filler
- If the problem is simple, say so and explain the simple real use case
- Be specific to THIS problem, not the category
- Short answers are better than padded ones
- Write like a human, not a template

Return ONLY valid JSON (no markdown, no backticks):
{{
  "pattern": "Short specific name — e.g. Column Renaming, Hash Lookup, BFS Traversal",
  "difficulty": "{difficulty}",
  "realWorldStory": "2-3 casual sentences. Where does this exact thing show up? Be specific to the problem.",
  "whyItHurts": "1-2 sentences. What actually breaks if you get this wrong? Match the problem — data bugs for data problems, perf for algo problems.",
  "casualUseCase": "2-3 sentences. Real scenarios, grounded. No fake scale drama.",
  "whySolveIt": "1 sentence. Honest reason.",
  "companiesContext": "1 sentence. Which teams deal with this.",
  "companies": ["4-5 real company names"],
  "costOfGettingWrong": "1 short sentence.",
  "skillYouGain": "1 short sentence."
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
    """Smart fallback — problem-type aware, no generic filler."""
    title = data.title or "this problem"
    tags_lower = [t.lower() for t in (data.tags or [])]

    # Data/pandas problems
    if any(t in tags_lower for t in ["pandas", "dataframe", "database", "sql"]):
        return {
            "pattern": "Schema Transformation",
            "difficulty": data.difficulty or "Easy",
            "realWorldStory": "This shows up when your backend and frontend don't agree on field names. One service sends 'first', another expects 'first_name'. Nothing crashes — your UI just shows empty data.",
            "whyItHurts": "It's not a crash, it's silent wrong data. Those bugs take longer to find than any exception.",
            "casualUseCase": "APIs, dashboards, ETL jobs — everywhere data moves between systems, naming mismatches cause issues. You rename once here, everything downstream works.",
            "whySolveIt": "Because systems rely on consistent data contracts, and this is how you enforce them.",
            "companiesContext": "Backend and data teams deal with this daily — especially when integrating third-party APIs.",
            "companies": ["Google", "Stripe", "Airbnb", "Meta", "Shopify"],
            "costOfGettingWrong": "Wrong column name = missing or incorrect data in your UI or reports.",
            "skillYouGain": "You learn to think in data contracts, not just code.",
        }

    # Binary search
    if "binary search" in tags_lower:
        return {
            "pattern": "Binary Search",
            "difficulty": data.difficulty or "Medium",
            "realWorldStory": "Every time you search for something in a sorted list — package tracking, version lookup, finding a threshold — binary search is running. It's the reason search feels instant.",
            "whyItHurts": "Linear scan on a sorted list of 1M items takes forever. Binary search does it in 20 steps. That's the difference between a fast app and a timeout.",
            "casualUseCase": "Git bisect uses this to find which commit broke your build. Database indexes use it to find rows. Even your phone's contact search uses it.",
            "whySolveIt": "It's the most fundamental 'work smarter not harder' algorithm — shows up everywhere sorted data exists.",
            "companiesContext": "Any team with large sorted datasets — search, databases, version control, pricing engines.",
            "companies": ["Google", "Amazon", "Microsoft", "Uber", "Netflix"],
            "costOfGettingWrong": "Off-by-one errors in binary search cause subtle bugs that only appear at boundaries.",
            "skillYouGain": "You start seeing sorted data as an opportunity to skip work, not just iterate through it.",
        }

    # Hash table / two sum style
    if any(t in tags_lower for t in ["hash table", "hash map"]):
        return {
            "pattern": "Hash Map Lookup",
            "difficulty": data.difficulty or "Easy",
            "realWorldStory": "This is the O(1) lookup pattern — it shows up in deduplication, session management, cache validation. When the naive O(n²) solution ships, lookup latency becomes a bottleneck and it becomes someone's on-call incident.",
            "whyItHurts": "Works fine at 1K inputs. Push it to 100K and you'll see latency spikes. That's when it goes from a code review comment to a production incident.",
            "casualUseCase": "Checking if a user already exists, finding duplicate transactions, looking up config values — all of these use hash maps under the hood.",
            "whySolveIt": "Companies ask this to see if you know when brute force will kill you in prod.",
            "companiesContext": "Any team running at scale — fintech, e-commerce, infra — has written a version of this.",
            "companies": ["Google", "Uber", "Stripe", "Amazon", "Airbnb"],
            "costOfGettingWrong": "Naive O(n²) solution hits a wall at 10K–100K inputs.",
            "skillYouGain": "You'll spot O(1) lookup opportunities before they become bottlenecks.",
        }

    # Generic fallback — still honest
    return {
        "pattern": "Core Algorithm",
        "difficulty": data.difficulty or "Unknown",
        "realWorldStory": f"'{title}' is a building block that shows up in real systems more than you'd expect. The exact scenario depends on the context, but the pattern is reusable.",
        "whyItHurts": "Getting the logic wrong here causes subtle bugs that are hard to trace back to the source.",
        "casualUseCase": "This type of problem appears in data processing, API design, and system utilities — anywhere you need to transform or search through structured data.",
        "whySolveIt": "It builds the intuition for recognizing similar patterns in production code.",
        "companiesContext": "Engineering teams across the industry encounter variations of this regularly.",
        "companies": ["Google", "Amazon", "Microsoft", "Meta", "Apple"],
        "costOfGettingWrong": "Incorrect logic leads to wrong results that may not surface until production.",
        "skillYouGain": "You build pattern recognition that transfers to real codebase problems.",
    }
