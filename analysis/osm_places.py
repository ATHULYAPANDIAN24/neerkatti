"""Suburb-level place names from OpenStreetMap Nominatim, cached in outputs/places.json."""
import json
import pathlib
import re
import time
import urllib.request

CACHE = pathlib.Path(__file__).resolve().parent.parent / "outputs" / "places.json"


def load_cache():
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}


def save_cache(cache):
    CACHE.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


def place_name(lon, lat, cache):
    """Area name (suburb level only, never a building or owner) from OSM Nominatim."""
    key = f"{lat:.5f},{lon:.5f}"
    if key not in cache:
        url = ("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14"
               f"&lat={lat:.5f}&lon={lon:.5f}&accept-language=en")
        req = urllib.request.Request(url, headers={
            "User-Agent": "NEERKATTI/0.2 (DEXATHON 2026 student project; "
                          "github.com/ATHULYAPANDIAN24/neerkatti)"})
        addr = json.loads(urllib.request.urlopen(req, timeout=30).read()).get("address", {})
        cache[key] = next((addr[k] for k in ("suburb", "village", "town", "city_district")
                           if k in addr), None)
        time.sleep(1.2)  # Nominatim allows one request per second
    return clean(cache[key])


def area_name(lon, lat, cache):
    """Where a patch is, for grouping: the Greater Chennai Corporation zone inside the city
    ("Perungudi zone"), or the village or suburb OpenStreetMap gives outside it."""
    place_name(lon, lat, cache)   # looks it up if it is not cached yet
    raw = cache[f"{lat:.5f},{lon:.5f}"]
    zone = re.match(r"^Zone \d+ (.+)$", raw or "")
    return f"{zone.group(1)} zone" if zone else raw


def clean(name):
    # Chennai's corporation zones come back as "Zone 14 Perungudi"
    return re.sub(r"^Zone \d+ ", "", name) if name else None
