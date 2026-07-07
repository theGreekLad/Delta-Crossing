import re
import urllib.request

FILES = [
    "https://delta.municipalcodeonline.com/Scripts/mco.common.desktop.book.js?v=AADgcRbDLUI1",
    "https://delta.municipalcodeonline.com/Scripts/mco.common.desktop.js?v=AADgcRbDLUI1",
    "https://delta.municipalcodeonline.com/Scripts/home/Services/ordinanceService.js?v=0a8b53ebfcf7f9bc2bb0419686f3f721e525c08798997edeada1fd592d3e92c3",
]

for url in FILES:
    body = urllib.request.urlopen(url, timeout=20).read().decode("utf-8", "replace")
    endpoints = sorted(set(re.findall(r"""url:\s*['"]([^'"]+)['"]""", body)))
    print("===", url.split("/")[-1], "===")
    for endpoint in endpoints:
        print(" ", endpoint)
