// ArchiveView — where everything the league publishes goes after two weeks.
//
// The Dashboard carries what is NEW: an edition of the Power Rankings or the
// Championship Odds for its first fourteen days, and the last fourteen days
// of the League Feed. Everything older — and any edition a newer one has
// replaced — is here. Nothing is retired by hand; the one rule is
// ARCHIVE_AFTER_DAYS in services/archive.js.
//
// An aged edition is still the CURRENT edition: its unreleased sections stay
// locked here exactly as they were on the Dashboard (releasedFor). Only an
// edition that has been REPLACED opens in full.
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
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import * as fs from '../services/firestoreService'
import { splitFeed } from '../services/leagueFeed'
import { FeedCard } from '../components/LeagueFeed'
import { ARTICLES, KIND_META } from '../data/articles'
import { archiveBySeason } from '../services/archive'
import { oddsForSeason } from '../data/odds/index.js'
import { DetailOverlay, LoadingList, SectionHeader } from '../components/shared'
import OddsBoard from '../components/OddsBoard'

const PowerRankingsView = lazy(() => import('./PowerRankingsView'))

export default function ArchiveView() {
  const { activeSeason, isPreview, areaEnabled } = useApp()
  const seasons = archiveBySeason(ARTICLES)
  const [open, setOpen] = useState(null)   // the article being read

  // League Feed posts more than two weeks old. Same listener the Dashboard
  // uses; this page shows the other half of the split.
  const feedOn = areaEnabled ? areaEnabled('feed') : true
  const [posts, setPosts] = useState(null)
  useEffect(() => {
    if (!feedOn) return
    if (isPreview) { import('../data/previewData').then((d) => setPosts(d.previewFeed ?? [])); return }
    return fs.listenToLeagueFeed(activeSeason, setPosts, () => setPosts([]))
  }, [feedOn, isPreview, activeSeason])
  const past = useMemo(() => (feedOn ? splitFeed(posts).past : []), [feedOn, posts])
  const pastByWeek = useMemo(() => {
    const groups = new Map()
    for (const p of past) {
      const label = p.week ? `Week ${p.week}` : 'Trades & news'
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label).push(p)
    }
    return [...groups.entries()]
  }, [past])

  return (
    <div style={{ padding: '4px 0 40px' }}>
      <SectionHeader title="🗄️ The Archive" />
      <p style={{ fontSize: 12.5, color: 'var(--iff-subtext)', lineHeight: 1.6, margin: '2px 4px 18px', maxWidth: 620 }}>
        Everything the league has published that is more than two weeks old: Power Rankings,
        Championship Odds, and League Feed recaps. New pieces spend their first two weeks on the
        Dashboard, then move here on their own.
      </p>

      {!seasons.length && !past.length && (
        <div className="iff-card" style={{ padding: 20, maxWidth: 620 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Nothing archived yet</div>
          <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 6, lineHeight: 1.6 }}>
            Everything published so far is less than two weeks old, so it is all still on the
            Dashboard. The first piece lands here when it turns two weeks old.
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

      {past.length > 0 && (
        <div style={{ maxWidth: 720, marginTop: seasons.length ? 26 : 0 }}>
          <SectionHeader title={`📰 League Feed · ${activeSeason}`} />
          <p style={{ fontSize: 12, color: 'var(--iff-subtext)', margin: '4px 4px 12px' }}>
            Recaps, trade write-ups and notices older than two weeks, newest first.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {pastByWeek.map(([label, items]) => (
              <div key={label}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: 'var(--iff-subtext)', margin: '0 4px 8px' }}>
                  {label.toUpperCase()}
                </div>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' }}>
                  {items.map((p) => <FeedCard key={p.id} post={p} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {open && (
        <DetailOverlay title={open.title} onBack={() => setOpen(null)} desktop="modal">
          {open.kind === 'rankings' ? (
            <Suspense fallback={<LoadingList count={2} />}>
              {/* A REPLACED edition is open in full, including sections that
                  were never released — the embargo governed the order of a
                  reveal, and that reveal is over. One that is here only
                  because it is two weeks old is still the current edition
                  and keeps its gate. The rule lives in services/archive.js
                  (releasedFor), not here. `embedded` keeps the
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
