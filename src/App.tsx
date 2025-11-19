import { BrowserRouter, Routes, Route } from 'react-router-dom'
import EditorPage from './pages/EditorPage'
import PlayPage from './pages/PlayPage'
import LandingPage from './pages/LandingPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/play/:projectId" element={<PlayPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
