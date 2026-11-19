#!/usr/bin/env python3
"""
Builds nginx's allowlist for the chat site: only visitors from Vietnam, Singapore and the US get through.

Two sources:
- DB-IP "IP to Country Lite" (https://db-ip.com, CC BY 4.0) for ordinary connections. A new list comes
  out each month; it is downloaded once per month and kept in CACHE.
- Apple's iCloud Private Relay egress list (https://mask-api.icloud.com/egress-ip-ranges.csv). Relay
  addresses stand for the user's country, but geolocation databases often place them elsewhere (in
  2026-11, DB-IP agreed with Apple for only a quarter of the Vietnam ranges), which is why the first
  Vietnam + Singapore allowlist (0.3.1) blocked iPhones. Apple's own country label is used instead.

Run as root, by setup-host.sh and then daily by familychatui-geo.timer. Writes:
  /etc/nginx/familychatui-geo-allow.conf   one "network 1;" line per allowed network
  /etc/nginx/conf.d/familychatui-geo.conf  geo $familychat_allowed { default 0; include ...; }
The chat vhost's HTTPS server answers 403 when $familychat_allowed is 0 (snippets/familychatui-geo.conf).
Other sites never look at it. On any failure (download, sanity check, nginx -t) the previous files stay.

--dry-run downloads and counts without writing anything (works without root, on any machine).
"""

import csv
import datetime
import gzip
import io
import ipaddress
import os
import shutil
import subprocess
import sys
import urllib.request

COUNTRIES = ("VN", "SG", "US")
ALLOW = "/etc/nginx/familychatui-geo-allow.conf"
GEO = "/etc/nginx/conf.d/familychatui-geo.conf"
CACHE = "/var/cache/familychatui-geo"
APPLE_URL = "https://mask-api.icloud.com/egress-ip-ranges.csv"
MIN_DBIP_PER_COUNTRY = 50  # far below the real counts; fewer means a broken download
MIN_APPLE_PER_COUNTRY = 20  # Apple had 295 Singapore ranges, the fewest, in 2026-11
GEO_BLOCK = f"""# Managed by familychatui deploy/update-geo-allowlist.py. Only the chat site uses this variable.
geo $familychat_allowed {{
    default 0;
    include {ALLOW};
}}
"""


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "familychatui-geo"})
    with urllib.request.urlopen(req, timeout=180) as res:
        return res.read()


def month_candidates() -> list[str]:
    first = datetime.date.today().replace(day=1)
    previous = (first - datetime.timedelta(days=1)).replace(day=1)
    return [first.strftime("%Y-%m"), previous.strftime("%Y-%m")]


def dbip(cache: str | None) -> tuple[str, str]:
    """This month's DB-IP list (the file appears in the first days of the month), else last month's."""
    for month in month_candidates():
        url = f"https://download.db-ip.com/free/dbip-country-lite-{month}.csv.gz"
        cached = os.path.join(cache, os.path.basename(url)) if cache else None
        if cached and os.path.exists(cached):
            with open(cached, "rb") as f:
                return url, gzip.decompress(f.read()).decode()
        try:
            data = fetch(url)
            text = gzip.decompress(data).decode()
        except Exception as err:  # noqa: BLE001 - try the previous month
            print(f"{url}: {err}", file=sys.stderr)
            continue
        if cached:
            os.makedirs(cache, mode=0o755, exist_ok=True)
            for old in os.listdir(cache):  # keep only the newest month
                if old.startswith("dbip-country-lite-"):
                    os.remove(os.path.join(cache, old))
            with open(cached, "wb") as f:
                f.write(data)
        return url, text
    sys.exit("Could not download a DB-IP country list; keeping the current allowlist.")


def dbip_networks(text: str) -> dict[str, list]:
    found: dict[str, list] = {c: [] for c in COUNTRIES}
    for line in text.splitlines():
        parts = [p.strip('"') for p in line.split(",")]
        if len(parts) >= 3 and parts[2] in found:
            start, end = ipaddress.ip_address(parts[0]), ipaddress.ip_address(parts[1])
            found[parts[2]].extend(ipaddress.summarize_address_range(start, end))
    return found


def apple_networks() -> dict[str, list]:
    try:
        text = fetch(APPLE_URL).decode()
    except Exception as err:  # noqa: BLE001
        sys.exit(f"{APPLE_URL}: {err}; keeping the current allowlist.")
    found: dict[str, list] = {c: [] for c in COUNTRIES}
    for row in csv.reader(io.StringIO(text)):  # prefix,country,region,city,
        if len(row) >= 2 and row[1] in found:
            found[row[1]].append(ipaddress.ip_network(row[0], strict=False))
    return found


def check(source: str, found: dict[str, list], minimum: int) -> None:
    for country, nets in found.items():
        if len(nets) < minimum:
            sys.exit(f"Only {len(nets)} {source} networks for {country}; keeping the current allowlist.")


def write_atomic(path: str, text: str) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    url, text = dbip(None if dry_run else CACHE)
    from_dbip = dbip_networks(text)
    check("DB-IP", from_dbip, MIN_DBIP_PER_COUNTRY)
    from_apple = apple_networks()
    check("Private Relay", from_apple, MIN_APPLE_PER_COUNTRY)

    allowed = [n for found in (from_dbip, from_apple) for nets in found.values() for n in nets]
    v4 = list(ipaddress.collapse_addresses(n for n in allowed if n.version == 4))
    v6 = list(ipaddress.collapse_addresses(n for n in allowed if n.version == 6))
    counts = "; ".join(
        f"{c}: DB-IP {len(from_dbip[c])}, Private Relay {len(from_apple[c])}" for c in COUNTRIES
    )
    summary = f"{len(v4) + len(v6)} networks after merging ({counts})"
    if dry_run:
        print(f"Dry run, nothing written. {url} + {APPLE_URL}: {summary}.")
        return

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        f"# Generated {stamp} from {url} and {APPLE_URL}",
        "# IP geolocation by DB-IP (https://db-ip.com), CC BY 4.0. Do not edit: regenerated daily.",
        "127.0.0.0/8 1;",
        "::1/128 1;",
        *(f"{n} 1;" for n in [*v4, *v6]),
    ]

    backups = {p: f"{p}.previous" for p in (ALLOW, GEO) if os.path.exists(p)}
    for path, backup in backups.items():
        shutil.copy2(path, backup)
    write_atomic(ALLOW, "\n".join(lines) + "\n")
    write_atomic(GEO, GEO_BLOCK)
    test = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
    if test.returncode != 0:
        for path in (ALLOW, GEO):
            if path in backups:
                os.replace(backups[path], path)
            elif os.path.exists(path):
                os.remove(path)
        sys.exit(f"nginx -t failed; restored the previous allowlist.\n{test.stderr}")
    subprocess.run(["systemctl", "reload", "nginx"], check=True)
    print(f"Allowlist updated: {summary}.")


if __name__ == "__main__":
    main()
