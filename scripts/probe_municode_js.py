import re
import urllib.request

html = urllib.request.urlopen(
    "https://delta.municipalcodeonline.com/book?type=ordinances",
    timeout=20,
).read().decode("utf-8", "replace")
scripts = re.findall(r'<script[^>]+src="([^"]+)"', html)
print("scripts", scripts)

for script in scripts:
    if "angular" in script:
        continue
    url = script if script.startswith("http") else "https://delta.municipalcodeonline.com" + script
    try:
        body = urllib.request.urlopen(url, timeout=20).read().decode("utf-8", "replace")
        print("---", url, "len", len(body))
        for match in re.findall(r"https://[^\"']+", body):
            if "amazonaws" in match or "api" in match or "municode" in match:
                print(" ", match)
    except Exception as exc:
        print("err", url, exc)
