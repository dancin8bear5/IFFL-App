import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppProvider } from './context/AppContext'
import ErrorBoundary from './components/ErrorBoundary'
import { applyCachedAppearance } from './services/appearance'
import './styles/theme.css'

// Paint in the user's own theme from the first frame. The saved settings
// live in Firestore and arrive after auth, which is a round trip away — so
// without this the app shows Modern and then switches, and a read that is
// slow or fails leaves the wrong theme on screen for good.
applyCachedAppearance()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
