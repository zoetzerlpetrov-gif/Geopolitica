FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/backend
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt && useradd --uid 10001 --create-home dominus
COPY backend /app/backend
COPY tools/fase2 /app/tools/fase2
COPY js/fase1-logica.js js/fase2-modelo.js js/fase2-importar.js js/util.js /app/js/
RUN mkdir -p /app/backend/private && chown -R dominus:dominus /app/backend/private
USER dominus
CMD ["uvicorn", "dominus.entry:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
