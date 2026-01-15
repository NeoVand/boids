/**
 * Optimized GPU Boids Canvas
 * 
 * Uses the new optimized GPU simulation with:
 * - Spatial hash grid for O(n×k) neighbor lookup
 * - Cached uniform locations
 * - Pre-configured VAOs
 * - Proper double-buffering
 * 
 * Falls back to WebGL if WebGPU unavailable
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { BoidsState } from '../../utils/boids';
import { OptimizedGPUBoids, GPUBoidsConfig } from '../../utils/gpu-boids-optimized';

interface OptimizedGPUCanvasProps {
  state: BoidsState;
  className?: string;
  onCursorPositionChange?: (position: { x: number; y: number } | null) => void;
  onAttractionStateChange?: (isAttracting: boolean) => void;
  onPerformanceUpdate?: (stats: PerformanceStats) => void;
}

export interface PerformanceStats {
  fps: number;
  frameTime: number;
  boidCount: number;
  gpuMode: 'webgl2' | 'webgpu' | 'cpu';
  simulationTime: number;
  renderTime: number;
}

// Create orthographic projection matrix
const createProjectionMatrix = (width: number, height: number): Float32Array => {
  const matrix = new Float32Array(16);
  matrix.fill(0);
  matrix[0] = 2 / Math.max(1, width);
  matrix[5] = -2 / Math.max(1, height);
  matrix[10] = 1;
  matrix[12] = -1;
  matrix[13] = 1;
  matrix[15] = 1;
  return matrix;
};

export const OptimizedGPUCanvas = ({
  state,
  className = '',
  onCursorPositionChange,
  onAttractionStateChange,
  onPerformanceUpdate
}: OptimizedGPUCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const gpuBoidsRef = useRef<OptimizedGPUBoids | null>(null);
  const projectionMatrixRef = useRef<Float32Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const [gpuMode, setGpuMode] = useState<'webgl2' | 'cpu'>('webgl2');
  const [isDragging, setIsDragging] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  
  // Performance tracking refs
  const fpsCounterRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const simTimesRef = useRef<number[]>([]);
  const renderTimesRef = useRef<number[]>([]);
  
  // GPU config based on state
  const gpuConfig: GPUBoidsConfig = useMemo(() => {
    const boidCount = Math.max(100, Math.min(100000, state.boids.length));
    const gridCellSize = Math.max(20, state.parameters.perceptionRadius);
    const gridWidth = Math.ceil(state.canvasWidth / gridCellSize);
    const gridHeight = Math.ceil(state.canvasHeight / gridCellSize);
    
    return {
      maxBoids: boidCount,
      gridCellSize,
      gridWidth,
      gridHeight
    };
  }, [state.boids.length, state.parameters.perceptionRadius, state.canvasWidth, state.canvasHeight]);
  
  // Canvas coordinate helper
  const getCanvasCoordinates = useCallback((e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    
    return { x, y };
  }, []);
  
  // Event handlers
  const handlePointerDown = useCallback((e: MouseEvent | TouchEvent) => {
    const position = getCanvasCoordinates(e);
    if (position) {
      setIsDragging(true);
      setMousePos(position);
      onCursorPositionChange?.(position);
      onAttractionStateChange?.(true);
    }
  }, [getCanvasCoordinates, onCursorPositionChange, onAttractionStateChange]);
  
  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (state.isAttracting || isDragging) {
      const position = getCanvasCoordinates(e);
      if (position) {
        setMousePos(position);
        onCursorPositionChange?.(position);
      }
    }
  }, [getCanvasCoordinates, onCursorPositionChange, state.isAttracting, isDragging]);
  
  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    onAttractionStateChange?.(false);
  }, [onAttractionStateChange]);
  
  // Setup event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const preventDefaultTouch = (e: TouchEvent) => {
      e.preventDefault();
      handlePointerDown(e);
    };
    
    canvas.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    
    canvas.addEventListener('touchstart', preventDefaultTouch, { passive: false });
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    
    return () => {
      canvas.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      
      canvas.removeEventListener('touchstart', preventDefaultTouch);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp]);
  
  // Initialize WebGL2 and GPU simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    try {
      const gl = canvas.getContext('webgl2', {
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
      });
      
      if (!gl) {
        console.warn('WebGL2 not supported');
        setGpuMode('cpu');
        return;
      }
      
      // Check for required extensions
      const floatTexExt = gl.getExtension('EXT_color_buffer_float');
      if (!floatTexExt) {
        console.warn('EXT_color_buffer_float not supported');
      }
      
      glRef.current = gl;
      
      // Initialize optimized GPU boids
      const gpuBoids = new OptimizedGPUBoids(gl, gpuConfig);
      // Set canvas dimensions before syncing boids
      gpuBoids.updateParameters({
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight,
        maxSpeed: state.parameters.maxSpeed,
        maxForce: state.parameters.maxForce,
        perceptionRadius: state.parameters.perceptionRadius,
        alignmentForce: state.parameters.alignmentForce,
        cohesionForce: state.parameters.cohesionForce,
        separationForce: state.parameters.separationForce,
        boidSize: state.parameters.boidSize ?? 0.5,
        noiseStrength: state.parameters.noiseStrength ?? 0.35,
        edgeBehavior: state.parameters.edgeBehavior,
        edgeMargin: state.parameters.edgeMargin,
        boundaryMode: state.parameters.boundaryMode,
        trailLength: state.parameters.trailLength,
        colorizationMode: state.colorizationMode,
        colorSpectrum: state.parameters.colorSpectrum,
        colorSensitivity: state.parameters.colorSensitivity
      });
      gpuBoids.syncFromReactState(state.boids);
      gpuBoidsRef.current = gpuBoids;
      
      // Setup GL state
      gl.clearColor(0.04, 0.05, 0.06, 1.0);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      // Premultiplied alpha blending for correct trail overlap
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      
      setGpuMode('webgl2');
      console.log('Optimized GPU boids initialized with', gpuConfig.maxBoids, 'boids');
      
    } catch (error) {
      console.error('GPU initialization failed:', error);
      setGpuMode('cpu');
    }
    
    return () => {
      if (gpuBoidsRef.current) {
        gpuBoidsRef.current.destroy();
        gpuBoidsRef.current = null;
      }
    };
  }, [gpuConfig]);
  
  // Update canvas dimensions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (canvas.width !== state.canvasWidth || canvas.height !== state.canvasHeight) {
      canvas.width = state.canvasWidth;
      canvas.height = state.canvasHeight;
      projectionMatrixRef.current = createProjectionMatrix(state.canvasWidth, state.canvasHeight);
      
      if (gpuBoidsRef.current) {
        gpuBoidsRef.current.updateParameters({
          canvasWidth: state.canvasWidth,
          canvasHeight: state.canvasHeight
        });
      }
    }
  }, [state.canvasWidth, state.canvasHeight]);
  
  // Update GPU parameters when state changes
  useEffect(() => {
    if (gpuBoidsRef.current) {
      gpuBoidsRef.current.updateParameters({
        alignmentForce: state.parameters.alignmentForce,
        cohesionForce: state.parameters.cohesionForce,
        separationForce: state.parameters.separationForce,
        perceptionRadius: state.parameters.perceptionRadius,
        maxSpeed: state.parameters.maxSpeed,
        maxForce: state.parameters.maxForce,
        attractionForce: state.parameters.attractionForce * (state.parameters.attractionMode === 'repel' ? -1 : 1),
        attractionX: mousePos?.x || 0,
        attractionY: mousePos?.y || 0,
        isAttracting: state.isAttracting && state.parameters.attractionMode !== 'off' ? 1 : 0,
        boidSize: state.parameters.boidSize ?? 0.5,
        noiseStrength: state.parameters.noiseStrength ?? 0.35,
        edgeBehavior: state.parameters.edgeBehavior,
        edgeMargin: state.parameters.edgeMargin,
        boundaryMode: state.parameters.boundaryMode,
        trailLength: state.parameters.trailLength,
        colorizationMode: state.colorizationMode,
        colorSpectrum: state.parameters.colorSpectrum,
        colorSensitivity: state.parameters.colorSensitivity
      });
    }
  }, [state.parameters, state.colorizationMode, mousePos, state.isAttracting]);
  
  // Sync boid count changes
  useEffect(() => {
    if (gpuBoidsRef.current && state.boids.length > 0) {
      gpuBoidsRef.current.syncFromReactState(state.boids);
    }
  }, [state.boids.length]);
  
  // Animation loop
  useEffect(() => {
    // Create projection matrix if not exists
    if (!projectionMatrixRef.current && state.canvasWidth > 0 && state.canvasHeight > 0) {
      projectionMatrixRef.current = createProjectionMatrix(state.canvasWidth, state.canvasHeight);
    }
    
    if (!state.isRunning || gpuMode === 'cpu' || !gpuBoidsRef.current || !projectionMatrixRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }
    
    const gl = glRef.current;
    if (!gl) return;
    
    let lastTime = performance.now();
    
    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      
      // Track frame time
      frameTimesRef.current.push(deltaTime);
      if (frameTimesRef.current.length > 60) frameTimesRef.current.shift();
      
      // FPS counter
      fpsCounterRef.current++;
      if (currentTime - lastFpsUpdateRef.current >= 1000) {
        const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
        const avgSimTime = simTimesRef.current.length > 0 
          ? simTimesRef.current.reduce((a, b) => a + b, 0) / simTimesRef.current.length 
          : 0;
        const avgRenderTime = renderTimesRef.current.length > 0
          ? renderTimesRef.current.reduce((a, b) => a + b, 0) / renderTimesRef.current.length
          : 0;
        
        onPerformanceUpdate?.({
          fps: fpsCounterRef.current,
          frameTime: avgFrameTime,
          boidCount: gpuBoidsRef.current?.getBoidCount() || 0,
          gpuMode: gpuMode,
          simulationTime: avgSimTime,
          renderTime: avgRenderTime
        });
        
        fpsCounterRef.current = 0;
        lastFpsUpdateRef.current = currentTime;
        simTimesRef.current = [];
        renderTimesRef.current = [];
      }
      
      // Update delta time
      gpuBoidsRef.current?.updateParameters({
        deltaTime: Math.min(deltaTime / 1000, 1/30)
      });
      
      // Clear
      gl.viewport(0, 0, state.canvasWidth, state.canvasHeight);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // Simulate
      const simStart = performance.now();
      gpuBoidsRef.current?.simulate();
      simTimesRef.current.push(performance.now() - simStart);
      
      // Render
      const renderStart = performance.now();
      gpuBoidsRef.current?.render(projectionMatrixRef.current!);
      renderTimesRef.current.push(performance.now() - renderStart);
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [state.isRunning, gpuMode, state.canvasWidth, state.canvasHeight, onPerformanceUpdate]);
  
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        width={state.canvasWidth}
        height={state.canvasHeight}
        className={className}
        style={{
          margin: 0,
          padding: 0,
          display: 'block',
          width: '100%',
          height: '100%',
          backgroundColor: '#0a0b0d',
          touchAction: 'none'
        }}
      />
      
      {/* Attraction indicator */}
      {mousePos && state.isAttracting && (
        <div style={{
          position: 'absolute',
          left: mousePos.x - 15,
          top: mousePos.y - 15,
          width: 30,
          height: 30,
          border: '2px solid rgba(100, 255, 100, 0.6)',
          borderRadius: '50%',
          pointerEvents: 'none',
          boxShadow: '0 0 20px rgba(100, 255, 100, 0.3)'
        }} />
      )}
    </div>
  );
};
