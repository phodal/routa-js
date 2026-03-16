# Sandbox image for routa.js code execution sandboxes.
#
# Provides a Python execution environment with Jupyter Notebook and a
# lightweight FastAPI server that accepts code-execution requests.
#
# Build:
#   docker build -t routa/sandbox:latest docker/sandbox/
#
# Run (managed automatically by the Rust SandboxManager):
#   docker run -p 8000:8000 routa/sandbox:latest

FROM jupyter/base-notebook:latest

# Install the in-sandbox FastAPI server and common scientific packages.
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    jupyter_client \
    matplotlib \
    numpy \
    pandas

WORKDIR /app
COPY server.py /app/server.py

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
