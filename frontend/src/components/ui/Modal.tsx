import { useEffect, useId } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

const openModalIds: string[] = []

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
}

export function Modal({ title, children, onClose }: ModalProps) {
  const titleId = useId()

  useEffect(() => {
    openModalIds.push(titleId)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openModalIds.at(-1) === titleId) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const modalIndex = openModalIds.lastIndexOf(titleId)
      if (modalIndex >= 0) openModalIds.splice(modalIndex, 1)
    }
  }, [onClose, titleId])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
          <h2 id={titleId} className="text-xl font-bold text-slate-900">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" className="size-5" /></button>
        </header>
        {children}
      </section>
    </div>
  )
}
