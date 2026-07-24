import type { ApiResponse } from '../types'

function resolvePluginName(): string {
  if (window.__PLUGIN_NAME__) return window.__PLUGIN_NAME__
  try {
    if (window.parent && (window.parent as Window & { __PLUGIN_NAME__?: string }).__PLUGIN_NAME__) {
      return (window.parent as Window & { __PLUGIN_NAME__?: string }).__PLUGIN_NAME__!
    }
  } catch { /* ignore */ }
  const extMatch = location.pathname.match(/\/ext\/([^/]+)/)
  if (extMatch) return extMatch[1]
  const pluginMatch = location.pathname.match(/\/plugin\/([^/]+)/)
  if (pluginMatch) return pluginMatch[1]
  return 'napcat-plugin-contact-manager'
}

export const PLUGIN_NAME = resolvePluginName()

const API_BASE_NO_AUTH = '/plugin/' + PLUGIN_NAME + '/api'
const API_BASE_AUTH = '/api/Plugin/ext/' + PLUGIN_NAME

function getToken(): string {
  return localStorage.getItem('token') || ''
}

function authHeaders(h: Record<string, string> = {}): Record<string, string> {
  const token = getToken()
  if (token) h['Authorization'] = 'Bearer ' + token
  return h
}

function buildUrl(base: string, path: string): string {
  return new URL(base + path, window.location.origin).toString()
}

async function parseResponse<T>(res: Response): Promise<ApiResponse<T>> {
  const text = await res.text()
  let json: ApiResponse<T>
  try {
    json = text ? JSON.parse(text) : { code: -1, message: '空响应' }
  } catch {
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (!res.ok && json.code === undefined) {
    throw new Error(json.message || text || `HTTP ${res.status}`)
  }
  return json
}

/** 无认证 API（扩展页推荐） */
export async function noAuthFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const res = await fetch(buildUrl(API_BASE_NO_AUTH, path), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  return parseResponse<T>(res)
}

/** 认证 API */
export async function authFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const res = await fetch(buildUrl(API_BASE_AUTH, path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      ...authHeaders(),
    },
  })
  return parseResponse<T>(res)
}

export function postJson<T = unknown>(path: string, body: unknown): Promise<ApiResponse<T>> {
  return noAuthFetch<T>(path, { method: 'POST', body: JSON.stringify(body) })
}
