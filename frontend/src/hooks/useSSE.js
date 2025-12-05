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
 * Hook specifically for Huntarr log streaming
 * @param {string} appFilter - Optional app filter (sonarr, radarr, etc.)
 * @returns {Object} - Log streaming state and controls
 */
export function useLogStream(appFilter = null) {
  const url = appFilter ? `./logs?app=${appFilter}` : './logs'

  const {
    messages: logs,
    error,
    connected,
    connect,
    disconnect,
    clearMessages: clearLogs
  } = useSSE(url, {
    autoConnect: true,
    reconnectDelay: 3000,
    maxRetries: 10
  })

  return {
    logs,
    error,
    connected,
    connect,
    disconnect,
    clearLogs
  }
}

export default useSSE
