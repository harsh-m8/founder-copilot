import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import OrgGuard from './components/OrgGuard.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { OrgProvider } from './context/OrgContext.jsx'

// Each route gets its own chunk — only loaded when the user navigates there
const App      = lazy(() => import('./App.jsx'))
const Login    = lazy(() => import('./pages/Login.jsx'))
const JoinOrg  = lazy(() => import('./pages/JoinOrg.jsx'))
const OrgSetup = lazy(() => import('./pages/OrgSetup.jsx'))
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))

function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#FAFAF8', fontFamily: "'Geist',system-ui,sans-serif",
      fontSize: '14px', color: '#A8A89A',
    }}>
      Loading…
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OrgProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={<App />} />
              <Route path="/login" element={<Login />} />
              <Route path="/join" element={<JoinOrg />} />

              {/* Requires auth only (no org needed — used to create first org) */}
              <Route path="/org/setup" element={
                <ProtectedRoute>
                  <OrgSetup />
                </ProtectedRoute>
              } />

              {/* Requires auth + org membership */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <OrgGuard>
                    <Dashboard />
                  </OrgGuard>
                </ProtectedRoute>
              } />
            </Routes>
          </Suspense>
        </OrgProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
