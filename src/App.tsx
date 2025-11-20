import { BrowserRouter, Routes, Route } from 'react-router-dom'
import EditorPage from './pages/EditorPage'
import PlayPage from './pages/PlayPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import PlaceholderPage from './pages/PlaceholderPage';
import ProductsPage from './pages/ProductsPage';
import ModelsPage from './pages/ModelsPage';
import ResourcesPage from './pages/ResourcesPage';
import PricingPage from './pages/PricingPage';
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<LoginPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/play/:projectId" element={<PlayPage />} />

        {/* Specific Pages */}
        <Route path="/page/products" element={<ProductsPage />} />
        <Route path="/page/models" element={<ModelsPage />} />
        <Route path="/page/resources" element={<ResourcesPage />} />
        <Route path="/page/pricing" element={<PricingPage />} />

        {/* Fallback for other pages */}
        <Route path="/page/:pageName" element={<PlaceholderPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

