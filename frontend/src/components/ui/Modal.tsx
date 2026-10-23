import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

const openModalIds: string[] = []
let scrollLockCount = 0
let originalBodyOverflow = ''

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  active?: boolean
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    .filter((element) => element.getClientRects().length > 0)
}

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    originalBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLockCount += 1
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) document.body.style.overflow = originalBodyOverflow
}

export function Modal({ title, children, onClose, active = true }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  const focusBeforeOpenRef = useRef<HTMLElement | null>(null)
  const lastFocusedInsideRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    focusBeforeOpenRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    return () => {
      const focusTarget = focusBeforeOpenRef.current
      if (focusTarget?.isConnected) focusTarget.focus()
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const dialog = dialogRef.current
    if (!dialog) return

    openModalIds.push(titleId)
    lockBodyScroll()

    const focusFrame = window.requestAnimationFrame(() => {
      const previousDialogFocus = lastFocusedInsideRef.current
      if (previousDialogFocus?.isConnected) {
        previousDialogFocus.focus()
        return
      }
      const [firstFocusableElement] = getFocusableElements(dialog)
      ;(firstFocusableElement ?? dialog).focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (openModalIds.at(-1) !== titleId) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements(dialog)
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const firstFocusableElement = focusableElements[0]
      const lastFocusableElement = focusableElements.at(-1)
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? lastFocusableElement : firstFocusableElement)?.focus()
      } else if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault()
        lastFocusableElement?.focus()
      } else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault()
        firstFocusableElement.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown)
      if (dialog.contains(document.activeElement)) {
        lastFocusedInsideRef.current = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      }
      const modalIndex = openModalIds.lastIndexOf(titleId)
      if (modalIndex >= 0) openModalIds.splice(modalIndex, 1)
      unlockBodyScroll()
    }
  }, [active, titleId])

  return (
    <div
      className={active ? 'fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-6' : 'hidden'}
      role={active ? 'presentation' : undefined}
      aria-hidden={active ? undefined : true}
      inert={!active}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        role={active ? 'dialog' : undefined}
        aria-modal={active ? 'true' : undefined}
        aria-labelledby={active ? titleId : undefined}
        tabIndex={-1}
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl outline-none sm:max-w-xl sm:rounded-3xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
          <h2 id={titleId} className="text-xl font-bold text-slate-900">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close" className="size-5" /></button>
        </header>
        {children}
      </section>
    </div>
  )
}
