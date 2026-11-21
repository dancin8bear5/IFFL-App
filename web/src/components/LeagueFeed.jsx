// LeagueFeed — recaps and trade write-ups that publish themselves.
//
// Cloud Functions write leagueFeed/{id} the moment a week's scores or a
// trade lands (functions/leagueFeed.js); there is no approval step, so this
// is a live listener and a new post appears without a reload. Renders
// nothing until there is something to read — an empty "League Feed" header
// in July would be a promise with nothing under it.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useIsDesktop } from '../hooks/useBreakpoint'
import * as fs from '../services/firestoreService'
import { feedMeta, visibleFeed } from '../services/leagueFeed'
import { SectionHeader } from './shared'

const COLLAPSED = 4

export default function LeagueFeed() {
  const { activeSeason, isPreview } = useApp()
  const isDesktop = useIsDesktop()
  const [posts, setPosts] = useState(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    if (isPreview) {
      import('../data/previewData').then((d) => setPosts(d.previewFeed ?? []))
      return
    }
    return fs.listenToLeagueFeed(activeSeason, setPosts, () => setPosts([]))
  }, [isPreview, activeSeason])

  const feed = useMemo(() => visibleFeed(posts), [posts])
  if (!feed.length) return null
  const shown = all ? feed : feed.slice(0, COLLAPSED)

  return (
    <div>
      <SectionHeader
        title="League Feed"
        actionLabel={feed.length > COLLAPSED ? (all ? 'Show less' : `Show all ${feed.length}`) : null}
        onAction={() => setAll((v) => !v)}
      />
      <div style={{
        display: 'grid', gap: 10, marginTop: 10,
        gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
      }}>
        {shown.map((p) => <FeedCard key={p.id} post={p} wide={isDesktop && p.type === 'week'} />)}
      </div>
    </div>
  )
}

function FeedCard({ post, wide }) {
  const { glyph, kicker } = feedMeta(post)
  return (
    <article className="iff-card" style={{ padding: 14, gridColumn: wide ? '1 / -1' : undefined, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--iff-subtext)' }}>
        <span aria-hidden="true">{glyph}</span> {kicker}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, overflowWrap: 'anywhere' }}>{post.title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {post.body}
      </div>
    </article>
  )
}
