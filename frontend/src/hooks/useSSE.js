import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Hook for Server-Sent Events connection with auto-reconnect
 * @param {string} url - SSE endpoint URL
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoConnect - Whether to connect automatically (default: true)
 * @param {number} options.reconnectDelay - Delay before reconnecting in ms (default: 3000)
 * @param {number} options.maxRetries - Maximum reconnection attempts (default: 5)
 * @returns {Object} - { messages, error, connected, connect, disconnect }
 */
export function useSSE(url, options = {}) {
  const {
    autoConnect = true,
    reconnectDelay = 3000,
    maxRetries = 5
  } = options

  const [messages, setMessages] = useState([])
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)

  const eventSourceRef = useRef(null)
  const retriesRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    setConnected(false)
  }, [])

  const connect = useCallback(() => {
    // Disconnect existing connection
    disconnect()

    try {
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setConnected(true)
        setError(null)
        retriesRef.current = 0
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setMessages(prev => [...prev, data])
        } catch {
          // Handle non-JSON messages
          setMessages(prev => [...prev, { raw: event.data }])
        }
      }

      eventSource.onerror = () => {
        setConnected(false)
        eventSource.close()
        eventSourceRef.current = null

        // Attempt reconnection if under max retries
        if (retriesRef.current < maxRetries) {
          retriesRef.current++
          setError(`Connection lost. Reconnecting (${retriesRef.current}/${maxRetries})...`)
          reconnectTimeoutRef.current = setTimeout(connect, reconnectDelay)
        } else {
          setError('Connection failed. Max retries reached.')
        }
      }
    } catch (err) {
      setError(`Failed to connect: ${err.message}`)
    }
  }, [url, disconnect, reconnectDelay, maxRetries])

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [autoConnect, connect, disconnect])

  return {
    messages,
    error,
    connected,
    connect,
    disconnect,
    clearMessages
  }
}

/**
 * Hook for Huntarr log polling (REST API, not SSE)
 * The Flask backend uses /api/logs/{appType} with JSON responses
 * @param {string} appFilter - App filter (all, sonarr, radarr, etc.)
 * @param {number} pollInterval - Polling interval in ms (default: 3000)
 * @returns {Object} - Log state and controls
 */
export function useLogStream(appFilter = 'all', pollInterval = 3000) {
  const [logs, setLogs] = useState([])
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  const intervalRef = useRef(null)
  const appFilterRef = useRef(appFilter)

  // Update ref when filter changes
  useEffect(() => {
    appFilterRef.current = appFilter
  }, [appFilter])

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`./api/logs/${appFilterRef.current}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      if (data.success && data.logs) {
        // Parse log strings into objects
        const parsedLogs = data.logs.map((logStr, idx) => {
          const parts = logStr.split('|')
          return {
            id: idx,
            timestamp: parts[0] || '',
            level: parts[1] || 'INFO',
            app: parts[2] || 'system',
            message: parts.slice(3).join('|') || logStr
          }
        })
        setLogs(parsedLogs)
        setConnected(true)
        setError(null)
      }
    } catch (err) {
      setError(`Failed to fetch logs: ${err.message}`)
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const connect = useCallback(() => {
    fetchLogs()
    intervalRef.current = setInterval(fetchLogs, pollInterval)
  }, [fetchLogs, pollInterval])

  const disconnect = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setConnected(false)
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  // Auto-connect on mount, reconnect when filter changes
  useEffect(() => {
    connect()
    return () => disconnect()
  }, [appFilter, connect, disconnect])

  return {
    logs,
    error,
    connected,
    loading,
    connect,
    disconnect,
    clearLogs,
    refetch: fetchLogs
  }
}

export default useSSE
