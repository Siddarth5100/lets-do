import type { ViewName } from '../../types/planner'
import { Icon } from '../ui/Icon'

interface DesktopNavigationProps {
  activeView: ViewName
  sidebarCollapsed: boolean
  onNavigate: (view: ViewName) => void
  onToggleSidebar: () => void
}

interface BottomNavigationProps {
  activeView: ViewName
  onNavigate: (view: ViewName) => void
  onAdd: () => void
}

const todayNavigationItem = { view: 'today' as const, label: 'Today', icon: 'today' as const }
const settingsNavigationItem = { view: 'settings' as const, label: 'Settings', icon: 'settings' as const }

type NavigationItem = typeof todayNavigationItem | typeof settingsNavigationItem

export function DesktopNavigation({ activeView, sidebarCollapsed, onNavigate, onToggleSidebar }: DesktopNavigationProps) {
  return (
    <aside className={`relative hidden min-h-screen shrink-0 flex-col border-r border-slate-200/80 bg-white/85 p-4 backdrop-blur transition-[width] duration-300 lg:flex ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
      <div className={`mb-10 px-2 ${sidebarCollapsed ? 'text-center' : ''}`}><div className="text-2xl font-black tracking-tight text-slate-950">{sidebarCollapsed ? 'L' : 'Let’s Do'}<span className="text-[var(--accent)]">.</span></div>{!sidebarCollapsed && <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Plan it. Do it. Feel good.</p>}</div>
      <button type="button" className="absolute -right-4 top-24 grid size-8 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition hover:text-[var(--accent-strong)]" onClick={onToggleSidebar} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed}><Icon name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} className="size-4" /></button>
      <nav className="space-y-2" aria-label="Main navigation">
        <DesktopNavigationButton item={todayNavigationItem} active={activeView === 'today'} collapsed={sidebarCollapsed} onClick={() => onNavigate('today')} />
      </nav>
      <nav className="mt-auto" aria-label="Settings navigation">
        <DesktopNavigationButton item={settingsNavigationItem} active={activeView === 'settings'} collapsed={sidebarCollapsed} onClick={() => onNavigate('settings')} />
      </nav>
    </aside>
  )
}

function DesktopNavigationButton({ item, active, collapsed, onClick }: { item: NavigationItem; active: boolean; collapsed: boolean; onClick: () => void }) {
  return <button type="button" className={`flex w-full items-center rounded-2xl py-3.5 font-semibold transition ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} ${active ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`} onClick={onClick} title={collapsed ? item.label : undefined}><Icon name={item.icon} className="size-5" />{!collapsed && item.label}</button>
}

export function BottomNavigation({ activeView, onNavigate, onAdd }: BottomNavigationProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-slate-200 bg-white/95 px-4 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,.08)] backdrop-blur lg:hidden" aria-label="Main navigation">
      <MobileNavigationButton item={todayNavigationItem} active={activeView === 'today'} onClick={() => onNavigate('today')} />
      <button type="button" className="flex flex-col items-center gap-1 text-xs font-semibold text-[var(--accent-strong)]" onClick={onAdd}><span className="-mt-6 grid size-12 place-items-center rounded-full bg-[var(--accent)] text-white shadow-lg shadow-[var(--glow)]"><Icon name="plus" className="size-6" /></span>Add task</button>
      <MobileNavigationButton item={settingsNavigationItem} active={activeView === 'settings'} onClick={() => onNavigate('settings')} />
    </nav>
  )
}

function MobileNavigationButton({ item, active, onClick }: { item: NavigationItem; active: boolean; onClick: () => void }) {
  return <button type="button" className={`flex flex-col items-center gap-1 rounded-xl py-1 text-xs font-semibold ${active ? 'text-[var(--accent-strong)]' : 'text-slate-400'}`} onClick={onClick}><Icon name={item.icon} className="size-5" />{item.label}</button>
}
