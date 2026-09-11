// usePowerRankings — the released Power Rankings, fetched per drop.
//
// Shared by the Dashboard block and the POD's Rankings tab so the Firestore
// plumbing exists once. It fetches ONLY the drops named in the meta doc's
// `released`, which is the whole security model: an unreleased write-up is
// never sent to a browser, not hidden in one.
//
// The meta doc carries no content and is a listener, so opening a drop
// reaches every open page within seconds without a reload.
import { useEffect, useState } from 'react'
import * as fs from '../services/firestoreService'
import { normalizeReleased, releasedTeams } from '../services/rankingsRelease'
import { editionId as EDITION_ID } from '../data/powerRankingsMeta'

export function usePowerRankings(edition = EDITION_ID) {
  const [meta, setMeta] = useState(null)
  const [bodies, setBodies] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    return fs.listenToPowerRankingsMeta(edition, (m) => { setMeta(m); setLoading(false) })
  }, [edition])

  const released = normalizeReleased(meta?.released)
  const key = released.join(',')

  useEffect(() => {
    let alive = true
    for (const k of released) {
      if (bodies[k]) continue
      fs.fetchPowerRankingsDrop(edition, k)
        .then((d) => { if (alive && d) setBodies((prev) => ({ ...prev, [k]: d })) })
        .catch(() => {})
    }
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, edition])

  return {
    meta,
    released,
    bodies,
    loading,
    teams: releasedTeams(released, bodies),
  }
}
