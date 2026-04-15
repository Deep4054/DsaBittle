# ai_engine.py — NVIDIA NIM AI Engine for DSA Dopamine Engine
# Uses NVIDIA NIM API (OpenAI-compatible) with Llama / Nemotron models

import os
import json
import re
from openai import AsyncOpenAI
from dotenv import load_dotenv
from models import ProblemInput

# Load .env immediately so os.getenv() works here AND in main.py
load_dotenv()

# ── Lazy client initializer ──
# We create the client on first use so the key is always read after load_dotenv()
_client: AsyncOpenAI | None = None

def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("NVIDIA_NIM_API_KEY")
        if not api_key:
            raise RuntimeError(
                "NVIDIA_NIM_API_KEY is not set. "
                "Create backend/.env with: NVIDIA_NIM_API_KEY=nvapi-..."
            )
        _client = AsyncOpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=api_key,
        )
    return _client

# Model choices (both confirmed working on NVIDIA NIM free tier):
# meta/llama-3.3-70b-instruct  → fast, cheap, high quality (confirmed 200 OK)
# nvidia/llama-3.1-nemotron-ultra-253b-v1  → larger, for deep analysis (if quota allows)
FAST_MODEL = "meta/llama-3.3-70b-instruct"
POWER_MODEL = "meta/llama-3.3-70b-instruct"  # Fallback: same model, nemotron-70b 404s on free accounts

# ─────────────────────────────────────────────
# PROMPT TEMPLATES
# ─────────────────────────────────────────────


ANALYZE_PROMPT = """
You are an expert software engineer and DSA teacher with 15+ years of experience at top tech companies.
Analyze this coding problem and return ONLY a valid JSON object. No markdown, no explanation, just JSON.

Problem Title: {title}
Difficulty: {difficulty}
Tags: {tags}
Description (partial): {description}

Return this EXACT JSON structure:
{{
  "pattern": "One-line pattern name (e.g. 'Sliding Window', 'Two Pointers + HashMap')",
  "whySolveThis": "2-3 sentences: why THIS specific problem type is critical for interview success and how mastering it unlocks a whole class of problems. Be motivating and specific.",
  "whereUsed": [
    "PRODUCT NAME: exactly what this algorithm does inside it and why they chose it",
    "PRODUCT NAME: how this pattern solves a scale or performance challenge there",
    "PRODUCT NAME: what would break in production without this approach"
  ],
  "whyCompaniesAsk": "2-3 sentences: the exact reason FAANG and top companies ask THIS pattern — what signal it gives about a candidate's thinking, problem decomposition, and code quality. Be candid.",
  "companies": ["Google", "Amazon", "Meta", "Microsoft", "Apple"],
  "analogy": "One vivid, memorable non-technical analogy a 10-year-old can understand that captures the algorithm's core insight. Make it surprising.",
  "difficulty": "{difficulty}"
}}

Rules:
- whereUsed items MUST start with an actual product name (Google Search, Netflix, Uber, etc.)
- companies must be real companies known to ask this exact pattern
- whySolveThis must be motivating and specific to THIS pattern, not generic
- whyCompaniesAsk must explain the interview signal, not just say "it tests fundamentals"
- Return ONLY valid JSON. No code blocks. No commentary.
"""

DEEPER_PROMPT = """
You are a senior software engineer at a FAANG company conducting a technical interview prep session.

Problem: {title}
Pattern Identified: {pattern}

Return ONLY this JSON structure (no markdown, no explanation):
{{
  "systemDesignConnection": "2-3 sentences connecting this exact problem to a real distributed system or production architecture. Be specific — name actual systems.",
  "edgeCases": [
    "Specific edge case that trips up most candidates",
    "Another non-obvious edge case",
    "A third edge case related to constraints or overflow"
  ],
  "timeComplexity": "Big-O with brief justification (e.g. 'O(n log n) — sorting dominates the nested loop')",
  "spaceComplexity": "Big-O with brief justification",
  "followUpProblems": [
    "Exactly related harder follow-up problem name",
    "Another follow-up that uses the same pattern differently"
  ],
  "mentalModel": "2-3 sentences: the exact mental model an experienced engineer uses to recognize and approach this pattern instantly during an interview."
}}
"""

DAILY_REPORT_PROMPT = """
You are a world-class DSA coach analyzing a developer's actual coding practice data.
Be specific, data-driven, and brutally honest — this is a premium coaching session.

Student Stats:
{stats}

Recent Problems Solved (last {count}):
{recent_history}

Return ONLY this JSON structure (no markdown):
{{
  "overallAssessment": "2-3 sentences about where this developer currently stands, referencing their ACTUAL numbers (total solved, current streak, difficulty distribution). Be specific.",
  "strongTopics": ["Topic they've solved most of", "Second strongest topic based on data", "Third if applicable"],
  "weakTopics": ["Topic with fewest attempts or worst avg time", "Second weakest", "Third if applicable"],
  "insight": "ONE specific, data-driven insight. Example: 'You solve Easy problems 3x faster than Medium — the bottleneck is your DP pattern recognition, not your coding speed.' Reference their actual stats.",
  "recommendation": "Specific actionable directive: what exact type of problem to solve next (give a real LeetCode problem name or topic), and why based on their data gaps.",
  "motivationalMessage": "Short, genuine message. NOT generic. Reference something specific from their data — their streak, a difficulty they conquered, or their growth trajectory.",
  "predictedLevel": "One of: Beginner / Apprentice / Intermediate / Advanced / Expert — based on total solved count, difficulty distribution, and avg solve time"
}}
"""


# ─────────────────────────────────────────────
# HELPER: Parse JSON safely (strips markdown if model adds it)
# ─────────────────────────────────────────────

def parse_json_response(raw: str) -> dict:
    """Strip markdown fences if present, then parse JSON."""
    raw = raw.strip()
    # Remove ```json ``` or ``` ``` wrappers
    raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'\s*```$', '', raw, flags=re.MULTILINE)
    return json.loads(raw.strip())


# ─────────────────────────────────────────────
# AI FUNCTIONS
# ─────────────────────────────────────────────

async def analyze_problem(data: ProblemInput) -> dict:
    """
    Call GPT-4o-mini to analyze a DSA problem and return
    real-world context, pattern, companies, analogy, and use cases.
    Fast + cheap for per-problem calls.
    """
    tags_str = ", ".join(data.tags) if data.tags else "None provided"
    desc_str = (data.description or "")[:600]

    prompt = ANALYZE_PROMPT.format(
        title=data.title,
        difficulty=data.difficulty or "Unknown",
        tags=tags_str,
        description=desc_str,
    )

    response = await _get_client().chat.completions.create(
        model=FAST_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You are an expert DSA teacher. Always respond with valid JSON only. No markdown, no explanation — pure JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=700,
    )

    raw = response.choices[0].message.content.strip()
    return parse_json_response(raw)


async def get_deeper_explanation(title: str, pattern: str) -> dict:
    """
    Call GPT-4o (smarter) for deep-dive analysis:
    system design connections, edge cases, complexity, follow-ups.
    """
    prompt = DEEPER_PROMPT.format(title=title, pattern=pattern or "General")

    response = await _get_client().chat.completions.create(
        model=POWER_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You are a senior FAANG engineer doing interview prep coaching. Respond with valid JSON only. No markdown, no explanation — pure JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.5,
        max_tokens=900,
    )

    raw = response.choices[0].message.content.strip()
    return parse_json_response(raw)


async def generate_daily_report(history: list, stats: dict) -> dict:
    """
    Call GPT-4o (best model) to generate a personalized coaching
    report based on the user's ACTUAL history and stats data.
    """
    recent = history[:10] if len(history) > 10 else history
    count = len(recent)

    # Build a cleaner stats summary for the prompt
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

    # Simplify history for the prompt
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
                "content": "You are a world-class DSA coach. Be specific, data-driven, and brutally honest. Respond with valid JSON only. No markdown, no explanation — pure JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.65,
        max_tokens=700,
    )

    raw = response.choices[0].message.content.strip()
    return parse_json_response(raw)


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _get_top_tags(tag_stats: dict, n: int = 3) -> list:
    """Return top N tags by solve count."""
    sorted_tags = sorted(tag_stats.items(), key=lambda x: x[1].get("count", 0), reverse=True)
    return [{"tag": k, "count": v.get("count", 0)} for k, v in sorted_tags[:n]]


def _get_slowest_tags(tag_stats: dict, n: int = 3) -> list:
    """Return top N tags by average solve time (slowest = most time spent)."""
    sorted_tags = sorted(
        [(k, v) for k, v in tag_stats.items() if v.get("count", 0) >= 2],
        key=lambda x: x[1].get("avgTime", 0),
        reverse=True,
    )
    return [
        {"tag": k, "avgTimeMinutes": round(v.get("avgTime", 0) / 60, 1)}
        for k, v in sorted_tags[:n]
    ]
