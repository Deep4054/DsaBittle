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
# MAIN PROMPT
# ─────────────────────────────────────────────

ANALYZE_PROMPT = """You are explaining a coding problem to a developer friend.

Problem: "{title}"
Tags: {tags}
Description: {description}

Your goal: Help them understand WHY this problem exists and WHERE this exact scenario shows up in real systems.

CRITICAL RULES - READ CAREFULLY:
1. NEVER explain HOW to solve it. No algorithms, no data structures, no solution approaches.
2. NEVER say "use a hash map", "sliding window", "memoization", "recursion", "greedy", "DP" etc.
3. Talk ONLY about THIS specific problem - not the general pattern category.
4. "realUse" must describe a real system where THIS exact problem behavior occurs.
5. "whatIsThis" must describe the real-world scenario being modeled, not the solution.
6. "whyThisApproach" must explain why THIS problem's constraints matter in production, not the algorithm.
7. Keep it casual and direct - like talking to a friend.

Example of WRONG response for "Jump Game":
  whatIsThis: "You're using greedy/DP to check if you can reach the end" <- WRONG, mentions solution

Example of CORRECT response for "Jump Game":
  whatIsThis: "You're modeling a real constraint - can you reach a destination given limited resources at each step? Like a car with varying fuel at each gas station." <- CORRECT, no solution

Return ONLY valid JSON, no markdown, no backticks:
{{
  "whatIsThis": "What real-world scenario does THIS problem model? No solution hints.",
  "realUse": "Specific real system where THIS exact behavior/constraint appears.",
  "whyThisApproach": "Why do THIS problem's constraints matter in production? Not the algorithm.",
  "whatBreaks": "What fails in a real system if you get this scenario wrong?",
  "intuitionShift": "One line - the key insight about the PROBLEM itself, not the solution.",
  "pattern": "Short pattern name",
  "difficulty": "{difficulty}"
}}"""


DEEPER_PROMPT = """Casual dev explaining to another dev.

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
  "recommendation": "Specific next step - what to practice and why.",
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
                    "content": (
                        "You explain WHY problems exist and WHERE they appear in real systems. "
                        "You NEVER explain how to solve them. No algorithms, no data structures, no solution hints. "
                        "Respond with valid JSON only. No markdown, no backticks."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            max_tokens=900,
        )
        raw = response.choices[0].message.content.strip()
        return parse_json_response(raw)

    except Exception as e:
        logger.warning(f"analyze_problem failed ({type(e).__name__}: {e}) - returning fallback")
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
        logger.warning(f"get_deeper_explanation failed ({type(e).__name__}: {e}) - returning fallback")
        return {
            "timeComplexity": "Unavailable - try again",
            "spaceComplexity": "Unavailable - try again",
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
        logger.warning(f"generate_daily_report failed ({type(e).__name__}: {e}) - returning fallback")
        total = stats_summary["totalSolved"]
        streak = stats_summary["streak"]
        return {
            "overallAssessment": f"You've solved {total} problems with a {streak}-day streak. Keep going.",
            "strongTopics": ["Array", "String", "Hash Map"],
            "weakTopics": ["Dynamic Programming", "Graph", "Tree"],
            "insight": "Consistency beats intensity - your streak shows you're building the habit.",
            "recommendation": "Try one medium problem per day in your weakest topic.",
            "motivationalMessage": f"{streak} day streak - that's real discipline.",
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

    if "jump game" in title:
        return {
            "pattern": "Greedy / Reachability",
            "difficulty": data.difficulty or "Medium",
            "whatIsThis": "You're modeling a reachability problem - given limited reach at each position, can you make it to the end? Like a frog jumping on lily pads where each pad tells you how far you can jump.",
            "realUse": "Game level design validation - can a player reach the exit given the platform layout? Or workflow automation - can a process reach completion given the available transitions at each step?",
            "whyThisApproach": "In real systems, reachability checks matter for validating state machines, workflow engines, and navigation graphs. If you can't prove reachability, you ship broken user flows.",
            "whatBreaks": "A game ships with an unreachable level. A workflow engine lets users start a process they can never complete. Both are silent failures - no error, just a stuck user.",
            "intuitionShift": "The question isn't about the path - it's about whether any path exists at all.",
        }

    if "binary search" in tags or "search" in title:
        return {
            "pattern": "Binary Search",
            "difficulty": data.difficulty or "Medium",
            "whatIsThis": "You're modeling a lookup problem on sorted data - finding a specific value or threshold without scanning everything.",
            "realUse": "Git bisect uses this exact behavior to find which commit broke your build. Database indexes use it to find rows. Package managers use it to find compatible version ranges.",
            "whyThisApproach": "Sorted data is everywhere in production. If you can't exploit the sort order, you're doing unnecessary work at every scale.",
            "whatBreaks": "Linear scan on sorted data works fine in dev with 100 rows. In production with 10M rows it becomes a timeout. The sort order was there to help you - ignoring it is waste.",
            "intuitionShift": "The data is already sorted - that's information. Use it to eliminate half the search space each time.",
        }

    if any(t in tags for t in ["hash table", "hash map"]) or "two sum" in title:
        return {
            "pattern": "Hash Map Lookup",
            "difficulty": data.difficulty or "Easy",
            "whatIsThis": "You're modeling a complement-finding problem - given a value, does its pair already exist in what you've seen so far?",
            "realUse": "Payment reconciliation - does this debit have a matching credit? Duplicate detection in event streams - have we seen this event ID before? Friend suggestion - do these two users share a connection?",
            "whyThisApproach": "The constraint is finding relationships between elements, not just processing each one. That relationship check is what makes this problem interesting in production.",
            "whatBreaks": "Scanning the full list for each element works in testing. In production with millions of transactions, that's the difference between a 200ms response and a timeout.",
            "intuitionShift": "You're not looking for the answer - you're asking if the answer to the current element already walked past you.",
        }

    if any(t in tags for t in ["two pointers", "sliding window"]):
        return {
            "pattern": "Two Pointers" if "two pointers" in tags else "Sliding Window",
            "difficulty": data.difficulty or "Medium",
            "whatIsThis": "You're modeling a range or window problem - tracking a contiguous segment of data as it moves through a sequence.",
            "realUse": "Rate limiting - how many requests happened in the last 60 seconds? Network monitoring - what's the peak traffic in any 5-minute window? Fraud detection - are there N suspicious transactions within a short time span?",
            "whyThisApproach": "In real systems, you're constantly asking 'what happened in this window of time/data'. The window moves forward - you don't restart from scratch each time.",
            "whatBreaks": "Recomputing from scratch for each window position works on small data. On a live event stream with millions of events per second, that's a guaranteed bottleneck.",
            "intuitionShift": "The window slides - when something enters from the right, something leaves from the left. You're maintaining a view, not recomputing it.",
        }

    if "dynamic programming" in tags or "dp" in tags:
        return {
            "pattern": "Dynamic Programming",
            "difficulty": data.difficulty or "Medium",
            "whatIsThis": "You're modeling an optimization problem where the same sub-decisions appear repeatedly - like planning a route where you keep re-evaluating the same intermediate stops.",
            "realUse": "Spell checkers computing edit distance between words. Route planners finding optimal paths. Compilers optimizing code. Any system that needs to find the best sequence of decisions.",
            "whyThisApproach": "The problem has overlapping subproblems - the same smaller decisions feed into multiple larger ones. In production, recomputing them is waste.",
            "whatBreaks": "Without caching intermediate results, the same sub-decisions get recomputed exponentially. A spell checker that recomputes from scratch for every keystroke would be unusable.",
            "intuitionShift": "You've already solved this smaller version of the problem. Store the answer so you don't solve it again.",
        }

    return {
        "pattern": "Data Transformation",
        "difficulty": data.difficulty or "Unknown",
        "whatIsThis": "You're modeling a data reshaping problem - transforming input into the exact format a downstream system expects.",
        "realUse": "APIs rarely return data in the shape your UI needs. ETL pipelines constantly reshape data between systems. This problem models that translation layer.",
        "whyThisApproach": "Doing the transformation once, correctly, keeps every downstream consumer clean. The alternative is handling mismatches everywhere they're consumed.",
        "whatBreaks": "Skipping proper transformation means mismatched data causes silent failures - UI shows blanks, joins fail, filters break with no obvious error.",
    }
