import { useEffect, useRef, useState } from "react"
import { useAuth } from "react-oidc-context"
import { NavLink, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { getMe } from "../api"

// ──────────────────────────────────────────────
// Logo
// ──────────────────────────────────────────────

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600 dark:text-indigo-400">
      <circle cx="13" cy="13" r="11.5" strokeWidth="1.5" />
      <circle cx="13" cy="13" r="8.5" strokeWidth="1" opacity="0.35" />
      <path d="M9.5 18 L13 10 L16.5 18" strokeWidth="2" />
      <line x1="10.8" y1="15" x2="15.2" y2="15" strokeWidth="2" />
    </svg>
  )
}

// ──────────────────────────────────────────────
// Icons (inline SVG, stroke-based, 20×20)
// ──────────────────────────────────────────────

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function IconList() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}


function IconCoin() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9.5a2.5 2.5 0 0 0-5 0v5a2.5 2.5 0 0 0 5 0" />
    </svg>
  )
}

function IconGem() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="6 3 18 3 22 9 12 22 2 9" />
      <line x1="2" y1="9" x2="22" y2="9" />
      <line x1="6" y1="3" x2="12" y2="22" />
      <line x1="18" y1="3" x2="12" y2="22" />
    </svg>
  )
}

function IconTrendingUp() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

function IconCreditCard() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

function IconBuilding() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="9" width="18" height="13" rx="1" />
      <path d="M3 9l9-6 9 6" />
      <rect x="9" y="14" width="6" height="8" />
    </svg>
  )
}

function IconPiggyBank() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2z" />
      <path d="M2 9V7c0-1.1.9-2 2-2h1" />
      <circle cx="15.5" cy="10.5" r=".5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconBanknote() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <circle cx="12" cy="12.5" r="2.5" />
      <path d="M6 9.5v.01M6 15.5v.01M18 9.5v.01M18 15.5v.01" />
    </svg>
  )
}

function IconRepeat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}


function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

// ──────────────────────────────────────────────
// NavItem
// ──────────────────────────────────────────────

function NavItem({ to, icon, label, showLabel }: { to: string; icon: React.ReactNode; label: string; showLabel: boolean }) {
  return (
    <NavLink
      to={to}
      title={showLabel ? undefined : label}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
          isActive
            ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
            : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
        }`
      }
    >
      {icon}
      {showLabel && <span className="text-sm font-medium truncate">{label}</span>}
    </NavLink>
  )
}

// Section header: same total height in both modes so items below don't shift.
// Expanded: pt-5 + text(~16px) + pb-1 ≈ 40px. Collapsed: pt-5 + h-4(16px) + pb-1 = 40px.
function SectionHeader({ label, showLabel }: { label: string; showLabel: boolean }) {
  return (
    <div className="pt-5 pb-1">
      {showLabel ? (
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 truncate">
          {label}
        </p>
      ) : (
        <div className="h-4 flex items-center">
          <div className="w-full border-t border-gray-100 dark:border-gray-800 mx-1" />
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Layout
// ──────────────────────────────────────────────

export default function Layout({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const token = auth.user?.access_token ?? ""
  const navigate = useNavigate()

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => getMe(token),
    enabled: !!token,
  })

  // Sidebar expanded/collapsed, persisted in localStorage
  const [expanded, setExpanded] = useState(() => localStorage.getItem("sidebar") !== "collapsed")
  // displayLabels trails expanded: goes false immediately on collapse, but waits for the
  // width animation (200ms) before going true on expand — prevents the left-to-right wipe.
  const [displayLabels, setDisplayLabels] = useState(expanded)

  useEffect(() => {
    if (!expanded) {
      setDisplayLabels(false)
      return
    }
    const t = setTimeout(() => setDisplayLabels(true), 200)
    return () => clearTimeout(t)
  }, [expanded])

  function toggleSidebar() {
    setExpanded((v) => {
      const next = !v
      localStorage.setItem("sidebar", next ? "expanded" : "collapsed")
      return next
    })
  }

  // Track OS dark mode preference for "system" theme
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  )
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = (e: MediaQueryListEvent) => setPrefersDark(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  // Apply theme class to <html>
  useEffect(() => {
    const theme = me?.theme ?? "system"
    const isDark = theme === "dark" || (theme === "system" && prefersDark)
    document.documentElement.classList.toggle("dark", isDark)
  }, [me?.theme, prefersDark])

  const displayName = me?.name || me?.email || auth.user?.profile.email || "Account"

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Top header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {expanded
              ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
          </button>
          <Logo />
          <span className="font-semibold text-lg text-gray-900 dark:text-gray-100">Argent</span>
        </div>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 px-2 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-semibold select-none">
              {displayName.charAt(0).toUpperCase()}
            </span>
            <span>{displayName}</span>
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50">
              <button
                onClick={() => { setMenuOpen(false); navigate("/profile") }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Profile
              </button>
              <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
              <button
                onClick={() => auth.signoutRedirect()}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside
          style={{ width: expanded ? 220 : 64 }}
          className="flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-[width] duration-200 overflow-hidden z-10"
        >
          <nav className="flex-1 p-2 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
            <div className="pt-3" />
            <NavItem to="/dashboard" icon={<IconHome />} label="Dashboard" showLabel={displayLabels} />

            {/* Banking section */}
            <SectionHeader label="Banking" showLabel={displayLabels} />

            <NavItem to="/checking" icon={<IconCreditCard />} label="Checking" showLabel={displayLabels} />
            <NavItem to="/savings" icon={<IconPiggyBank />} label="Savings" showLabel={displayLabels} />
            <NavItem to="/overview" icon={<IconList />} label="Transactions" showLabel={displayLabels} />
            <NavItem to="/subscriptions" icon={<IconRepeat />} label="Subscriptions" showLabel={displayLabels} />
            <NavItem to="/settings" icon={<IconSettings />} label="Settings" showLabel={displayLabels} />

            {/* Liabilities section */}
            <SectionHeader label="Liabilities" showLabel={displayLabels} />
            <NavItem to="/mortgages" icon={<IconBuilding />} label="Mortgages" showLabel={displayLabels} />
            <NavItem to="/loans" icon={<IconBanknote />} label="Loans" showLabel={displayLabels} />

            {/* Investments section */}
            <SectionHeader label="Investments" showLabel={displayLabels} />

            <NavItem to="/crypto" icon={<IconCoin />} label="Crypto" showLabel={displayLabels} />
            <NavItem to="/metals" icon={<IconGem />} label="Metals" showLabel={displayLabels} />
            <NavItem to="/stocks" icon={<IconTrendingUp />} label="Stocks" showLabel={displayLabels} />

            {/* Push admin/profile to bottom */}
            <div className="flex-1" />
            <div className="border-t border-gray-100 dark:border-gray-800 my-2" />

            {me?.isAdmin && (
              <NavItem to="/admin" icon={<IconShield />} label="Admin" showLabel={displayLabels} />
            )}
            <NavItem to="/profile" icon={<IconUser />} label="Profile" showLabel={displayLabels} />
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
