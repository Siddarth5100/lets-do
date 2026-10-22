import type { ReactNode, SVGProps } from 'react'

type IconName = 'today' | 'calendar' | 'plus' | 'settings' | 'star' | 'edit' | 'trash' | 'clock' | 'flame' | 'check' | 'close' | 'chevron-left' | 'chevron-right'

const paths: Record<IconName, ReactNode> = {
  today: <><path d="M4 5.5h16v15H4z"/><path d="M8 3v5M16 3v5M4 10h16"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.37.36.7.65.97.3.27.68.42 1.08.43H21v4h-.09A1.7 1.7 0 0 0 19.4 15z"/></>,
  star: <path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3z"/>,
  edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z"/></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  flame: <path d="M13 3s1 3-1 5c-1.5 1.5-2 3-1 4.5.7 1 2.5.8 3.3-.3C15.5 10.5 15 8 15 8s4 3 4 7a7 7 0 0 1-14 0c0-3 2-5.5 5-8-.2 2.4.8 3.4 1.5 3.8C10.7 7 13 3 13 3z"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="M6 6l12 12M18 6 6 18"/>,
  'chevron-left': <path d="m15 18-6-6 6-6"/>,
  'chevron-right': <path d="m9 18 6-6-6-6"/>,
}

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
}

export function Icon({ name, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  )
}
