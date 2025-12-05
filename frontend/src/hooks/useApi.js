import { useState, useCallback } from 'react'
import { fetchWithTimeout } from '../api/client'

/**
 * Hook for making API calls with loading and error states
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Object} - { data, error, loading, refetch }
 */
export function useApi(endpoint, options = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetchWithTimeout(endpoint, options)
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`)
      }
      const json = await res.json()
      setData(json)
      return json
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [endpoint, options])

  return { data, error, loading, refetch, setData }
}

/**
 * Hook for making mutations (POST, PUT, DELETE)
 * @returns {Object} - { mutate, loading, error }
 */
export function useMutation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const mutate = useCallback(async (endpoint, options = {}) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...options
      })

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`)
      }

      const json = await res.json()
      return { success: true, data: json }
    } catch (err) {
      setError(err.message)
      return { success: false, error: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  return { mutate, loading, error }
}

export default useApi
