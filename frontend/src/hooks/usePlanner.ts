import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../api/ApiProvider'
import { ApiError } from '../api/client'
import { PlannerApi } from '../api/planner'
import type { TaskCompletionAction } from '../api/planner'
import { useAuth } from '../auth/AuthProvider'
import { defaultTaskCategories, isDefaultTaskCategory, normalizeCategoryName } from '../data/categories'
import type { PlannerSettings, PlannerState, Task, TaskCategory, TaskDraft } from '../types/planner'
import { defaultPlannerState } from '../utils/storage'
import { getBrowserTimeZone } from '../utils/timeZones'

type PlannerStatus = 'loading' | 'ready' | 'error'
type TaskUpdateMode = 'edit' | 'reschedule'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The planner request failed.'
}

function isCancellation(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'request_cancelled'
}

function requireTaskVersion(task: Task): number {
  if (!Number.isInteger(task.version) || (task.version ?? 0) < 1) {
    throw new Error('This task is missing the version required to save changes.')
  }
  return task.version as number
}

export function usePlanner() {
  const { user } = useAuth()
  const apiClient = useApi()
  const plannerApi = useMemo(() => new PlannerApi(apiClient), [apiClient])
  const userId = user?.id ?? null
  const userIdRef = useRef(userId)
  const stateRef = useRef<PlannerState>(defaultPlannerState)
  const categoriesRef = useRef<TaskCategory[]>([])
  const loadControllerRef = useRef<AbortController | null>(null)
  const activityRefreshControllerRef = useRef<AbortController | null>(null)
  const activityRefreshPromiseRef = useRef<Promise<void> | null>(null)
  const activityRefreshQueuedRef = useRef(false)
  const mutationControllersRef = useRef(new Set<AbortController>())
  const mutationCountRef = useRef(0)
  const [state, setStateValue] = useState<PlannerState>(defaultPlannerState)
  const [categories, setCategoriesValue] = useState<TaskCategory[]>([])
  const [status, setStatus] = useState<PlannerStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set())
  const [creatingTask, setCreatingTask] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [confirmingReview, setConfirmingReview] = useState(false)

  const setState = useCallback((next: PlannerState | ((current: PlannerState) => PlannerState)) => {
    setStateValue((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      stateRef.current = resolved
      return resolved
    })
  }, [])

  const setCategories = useCallback((next: TaskCategory[]) => {
    categoriesRef.current = next
    setCategoriesValue(next)
  }, [])

  const buildState = useCallback((
    tasks: Task[],
    settings: PlannerSettings,
    activity: Awaited<ReturnType<PlannerApi['getActivity']>>,
    loadedCategories: TaskCategory[],
  ): PlannerState => ({
    version: 2,
    tasks,
    activityDates: activity.activityDates,
    completionEvents: activity.completionEvents,
    customCategories: loadedCategories
      .filter((category) => !isDefaultTaskCategory(category.name))
      .map((category) => category.name),
    settings,
  }), [])

  const ensureDefaultCategories = useCallback(async (
    loadedCategories: TaskCategory[],
    signal: AbortSignal,
  ): Promise<TaskCategory[]> => {
    const existing = new Set(loadedCategories.map((category) => normalizeCategoryName(category.name)))
    const missingNames = defaultTaskCategories.filter(
      (name) => !existing.has(normalizeCategoryName(name)),
    )
    const results = await Promise.all(missingNames.map(async (name) => {
      try {
        return { category: await plannerApi.createCategory(name, signal), conflict: false }
      } catch (categoryError) {
        if (categoryError instanceof ApiError && categoryError.code === 'category_name_conflict') {
          return { category: null, conflict: true }
        }
        throw categoryError
      }
    }))
    return results.some((result) => result.conflict)
      ? plannerApi.getCategories(signal)
      : [...loadedCategories, ...results.flatMap((result) => (
        result.category ? [result.category] : []
      ))]
  }, [plannerApi])

  const loadPlanner = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!userId) return
    if (loadControllerRef.current) return
    const controller = new AbortController()
    loadControllerRef.current = controller
    const initiatingUserId = userId
    if (mode === 'initial') {
      setStatus('loading')
      setError(null)
    } else {
      setRefreshing(true)
      setRefreshError(null)
    }
    try {
      const [settingsResult, tasks, activity, categoryResult] = await Promise.all([
        plannerApi.getSettings(controller.signal),
        plannerApi.getTasks(controller.signal),
        plannerApi.getActivity(controller.signal),
        plannerApi.getCategories(controller.signal),
      ])
      const loadedCategories = await ensureDefaultCategories(categoryResult, controller.signal)
      if (controller.signal.aborted || userIdRef.current !== initiatingUserId) return
      setCategories(loadedCategories)
      setState(buildState(tasks, settingsResult, activity, loadedCategories))
      setStatus('ready')
      setError(null)
      setRefreshError(null)
    } catch (loadError) {
      if (controller.signal.aborted || isCancellation(loadError)) return
      if (mode === 'initial') {
        setStatus('error')
        setError(errorMessage(loadError))
      } else {
        setRefreshError(errorMessage(loadError))
      }
    } finally {
      if (loadControllerRef.current === controller) loadControllerRef.current = null
      if (userIdRef.current === initiatingUserId) setRefreshing(false)
    }
  }, [buildState, ensureDefaultCategories, plannerApi, setCategories, setState, userId])

  // Account changes intentionally reset all account-scoped state before the new bootstrap.
  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    userIdRef.current = userId
    loadControllerRef.current?.abort()
    loadControllerRef.current = null
    activityRefreshControllerRef.current?.abort()
    activityRefreshControllerRef.current = null
    activityRefreshQueuedRef.current = false
    for (const controller of mutationControllersRef.current) controller.abort()
    mutationControllersRef.current.clear()
    mutationCountRef.current = 0
    setPendingTaskIds(new Set())
    setCreatingTask(false)
    setCreatingCategory(false)
    setSavingSettings(false)
    setConfirmingReview(false)
    setState(defaultPlannerState)
    setCategories([])
    const bootstrapTimer = userId
      ? window.setTimeout(() => void loadPlanner('initial'), 0)
      : undefined
    return () => {
      if (bootstrapTimer !== undefined) window.clearTimeout(bootstrapTimer)
      loadControllerRef.current?.abort()
      activityRefreshControllerRef.current?.abort()
    }
  }, [loadPlanner, setCategories, setState, userId])
  /* oxlint-enable react/set-state-in-effect */

  useEffect(() => {
    let focusRefreshTimer: number | undefined
    const refreshOnFocus = () => {
      if (document.visibilityState !== 'hidden' && status === 'ready' && mutationCountRef.current === 0) {
        if (focusRefreshTimer !== undefined) window.clearTimeout(focusRefreshTimer)
        focusRefreshTimer = window.setTimeout(() => void loadPlanner('refresh'), 50)
      }
    }
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)
    return () => {
      if (focusRefreshTimer !== undefined) window.clearTimeout(focusRefreshTimer)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [loadPlanner, status])

  useEffect(() => () => {
    for (const controller of mutationControllersRef.current) controller.abort()
    activityRefreshControllerRef.current?.abort()
  }, [])

  const runMutation = useCallback(async <Result,>(
    operation: (signal: AbortSignal) => Promise<Result>,
  ): Promise<Result> => {
    if (!userId) throw new Error('Authentication is required.')
    loadControllerRef.current?.abort()
    loadControllerRef.current = null
    const initiatingUserId = userId
    const controller = new AbortController()
    mutationControllersRef.current.add(controller)
    mutationCountRef.current += 1
    try {
      const result = await operation(controller.signal)
      if (controller.signal.aborted || userIdRef.current !== initiatingUserId) {
        throw new ApiError(0, 'request_cancelled', 'The request was cancelled.')
      }
      return result
    } finally {
      mutationControllersRef.current.delete(controller)
      mutationCountRef.current = Math.max(0, mutationCountRef.current - 1)
    }
  }, [userId])

  const scheduleActivityRefresh = useCallback(function scheduleActivityRefreshRequest() {
    activityRefreshQueuedRef.current = true
    if (activityRefreshPromiseRef.current) return

    const refreshPromise = (async () => {
      while (activityRefreshQueuedRef.current) {
        activityRefreshQueuedRef.current = false
        const initiatingUserId = userIdRef.current
        if (!initiatingUserId) continue
        const controller = new AbortController()
        activityRefreshControllerRef.current = controller
        try {
          const activity = await plannerApi.getActivity(controller.signal)
          if (!controller.signal.aborted && userIdRef.current === initiatingUserId) {
            setState((current) => ({ ...current, ...activity }))
            setRefreshError(null)
          }
        } catch (activityError) {
          if (!controller.signal.aborted && !isCancellation(activityError)
            && userIdRef.current === initiatingUserId) {
            setRefreshError(
              `The task was saved, but activity could not be refreshed: ${errorMessage(activityError)}`,
            )
          }
        } finally {
          if (activityRefreshControllerRef.current === controller) {
            activityRefreshControllerRef.current = null
          }
        }
      }
    })()
    activityRefreshPromiseRef.current = refreshPromise
    void refreshPromise.finally(() => {
      if (activityRefreshPromiseRef.current === refreshPromise) {
        activityRefreshPromiseRef.current = null
      }
      if (activityRefreshQueuedRef.current) scheduleActivityRefreshRequest()
    })
  }, [plannerApi, setState])

  const withTaskPending = useCallback(async <Result,>(
    taskId: string,
    operation: (signal: AbortSignal) => Promise<Result>,
  ): Promise<Result> => {
    setPendingTaskIds((current) => new Set(current).add(taskId))
    try {
      return await runMutation(operation)
    } catch (mutationError) {
      if (mutationError instanceof ApiError && mutationError.code === 'task_version_conflict') {
        await loadPlanner('refresh')
      }
      throw mutationError
    } finally {
      setPendingTaskIds((current) => {
        const next = new Set(current)
        next.delete(taskId)
        return next
      })
    }
  }, [loadPlanner, runMutation])

  const categoryForName = useCallback((name: string): TaskCategory => {
    const normalizedName = normalizeCategoryName(name)
    const category = categoriesRef.current.find(
      (candidate) => normalizeCategoryName(candidate.name) === normalizedName,
    )
    if (!category) throw new Error(`The category “${name}” is not available.`)
    return category
  }, [])

  const replaceTask = useCallback((savedTask: Task) => {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === savedTask.id ? savedTask : task),
    }))
  }, [setState])

  const addTask = useCallback(async (draft: TaskDraft, confirmWarnings = false): Promise<Task> => {
    setCreatingTask(true)
    try {
      return await runMutation(async (signal) => {
        const savedTask = await plannerApi.createTask({
          draft,
          categoryId: categoryForName(draft.category).id,
          scheduleTimeZone: getBrowserTimeZone(),
          confirmWarnings,
        }, signal)
        setState((current) => ({ ...current, tasks: [...current.tasks, savedTask] }))
        scheduleActivityRefresh()
        return savedTask
      })
    } finally {
      setCreatingTask(false)
    }
  }, [categoryForName, plannerApi, runMutation, scheduleActivityRefresh, setState])

  const updateTask = useCallback(async (
    taskId: string,
    draft: TaskDraft,
    mode: TaskUpdateMode,
    confirmWarnings = false,
  ): Promise<Task> => withTaskPending(taskId, async (signal) => {
    const currentTask = stateRef.current.tasks.find((task) => task.id === taskId)
    if (!currentTask) throw new Error('This task is no longer available.')
    const category = categoryForName(draft.category)
    const savedTask = await plannerApi.updateTask(taskId, {
      version: requireTaskVersion(currentTask),
      categoryId: category.id,
      title: draft.title,
      reminderEnabled: draft.reminder.enabled,
      reminderMinutesBefore: draft.reminder.minutesBefore,
      important: draft.important,
      confirmWarnings,
      ...(mode === 'reschedule' ? {
        date: draft.date,
        startTime: draft.startTime,
        scheduleTimeZone: getBrowserTimeZone(),
        plannedMinutes: draft.plannedMinutes,
      } : {}),
    }, signal)
    replaceTask(savedTask)
    scheduleActivityRefresh()
    return savedTask
  }), [categoryForName, plannerApi, replaceTask, scheduleActivityRefresh, withTaskPending])

  const transitionTask = useCallback(async (
    taskId: string,
    action: TaskCompletionAction,
    confirmWarnings = false,
  ): Promise<Task> => withTaskPending(taskId, async (signal) => {
    const currentTask = stateRef.current.tasks.find((task) => task.id === taskId)
    if (!currentTask) throw new Error('This task is no longer available.')
    const savedTask = await plannerApi.updateTaskCompletion(taskId, {
      version: requireTaskVersion(currentTask), action, confirmWarnings,
    }, signal)
    replaceTask(savedTask)
    scheduleActivityRefresh()
    return savedTask
  }), [plannerApi, replaceTask, scheduleActivityRefresh, withTaskPending])

  const completeTask = useCallback((taskId: string) => transitionTask(taskId, 'complete'), [transitionTask])
  const toggleTaskPartial = useCallback((taskId: string) => transitionTask(taskId, 'toggle_partial'), [transitionTask])
  const markTaskIncomplete = useCallback((taskId: string) => transitionTask(taskId, 'mark_incomplete'), [transitionTask])
  const reopenTask = useCallback((taskId: string, confirmWarnings = false) => (
    transitionTask(taskId, 'reopen', confirmWarnings)
  ), [transitionTask])

  const toggleImportant = useCallback(async (taskId: string): Promise<Task> => (
    withTaskPending(taskId, async (signal) => {
      const currentTask = stateRef.current.tasks.find((task) => task.id === taskId)
      if (!currentTask) throw new Error('This task is no longer available.')
      const savedTask = await plannerApi.updateTask(taskId, {
        version: requireTaskVersion(currentTask),
        important: !currentTask.important,
      }, signal)
      replaceTask(savedTask)
      scheduleActivityRefresh()
      return savedTask
    })
  ), [plannerApi, replaceTask, scheduleActivityRefresh, withTaskPending])

  const deleteTask = useCallback(async (taskId: string): Promise<void> => {
    await withTaskPending(taskId, async (signal) => {
      const currentTask = stateRef.current.tasks.find((task) => task.id === taskId)
      if (!currentTask) throw new Error('This task is no longer available.')
      await plannerApi.deleteTask(taskId, requireTaskVersion(currentTask), signal)
      setState((current) => ({
        ...current,
        tasks: current.tasks.filter((task) => task.id !== taskId),
      }))
      scheduleActivityRefresh()
    })
  }, [plannerApi, scheduleActivityRefresh, setState, withTaskPending])

  const addCustomCategory = useCallback(async (rawName: string): Promise<string> => {
    const name = rawName.trim()
    const existing = categoriesRef.current.find(
      (category) => normalizeCategoryName(category.name) === normalizeCategoryName(name),
    )
    if (existing) return existing.name
    setCreatingCategory(true)
    try {
      return await runMutation(async (signal) => {
        try {
          const created = await plannerApi.createCategory(name, signal)
          const next = [...categoriesRef.current, created]
          setCategories(next)
          setState((current) => ({
            ...current,
            customCategories: next.filter((item) => !isDefaultTaskCategory(item.name)).map((item) => item.name),
          }))
          return created.name
        } catch (categoryError) {
          if (!(categoryError instanceof ApiError) || categoryError.code !== 'category_name_conflict') {
            throw categoryError
          }
          const next = await plannerApi.getCategories(signal)
          setCategories(next)
          setState((current) => ({
            ...current,
            customCategories: next.filter((item) => !isDefaultTaskCategory(item.name)).map((item) => item.name),
          }))
          const concurrent = next.find(
            (category) => normalizeCategoryName(category.name) === normalizeCategoryName(name),
          )
          if (!concurrent) throw categoryError
          return concurrent.name
        }
      })
    } finally {
      setCreatingCategory(false)
    }
  }, [plannerApi, runMutation, setCategories, setState])

  const updateSettings = useCallback(async (nextSettings: PlannerSettings): Promise<void> => {
    const previous = stateRef.current.settings
    const optimistic = { ...nextSettings, timeZone: nextSettings.timeZone ?? previous.timeZone ?? getBrowserTimeZone() }
    setState((current) => ({ ...current, settings: optimistic }))
    setSavingSettings(true)
    try {
      const saved = await runMutation((signal) => plannerApi.updateSettings({
        manualThemeId: optimistic.manualThemeId,
        sidebarCollapsed: optimistic.sidebarCollapsed,
        timeZone: optimistic.timeZone,
      }, signal))
      setState((current) => ({ ...current, settings: saved }))
    } catch (settingsError) {
      setState((current) => ({ ...current, settings: previous }))
      throw settingsError
    } finally {
      setSavingSettings(false)
    }
  }, [plannerApi, runMutation, setState])

  const confirmReview = useCallback(async (): Promise<void> => {
    setConfirmingReview(true)
    try {
      const confirmation = await runMutation((signal) => (
        plannerApi.confirmReview(getBrowserTimeZone(), signal)
      ))
      setState((current) => ({
        ...current,
        activityDates: current.activityDates.includes(confirmation.activityDate)
          ? current.activityDates
          : [...current.activityDates, confirmation.activityDate],
      }))
    } finally {
      setConfirmingReview(false)
    }
  }, [plannerApi, runMutation, setState])

  return {
    state,
    categories,
    status,
    error,
    refreshing,
    refreshError,
    pendingTaskIds,
    creatingTask,
    creatingCategory,
    savingSettings,
    confirmingReview,
    retry: () => loadPlanner('initial'),
    refresh: () => loadPlanner('refresh'),
    addTask,
    updateTask,
    completeTask,
    toggleTaskPartial,
    markTaskIncomplete,
    reopenTask,
    toggleImportant,
    deleteTask,
    addCustomCategory,
    updateSettings,
    confirmReview,
  }
}
