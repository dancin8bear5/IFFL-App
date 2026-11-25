// LeagueFeed — recaps and trade write-ups that publish themselves.
//
// Cloud Functions write leagueFeed/{id} the moment a week's scores or a
// trade lands (functions/leagueFeed.js); there is no approval step, so this
// is a live listener and a new post appears without a reload. Renders
// nothing until there is something to read — an empty "League Feed" header
// in July would be a promise with nothing under it.
//
// It lives in the Dashboard RAIL (270–300px), so it is built narrow-first:
// one column there, and the grid only grows columns if Admin → Layout moves
// it somewhere wider. Posts are clamped to a few lines and open on a tap —
// seven recaps at full length would push everything else in the rail off
// the screen.
//
// Only the last TWO WEEKS show here (services/leagueFeed.splitFeed, the same
// ARCHIVE_AFTER_DAYS every other published thing uses). Older posts are on
// the archive page, and the link to them appears only when there are some.
// Matchup write-ups are stricter: only the LATEST week's show, and an older
// week's go to the archive the moment a newer week's land.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import * as fs from '../services/firestoreService'
import { feedMeta, splitFeed } from '../services/leagueFeed'
import { SectionHeader } from './shared'

const COLLAPSED = 4

export default function LeagueFeed({ onOpenArchive }) {
  const { activeSeason, isPreview } = useApp()
  const [posts, setPosts] = useState(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    if (isPreview) {
      import('../data/previewData').then((d) => setPosts(d.previewFeed ?? []))
      return
    }
    return fs.listenToLeagueFeed(activeSeason, setPosts, () => setPosts([]))
  }, [isPreview, activeSeason])

  const { recent, past } = useMemo(() => splitFeed(posts), [posts])
  if (!recent.length) return null
  const shown = all ? recent : recent.slice(0, COLLAPSED)

  return (
    <div>
      <SectionHeader
        title="League Feed"
        actionLabel={recent.length > COLLAPSED ? (all ? 'Show less' : `Show all ${recent.length}`) : null}
        onAction={() => setAll((v) => !v)}
      />
      <div style={{
        display: 'grid', gap: 8, marginTop: 10,
        // One column in the rail and on a phone; more only where there is room.
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
      }}>
        {shown.map((p) => <FeedCard key={p.id} post={p} />)}
      </div>
      {past.length > 0 && onOpenArchive && (
        <button
          onClick={onOpenArchive}
          style={{ marginTop: 10, fontSize: 11.5, fontWeight: 700, color: 'var(--iff-accent)', minHeight: 32 }}
        >
          Older posts in the Archive ›
        </button>
      )}
    </div>
  )
}

export function FeedCard({ post, startOpen = false }) {
  const [open, setOpen] = useState(startOpen)
  const { glyph, kicker } = feedMeta(post)
  // Short posts have nothing to expand; don't offer a control that does nothing.
  const long = String(post.body ?? '').length > 150 || String(post.body ?? '').includes('\n')
  return (
    <article className="iff-card" style={{ padding: 12, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--iff-subtext)' }}>
        <span aria-hidden="true">{glyph}</span> {kicker}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4, overflowWrap: 'anywhere' }}>{post.title}</div>
      <div style={{
        fontSize: 12.5, lineHeight: 1.55, marginTop: 5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
        ...(open || !long ? {} : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
      }}>
        {post.body}
      </div>
      {long && (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: 'var(--iff-accent)', minHeight: 32 }}
        >
          {open ? 'Less' : 'Read more'}
        </button>
      )}
    </article>
  )
}
