import type { CanvasMarker, CanvasRegion, RegionType, InferredShape } from './types'

const PROXIMITY_THRESHOLD = 60 // pixels - markers within this distance are grouped

/**
 * Detects clusters of same-type markers and creates regions.
 * Uses simple distance-based clustering (DBSCAN-like approach).
 */
export function detectRegions(markers: CanvasMarker[], existingRegions: CanvasRegion[]): {
  newRegions: CanvasRegion[]
  updatedMarkers: CanvasMarker[]
} {
  // Only cluster these types - others are individual points
  const clusterableTypes: RegionType[] = ['water', 'mountains', 'desert', 'forest']
  const updatedMarkers = [...markers]
  const newRegions: CanvasRegion[] = []

  for (const type of clusterableTypes) {
    const typeMarkers = markers.filter(m => m.type === type && !m.regionId)
    const clusters = findClusters(typeMarkers, PROXIMITY_THRESHOLD)

    for (const cluster of clusters) {
      if (cluster.length < 3) continue // Need at least 3 points to form a region

      // Check if this cluster already corresponds to an existing region
      const existingRegion = existingRegions.find(r =>
        r.type === type &&
        cluster.some(m => m.regionId === r.id)
      )

      const regionId = existingRegion?.id || crypto.randomUUID()
      const boundary = computeConvexHull(cluster.map(m => ({ x: m.x, y: m.y })))
      const inferredShape = inferShape(type, cluster, boundary)

      // Assign markers to region
      for (const marker of cluster) {
        const idx = updatedMarkers.findIndex(m => m.id === marker.id)
        if (idx >= 0) {
          updatedMarkers[idx] = { ...updatedMarkers[idx], regionId }
        }
      }

      newRegions.push({
        id: regionId,
        type,
        inferredShape,
        name: existingRegion?.name || null,
        noNameNeeded: existingRegion?.noNameNeeded || false,
        markerIds: cluster.map(m => m.id),
        boundaryPoints: boundary,
      })
    }
  }

  return { newRegions, updatedMarkers }
}

/**
 * Simple distance-based clustering.
 * Groups markers that are within threshold distance of at least one other marker in the group.
 */
function findClusters(markers: CanvasMarker[], threshold: number): CanvasMarker[][] {
  const visited = new Set<string>()
  const clusters: CanvasMarker[][] = []

  for (const marker of markers) {
    if (visited.has(marker.id)) continue

    const cluster: CanvasMarker[] = []
    const queue = [marker]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.id)) continue
      visited.add(current.id)
      cluster.push(current)

      // Find neighbors
      for (const other of markers) {
        if (visited.has(other.id)) continue
        const dist = distance(current, other)
        if (dist <= threshold) {
          queue.push(other)
        }
      }
    }

    if (cluster.length > 0) {
      clusters.push(cluster)
    }
  }

  return clusters
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/**
 * Compute convex hull of a set of points (Graham scan).
 */
function computeConvexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points

  // Find the lowest point (and leftmost if tie)
  const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x)
  const pivot = sorted[0]

  // Sort by polar angle with respect to pivot
  const rest = sorted.slice(1).sort((a, b) => {
    const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x)
    const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x)
    return angleA - angleB
  })

  const hull: { x: number; y: number }[] = [pivot]

  for (const point of rest) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2]
      const b = hull[hull.length - 1]
      const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
      if (cross <= 0) {
        hull.pop()
      } else {
        break
      }
    }
    hull.push(point)
  }

  // Expand the hull slightly for visual padding
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length
  const padding = 15

  return hull.map(p => ({
    x: p.x + (p.x - cx) / distance(p, { x: cx, y: cy }) * padding,
    y: p.y + (p.y - cy) / distance(p, { x: cx, y: cy }) * padding,
  }))
}

/**
 * Infer what kind of geographical feature a region represents
 * based on its type and shape.
 */
function inferShape(type: RegionType, markers: CanvasMarker[], boundary: { x: number; y: number }[]): InferredShape {
  if (type !== 'water') {
    // Non-water types map directly
    return type as InferredShape
  }

  // For water: determine if it's a river, lake, or sea based on shape
  const xs = markers.map(m => m.x)
  const ys = markers.map(m => m.y)
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...ys) - Math.min(...ys)
  const aspectRatio = Math.max(width, height) / (Math.min(width, height) || 1)

  if (aspectRatio > 4) {
    return 'river' // Very elongated = river
  }

  // Area based on convex hull
  const area = computePolygonArea(boundary)
  if (area > 50000) {
    return 'sea' // Large area = sea
  }

  return 'lake' // Default for water
}

function computePolygonArea(points: { x: number; y: number }[]): number {
  let area = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  return Math.abs(area / 2)
}
