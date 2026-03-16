import { createContext, useContext, useState } from 'react'

const ExportContext = createContext(null)

export function ExportProvider({ children }) {
  const [exportState, setExportState] = useState({ data: [], dashboardId: '' })
  return (
    <ExportContext.Provider value={{ ...exportState, setExportState }}>
      {children}
    </ExportContext.Provider>
  )
}

export function useExport() {
  return useContext(ExportContext)
}
