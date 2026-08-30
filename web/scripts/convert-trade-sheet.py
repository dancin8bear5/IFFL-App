#!/usr/bin/env python3
"""Convert the hand-kept trade workbook into data/trades-2022-2024.csv.

Run once per new workbook. The CSV it writes is the committed source of
truth from then on; generate-trades-history.mjs turns that into the app's
data file. Python rather than node only because an .xlsx is a zip archive
and node has no bundled unzip — there is no other reason, and nothing else
in this repo depends on it.

    python3 web/scripts/convert-trade-sheet.py <workbook.xlsx>

TWO SHEET LAYOUTS, because the sheet was rebuilt between seasons:

  2022-2023   B=date  C=team A  D=pos  E=asset   G=team B  H=pos  I=asset
              A trade is a dated row plus the undated rows under it;
              a blank row ends it.

  2024        A=date  B=team A + its assets in the rows below
                      C=team B + its assets in the rows below
              No position column, no blank separators — a new date in
              column A is the only thing that starts a new trade.

Both sheets record what each side RECEIVED, which is also how
web/src/data/trades2026.js is kept and the opposite of the app's
assetsFromProposer/assetsFromReceiver. The flip happens once, later, in
seedHistoricalTrades(). Do not flip it here.
"""
import sys, zipfile, datetime, csv, re
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

# What the sheet calls people vs. the master team names the app uses.
# 'Zurek' on its own is Matt: both 2022 and 2023 name Andrew explicitly
# elsewhere on the same sheet, and 2024 switches to 'Matt' / 'M Zurek'
# while still writing 'Andrew' for the other brother.
ALIASES = {
    'corey': 'Abad', 'abad': 'Abad',
    'andrew': 'A. Zurek', 'a. zurek': 'A. Zurek', 'a zurek': 'A. Zurek',
    'zurek': 'M. Zurek', 'matt': 'M. Zurek', 'm zurek': 'M. Zurek', 'm. zurek': 'M. Zurek',
    'wayne': 'Wayne', 'jared': 'Jared', 'cantone': 'Cantone', 'dugan': 'Dugan',
    'bill': 'Bill', 'ryan': 'Ryan', 'faybik': 'Faybik', 'jason': 'Jason',
    'foley': 'Foley',
}


def team(raw):
    key = re.sub(r"[^a-z. ]", '', (raw or '').strip().lower())
    return ALIASES.get(key)


def cells(row, shared):
    out = {}
    for c in row.findall(f'{NS}c'):
        col = ''.join(ch for ch in c.get('r') if ch.isalpha())
        v, t = c.find(f'{NS}v'), c.get('t')
        if t == 'inlineStr':
            val = ''.join(x.text or '' for x in c.iter(f'{NS}t'))
        elif v is None:
            val = ''
        elif t == 's':
            val = shared[int(v.text)]
        else:
            val = v.text
        val = str(val or '').strip()
        if val:
            out[col] = val
    return out


def xdate(n):
    try:
        return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(n)))).isoformat()
    except (TypeError, ValueError):
        return None


# A pick reads three ways across the sheets. All three carry the same two
# facts — which season, and which slot or round — and usually the team it
# originally belonged to.
PICK_PATTERNS = [
    re.compile(r'^(?P<season>\d{4})\s+(?P<slot>\d\.\d{2})\s*\((?P<orig>[^)]+?)\'?s?\)$'),  # 2023 1.05 (Ryan)
    re.compile(r'^(?P<season>\d{4})\s+(?P<round>\d)(?:st|nd|rd|th)\s*\((?P<orig>[^)]+?)\'?s?\)$'),  # 2023 2nd (Bill's)
    re.compile(r'^(?P<orig>.+?)\s+(?P<season>\d{4})\s+(?P<slot>\d\.\d{2})$'),  # Foley 2024 1.02
    re.compile(r'^(?P<orig>.+?)\s+(?P<season>\d{4})\s+(?P<round>\d)(?:st|nd|rd|th)$'),  # Jason 2025 1st
    re.compile(r'^(?P<season>\d{4})\s+(?P<slot>\d\.\d{2})$'),  # 2022 1.01
    re.compile(r'^(?P<season>\d{4})\s+(?P<round>\d)(?:st|nd|rd|th)$'),  # 2025 1st
]


def classify(name):
    """-> (kind, pick_season, pick_slot, pick_round, original_team)"""
    for pat in PICK_PATTERNS:
        m = pat.match(name.strip())
        if m:
            g = m.groupdict()
            return ('pick', g.get('season'), g.get('slot') or '',
                    g.get('round') or (g['slot'].split('.')[0] if g.get('slot') else ''),
                    team(g.get('orig')) or (g.get('orig') or '').strip())
    return ('player', '', '', '', '')


def parse(path):
    z = zipfile.ZipFile(path)
    shared = []
    try:
        ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in ss.findall(f'{NS}si'):
            shared.append(''.join(t.text or '' for t in si.iter(f'{NS}t')))
    except KeyError:
        pass

    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = {}
    for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')):
        rels[r.get('Id')] = r.get('Target')

    trades = []
    for sheet in wb.iter(f'{NS}sheet'):
        name = sheet.get('name')
        m = re.search(r'(20\d\d)', name or '')
        if not m:
            continue
        season = int(m.group(1))
        rid = sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        target = rels[rid].lstrip('/')
        rows = [cells(r, shared) for r in ET.fromstring(z.read('xl/' + target.replace('xl/', ''))).iter(f'{NS}row')]

        legacy = any(r.get('B') == 'Date' for r in rows[:2])
        cur = None
        for i, r in enumerate(rows):
            if legacy:
                if i == 0:
                    continue
                if not r:
                    if cur:
                        trades.append(cur)
                    cur = None
                    continue
                if 'B' in r:
                    if cur:
                        trades.append(cur)
                    cur = {'season': season, 'date': xdate(r['B']),
                           'a': {'team': team(r.get('C')), 'raw': r.get('C', ''), 'received': []},
                           'b': {'team': team(r.get('G')), 'raw': r.get('G', ''), 'received': []}}
                if cur is None:
                    continue
                if r.get('E'):
                    cur['a']['received'].append(r['E'])
                if r.get('I'):
                    cur['b']['received'].append(r['I'])
            else:
                if 'A' in r:
                    if cur:
                        trades.append(cur)
                    cur = {'season': season, 'date': xdate(r['A']),
                           'a': {'team': team(r.get('B')), 'raw': r.get('B', ''), 'received': []},
                           'b': {'team': team(r.get('C')), 'raw': r.get('C', ''), 'received': []}}
                    continue
                if cur is None:
                    continue
                if r.get('B'):
                    cur['a']['received'].append(r['B'])
                if r.get('C'):
                    cur['b']['received'].append(r['C'])
        if cur:
            trades.append(cur)
    return trades


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if not src:
        sys.exit('usage: convert-trade-sheet.py <workbook.xlsx>')
    trades = parse(src)

    problems = []
    rows = []
    for n, t in enumerate(trades):
        a, b = t['a'], t['b']
        if not a['team'] or not b['team']:
            problems.append(f"{t['season']} {t['date']}: unrecognised team "
                            f"{a['raw']!r} / {b['raw']!r}")
            continue
        if not a['received'] and not b['received']:
            problems.append(f"{t['season']} {t['date']}: {a['team']}/{b['team']} has no assets")
            continue
        tid = f"{t['season']}-{n:03d}"
        # One row per asset that moved: `to` received it, `frm` gave it up.
        for side, other in ((a, b), (b, a)):
            for asset in side['received']:
                kind, ps, slot, rnd, orig = classify(asset)
                rows.append({
                    'trade_id': tid, 'season': t['season'], 'date': t['date'] or '',
                    'to_team': side['team'], 'from_team': other['team'],
                    'asset': asset, 'asset_type': kind,
                    'pick_season': ps, 'pick_slot': slot, 'pick_round': rnd,
                    'pick_original_team': orig,
                })

    out = 'data/trades-2022-2024.csv'
    with open(out, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    kept = len({r['trade_id'] for r in rows})
    print(f'{kept} trades, {len(rows)} asset movements -> {out}')
    by = {}
    for r in rows:
        by.setdefault(r['season'], set()).add(r['trade_id'])
    for s in sorted(by):
        print(f'   {s}: {len(by[s])} trades')
    picks = [r for r in rows if r['asset_type'] == 'pick']
    print(f'   {len(picks)} pick movements, {len(rows) - len(picks)} player movements')
    if problems:
        print(f'\n{len(problems)} rows skipped:')
        for p in problems:
            print('   ', p)


if __name__ == '__main__':
    main()
