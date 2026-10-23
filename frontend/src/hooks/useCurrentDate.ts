import { useEffect, useState } from 'react'
import { getCurrentDate, toLocalDateKey } from '../utils/dates'

const MIDNIGHT_TIMER_BUFFER_MILLISECONDS = 50

function millisecondsUntilNextLocalDate(currentDate: Date): number {
  const nextLocalDate = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate() + 1,
  )
  return nextLocalDate.getTime() - currentDate.getTime() + MIDNIGHT_TIMER_BUFFER_MILLISECONDS
}

export function useCurrentDate(): Date {
  const [currentDate, setCurrentDate] = useState(getCurrentDate)

  useEffect(() => {
    let midnightTimeoutId: number | undefined

    const scheduleMidnightRefresh = (referenceDate: Date) => {
      if (midnightTimeoutId !== undefined) window.clearTimeout(midnightTimeoutId)
      midnightTimeoutId = window.setTimeout(
        refreshCurrentDate,
        millisecondsUntilNextLocalDate(referenceDate),
      )
    }

    const refreshCurrentDate = () => {
      const nextDate = getCurrentDate()
      setCurrentDate((existingDate) => (
        toLocalDateKey(existingDate) === toLocalDateKey(nextDate) ? existingDate : nextDate
      ))
      scheduleMidnightRefresh(nextDate)
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshCurrentDate()
    }

    scheduleMidnightRefresh(getCurrentDate())
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      if (midnightTimeoutId !== undefined) window.clearTimeout(midnightTimeoutId)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  return currentDate
}
