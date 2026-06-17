import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import ETFMarket from './pages/ETFMarket'
import Wallet from './pages/Wallet'
import Portfolio from './pages/Portfolio'
import History from './pages/History'
import AutoTrade from './pages/AutoTrade'
import ManageETFs from './pages/ManageETFs'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#64748b' }}>Loading...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<ETFMarket />} />
        <Route path="wallet" element={<Wallet />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="history" element={<History />} />
        <Route path="auto-trade" element={<AutoTrade />} />
        <Route path="manage" element={<ManageETFs />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App
