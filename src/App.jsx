import { Routes, Route, Navigate } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import Landing from './views/Landing'
import FoodBankDashboard from './views/FoodBankDashboard'
import DonorDashboard from './views/DonorDashboard'
import GovDashboard from './views/GovDashboard'
import Navbar from './components/Navbar'
import AIAssistant from './components/AIAssistant'
import { LanguageProvider } from './context/LanguageContext'
import { ThemeProvider } from './context/ThemeContext'
import { ExportProvider } from './context/ExportContext'

function Dashboard() {
  const [params] = useSearchParams()
  const view = params.get('view')
  return (
    <div className="min-h-screen bg-page text-primary transition-colors duration-300">
      <Navbar />
      {view === 'foodbank' && <FoodBankDashboard />}
      {view === 'donor' && <DonorDashboard />}
      {view === 'government' && <GovDashboard />}
      {!view && <Navigate to="/" replace />}
      <AIAssistant />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
    <LanguageProvider>
    <ExportProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ExportProvider>
    </LanguageProvider>
    </ThemeProvider>
  )
}
