import { useEffect } from 'react'
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
import WallEditorPage from './pages/WallEditorPage';
import CustomModelingPage from './pages/CustomModelingPage';
import './App.css'

// Initialize theme from localStorage immediately
const initializeTheme = () => {
  const savedThemeMode = localStorage.getItem('themeMode') as 'light' | 'dark' | null;
  const savedThemeColor = localStorage.getItem('themeColor');

  if (savedThemeMode) {
    document.documentElement.setAttribute('data-theme', savedThemeMode);
  }
  if (savedThemeColor) {
    document.documentElement.style.setProperty('--theme-color', savedThemeColor);
    document.documentElement.style.setProperty('--primary', savedThemeColor);
  }
};

// Run immediately on module load
initializeTheme();

function App() {
  // Also run on mount to ensure theme is applied
  useEffect(() => {
    initializeTheme();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<LoginPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/wall-editor" element={<WallEditorPage />} />
        <Route path="/custom-modeling" element={<CustomModelingPage />} />
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

