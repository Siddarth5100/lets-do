export interface ApiSession {
  accessToken: string
  userId: string
}

export interface ApiClientOptions {
  baseUrl: string
  getSession: () => Promise<ApiSession | null>
  refreshSession: () => Promise<ApiSession | null>
  onAuthenticationFailure: () => Promise<void> | void
  fetchImplementation?: typeof fetch
}

interface StructuredErrorBody {
  error?: {
    code?: unknown
    message?: unknown
    details?: unknown
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly getSession: ApiClientOptions['getSession']
  private readonly refreshSession: ApiClientOptions['refreshSession']
  private readonly onAuthenticationFailure: ApiClientOptions['onAuthenticationFailure']
  private readonly fetchImplementation: typeof fetch
  private readonly activeControllers = new Set<AbortController>()
  private activeUserId: string | null = null
  private refreshPromise: Promise<ApiSession | null> | null = null

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.getSession = options.getSession
    this.refreshSession = options.refreshSession
    this.onAuthenticationFailure = options.onAuthenticationFailure
    this.fetchImplementation = options.fetchImplementation ?? fetch
  }

  setActiveUser(userId: string | null): void {
    if (this.activeUserId !== userId) {
      this.abortAll()
      this.activeUserId = userId
    }
  }

  abortAll(): void {
    for (const controller of this.activeControllers) controller.abort()
    this.activeControllers.clear()
  }

  async request<ResponseBody>(path: string, request: RequestInit = {}): Promise<ResponseBody> {
    const session = await this.getSession()
    if (!session) {
      throw new ApiError(401, 'authentication_required', 'Authentication is required.')
    }
    if (this.activeUserId !== null && session.userId !== this.activeUserId) {
      throw this.createCancelledError()
    }

    const controller = new AbortController()
    const removeExternalAbortListener = this.linkAbortSignal(request.signal, controller)
    this.activeControllers.add(controller)
    try {
      return await this.performRequest<ResponseBody>(
        path,
        request,
        session,
        session.userId,
        controller.signal,
        true,
      )
    } catch (error) {
      if (controller.signal.aborted) throw this.createCancelledError()
      if (error instanceof ApiError) throw error
      throw new ApiError(0, 'network_error', 'The API could not be reached.')
    } finally {
      removeExternalAbortListener()
      this.activeControllers.delete(controller)
    }
  }

  private async performRequest<ResponseBody>(
    path: string,
    request: RequestInit,
    session: ApiSession,
    initiatingUserId: string,
    signal: AbortSignal,
    allowRefresh: boolean,
  ): Promise<ResponseBody> {
    const headers = new Headers(request.headers)
    headers.set('Authorization', `Bearer ${session.accessToken}`)
    if (request.body !== undefined && !(request.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
      ...request,
      headers,
      signal,
    })

    if (response.status === 401 && allowRefresh) {
      const refreshedSession = await this.refreshAccessToken()
      if (!refreshedSession || refreshedSession.userId !== initiatingUserId) {
        await this.onAuthenticationFailure()
        throw new ApiError(401, 'session_expired', 'Your session has expired.')
      }
      return this.performRequest<ResponseBody>(
        path,
        request,
        refreshedSession,
        initiatingUserId,
        signal,
        false,
      )
    }

    if (response.status === 401) {
      await this.onAuthenticationFailure()
      throw new ApiError(401, 'session_expired', 'Your session has expired.')
    }

    await this.ensureRequestUserIsCurrent(initiatingUserId)
    if (!response.ok) throw await this.createResponseError(response)
    if (response.status === 204) return undefined as ResponseBody
    return await response.json() as ResponseBody
  }

  private async refreshAccessToken(): Promise<ApiSession | null> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshSession().finally(() => {
        this.refreshPromise = null
      })
    }
    return this.refreshPromise
  }

  private async ensureRequestUserIsCurrent(initiatingUserId: string): Promise<void> {
    const currentSession = await this.getSession()
    if (!currentSession || currentSession.userId !== initiatingUserId) {
      throw this.createCancelledError()
    }
  }

  private async createResponseError(response: Response): Promise<ApiError> {
    let responseBody: StructuredErrorBody = {}
    try {
      responseBody = await response.json() as StructuredErrorBody
    } catch {
      // A non-JSON response still receives a stable client-side error shape.
    }
    const code = typeof responseBody.error?.code === 'string'
      ? responseBody.error.code
      : 'http_error'
    const message = typeof responseBody.error?.message === 'string'
      ? responseBody.error.message
      : `The request failed with status ${response.status}.`
    return new ApiError(response.status, code, message, responseBody.error?.details)
  }

  private linkAbortSignal(
    externalSignal: AbortSignal | null | undefined,
    controller: AbortController,
  ): () => void {
    if (!externalSignal) return () => undefined
    const abortRequest = () => controller.abort()
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', abortRequest, { once: true })
    return () => externalSignal.removeEventListener('abort', abortRequest)
  }

  private createCancelledError(): ApiError {
    return new ApiError(0, 'request_cancelled', 'The request was cancelled.')
  }
}
