// ============================================
// Q&A Routes
// ============================================

import { Router, Request, Response } from 'express'
import { requireAuth, getServiceClient } from '../middleware/auth.js'
import { askQuestion } from './engine.js'

const router = Router()

/**
 * POST /api/projects/:projectId/qa/ask
 * Ask a question about the project's documents.
 */
router.post(
  '/projects/:projectId/qa/ask',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params as { projectId: string }
      const userId = req.user!.id
      const { question, top_k } = req.body
      const supabase = getServiceClient()

      if (!question || typeof question !== 'string' || question.trim().length === 0) {
        res.status(400).json({ error: 'question is required' })
        return
      }

      // Verify project ownership
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .single()

      if (!project) {
        res.status(404).json({ error: 'Project not found' })
        return
      }

      const result = await askQuestion(projectId, question.trim(), { topK: top_k })

      res.json(result)
    } catch (error) {
      console.error('Q&A error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

export default router
