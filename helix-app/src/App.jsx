import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import OpsDashboard from './pages/ops/OpsDashboard'
import CsvUpload from './pages/ops/CsvUpload'
import ScheduleView from './pages/ops/ScheduleView'
import FacilitatorView from './pages/facilitator/FacilitatorView'

function App() {
  const { loading } = useAuth()

  if (loading) return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100dvh',
      color: 'var(--color-text-muted)'
    }}>
      Loading...
    </div>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/ops" element={<OpsDashboard />} />
        <Route path="/ops/upload" element={<CsvUpload />} />
        <Route path="/ops/schedule" element={<ScheduleView />} />
        <Route path="/facilitator" element={<FacilitatorView />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App