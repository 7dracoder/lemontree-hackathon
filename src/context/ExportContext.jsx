import { createContext, useContext, useState, useMemo } from 'react'

const ExportContext = createContext(null)

export function ExportProvider({ children }) {
  const [exportState, setExportState] = useState({ data: [], dashboardId: '' })
  const value = useMemo(() => ({ ...exportState, setExportState }), [exportState])
  return (
    <ExportContext.Provider value={value}>
      {children}
    </ExportContext.Provider>
  )
}

export function useExport() {
  return useContext(ExportContext)
}
