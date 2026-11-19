"""En la batería general (sin pandas, numpy ni yfinance) se omiten estas pruebas; el flujo del Portafolio sí las corre."""
import importlib.util

collect_ignore_glob = [] if all(importlib.util.find_spec(m) for m in ("pandas", "numpy", "yfinance")) else ["test_*.py"]
