// useIsDesktop — single source of truth for the layout switch.
// < 900px: phone layout (bottom tabs, single column, full-screen overlays)
// ≥ 900px: desktop layout (sidebar, multi-column grids, panels/modals)
import { useEffect, useState } from 'react'

export const DESKTOP_QUERY = '(min-width: 900px)'

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY)
    const onChange = (e) => setIsDesktop(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}
