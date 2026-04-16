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

FAST_MODEL  = "meta/llama-3.3-70b-instruct"
POWER_MODEL = "meta/llama-3.3-70b-instruct"


# ─────────────────────────────────────────────
# PROMPTS — PRODUCTION-FOCUSED, PROBLEM-SPECIFIC
# ─────────────────────────────────────────────

ANALYZE_PROMPT = """You are a production engineer (not a DSA tutor) explaining why solving THIS exact problem matters in real systems.

Problem: "{title}"
Difficulty: {difficulty}
Tags: {tags}
Description: {description}

YOUR TASK: Find the actual, non-obvious reason a company NEEDS this computation solved.
- NOT "this is used in sorting" or "this is a fundamental algorithm"
- YES "when this system fails or is slow, it costs the company $X per minute" or "this constraint exists because of a real product requirement"
- YES "I can point to the exact line of code or system decision that requires solving this"

Think like a tech lead who got paged at 3am because THIS problem wasn't solved efficiently.

Return ONLY valid JSON (no markdown):
{{
  "pattern": "The core computational pattern '{title}' reduces to",
  "problemSolves": "What actual business problem, system constraint, or user-facing issue does '{title}' solve? (Not 'it teaches you about trees')",
  "productsNeedThis": [
    {{
      "product": "Actual product/company/service",
      "whyTheNeed": "Concrete scenario: what constraint forces them to solve this, when does it run, what breaks if slow/wrong"
    }},
    {{
      "product": "Another non-obvious real scenario",
      "whyTheNeed": "Why does THEIR ACTUAL SYSTEM need this exact solution (not just 'they use algorithms')"
    }},
    {{
      "product": "Third example (pick something common users interact with)",
      "whyTheNeed": "Specific trigger: what user action causes this computation, why can't they avoid it"
    }}
  ],
  "costOfGettingWrong": "Real consequences if this is solved inefficiently or incorrectly: latency impact, money lost, user experience breaking, scale limit hit",
  "whyThisProblemMatters": "2-3 sentences: why solving THIS teaches you something about building REAL systems under constraint, not just DSA theory",
  "productionReality": "The unsexy production truth: what engineer frustration, business pressure, or scale reality does THIS problem represent?",
  "skillYouGain": "Specific technical skill or debugging mindset: what can you NOW build or debug that you couldn't before solving this?",
  "whenYourSeeThis": "Signal in real code: what pattern in a codebase or system design tells you THIS exact problem is being solved",
  "companies": ["Real companies known to hire specifically for this exact problem"],
  "analogy": "One analogy from ACTUAL WORK (not nature/animals): how does '{title}' map to something a junior engineer encounters on day 1",
  "difficulty": "{difficulty}"
}}

RULES:
- productsNeedThis must list ACTUAL products with specific, user-facing scenarios (not generic 'tech companies use algorithms')
- costOfGettingWrong must describe REAL consequences (latency SLA miss = money, scale limit = business decision delayed, user experience = churn)
- productionReality must feel like overhearing engineers in Slack or Zoom, not Wikipedia
- skillYouGain must be actionable: 'identify memory bottlenecks in X' not 'learn about optimization'
- whenYouSeeThis must be about pattern recognition in real codebases
- Return ONLY valid JSON"""


DEEPER_PROMPT = """You are a senior engineer doing a deep technical review.

Problem: "{title}"
Pattern: {pattern}

Your goal: explain NOT just the algorithm, but why THIS constraint matters in production systems.

Return ONLY valid JSON:
{{
  "timeComplexity": "Optimal Big-O for '{title}' with one-line justification specific to this problem's constraints",
  "spaceComplexity": "Big-O with 1-line justification for why space matters here (not generic 'use extra space')",
  "systemDesignConnection": "Real distributed/high-scale system where '{title}' exact computation is the bottleneck or decision point. Name the actual system, not 'databases in general'",
  "scalingPoint": "At what scale does the naive solution break? (e.g., '1M queries/sec, connection pooling becomes the constraint')",
  "edgeCases": [
    "Edge case SPECIFIC to '{title}' that trips up candidates and shows up in prod bugs",
    "Non-obvious edge case that reveals whether candidate thinks about constraints",
    "Constraint-specific case that would break if someone misread the problem"
  ],
  "debuggingSignal": "How would you KNOW in production that this exact problem is being solved wrong? (latency dashboard, error pattern, resource spike, etc.)",
  "followUpProblems": [
    "Harder LeetCode/real problem that directly extends '{title}' under real constraints",
    "Variant that shows up when you scale the original to production"
  ],
  "mentalModel": "Exact mental model for '{title}': how does a senior engineer think about it the MOMENT they see the constraint? (what's the first instinct, not the algorithm)",
  "productionTrap": "The most common way engineers get THIS wrong in production systems (not on LeetCode)"
}}"""


DAILY_REPORT_PROMPT = """You are a production-focused DSA coach analyzing a developer's actual practice data.
Be specific, data-driven, and brutally honest about what their trajectory means for real systems.

Student Stats:
{stats}

Recent Problems Solved (last {count}):
{recent_history}

Return ONLY valid JSON:
{{
  "overallAssessment": "2-3 sentences: referencing their ACTUAL numbers (total, streak, difficulty split). What does this trajectory say about their production-readiness?",
  "strongTopics": ["Most-solved topic", "Second strongest", "Third if applicable"],
  "weakTopics": ["Topic with fewest solves or slowest time", "Second weakest", "Third if applicable"],
  "productionRelevance": "Which of their strong/weak topics actually matter in real systems? (Some topics are common in interviews but rare in prod)",
  "bottleneck": "If they were on your team TODAY, what ACTUAL class of problems would slow them down on production systems?",
  "nextTarget": "Specific problem type or category to focus on NEXT and why (not just 'do medium problems')",
  "trainingGap": "The unsexy gap between their practice and what prod systems actually require (e.g., 'you practice isolated problems, prod = integration')",
  "motivationalMessage": "Specific reference to their data that shows progress or potential",
  "predictedLevel": "Beginner / Apprentice / Intermediate / Advanced / Expert"
}}"""


# ─────────────────────────────────────────────
# JSON PARSER — fixed regex
# ─────────────────────────────────────────────

def parse_json_response(raw: str) -> dict:
    raw = raw.strip()

    # Strip markdown code fences if present
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()

    # Try direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Find first {...} block
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
                        "You are a production engineer, NOT a DSA tutor. "
                        "Always respond with valid JSON only. "
                        "Every answer must explain the ACTUAL business/system reason this problem matters. "
                        "Avoid generic 'this is used in tech' responses. "
                        "Be specific to production constraints, money, scale, user impact."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.75,
            max_tokens=1200,
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
            model=POWER_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a senior production engineer doing interview prep. "
                        "Respond with valid JSON only. "
                        "Focus on why THIS problem matters in real systems under constraint. "
                        "Be specific about scale, bottlenecks, production failure modes."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
            max_tokens=1200,
        )
        raw = response.choices[0].message.content.strip()
        return parse_json_response(raw)

    except Exception as e:
        logger.warning(f"get_deeper_explanation failed ({type(e).__name__}: {e}) — returning fallback")
        return {
            "timeComplexity": "Analysis unavailable — try again",
            "spaceComplexity": "Analysis unavailable — try again",
            "systemDesignConnection": "AI analysis temporarily unavailable. Refresh to retry.",
            "scalingPoint": "100K+ scale usually exposes this problem",
            "edgeCases": ["Empty input", "Single element", "Maximum constraint value"],
            "debuggingSignal": "Monitor latency dashboards and memory usage patterns",
            "followUpProblems": ["Distributed variant of this problem", "Caching layer needed variant"],
            "mentalModel": "Identify the core constraint, work backward from the output, then find the efficient path",
            "productionTrap": "Assuming local optimization works at scale without testing under real load"
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

    try:
        response = await _get_client().chat.completions.create(
            model=POWER_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a production-focused DSA coach. "
                        "Be specific, data-driven, and honest about production impact. "
                        "Respond with valid JSON only. "
                        "Connect their practice patterns to what they'd actually face in real systems."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.65,
            max_tokens=900,
        )
        raw = response.choices[0].message.content.strip()
        return parse_json_response(raw)

    except Exception as e:
        logger.warning(f"generate_daily_report failed ({type(e).__name__}: {e}) — returning fallback")
        total = stats_summary["totalSolved"]
        streak = stats_summary["streak"]
        return {
            "overallAssessment": f"You've solved {total} problems with a {streak}-day streak. Consistency matters more than speed.",
            "strongTopics": ["Most frequently solved pattern", "Second strongest", "Third if present"],
            "weakTopics": ["Least practiced", "Second weakest", "Opportunity area"],
            "productionRelevance": "Some patterns you practice are interview favorites but less common in prod. Focus on high-impact ones.",
            "bottleneck": "Identify where you slow down most: is it pattern recognition, implementation, or testing?",
            "nextTarget": "Mix hard problems with pattern variants to build depth, not just breadth.",
            "trainingGap": "You're solving isolated problems — next: think about how these combine in real systems.",
            "motivationalMessage": f"Your {streak}-day streak shows discipline. Keep building on that foundation.",
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
    return [
        {"tag": k, "avgTimeMinutes": round(v.get("avgTime", 0) / 60, 1)}
        for k, v in sorted_tags[:n]
    ]


def _fallback_analysis(data: ProblemInput) -> dict:
    """
    Fallback analysis when AI is unavailable.
    Still generates problem-specific insights where possible.
    """
    title = data.title or "this problem"
    tags_lower = [t.lower() for t in (data.tags or [])]

    # Map patterns to production contexts
    pattern_context = {
        "binary search": {
            "pattern": "Search Space Pruning",
            "production": "Finding thresholds at scale (pricing tiers, feature flags, system limits)",
            "signal": "Latency > threshold causing timeouts in search/matching"
        },
        "two pointers": {
            "pattern": "Multi-Index Traversal",
            "production": "Collision detection, matching, duplicate removal in streams",
            "signal": "O(n²) naive solution timing out with real data"
        },
        "sliding window": {
            "pattern": "Constraint-Based Window",
            "production": "Rate limiting, time-series aggregation, buffer management",
            "signal": "Memory spikes when processing continuous data streams"
        },
        "dynamic programming": {
            "pattern": "State Memoization",
            "production": "Cost optimization in decision trees, resource allocation, caching strategies",
            "signal": "Exponential blowup in recursive solutions at 1K+ input size"
        },
        "hash table": {
            "pattern": "O(1) Lookup",
            "production": "Deduplication, session management, distributed cache validation",
            "signal": "Lookup latency becoming bottleneck as data grows"
        },
        "graph": {
            "pattern": "Relationship Traversal",
            "production": "Recommendation systems, dependency resolution, network routing",
            "signal": "BFS/DFS timeout when graph has >10K nodes"
        },
        "tree": {
            "pattern": "Hierarchical Search",
            "production": "Autocomplete indices, permission hierarchies, geographic partitioning",
            "signal": "Search latency linear in tree size instead of logarithmic"
        },
        "stack": {
            "pattern": "LIFO Processing",
            "production": "Browser history, undo/redo, expression parsing in compilers",
            "signal": "Recursive calls hitting stack overflow on deep inputs"
        },
        "linked list": {
            "pattern": "Sequential Access",
            "production": "Memory-efficient queuing, LRU cache implementation, immutable data structures",
            "signal": "Need for efficient insertion/deletion at arbitrary positions"
        },
        "string": {
            "pattern": "Pattern Matching",
            "production": "Log parsing, config validation, text search optimization",
            "signal": "String scanning becoming bottleneck in text processing pipeline"
        },
    }

    # Find matching context
    pattern = "Core Problem Solving"
    context = {
        "pattern": pattern,
        "production": "General computation",
        "signal": "Performance degradation"
    }

    for key, val in pattern_context.items():
        if any(key in t for t in tags_lower):
            context = val
            pattern = val["pattern"]
            break

    return {
        "pattern": pattern,
        "problemSolves": f"'{title}' solves the core constraint: {context['production'].lower()}",
        "productsNeedThis": [
            {
                "product": "High-scale systems (any company with millions of users)",
                "whyTheNeed": context['signal']
            },
            {
                "product": "Data-heavy services (analytics, search, recommendations)",
                "whyTheNeed": f"Efficiency in '{title}' directly impacts query latency SLA"
            },
            {
                "product": "Real-time systems (trading, monitoring, streaming)",
                "whyTheNeed": "Microseconds matter — naive solution = cascading failures"
            }
        ],
        "costOfGettingWrong": f"Inefficient solution hits scaling wall at 1K-10K inputs. On prod: 100ms query → 5sec query → SLA miss → customer churn.",
        "whyThisProblemMatters": (
            f"'{title}' isn't about beauty — it's about hitting a hard constraint under real load. "
            "Solving it teaches you to recognize bottlenecks before they become critical."
        ),
        "productionReality": f"Engineers solve this because they hit it. Not theory — necessity.",
        "skillYouGain": f"Recognize {context['pattern'].lower()} bottlenecks in code. Debug latency dashboards. Know when optimization = business critical.",
        "whenYourSeeThis": f"When you see {context['signal'].lower()} in monitoring or perf profilers.",
        "companies": ["Any company operating at scale: Google, Uber, Stripe, DoorDash, Airbnb"],
        "analogy": f"Like tuning a car engine: you don't study it for art's sake — you study it because the car is slow.",
        "difficulty": data.difficulty or "Unknown"
    }