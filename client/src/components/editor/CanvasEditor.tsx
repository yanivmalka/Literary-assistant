import { useRef, useCallback, useEffect, useState } from 'react'
import { Stage, Layer, Circle, Line, Text, RegularPolygon, Image as KonvaImage, Rect, Transformer } from 'react-konva'
import { useMapStore } from '@/stores/mapStore'
import { MARKER_DEFINITIONS } from '@/lib/types'
import type { MarkerType, CanvasMarker, MarkerShape } from '@/lib/types'
import type Konva from 'konva'

export default function CanvasEditor() {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const selectedShapeRef = useRef<Konva.Node | null>(null)
  const {
    currentMap,
    markers,
    regions,
    scale,
    viewportX,
    viewportY,
    activeToolType,
    activeShape,
    selectedMarkerId,
    setScale,
    setViewport,
    addMarker,
    moveMarker,
    selectMarker,
    setActiveTool,
  } = useMapStore()

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null)

  // Load uploaded final image as background
  useEffect(() => {
    if (currentMap?.final_image_url) {
      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => setBgImage(img)
      img.src = currentMap.final_image_url
    } else {
      setBgImage(null)
    }
  }, [currentMap?.final_image_url])

  // Attach transformer to selected marker
  useEffect(() => {
    if (selectedMarkerId && transformerRef.current && stageRef.current) {
      const selectedNode = stageRef.current.findOne(`#marker-${selectedMarkerId}`)
      if (selectedNode) {
        const marker = markers.find(m => m.id === selectedMarkerId)
        const def = marker ? MARKER_DEFINITIONS.find(d => d.type === marker.type) : null
        const isResizable = def?.resizable !== false
        const isRotatable = def?.rotatable !== false && isResizable

        if (isResizable) {
          transformerRef.current.rotateEnabled(isRotatable)
          transformerRef.current.nodes([selectedNode])
          transformerRef.current.getLayer()?.batchDraw()
        } else {
          transformerRef.current.nodes([])
        }
        selectedShapeRef.current = selectedNode
      }
    } else if (transformerRef.current) {
      transformerRef.current.nodes([])
      transformerRef.current.getLayer()?.batchDraw()
      selectedShapeRef.current = null
    }
  }, [selectedMarkerId, markers])

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
    if (e.target === e.currentTarget || e.target.getClassName() === 'Image' || e.target.getClassName() === 'Rect') {
      if (activeToolType) {
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return

        const x = (pointer.x - viewportX) / scale
        const y = (pointer.y - viewportY) / scale

        const def = MARKER_DEFINITIONS.find(d => d.type === activeToolType)

        const newMarker: CanvasMarker = {
          id: generateId(),
          type: activeToolType,
          x,
          y,
          name: null,
          noNameNeeded: false,
          regionId: null,
          shape: activeShape || def?.shape || 'circle',
          color: def?.color,
        }
        addMarker(newMarker)
      } else {
        selectMarker(null)
      }
    }
  }, [activeToolType, activeShape, viewportX, viewportY, scale, addMarker, selectMarker])

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

    const def = MARKER_DEFINITIONS.find(d => d.type === markerType)

    const newMarker: CanvasMarker = {
      id: generateId(),
      type: markerType,
      x,
      y,
      name: null,
      noNameNeeded: false,
      regionId: null,
      shape: activeShape || def?.shape || 'circle',
      color: def?.color,
    }
    addMarker(newMarker)
    setActiveTool(null)
  }, [viewportX, viewportY, scale, activeShape, addMarker, setActiveTool])

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

  const stageWidth = typeof window !== 'undefined' ? window.innerWidth - 224 - 288 : 800
  const stageHeight = typeof window !== 'undefined' ? window.innerHeight - 120 : 600

  return (
    <div
      className="w-full h-full bg-muted/30"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      style={{ cursor: activeToolType ? 'crosshair' : 'default' }}
    >
      <Stage
        ref={stageRef}
        width={stageWidth}
        height={stageHeight}
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
          {/* Background - uploaded image or placeholder rect */}
          {bgImage ? (
            <KonvaImage
              image={bgImage}
              x={0}
              y={0}
              width={bgImage.naturalWidth || stageWidth}
              height={bgImage.naturalHeight || stageHeight}
              listening={false}
            />
          ) : (
            <Rect
              x={0}
              y={0}
              width={stageWidth / scale}
              height={stageHeight / scale}
              fill="#f8f9fa"
              listening={false}
            />
          )}

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
            const markerColor = marker.color || def.color
            const markerShape = (marker.shape || def.shape) as MarkerShape
            const markerStroke = def.strokeColor
            const markerSize = marker.size || def.size

            return (
              <MarkerShape
                key={marker.id}
                id={`marker-${marker.id}`}
                marker={marker}
                def={{ color: markerColor, shape: markerShape, size: markerSize, strokeColor: markerStroke }}
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

          {/* Transformer for resize/rotate/stretch */}
          <Transformer
            ref={transformerRef}
            rotateEnabled={true}
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
            boundBoxFunc={(oldBox, newBox) => {
              // Limit minimum size
              if (newBox.width < 5 || newBox.height < 5) return oldBox
              return newBox
            }}
          />
        </Layer>
      </Stage>
    </div>
  )
}

interface MarkerShapeProps {
  id: string
  marker: CanvasMarker
  def: { color: string; shape: string; size: number; strokeColor?: string }
  isSelected: boolean
  onClick: () => void
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
}

function MarkerShape({ id, marker, def, isSelected, onClick, onDragEnd }: MarkerShapeProps) {
  const commonProps = {
    id,
    x: marker.x,
    y: marker.y,
    draggable: true,
    onClick,
    onTap: onClick,
    onDragEnd,
  }

  const selStroke = isSelected ? '#000' : def.strokeColor || undefined
  const selStrokeWidth = isSelected ? 2 : def.strokeColor ? 1.5 : 0

  if (def.shape === 'triangle') {
    return (
      <RegularPolygon
        {...commonProps}
        sides={3}
        radius={def.size / 2 + 2}
        fill={def.color}
        stroke={selStroke}
        strokeWidth={selStrokeWidth}
      />
    )
  }

  if (def.shape === 'polygon') {
    return (
      <RegularPolygon
        {...commonProps}
        sides={5}
        radius={def.size / 2 + 2}
        fill={def.color}
        stroke={selStroke}
        strokeWidth={selStrokeWidth}
      />
    )
  }

  if (def.shape === 'crown') {
    // Detailed crown shape - gold with dark red interior
    const s = def.size / 2
    const crownPoints = [
      -s, s*0.4,  // bottom-left
      -s, -s*0.1,  // left rise
      -s*0.8, -s*0.6,  // left point
      -s*0.5, -s*0.2,  // left valley
      -s*0.2, -s*0.8,  // inner-left point
      0, -s*0.3,  // center valley
      s*0.2, -s*0.8,  // inner-right point
      s*0.5, -s*0.2,  // right valley
      s*0.8, -s*0.6,  // right point
      s, -s*0.1,  // right rise
      s, s*0.4,  // bottom-right
    ]
    return (
      <>
        <Line
          {...commonProps}
          points={crownPoints}
          closed
          fill="#D4A017"
          stroke="#B8860B"
          strokeWidth={1}
        />
        {/* Crown band at bottom */}
        <Line
          x={marker.x}
          y={marker.y}
          points={[-s, s*0.25, s, s*0.25, s, s*0.4, -s, s*0.4]}
          closed
          fill="#C49B08"
          stroke="#B8860B"
          strokeWidth={0.5}
          listening={false}
        />
        {/* Red interior */}
        <Line
          x={marker.x}
          y={marker.y}
          points={[
            -s*0.7, -s*0.05,
            -s*0.4, -s*0.15,
            -s*0.15, -s*0.55,
            0, -s*0.15,
            s*0.15, -s*0.55,
            s*0.4, -s*0.15,
            s*0.7, -s*0.05,
            s*0.5, s*0.2,
            -s*0.5, s*0.2,
          ]}
          closed
          fill="#8B1A1A"
          listening={false}
        />
      </>
    )
  }

  if (def.shape === 'square') {
    return (
      <Rect
        id={id}
        x={marker.x - def.size / 2}
        y={marker.y - def.size / 2}
        width={def.size}
        height={def.size}
        fill={def.color}
        stroke={selStroke}
        strokeWidth={selStrokeWidth}
        draggable
        onClick={onClick}
        onTap={onClick}
        onDragEnd={onDragEnd}
      />
    )
  }

  if (def.shape === 'line') {
    return (
      <Line
        id={id}
        x={marker.x}
        y={marker.y}
        points={[-8, 8, 8, -8]}
        stroke={def.color}
        strokeWidth={marker.strokeWidth ?? 3}
        lineCap="round"
        draggable
        onClick={onClick}
        onTap={onClick}
        onDragEnd={onDragEnd}
        hitStrokeWidth={12}
      />
    )
  }

  // Default: circle/dot
  return (
    <Circle
      {...commonProps}
      radius={def.shape === 'dot' ? def.size / 3 : def.size / 2}
      fill={def.color}
      stroke={selStroke}
      strokeWidth={selStrokeWidth}
      opacity={def.shape === 'dot' ? 1 : 0.8}
    />
  )
}
