// ArchiveView — where an edition goes when it stops being the current one.
//
// The Dashboard carries the NEWEST Power Rankings and the newest
// Championship Odds; everything older is here. Nothing is retired by hand —
// publishing a new edition adds a line to data/articles.js and the previous
// one lands in this list in the same edit. See services/archive.js.
//
// Not a seventh League History tab: those six are declarations of columns
// and rows, rendered as a searchable, sortable, exportable table. These are
// eight-thousand-word write-ups, and forcing one through a table gives you a
// column of eight-thousand-character cells.
//
// An edition opens in an OVERLAY here rather than by navigating to its own
// page. TabLayout normalises the hash back to a bare tab slug, so an
// in-session jump to #power-rankings/2025-preseason would lose the edition
// before that lazy view mounted. A shared link still works on a cold load —
// that path reads services/routing's boot snapshot.
import { Suspense, lazy, useState } from 'react'
import { ARTICLES, KIND_META } from '../data/articles'
import { archiveBySeason } from '../services/archive'
import { oddsForSeason } from '../data/odds/index.js'
import { DetailOverlay, LoadingList, SectionHeader } from '../components/shared'
import OddsBoard from '../components/OddsBoard'

const PowerRankingsView = lazy(() => import('./PowerRankingsView'))

export default function ArchiveView() {
  const seasons = archiveBySeason(ARTICLES)
  const [open, setOpen] = useState(null)   // the article being read

  return (
    <div style={{ padding: '4px 0 40px' }}>
      <SectionHeader title="🗄️ The Archive" />
      <p style={{ fontSize: 12.5, color: 'var(--iff-subtext)', lineHeight: 1.6, margin: '2px 4px 18px', maxWidth: 620 }}>
        Everything the league has published that isn&apos;t the current edition. The newest Power
        Rankings and the newest Championship Odds stay on the Dashboard; when the next ones come
        out, these move here on their own.
      </p>

      {!seasons.length && (
        <div className="iff-card" style={{ padding: 20, maxWidth: 620 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Nothing archived yet</div>
          <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 6, lineHeight: 1.6 }}>
            There is one edition of each piece so far and both are current, so both are on the
            Dashboard. The first one lands here the day it&apos;s replaced.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>
        {seasons.map(({ season, items }) => (
          <div key={season}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: 'var(--iff-subtext)', margin: '0 4px 8px' }}>
              {season}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((a) => (
                <button
                  key={`${a.kind}:${a.id}`}
                  className="iff-card"
                  onClick={() => setOpen(a)}
                  style={{ display: 'flex', gap: 13, alignItems: 'flex-start', padding: '14px 16px', textAlign: 'left', width: '100%' }}
                >
                  <span style={{ fontSize: 20, lineHeight: 1.2, flexShrink: 0 }}>
                    {KIND_META[a.kind]?.glyph ?? '📄'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800 }}>{a.title}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
                      {a.edition} · {a.date}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--iff-subtext)', marginTop: 7, lineHeight: 1.6 }}>
                      {a.blurb}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--iff-subtext)' }}>›</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <DetailOverlay title={open.title} onBack={() => setOpen(null)} desktop="modal">
          {open.kind === 'rankings' ? (
            <Suspense fallback={<LoadingList count={2} />}>
              {/* A retired edition is open in full, including sections that
                  were never released — the embargo governed the order of a
                  reveal, and that reveal is over. The rule itself lives in
                  services/archive.js, not here. `embedded` keeps the
                  sections collapsed, which is what makes a long piece
                  navigable in a popup. */}
              <PowerRankingsView embedded edition={open.id} />
            </Suspense>
          ) : (
            <div style={{ padding: '14px 16px 24px' }}>
              <OddsBoard embedded edition={oddsForSeason(open.id)} />
            </div>
          )}
        </DetailOverlay>
      )}
    </div>
  )
}
