import re
import urllib.request

BASE = "https://delta.municipalcodeonline.com"
PATHS = [
    "/",
    "/book",
    "/book?type=code",
    "/book?type=ordinances",
]

for path in PATHS:
    url = BASE + path
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=20) as response:
            body = response.read(8000).decode("utf-8", "replace")
            print("===", path, "status", response.status, "len", len(body))
            matches = re.findall(r'(?:https?://[^"\']+|/api/[^"\']+)', body)
            for match in matches[:15]:
                print(" ", match)
    except Exception as exc:
        print("===", path, "ERR", exc)
