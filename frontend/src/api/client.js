/**
 * API client for Huntarr backend
 * Handles fetch with timeout and relative URL resolution for subpath deployments
 */

const DEFAULT_TIMEOUT = 120000 // 2 minutes

/**
 * Fetch with configurable timeout and automatic 401 redirect
 * @param {string} url - URL to fetch (relative URLs supported)
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      credentials: 'include' // Include cookies for session auth
    })

    // Global 401 handler - redirect to login when session is invalid
    // Skip redirect for auth-related endpoints to prevent loops
    if (response.status === 401) {
      const authEndpoints = ['/login', '/setup', '/api/auth/status', '/api/setup/status']
      const isAuthEndpoint = authEndpoints.some(ep => url.includes(ep))
      const isOnAuthPage = window.location.pathname.startsWith('/login') ||
                           window.location.pathname.startsWith('/setup')

      if (!isAuthEndpoint && !isOnAuthPage) {
        console.debug('Received 401, redirecting to login')
        window.location.href = '/login'
        // Return the response but redirect is happening
        return response
      }
    }

    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * API helper for JSON requests
 */
export const api = {
  async get(endpoint) {
    const res = await fetchWithTimeout(endpoint)
    if (!res.ok) throw new Error(`GET ${endpoint} failed: ${res.status}`)
    return res.json()
  },

  async post(endpoint, data) {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error(`POST ${endpoint} failed: ${res.status}`)
    return res.json()
  },

  async put(endpoint, data) {
    const res = await fetchWithTimeout(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error(`PUT ${endpoint} failed: ${res.status}`)
    return res.json()
  },

  async delete(endpoint) {
    const res = await fetchWithTimeout(endpoint, { method: 'DELETE' })
    if (!res.ok) throw new Error(`DELETE ${endpoint} failed: ${res.status}`)
    return res.json()
  }
}

export default api
