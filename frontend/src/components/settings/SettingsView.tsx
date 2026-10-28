import { weekdayThemes } from '../../data/themes'
import type { PlannerSettings } from '../../types/planner'
import { Icon } from '../ui/Icon'

interface SettingsViewProps {
  settings: PlannerSettings
  automaticThemeId: string
  onSave: (settings: PlannerSettings) => void
  onOpenReview: () => void
}

export function SettingsView({
  settings,
  automaticThemeId,
  onSave,
  onOpenReview,
}: SettingsViewProps) {
  const selectTheme = (manualThemeId: string | null) => {
    onSave({ ...settings, manualThemeId })
  }

  return (
    <div className="space-y-7">
      <header>
        <p className="section-kicker">Make it yours</p>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">
          Set the pace and choose the color that helps today feel like yours.
        </p>
      </header>

      <section className="panel p-5 sm:p-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Weekday theme</h2>
            <p className="mt-1 text-sm text-slate-500">
              Follow the weekday automatically or keep one theme selected.
            </p>
          </div>
          <button
            type="button"
            className={`button-secondary ${settings.manualThemeId === null ? 'border-[var(--accent)] text-[var(--accent-strong)]' : ''}`}
            onClick={() => selectTheme(null)}
          >
            Automatic
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {weekdayThemes.map((theme) => {
            const themeIsActive = settings.manualThemeId === theme.id || (
              settings.manualThemeId === null && automaticThemeId === theme.id
            )

            return (
              <button
                type="button"
                key={theme.id}
                className={`rounded-2xl border-2 p-3 text-left transition ${themeIsActive ? 'border-slate-800 shadow-md' : 'border-transparent hover:border-slate-200'}`}
                style={{ backgroundColor: theme.accentSoft }}
                onClick={() => selectTheme(theme.id)}
                aria-pressed={settings.manualThemeId === theme.id}
              >
                <span
                  className="block size-7 rounded-full"
                  style={{ backgroundColor: theme.accent }}
                />
                <span className="mt-3 block text-xs font-bold text-slate-700">
                  {theme.name.replace(/^(\w+) /, '')}
                </span>
                <span className="mt-0.5 block text-[10px] text-slate-500">{theme.id}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <h2 className="text-xl font-black text-slate-900">Daily review</h2>
          <p className="mt-1 text-sm text-slate-500">
            Review any date, then explicitly confirm today’s plan for your activity streak.
          </p>
        </div>
        <button type="button" className="button-primary shrink-0" onClick={onOpenReview}>
          <Icon name="check" className="size-4" />
          Open Review Plan
        </button>
      </section>

      <section className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
        <strong className="text-slate-700">Coming later:</strong>{' '}
        rest days, recurring routines, account sync, and real reminder delivery are intentionally
        outside this milestone.
      </section>
    </div>
  )
}
