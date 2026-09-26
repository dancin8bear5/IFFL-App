// ErrorBoundary — keeps one broken component from taking down the app.
//
// Before this, any render-time exception anywhere unmounted the entire
// React tree and left a blank white page, with no route back except a
// manual browser reload. That is the worst possible failure mode for a
// phone-first app that people open from a home-screen icon.
//
// Two levels are used (see App.jsx / TabLayout.jsx):
//   · app level  — last resort; offers a full reload
//   · tab level  — a crash in Rosters leaves every OTHER tab usable, and
//                  "Try again" re-mounts just that subtree
//
// "Try again" genuinely re-mounts rather than just hiding the error: the
// `resetKey` bump forces React to build a fresh instance of the child, so
// a fault caused by transient state (a bad snapshot, a half-loaded doc)
// clears on retry instead of re-throwing forever.
import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, resetKey: 0 }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Kept as console output rather than shipped anywhere: this league has
    // twelve users and no error-reporting budget. It still means a member
    // can open the console (or hand Jared a screenshot) and the stack is
    // right there.
    console.error(`[${this.props.label ?? 'app'}] crashed:`, error, info?.componentStack)
  }

  retry = () => this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }))

  render() {
    const { error } = this.state
    if (!error) {
      // key forces a fresh mount of the subtree on retry
      return <div key={this.state.resetKey} style={{ display: 'contents' }}>{this.props.children}</div>
    }

    const isTab = Boolean(this.props.label)
    return (
      <div className="iff-card" style={{ margin: 16, padding: 20, borderLeft: '3px solid var(--iff-accent)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
          {isTab ? `${this.props.label} hit a snag` : 'Something broke'}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--iff-subtext)', lineHeight: 1.6, marginBottom: 12 }}>
          {isTab
            ? 'The rest of the app still works — switch tabs, or try loading this one again.'
            : 'The app ran into an unexpected error. Reloading usually clears it.'}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={this.retry} style={{ fontSize: 12, padding: '7px 16px' }}>
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ fontSize: 12, padding: '7px 14px', color: 'var(--iff-subtext)' }}
          >
            Reload app
          </button>
        </div>

        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 11, color: 'var(--iff-subtext)', cursor: 'pointer' }}>
            Technical details
          </summary>
          <pre
            style={{
              marginTop: 8, fontSize: 10.5, lineHeight: 1.5, color: 'var(--iff-subtext)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflow: 'auto',
            }}
          >
            {String(error?.message ?? error)}
          </pre>
        </details>
      </div>
    )
  }
}
