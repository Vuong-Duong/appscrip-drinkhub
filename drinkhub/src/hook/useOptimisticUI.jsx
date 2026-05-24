import { useEffect, useState } from 'react'
import usePOSStore from '../store/posStore'
import { debounce } from '../utils/helpers'

// Hook để quản lý Optimistic UI updates
export const useOptimisticUI = () => {
  const { pendingUpdates, flushPendingUpdates } = usePOSStore()
  const [isSyncing, setIsSyncing] = useState(false)

  // Auto-sync pending updates
  useEffect(() => {
    const syncUpdates = debounce(async () => {
      if (pendingUpdates.length > 0) {
        setIsSyncing(true)
        try {
          await flushPendingUpdates()
        } finally {
          setIsSyncing(false)
        }
      }
    }, 2000)

    syncUpdates()
  }, [pendingUpdates, flushPendingUpdates])

  return {
    isSyncing,
    pendingCount: pendingUpdates.length,
  }
}

// Hook để track component mount/unmount
export const useMount = (callback) => {
  useEffect(() => {
    callback()
    return () => {
      // Cleanup
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// Hook để debounce một giá trị
export const useDebouncedValue = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

// Hook để quản lý loading state
export const useLoading = (initialState = false) => {
  const [isLoading, setIsLoading] = useState(initialState)

  const execute = async (fn) => {
    setIsLoading(true)
    try {
      return await fn()
    } finally {
      setIsLoading(false)
    }
  }

  return { isLoading, setIsLoading, execute }
}
