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

async def root(request):
    """Root status page — shown when visiting the Railway URL directly."""
    from starlette.responses import HTMLResponse
    html = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>DSA Dopamine Engine — API</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',system-ui,sans-serif;background:#080810;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .card{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:40px 48px;max-width:480px;width:90%;text-align:center;backdrop-filter:blur(20px)}
    .logo{font-size:40px;margin-bottom:16px}
    h1{font-size:22px;font-weight:800;margin-bottom:6px;letter-spacing:-0.5px}
    .sub{font-size:13px;color:rgba(255,255,255,0.45);margin-bottom:28px}
    .badge{display:inline-flex;align-items:center;gap:7px;background:rgba(74,222,128,0.12);border:1px solid rgba(74,222,128,0.3);color:#4ade80;font-size:12px;font-weight:700;padding:6px 16px;border-radius:30px;margin-bottom:28px}
    .dot{width:7px;height:7px;border-radius:50%;background:#4ade80;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,0.4)}50%{box-shadow:0 0 0 5px rgba(74,222,128,0)}}
    .endpoints{text-align:left;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px 20px;font-size:12px}
    .ep{display:flex;align-items:center;gap:10px;padding:5px 0;color:rgba(255,255,255,0.7)}
    .ep:not(:last-child){border-bottom:1px solid rgba(255,255,255,0.05)}
    .method{background:rgba(96,165,250,0.15);color:#60a5fa;border:1px solid rgba(96,165,250,0.25);font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;font-family:monospace}
    .method.get{background:rgba(74,222,128,0.12);color:#4ade80;border-color:rgba(74,222,128,0.25)}
    .path{font-family:monospace;font-size:11px;color:rgba(255,255,255,0.85)}
    .model{margin-top:20px;font-size:11px;color:rgba(255,255,255,0.3)}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🧠</div>
    <h1>DSA Dopamine Engine</h1>
    <div class="sub">AI-Powered Coaching API · Powered by NVIDIA NIM</div>
    <div class="badge"><span class="dot"></span> Online &amp; Healthy</div>
    <div class="endpoints">
      <div class="ep"><span class="method get">GET</span><span class="path">/health</span></div>
      <div class="ep"><span class="method">POST</span><span class="path">/analyze-problem</span></div>
      <div class="ep"><span class="method">POST</span><span class="path">/deeper-explanation</span></div>
      <div class="ep"><span class="method">POST</span><span class="path">/daily-report</span></div>
    </div>
    <div class="model">Model: meta/llama-3.3-70b-instruct</div>
  </div>
</body>
</html>"""
    return HTMLResponse(html)


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
        Route("/",               root,                    methods=["GET"]),
        Route("/health",         health,                  methods=["GET"]),
        Route("/analyze-problem",     analyze_endpoint,    methods=["POST", "OPTIONS"]),
        Route("/deeper-explanation",  deeper_endpoint,     methods=["POST", "OPTIONS"]),
        Route("/daily-report",        daily_report_endpoint, methods=["POST", "OPTIONS"]),
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
