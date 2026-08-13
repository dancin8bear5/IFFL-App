// AppContext — web port of AppState (App/CodeRedApp.swift).
// Phase 1: auth state + user resolution skeleton.
// Phase 2 adds the five Firestore listeners and league data.
import { createContext, useContext, useEffect, useState } from 'react'
import { listenToAuth } from '../services/authService'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  // Auth
  const [user, setUser] = useState(null)          // Firebase User | null
  const [authReady, setAuthReady] = useState(false) // first auth callback fired

  // Mirrors of AppState @Published (wired to Firestore in Phase 2)
  const [userTeam, setUserTeam] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [activeSeason, setActiveSeason] = useState(2026)
  const [isOffSeason, setIsOffSeason] = useState(false)
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false)

  // Admin gate — same email check as AppState.isAdmin
  const isAdmin = user?.email === 'jaredrogtaylor@gmail.com'

  useEffect(() => {
    return listenToAuth((u) => {
      setUser(u)
      setAuthReady(true)
    })
  }, [])

  const value = {
    user,
    authReady,
    isAdmin,
    userTeam, setUserTeam,
    selectedTeam, setSelectedTeam,
    activeSeason, setActiveSeason,
    isOffSeason, setIsOffSeason,
    isInitialLoadComplete, setIsInitialLoadComplete,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
