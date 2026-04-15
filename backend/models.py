# models.py — Dataclass data contracts for DSA Dopamine Engine API
# Bypassing Pydantic due to Python 3.14 compatibility issues

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any


@dataclass
class ProblemInput:
    title: str
    description: str = ""
    difficulty: str = "Unknown"
    tags: List[str] = field(default_factory=list)


@dataclass
class DeeperExplanationRequest:
    title: str
    pattern: str = ""


@dataclass
class DailyReportRequest:
    history: List[Dict[str, Any]] = field(default_factory=list)
    stats: Dict[str, Any] = field(default_factory=dict)
