# main.py — DSA Dopamine Engine Starlette Server

import os
import logging
import json
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from models import ProblemInput, DeeperExplanationRequest, DailyReportRequest
from ai_engine import analyze_problem, get_deeper_explanation, generate_daily_report

load_dotenv()

# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("dsa-engine")


# ── Global error handler ──
async def global_error_handler(request, exc: Exception):
    logger.error(f"Unhandled error on {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        {"detail": str(exc), "error": type(exc).__name__},
        status_code=500
    )


# ─────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────

async def health(request):
    """Health check — used by Railway and monitoring."""
    api_key_set = bool(os.getenv("NVIDIA_NIM_API_KEY"))
    return JSONResponse({
        "status": "healthy",
        "version": "1.0.0",
        "nvidia_nim_configured": api_key_set,
        "model": "meta/llama-3.3-70b-instruct",
    })


async def analyze_endpoint(request):
    try:
        payload = await request.json()
        data = ProblemInput(**payload)
        logger.info(f"Analyzing: '{data.title}' [{data.difficulty}] tags={data.tags}")
        
        result = await analyze_problem(data)
        logger.info(f"Analysis complete for: '{data.title}' → pattern: {result.get('pattern')}")
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"analyze_problem failed: {e}", exc_info=True)
        return JSONResponse({"detail": f"AI analysis failed: {str(e)}"}, status_code=500)


async def deeper_endpoint(request):
    try:
        payload = await request.json()
        data = DeeperExplanationRequest(**payload)
        logger.info(f"Deeper dive: '{data.title}' pattern='{data.pattern}'")
        
        result = await get_deeper_explanation(data.title, data.pattern)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"get_deeper_explanation failed: {e}", exc_info=True)
        return JSONResponse({"detail": f"Deeper analysis failed: {str(e)}"}, status_code=500)


async def daily_report_endpoint(request):
    try:
        payload = await request.json()
        data = DailyReportRequest(**payload)
        logger.info(
            f"Daily report: {len(data.history)} problems, "
            f"totalSolved={data.stats.get('totalSolved', 0)}, "
            f"xp={data.stats.get('xp', 0)}"
        )
        
        result = await generate_daily_report(data.history, data.stats)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"generate_daily_report failed: {e}", exc_info=True)
        return JSONResponse({"detail": f"Report generation failed: {str(e)}"}, status_code=500)


# ── App ──
app = Starlette(
    debug=True,
    routes=[
        Route("/health", health, methods=["GET"]),
        Route("/analyze-problem", analyze_endpoint, methods=["POST", "OPTIONS"]),
        Route("/deeper-explanation", deeper_endpoint, methods=["POST", "OPTIONS"]),
        Route("/daily-report", daily_report_endpoint, methods=["POST", "OPTIONS"]),
    ],
    middleware=[
        Middleware(
            CORSMiddleware,
            allow_origins=["*"],   # Chrome extensions require wildcard
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
            allow_credentials=False,
        )
    ],
    exception_handlers={
        Exception: global_error_handler
    }
)


# ─────────────────────────────────────────────
# DEV ENTRY POINT
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    logger.info(f"Starting DSA Dopamine Engine on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
