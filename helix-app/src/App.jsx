import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import OpsDashboard from './pages/ops/OpsDashboard'

function App() {
  const { user, loading } = useAuth()

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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App