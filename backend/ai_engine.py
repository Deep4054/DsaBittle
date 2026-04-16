# ai_engine.py — NVIDIA NIM AI Engine for DSA Dopamine Engine

import os
import json
import re
from openai import AsyncOpenAI
from dotenv import load_dotenv
from models import ProblemInput

load_dotenv()

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

FAST_MODEL  = "meta/llama-3.3-70b-instruct"
POWER_MODEL = "meta/llama-3.3-70b-instruct"


# ─────────────────────────────────────────────
# PROMPTS — Problem-specific, not pattern-generic
# ─────────────────────────────────────────────

ANALYZE_PROMPT = """You are a world-class software engineer and DSA coach.
Your job is to make THIS SPECIFIC problem feel alive and meaningful — not give generic pattern advice.

Problem: "{title}"
Difficulty: {difficulty}
Tags: {tags}
Description: {description}

Think deeply about THIS problem specifically:
- What is the EXACT real-world scenario where this problem's solution is used?
- Not "binary search is used in databases" — but specifically what "{title}" computes and where THAT computation matters
- Connect the actual algorithm to actual production code in actual products

Return ONLY valid JSON (no markdown, no explanation):
{{
  "pattern": "Precise pattern name for this specific problem",
  "whySolveThis": "2-3 sentences specific to '{title}' — what insight does solving THIS problem give you? What class of problems does it unlock? Be concrete, not generic.",
  "realWorldConnection": "The single most direct real-world use of THIS problem's exact computation. Example for Sqrt(x): 'Every graphics engine uses integer square root to compute pixel distances in collision detection — Unity, Unreal, and game physics engines call this thousands of times per frame.' Be THIS specific.",
  "whereUsed": [
    "SPECIFIC PRODUCT: exactly how THIS problem's algorithm is used inside it — not the pattern, but this exact computation",
    "SPECIFIC PRODUCT: another concrete use of this exact problem's solution in production",
    "SPECIFIC PRODUCT: a third real use that would surprise most developers"
  ],
  "whyCompaniesAsk": "2-3 sentences: what THIS specific problem reveals about a candidate — not generic 'tests fundamentals' but what thinking pattern, edge case awareness, or optimization insight it exposes.",
  "companies": ["5 real companies known to ask problems exactly like this one"],
  "analogy": "One vivid real-world analogy SPECIFIC to this problem's algorithm. Not a generic binary search analogy — make it about what '{title}' actually computes.",
  "difficulty": "{difficulty}"
}}

CRITICAL RULES:
- Every field must be about "{title}" specifically, not about the general pattern
- whereUsed items must name real products and explain the EXACT use of this computation
- The analogy must be unique to this problem, not reusable for other problems
- Return ONLY valid JSON"""


DEEPER_PROMPT = """You are a senior engineer doing a deep technical review of one specific problem.

Problem: "{title}"
Pattern: {pattern}

Think about THIS problem's unique characteristics:
- What are the edge cases specific to "{title}" (not generic edge cases)
- What system design scenario uses THIS exact computation
- What follow-up problems build DIRECTLY on "{title}"

Return ONLY valid JSON:
{{
  "timeComplexity": "Big-O for the optimal solution to '{title}' with a one-line justification",
  "spaceComplexity": "Big-O with justification specific to this problem's constraints",
  "systemDesignConnection": "2-3 sentences: a real distributed system or production scenario where '{title}' exact computation appears. Name the actual system and explain why this specific algorithm is needed there.",
  "edgeCases": [
    "Edge case specific to '{title}' constraints (e.g. input = 0, input = 1, overflow)",
    "A non-obvious edge case that trips up candidates on this exact problem",
    "A third edge case related to this problem's specific constraints"
  ],
  "followUpProblems": [
    "A harder LeetCode problem that directly extends '{title}'",
    "A related problem that uses the same core insight differently"
  ],
  "mentalModel": "2-3 sentences: the exact mental model for '{title}' specifically — how an experienced engineer thinks about this problem the moment they see it, what they recognize, and how they approach it."
}}"""


DAILY_REPORT_PROMPT = """You are a world-class DSA coach analyzing a developer's actual practice data.
Be specific, data-driven, and brutally honest.

Student Stats:
{stats}

Recent Problems Solved (last {count}):
{recent_history}

Return ONLY valid JSON:
{{
  "overallAssessment": "2-3 sentences referencing their ACTUAL numbers — total solved, streak, difficulty split. Be specific and honest.",
  "strongTopics": ["Their most-solved topic", "Second strongest", "Third if applicable"],
  "weakTopics": ["Topic with fewest attempts or worst time", "Second weakest", "Third if applicable"],
  "insight": "ONE specific data-driven insight referencing their actual stats. Example: 'You solve Easy 3x faster than Medium — the bottleneck is DP pattern recognition, not coding speed.'",
  "recommendation": "Specific next step: exact problem type or LeetCode problem name, and why based on their data gaps.",
  "motivationalMessage": "Short genuine message referencing something specific from their data — streak, a hard problem they solved, or growth.",
  "predictedLevel": "Beginner / Apprentice / Intermediate / Advanced / Expert — based on their actual data"
}}"""


# ─────────────────────────────────────────────
# JSON PARSER
# ─────────────────────────────────────────────

def parse_json_response(raw: str) -> dict:
    raw = raw.strip()
    cleaned = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
    cleaned = re.sub(r'\s*```$', '', cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    match = re.search(r'\{[\s\S]*\}', cleaned)
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
    tags_str = ", ".join(data.tags) if data.tags else "not provided"
    desc_str = (data.description or "")[:800]

    prompt = ANALYZE_PROMPT.format(
        title=data.title,
        difficulty=data.difficulty or "Unknown",
        tags=tags_str,
        description=desc_str,
    )

    try:
        response = await _get_client().chat.completions.create(
            model=FAST_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert DSA teacher. "
                        "Always respond with valid JSON only. "
                        "Make every response specific to the exact problem asked — never give generic pattern advice."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.75,
            max_tokens=900,
        )
        raw = response.choices[0].message.content.strip()
        return parse_json_response(raw)

    except Exception as e:
        import logging
        logging.getLogger("dsa-engine").warning(
            f"analyze_problem failed ({type(e).__name__}: {e}) — returning fallback"
        )
        return _fallback_analysis(data)


async def get_deeper_explanation(title: str, pattern: str) -> dict:
    prompt = DEEPER_PROMPT.format(title=title, pattern=pattern or "General")

    try:
        response = await _get_client().chat.completions.create(
            model=POWER_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior FAANG engineer doing interview prep. "
                        "Respond with valid JSON only. "
                        "Every answer must be specific to the exact problem, not generic."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
            max_tokens=1000,
        )
        raw = response.choices[0].message.content.strip()
        return parse_json_response(raw)

    except Exception as e:
        import logging
        logging.getLogger("dsa-engine").warning(
            f"get_deeper_explanation failed ({type(e).__name__}: {e}) — returning fallback"
        )
        return {
            "timeComplexity": "Analysis unavailable — try again",
            "spaceComplexity": "Analysis unavailable — try again",
            "systemDesignConnection": "AI analysis temporarily unavailable. Refresh to retry.",
            "edgeCases": ["Input = 0", "Input = 1", "Maximum integer value (overflow check)"],
            "followUpProblems": ["Valid Perfect Square (LeetCode 367)", "Pow(x, n) (LeetCode 50)"],
            "mentalModel": "Identify the search space, define the condition, then binary search on the answer."
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
            "pattern": item.get("pattern", ""),
        }
        for item in recent
    ]

    prompt = DAILY_REPORT_PROMPT.format(
        stats=json.dumps(stats_summary, indent=2),
        recent_history=json.dumps(simple_history, indent=2),
        count=count,
    )

    response = await _get_client().chat.completions.create(
        model=POWER_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You are a world-class DSA coach. Be specific and data-driven. Respond with valid JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.65,
        max_tokens=800,
    )

    raw = response.choices[0].message.content.strip()
    return parse_json_response(raw)


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
    return [
        {"tag": k, "avgTimeMinutes": round(v.get("avgTime", 0) / 60, 1)}
        for k, v in sorted_tags[:n]
    ]


def _fallback_analysis(data: ProblemInput) -> dict:
    """Fallback when AI is unavailable — still tries to be problem-specific."""
    title = data.title or "this problem"
    tags_lower = [t.lower() for t in (data.tags or [])]

    pattern_map = {
        "binary search": "Binary Search on Answer",
        "math": "Mathematical Computation",
        "two pointers": "Two Pointers",
        "dynamic programming": "Dynamic Programming",
        "graph": "Graph Traversal",
        "tree": "Tree Traversal",
        "sliding window": "Sliding Window",
        "hash table": "Hash Map",
        "stack": "Stack / Monotonic Stack",
        "heap": "Priority Queue",
        "linked list": "Linked List",
        "string": "String Processing",
        "backtracking": "Backtracking",
        "greedy": "Greedy",
        "array": "Array Traversal",
    }

    pattern = "General Problem Solving"
    for key, val in pattern_map.items():
        if any(key in t for t in tags_lower):
            pattern = val
            break

    return {
        "pattern": pattern,
        "difficulty": data.difficulty or "Unknown",
        "whySolveThis": (
            f"'{title}' is a classic problem that builds core intuition for {pattern}. "
            "Mastering it gives you a template for a whole family of similar problems. "
            "⚠️ AI offline — showing cached insights. Refresh to get personalized analysis."
        ),
        "realWorldConnection": (
            f"The {pattern} technique used in '{title}' appears directly in production systems "
            "that need to compute or search efficiently at scale."
        ),
        "whereUsed": [
            f"Google: uses {pattern} in search index traversal and query optimization",
            f"Amazon: applies it in recommendation filtering and inventory systems",
            f"Netflix: uses it for real-time content ranking pipelines",
        ],
        "whyCompaniesAsk": (
            f"'{title}' tests whether you can recognize the {pattern} structure, "
            "handle edge cases correctly, and write clean optimal code under pressure."
        ),
        "companies": ["Google", "Amazon", "Microsoft", "Meta", "Apple"],
        "analogy": f"⚠️ AI temporarily unavailable. Refresh in 30 seconds for a personalized analogy for '{title}'.",
    }
