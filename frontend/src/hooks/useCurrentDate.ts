import { useEffect, useState } from 'react'
import { getCurrentDate } from '../utils/dates'
import { getSecondsUntilV1Midnight } from '../utils/liveTime'
import { getV1DateKey } from '../utils/timeZones'

const MIDNIGHT_TIMER_BUFFER_MILLISECONDS = 50

function millisecondsUntilNextV1Date(currentDate: Date): number {
  return getSecondsUntilV1Midnight(currentDate) * 1000 + MIDNIGHT_TIMER_BUFFER_MILLISECONDS
}

export function useCurrentDate(): Date {
  const [currentDate, setCurrentDate] = useState(getCurrentDate)

  useEffect(() => {
    let midnightTimeoutId: number | undefined

    const scheduleMidnightRefresh = (referenceDate: Date) => {
      if (midnightTimeoutId !== undefined) window.clearTimeout(midnightTimeoutId)
      midnightTimeoutId = window.setTimeout(
        refreshCurrentDate,
        millisecondsUntilNextV1Date(referenceDate),
      )
    }

    const refreshCurrentDate = () => {
      const nextDate = getCurrentDate()
      setCurrentDate((existingDate) => (
        getV1DateKey(existingDate) === getV1DateKey(nextDate) ? existingDate : nextDate
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
