// useIsDesktop — single source of truth for the layout switch.
// < 900px: phone layout (bottom tabs, single column, full-screen overlays)
// ≥ 900px: desktop layout (sidebar, multi-column grids, panels/modals)
import { useEffect, useState } from 'react'

export const DESKTOP_QUERY = '(min-width: 900px)'

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (e) => setMatches(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export function useIsDesktop() {
  return useMediaQuery(DESKTOP_QUERY)
}
