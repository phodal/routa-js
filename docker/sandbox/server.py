"""
In-sandbox API server.

Runs inside each sandbox Docker container. Exposes a single /execute endpoint
that accepts code, runs it via a Jupyter kernel, and streams back results as
newline-delimited JSON (NDJSON).

Output events:
  {"text": "..."}           — stdout / print output
  {"image": "<base64-png>"} — matplotlib / display_data PNG images
  {"error": "..."}          — traceback on execution error

Reference: https://amirmalik.net/2025/03/07/code-sandboxes-for-llm-ai-agents
"""

import asyncio
import json

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from jupyter_client.manager import AsyncKernelManager

app = FastAPI()


async def execute_code(code: str):
    km = AsyncKernelManager()
    await km.start_kernel()
    kc = km.client()
    kc.start_channels()
    await kc.wait_for_ready()

    msg_id = kc.execute(code)

    async def stream_results():
        try:
            while True:
                reply = await kc.get_iopub_msg()

                # Ignore messages from other executions.
                if reply["parent_header"].get("msg_id") != msg_id:
                    continue

                msg_type = reply["msg_type"]

                if msg_type == "stream":
                    yield json.dumps({"text": reply["content"]["text"]}) + "\n"

                elif msg_type == "display_data":
                    data = reply["content"].get("data", {})
                    if "image/png" in data:
                        yield json.dumps({"image": data["image/png"]}) + "\n"

                elif msg_type == "execute_result":
                    data = reply["content"].get("data", {})
                    if "text/plain" in data:
                        yield json.dumps({"text": data["text/plain"] + "\n"}) + "\n"

                elif msg_type == "error":
                    traceback = "\n".join(reply["content"]["traceback"])
                    yield json.dumps({"error": traceback}) + "\n"
                    break

                elif (
                    msg_type == "status"
                    and reply["content"]["execution_state"] == "idle"
                ):
                    break
        except asyncio.CancelledError:
            pass
        finally:
            kc.stop_channels()
            await km.shutdown_kernel()

    return StreamingResponse(stream_results(), media_type="application/x-ndjson")


@app.post("/execute")
async def execute(request: dict):
    if "code" not in request:
        raise HTTPException(status_code=400, detail="Missing 'code' field")
    if not request["code"].strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")
    return await execute_code(request["code"])


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
