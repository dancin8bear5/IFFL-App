// TeamLink — a team name that goes to that team's roster.
//
// A real <a href="#rosters/bill">, not a button with an onClick. That
// buys a lot for free: middle-click and ⌘-click open a new tab, the
// browser shows the destination on hover, keyboard and screen readers get
// link semantics, and the phone's back button steps back out of it.
//
// It also means this component needs nothing from React context and no
// setTab plumbed down through every view — the href IS the navigation.
// TabLayout is already listening for hash changes and knows how to turn
// #rosters/bill into "Rosters tab, Bill selected". That's what makes it
// practical to use this at ~70 call sites without threading props through
// all of them.
import { rosterHash } from '../services/routing'
import { TeamAvatar } from './shared'

/**
 * @param name    team name, e.g. "A. Zurek"
 * @param avatar  render the team's avatar before the name
 * @param size    avatar size when `avatar` is set
 * @param bold    numeric font-weight override (call sites vary a lot)
 * @param muted   render in subtext colour — for names that are context
 *                rather than the subject of the row
 * @param as      wrapper element for the avatar+name pair; defaults to span
 * @param style   merged last, so a call site can still override anything
 */
export default function TeamLink({
  name,
  avatar = false,
  size = 20,
  bold,
  muted = false,
  children,
  style,
  ...rest
}) {
  // Nothing to link to. Render the text so the row doesn't lose content —
  // a missing team is a data problem, not a reason to show a blank cell.
  if (!name) return <span style={style}>{children ?? '—'}</span>

  const link = (
    <a
      href={rosterHash(name)}
      className="team-link"
      title={`${name}'s roster`}
      style={{
        color: muted ? 'var(--iff-subtext)' : 'inherit',
        fontWeight: bold,
        textDecoration: 'none',
        // The name should read as part of the row until you go looking for
        // it; the underline on hover is what says "this is a link".
        cursor: 'pointer',
        ...(avatar ? {} : style),
      }}
      {...rest}
    >
      {children ?? name}
    </a>
  )

  if (!avatar) return link

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, ...style }}>
      <a href={rosterHash(name)} className="team-link" title={`${name}'s roster`} aria-hidden="true" tabIndex={-1}>
        <TeamAvatar name={name} size={size} />
      </a>
      {link}
    </span>
  )
}
