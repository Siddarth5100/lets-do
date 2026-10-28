import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../api/ApiProvider'
import { ApiError } from '../api/client'
import { PlannerApi } from '../api/planner'
import { useAuth } from '../auth/AuthProvider'
import {
  defaultTaskCategories,
  isDefaultTaskCategory,
  normalizeCategoryName,
} from '../data/categories'
import type { PlannerState, TaskCategory } from '../types/planner'
import { defaultPlannerState } from '../utils/storage'

type PlannerLoadStatus = 'loading' | 'ready' | 'error'
type LoadKind = 'initial' | 'refresh'

interface ActiveLoad {
  controller: AbortController
  promise: Promise<void>
  userId: string
}

interface PlannerSnapshot {
  state: PlannerState
  categories: TaskCategory[]
}

function createEmptyPlannerState(): PlannerState {
  return {
    ...defaultPlannerState,
    tasks: [],
    activityDates: [],
    completionEvents: [],
    customCategories: [],
    settings: { ...defaultPlannerState.settings },
  }
}

export function usePlanner() {
  const apiClient = useApi()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const plannerApi = useMemo(() => new PlannerApi(apiClient), [apiClient])
  const [state, setState] = useState<PlannerState>(createEmptyPlannerState)
  const [categories, setCategories] = useState<TaskCategory[]>([])
  const [status, setStatus] = useState<PlannerLoadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const generationRef = useRef(0)
  const activeLoadRef = useRef<ActiveLoad | null>(null)

  const abortActiveLoad = useCallback(() => {
    activeLoadRef.current?.controller.abort()
    activeLoadRef.current = null
  }, [])

  const loadPlanner = useCallback((kind: LoadKind): Promise<void> => {
    if (!userId) return Promise.resolve()
    const existingLoad = activeLoadRef.current
    if (existingLoad?.userId === userId) return existingLoad.promise

    abortActiveLoad()
    const controller = new AbortController()
    const generation = ++generationRef.current
    if (kind === 'initial') {
      setStatus('loading')
      setError(null)
    } else {
      setRefreshing(true)
      setRefreshError(null)
    }

    let loadPromise: Promise<void>
    loadPromise = loadPlannerSnapshot(plannerApi, controller.signal)
      .then((snapshot) => {
        if (controller.signal.aborted || generation !== generationRef.current) return
        setState(snapshot.state)
        setCategories(snapshot.categories)
        setStatus('ready')
        setError(null)
        setRefreshError(null)
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted || generation !== generationRef.current) return
        controller.abort()
        const errorMessage = getPlannerErrorMessage(loadError)
        if (kind === 'initial') {
          setStatus('error')
          setError(errorMessage)
        } else {
          setRefreshError(errorMessage)
        }
      })
      .finally(() => {
        if (activeLoadRef.current?.promise === loadPromise) {
          activeLoadRef.current = null
        }
        if (generation === generationRef.current) setRefreshing(false)
      })

    activeLoadRef.current = { controller, promise: loadPromise, userId }
    return loadPromise
  }, [abortActiveLoad, plannerApi, userId])

  /* oxlint-disable react/set-state-in-effect -- account changes must clear the previous user's snapshot before starting network work. */
  useEffect(() => {
    generationRef.current += 1
    abortActiveLoad()
    setState(createEmptyPlannerState())
    setCategories([])
    setError(null)
    setRefreshError(null)
    setRefreshing(false)

    if (!userId) {
      setStatus('loading')
      return
    }

    void loadPlanner('initial')
    return () => {
      generationRef.current += 1
      abortActiveLoad()
    }
  }, [abortActiveLoad, loadPlanner, userId])
  /* oxlint-enable react/set-state-in-effect */

  useEffect(() => {
    if (status !== 'ready') return
    const refreshPlanner = () => void loadPlanner('refresh')
    const refreshVisiblePlanner = () => {
      if (document.visibilityState === 'visible') refreshPlanner()
    }

    window.addEventListener('focus', refreshPlanner)
    document.addEventListener('visibilitychange', refreshVisiblePlanner)
    return () => {
      window.removeEventListener('focus', refreshPlanner)
      document.removeEventListener('visibilitychange', refreshVisiblePlanner)
    }
  }, [loadPlanner, status])

  return {
    state,
    categories,
    status,
    error,
    refreshError,
    refreshing,
    retry: () => loadPlanner('initial'),
  }
}

async function loadPlannerSnapshot(
  plannerApi: PlannerApi,
  signal: AbortSignal,
): Promise<PlannerSnapshot> {
  const [settings, tasks, activity, initialCategories] = await Promise.all([
    plannerApi.getSettings(signal),
    plannerApi.getTasks(signal),
    plannerApi.getActivity(signal),
    plannerApi.getCategories(signal),
  ])
  const categories = await ensureDefaultCategories(plannerApi, initialCategories, signal)
  return {
    categories,
    state: {
      version: 2,
      tasks,
      activityDates: activity.activityDates,
      completionEvents: activity.completionEvents,
      customCategories: categories
        .filter((category) => !isDefaultTaskCategory(category.name))
        .map((category) => category.name),
      settings,
    },
  }
}

async function ensureDefaultCategories(
  plannerApi: PlannerApi,
  categories: TaskCategory[],
  signal: AbortSignal,
): Promise<TaskCategory[]> {
  const existingNames = new Set(categories.map((category) => normalizeCategoryName(category.name)))
  const missingCategories = defaultTaskCategories.filter(
    (category) => !existingNames.has(normalizeCategoryName(category)),
  )
  if (missingCategories.length === 0) return categories

  await Promise.all(missingCategories.map(async (category) => {
    try {
      await plannerApi.createCategory(category, signal)
    } catch (categoryError) {
      if (!(categoryError instanceof ApiError && categoryError.code === 'category_name_conflict')) {
        throw categoryError
      }
    }
  }))
  return plannerApi.getCategories(signal)
}

function getPlannerErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message
  return 'Planner data could not be loaded. Please try again.'
}
