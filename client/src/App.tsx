import { Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import MapWizardPage from './pages/MapWizardPage'
import MapEditorPage from './pages/MapEditorPage'
import TrashPage from './pages/TrashPage'
import DocumentsPage from './pages/DocumentsPage'
import EntityReviewPage from './pages/EntityReviewPage'
import QAPage from './pages/QAPage'
import ContradictionsPage from './pages/ContradictionsPage'
import DevTestPage from './pages/DevTestPage'

function App() {
  const { i18n } = useTranslation()
  const { initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    const dir = i18n.language === 'he' ? 'rtl' : 'ltr'
    document.documentElement.dir = dir
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<HomePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="projects/:projectId/maps/new" element={<MapWizardPage />} />
        <Route path="projects/:projectId/maps/:mapId" element={<MapEditorPage />} />
        <Route path="projects/:projectId/documents" element={<DocumentsPage />} />
        <Route path="projects/:projectId/entities" element={<EntityReviewPage />} />
        <Route path="projects/:projectId/qa" element={<QAPage />} />
        <Route path="projects/:projectId/contradictions" element={<ContradictionsPage />} />
        <Route path="trash" element={<TrashPage />} />
        <Route path="dev" element={<DevTestPage />} />
      </Route>
    </Routes>
  )
}

export default App
