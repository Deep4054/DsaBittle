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

ANALYZE_PROMPT = """
You are a senior engineer who has worked at Google, Uber, Stripe, and startups.
You explain DSA problems to a smart friend who needs to understand WHY — not just WHAT.
Your vibe: senior dev over coffee, not a textbook. Direct. Real.
You use actual app names, actual features, actual failure modes.
You do NOT use bullet points, key-value labels, or formal headers. You write flowing casual paragraphs like a human talking.

Problem: "{title}"
Difficulty: {difficulty}
Tags: {tags}
Description: {description}

RULES:
1. NEVER write like an email template. No 'Real-World Application:', no labels. Just talk.
2. Answer 'bro why should I actually care about this' — directly, specifically, with urgency.
3. Be specific. Don't say 'used in many applications.' Say WHICH app, WHICH feature, WHICH moment.
4. Make the pain of NOT knowing this feel real. Production bugs, latency spikes. Not dramatic — accurate.
5. Short, dense. Every sentence earns its place. No filler.
6. Use casual register: 'you', 'your', 'basically', 'look', 'here's the thing', 'honestly'.
7. If a field has nothing useful to say, return an empty string. Do not pad with generic filler.

Return ONLY valid JSON (no markdown, no backticks, no preamble):
{{
  "pattern": "Two Pointers | Hash Map | BFS | Dynamic Programming | Sliding Window | etc",
  "difficulty": "{difficulty}",
  "realWorldStory": "2-4 sentences. Start with a real app and where exactly this algo runs inside it. Make it specific and tangible. Example: 'Every time you split a bill on Splitwise, their backend runs something like this. Without an efficient lookup, it scans every transaction for every person. At 10M users that's not slow, it's dead.'",
  "whyItHurts": "2-3 sentences. What actually breaks in production if you get this wrong — slow queries, memory blowup, SLA miss, 500 errors. Example: 'Brute force works fine on your laptop with 10 items. At 100K transactions it's already lagging. At 1M it's a customer support ticket. At 10M it's an incident report.'",
  "casualUseCase": "A flowing paragraph (not a list). 2-3 casual real-world scenarios as flowing text. Example: 'Tinder's swipe queue is basically this. Netflix figuring out what to buffer next — same idea. Your IDE autocomplete? Yep, every keystroke.'",
  "whySolveIt": "1-2 sentences. The honest reason this exists in interviews and codebases. Example: 'Companies ask this because it shows you know when brute force will kill you in prod. That's a 100x salary decision for them.'",
  "companiesContext": "1-2 sentences about what KIND of teams hit this and why. Don't just list names. Example: 'Any team running a recommendation engine, feed, or search bar has dealt with this. That's basically every company post Series A.'",
  "companies": ["Real company names only, no descriptions — e.g. Google, Uber, Stripe, Amazon"],
  "costOfGettingWrong": "One sentence. Specific consequence of naive solution at real scale.",
  "skillYouGain": "One sentence. What specific thing you can now build or debug that you couldn't before."
}}"""



DEEPER_PROMPT = """
Same vibe — senior dev, casual, real. No textbook explanations.

Problem: "{title}"
Pattern: {pattern}

Return ONLY valid JSON (no markdown, no backticks):
{{
  "timeComplexity": "Just the Big-O with one casual line why. Example: 'O(n) — one pass, that's it.'",
  "spaceComplexity": "Big-O with one line on why space matters here specifically.",
  "systemDesignConnection": "2-3 casual sentences. Where exactly does this show up in system design. Specific. Example: 'This is literally how Redis implements its hash table. When you cache a session token, this lookup is happening under the hood.'",
  "edgeCases": [
    "Write each as a sentence, not a label. Example: 'What if the array is empty — your code needs to not blow up here.'",
    "Not just 'Single element' — say 'If there's only one element, you return immediately. Make sure you're not comparing an element with itself.'",
    "A constraint-specific case that would break if someone misread the problem."
  ],
  "followUpProblems": ["Actual LeetCode problem names that extend this one", "Variant that shows up at prod scale"],
  "mentalModel": "2-3 sentences. Core intuition like you're drawing on a whiteboard. Casual and visual. Example: 'Think of it like a door with a lock. Every number is a lock. You carry the key for whatever you've seen before. When the right key shows up, door opens — done.'"
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
                        "You are a senior engineer who has shipped real systems at Google, Uber, Stripe, and startups. "
                        "You explain DSA problems like a dev talking to another dev — casual, direct, specific. "
                        "No corporate language, no templates, no 'Key Insight:' headers. "
                        "Every sentence must be specific to THIS problem — zero generic filler. "
                        "Respond with valid JSON only. No markdown, no backticks."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.85,
            max_tokens=1400,
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
                        "You are a senior engineer explaining to a smart friend — casual, specific, real. "
                        "No formal structure, no textbook definitions. "
                        "Respond with valid JSON only. No markdown, no backticks. "
                        "Every field must be specific to THIS problem, not generic DSA advice."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
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
        "difficulty": data.difficulty or "Unknown",
        "realWorldStory": f"This is the {context['pattern'].lower()} pattern — and it shows up in {context['production'].lower()}. When the naive solution ships, {context['signal'].lower()} and it becomes someone's on-call incident.",
        "whyItHurts": f"Works fine at 1K inputs. Push it to 100K or 1M and you'll see latency spikes, query timeouts, SLA misses. That's when it goes from a code review comment to a production incident.",
        "casualUseCase": f"{context['production']}. This pattern is more common than people realize — anytime you're processing data at volume, this is either working for you or against you.",
        "whySolveIt": "Companies ask this to see if you know when brute force will kill you in prod. That's a real engineering judgment call they're testing for.",
        "companiesContext": "Any team running at scale has hit this. Fintech, e-commerce, infra — they've all written a version of this in some critical path.",
        "companies": ["Google", "Uber", "Stripe", "Amazon", "Airbnb"],
        "costOfGettingWrong": f"Naive solution hits a wall at 10K–100K inputs. In prod: latency SLA miss, customer churn, on-call pages.",
        "skillYouGain": f"You'll spot {context['pattern'].lower()} bottlenecks before they become incidents.",
    }