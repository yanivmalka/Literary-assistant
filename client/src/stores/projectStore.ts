import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Project, MapRecord } from '@/lib/types'

interface ProjectState {
  projects: Project[]
  trashedProjects: Project[]
  currentProject: Project | null
  projectMaps: MapRecord[]
  loading: boolean

  fetchProjects: () => Promise<void>
  fetchTrashedProjects: () => Promise<void>
  fetchProject: (id: string) => Promise<void>
  fetchProjectMaps: (projectId: string) => Promise<void>
  createProject: (name: string, description?: string) => Promise<Project | null>
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>
  moveToTrash: (id: string) => Promise<void>
  restoreFromTrash: (id: string) => Promise<void>
  deletePermanently: (id: string) => Promise<void>
  emptyTrash: () => Promise<{ success: boolean; error?: string }>
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  trashedProjects: [],
  currentProject: null,
  projectMaps: [],
  loading: false,

  fetchProjects: async () => {
    set({ loading: true })
    const { data } = await supabase
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })

    set({ projects: (data as Project[]) || [], loading: false })
  },

  fetchTrashedProjects: async () => {
    set({ loading: true })
    const { data } = await supabase
      .from('projects')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    set({ trashedProjects: (data as Project[]) || [], loading: false })
  },

  fetchProject: async (id) => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    set({ currentProject: data as Project | null })
  },

  fetchProjectMaps: async (projectId) => {
    const { data } = await supabase
      .from('maps')
      .select('*')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })

    set({ projectMaps: (data as MapRecord[]) || [] })
  },

  createProject: async (name, description) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('projects')
      .insert({ name, description, user_id: user.id })
      .select()
      .single()

    if (error || !data) return null

    const project = data as Project
    set({ projects: [project, ...get().projects] })
    return project
  },

  updateProject: async (id, updates) => {
    await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)

    set({
      projects: get().projects.map(p => p.id === id ? { ...p, ...updates } : p),
    })
  },

  moveToTrash: async (id) => {
    const deletedAt = new Date().toISOString()
    await supabase
      .from('projects')
      .update({ deleted_at: deletedAt })
      .eq('id', id)

    const project = get().projects.find(p => p.id === id)
    set({
      projects: get().projects.filter(p => p.id !== id),
      trashedProjects: project
        ? [{ ...project, deleted_at: deletedAt }, ...get().trashedProjects]
        : get().trashedProjects,
    })
  },

  restoreFromTrash: async (id) => {
    await supabase
      .from('projects')
      .update({ deleted_at: null })
      .eq('id', id)

    const project = get().trashedProjects.find(p => p.id === id)
    set({
      trashedProjects: get().trashedProjects.filter(p => p.id !== id),
      projects: project
        ? [{ ...project, deleted_at: null }, ...get().projects]
        : get().projects,
    })
  },

  deletePermanently: async (id) => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Failed to permanently delete project:', error)
      return
    }

    set({
      trashedProjects: get().trashedProjects.filter(p => p.id !== id),
    })
  },

  emptyTrash: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('user_id', user.id)
      .not('deleted_at', 'is', null)

    if (error) {
      return { success: false, error: error.message }
    }

    set({ trashedProjects: [] })
    return { success: true }
  },
}))
