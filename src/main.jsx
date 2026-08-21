import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
import App from './App.jsx'
import HowItWorks from './HowItWorks.jsx'
import NotFound from './NotFound.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import './styles.css'

function LegacyCardRedirect() {
  const { username } = useParams()
  const { search } = useLocation()

  return <Navigate to={`/${encodeURIComponent(username)}${search}`} replace />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/card/:username" element={<LegacyCardRedirect />} />
          <Route path="/:username" element={<App />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)
