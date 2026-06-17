import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Layout from './components/Layout'
import ETFMarket from './pages/ETFMarket'
import Wallet from './pages/Wallet'
import Portfolio from './pages/Portfolio'
import History from './pages/History'
import AutoTrade from './pages/AutoTrade'
import ManageETFs from './pages/ManageETFs'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ETFMarket />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="history" element={<History />} />
          <Route path="auto-trade" element={<AutoTrade />} />
          <Route path="manage" element={<ManageETFs />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
