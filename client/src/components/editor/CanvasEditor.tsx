import { useRef, useCallback } from 'react'
import { Stage, Layer, Circle, Line, Text, RegularPolygon } from 'react-konva'
import { useMapStore } from '@/stores/mapStore'
import { MARKER_DEFINITIONS } from '@/lib/types'
import type { MarkerType, CanvasMarker } from '@/lib/types'
import type Konva from 'konva'

export default function CanvasEditor() {
  const stageRef = useRef<Konva.Stage>(null)
  const {
    markers,
    regions,
    scale,
    viewportX,
    viewportY,
    activeToolType,
    selectedMarkerId,
    setScale,
    setViewport,
    addMarker,
    moveMarker,
    selectMarker,
    setActiveTool,
  } = useMapStore()

  const generateId = () => crypto.randomUUID()

  // Handle wheel zoom
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const scaleBy = 1.1
    const stage = stageRef.current
    if (!stage) return

    const oldScale = scale
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const newScale = e.evt.deltaY < 0
      ? Math.min(oldScale * scaleBy, 5)
      : Math.max(oldScale / scaleBy, 0.1)

    const mousePointTo = {
      x: (pointer.x - viewportX) / oldScale,
      y: (pointer.y - viewportY) / oldScale,
    }

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    }

    setScale(newScale)
    setViewport(newPos.x, newPos.y)
  }, [scale, viewportX, viewportY, setScale, setViewport])

  // Handle click to place marker
  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // If clicking on empty space (not on a shape), deselect
    if (e.target === e.currentTarget) {
      if (activeToolType) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return

        const x = (pointer.x - viewportX) / scale
        const y = (pointer.y - viewportY) / scale

        const newMarker: CanvasMarker = {
          id: generateId(),
          type: activeToolType,
          x,
          y,
          name: null,
          noNameNeeded: false,
          regionId: null,
        }
        addMarker(newMarker)
      } else {
        selectMarker(null)
      }
    }
  }, [activeToolType, viewportX, viewportY, scale, addMarker, selectMarker])

  // Handle drag from palette (drop on canvas)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const markerType = e.dataTransfer.getData('marker-type') as MarkerType
    if (!markerType) return

    const stage = stageRef.current
    if (!stage) return

    const stageBox = stage.container().getBoundingClientRect()
    const x = (e.clientX - stageBox.left - viewportX) / scale
    const y = (e.clientY - stageBox.top - viewportY) / scale

    const newMarker: CanvasMarker = {
      id: generateId(),
      type: markerType,
      x,
      y,
      name: null,
      noNameNeeded: false,
      regionId: null,
    }
    addMarker(newMarker)
    setActiveTool(null)
  }, [viewportX, viewportY, scale, addMarker, setActiveTool])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  // Handle marker drag end
  const handleMarkerDragEnd = useCallback((id: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target
    moveMarker(id, node.x(), node.y())
  }, [moveMarker])

  // Get visual properties for each marker type
  const getMarkerDef = (type: MarkerType) =>
    MARKER_DEFINITIONS.find(d => d.type === type) || MARKER_DEFINITIONS[0]

  return (
    <div
      className="w-full h-full bg-muted/30"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      style={{ cursor: activeToolType ? 'crosshair' : 'default' }}
    >
      <Stage
        ref={stageRef}
        width={window.innerWidth - 56 * 4 - 72 * 4} // approximate
        height={window.innerHeight - 120}
        scaleX={scale}
        scaleY={scale}
        x={viewportX}
        y={viewportY}
        draggable={!activeToolType}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setViewport(e.target.x(), e.target.y())
          }
        }}
      >
        <Layer>
          {/* Region boundaries */}
          {regions.map((region) => {
            if (region.boundaryPoints.length < 3) return null
            const points = region.boundaryPoints.flatMap(p => [p.x, p.y])
            const def = getMarkerDef(region.type as MarkerType)
            return (
              <Line
                key={region.id}
                points={points}
                closed
                fill={`${def.color}20`}
                stroke={def.color}
                strokeWidth={1.5}
                dash={[5, 5]}
                opacity={0.6}
              />
            )
          })}

          {/* Markers */}
          {markers.map((marker) => {
            const def = getMarkerDef(marker.type)
            const isSelected = selectedMarkerId === marker.id

            return (
              <MarkerShape
                key={marker.id}
                marker={marker}
                def={def}
                isSelected={isSelected}
                onClick={() => selectMarker(marker.id)}
                onDragEnd={(e) => handleMarkerDragEnd(marker.id, e)}
              />
            )
          })}

          {/* Names */}
          {markers.filter(m => m.name).map((marker) => (
            <Text
              key={`name-${marker.id}`}
              x={marker.x - 30}
              y={marker.y + 12}
              text={marker.name!}
              fontSize={11}
              fill="#1F2937"
              align="center"
              width={60}
            />
          ))}

          {/* Region names */}
          {regions.filter(r => r.name && r.boundaryPoints.length > 0).map((region) => {
            const cx = region.boundaryPoints.reduce((s, p) => s + p.x, 0) / region.boundaryPoints.length
            const cy = region.boundaryPoints.reduce((s, p) => s + p.y, 0) / region.boundaryPoints.length
            return (
              <Text
                key={`rname-${region.id}`}
                x={cx - 40}
                y={cy - 6}
                text={region.name!}
                fontSize={13}
                fill="#1F2937"
                fontStyle="italic"
                align="center"
                width={80}
              />
            )
          })}
        </Layer>
      </Stage>
    </div>
  )
}

interface MarkerShapeProps {
  marker: CanvasMarker
  def: { color: string; shape: string; size: number }
  isSelected: boolean
  onClick: () => void
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
}

function MarkerShape({ marker, def, isSelected, onClick, onDragEnd }: MarkerShapeProps) {
  const commonProps = {
    x: marker.x,
    y: marker.y,
    draggable: true,
    onClick,
    onTap: onClick,
    onDragEnd,
  }

  if (def.shape === 'triangle') {
    return (
      <RegularPolygon
        {...commonProps}
        sides={3}
        radius={def.size / 2 + 2}
        fill={def.color}
        stroke={isSelected ? '#000' : undefined}
        strokeWidth={isSelected ? 2 : 0}
      />
    )
  }

  if (def.shape === 'crown') {
    return (
      <RegularPolygon
        {...commonProps}
        sides={5}
        radius={def.size / 2 + 2}
        fill={def.color}
        stroke={isSelected ? '#000' : undefined}
        strokeWidth={isSelected ? 2 : 0}
      />
    )
  }

  // Default: circle/dot
  return (
    <Circle
      {...commonProps}
      radius={def.size / 2}
      fill={def.color}
      stroke={isSelected ? '#000' : undefined}
      strokeWidth={isSelected ? 2 : 0}
      opacity={def.shape === 'dot' ? 1 : 0.8}
    />
  )
}
