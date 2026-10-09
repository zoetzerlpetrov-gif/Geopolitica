"""Próximos lanzamientos (Launch Library 2): solo datos básicos y la plataforma como punto."""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "espacio"))
import lanzamientos as L  # noqa: E402


def test_features():
    r = [{"id": "a1", "name": "Falcon 9 Block 5 | Starlink", "net": "2026-10-10T12:00:00Z", "status": {"abbrev": "Go", "name": "Go for Launch"},
          "rocket": {"configuration": {"full_name": "Falcon 9 Block 5"}}, "launch_service_provider": {"name": "SpaceX", "type": {"name": "Commercial"}},
          "mission": {"name": "Starlink", "type": "Communications", "orbit": {"abbrev": "LEO"}, "description": "texto largo que no se guarda"},
          "pad": {"name": "SLC-40", "latitude": "28.5619", "longitude": "-80.5772", "location": {"name": "Cabo Cañaveral", "country": {"alpha_3_code": "USA"}}}},
         {"id": "b2", "name": "Sin plataforma", "pad": {}}]
    fs = L.features(r)
    assert len(fs) == 1
    p = fs[0]["properties"]
    assert fs[0]["geometry"]["coordinates"] == [-80.5772, 28.5619] and p["estado"] == "Confirmado (Go)" and p["orbita"] == "LEO"
    assert p["pais_iso3"] == "USA" and "texto largo" not in str(p)
