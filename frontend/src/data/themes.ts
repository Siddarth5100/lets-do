export interface WeekdayTheme {
  id: string
  name: string
  accent: string
  accentStrong: string
  accentSoft: string
  page: string
  glow: string
}

export const weekdayThemes: WeekdayTheme[] = [
  { id: 'sunday', name: 'Sunday Peach', accent: '#e76f51', accentStrong: '#9f321f', accentSoft: '#fff0e8', page: '#fffaf6', glow: '#ffd7c5' },
  { id: 'monday', name: 'Monday Blue', accent: '#3578c7', accentStrong: '#174f91', accentSoft: '#e9f3ff', page: '#f7fbff', glow: '#c9e3ff' },
  { id: 'tuesday', name: 'Tuesday Coral', accent: '#d95d76', accentStrong: '#963047', accentSoft: '#fff0f3', page: '#fff9fa', glow: '#ffd2dc' },
  { id: 'wednesday', name: 'Wednesday Green', accent: '#32936f', accentStrong: '#176148', accentSoft: '#e8f7f0', page: '#f7fcf9', glow: '#c5ebda' },
  { id: 'thursday', name: 'Thursday Violet', accent: '#7965c1', accentStrong: '#4e3a91', accentSoft: '#f0edff', page: '#faf9ff', glow: '#dcd4ff' },
  { id: 'friday', name: 'Friday Gold', accent: '#c07a19', accentStrong: '#81500f', accentSoft: '#fff5dc', page: '#fffcf4', glow: '#ffe4a7' },
  { id: 'saturday', name: 'Saturday Teal', accent: '#208b93', accentStrong: '#0d5d63', accentSoft: '#e4f7f7', page: '#f6fcfc', glow: '#bde9e9' },
]

export function getTheme(themeId: string | null, weekday: number): WeekdayTheme {
  return weekdayThemes.find((theme) => theme.id === themeId) ?? weekdayThemes[weekday] ?? weekdayThemes[0]
}
