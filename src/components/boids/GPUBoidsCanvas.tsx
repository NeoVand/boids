import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { BoidsState } from '../../utils/boids';
import { GPUBoidsSimulation, GPUBoidsConfig } from '../../utils/gpu-boids';

interface GPUBoidsCanvasProps {
  state: BoidsState;
  className?: string;
  onCursorPositionChange?: (position: { x: number; y: number } | null) => void;
  onAttractionStateChange?: (isAttracting: boolean) => void;
}

// Create projection matrix for WebGL
const createProjectionMatrix = (width: number, height: number): Float32Array => {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  const matrix = new Float32Array(16);
  matrix.fill(0);
  
  // Orthographic projection for 2D
  matrix[0] = 2 / safeWidth;
  matrix[5] = -2 / safeHeight;
  matrix[10] = 1;
  matrix[12] = -1;
  matrix[13] = 1;
  matrix[15] = 1;
  
  return matrix;
};

export const GPUBoidsCanvas = ({ 
  state, 
  className = '',
  onCursorPositionChange,
  onAttractionStateChange
}: GPUBoidsCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gl2Ref = useRef<WebGL2RenderingContext | null>(null);
  const gpuSimulationRef = useRef<GPUBoidsSimulation | null>(null);
  const projectionMatrixRef = useRef<Float32Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const [useGPU, setUseGPU] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);
  const [performanceStats, setPerformanceStats] = useState({
    fps: 0,
    frameTime: 0,
    boidCount: 0
  });
  
  // Performance tracking
  const fpsCounterRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);
  const frameTimeRef = useRef<number>(0);
  
  // GPU configuration
  const gpuConfig: GPUBoidsConfig = useMemo(() => ({
    maxBoids: Math.max(100, Math.min(50000, state.boids.length)), // Ensure minimum and cap at 50k
    workGroupSize: 64,
    spatialGridSize: 128,
    useTransformFeedback: true,
    useInstancedRendering: true
  }), [state.boids.length]);
  
  // Handle mouse/touch interaction
  const getCanvasCoordinates = useCallback((e: MouseEvent | TouchEvent): { x: number, y: number } | null => {
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
    
    const preventDefaultTouchstart = (e: TouchEvent) => {
      e.preventDefault();
      handlePointerDown(e);
    };
    
    canvas.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    
    canvas.addEventListener('touchstart', preventDefaultTouchstart, { passive: false });
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    
    return () => {
      canvas.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      
      canvas.removeEventListener('touchstart', preventDefaultTouchstart);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp]);
  
  // Initialize WebGL2 and GPU simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    try {
      // Get WebGL2 context
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
        console.warn('WebGL2 not supported, falling back to CPU simulation');
        setUseGPU(false);
        return;
      }
      
      gl2Ref.current = gl;
      
      // Initialize GPU simulation
      const gpuSim = new GPUBoidsSimulation(gl, gpuConfig);
      
      // Sync with React state boids
      gpuSim.syncFromReactState(state.boids);
      
      gpuSimulationRef.current = gpuSim;
      
      // Set clear color
      gl.clearColor(0.06, 0.07, 0.08, 1.0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      
      console.log('GPU-accelerated boids simulation initialized');
      
    } catch (error) {
      console.error('Failed to initialize GPU simulation:', error);
      setUseGPU(false);
    }
    
    return () => {
      if (gpuSimulationRef.current) {
        gpuSimulationRef.current.destroy();
        gpuSimulationRef.current = null;
      }
    };
  }, [gpuConfig]);
  
  // Update canvas dimensions and projection matrix
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (canvas.width !== state.canvasWidth || canvas.height !== state.canvasHeight) {
      canvas.width = state.canvasWidth;
      canvas.height = state.canvasHeight;
      
      projectionMatrixRef.current = createProjectionMatrix(state.canvasWidth, state.canvasHeight);
      
      // Update GPU simulation parameters
      if (gpuSimulationRef.current) {
        gpuSimulationRef.current.updateParameters({
          canvasWidth: state.canvasWidth,
          canvasHeight: state.canvasHeight
        });
      }
    }
  }, [state.canvasWidth, state.canvasHeight]);
  
  // Update GPU simulation parameters when state changes
  useEffect(() => {
    if (gpuSimulationRef.current) {
      gpuSimulationRef.current.updateParameters({
        alignmentForce: state.parameters.alignmentForce,
        cohesionForce: state.parameters.cohesionForce,
        separationForce: state.parameters.separationForce,
        perceptionRadius: state.parameters.perceptionRadius,
        maxSpeed: state.parameters.maxSpeed,
        maxForce: state.parameters.maxForce,
        attractionForce: state.parameters.attractionForce,
        attractionX: mousePos?.x || 0,
        attractionY: mousePos?.y || 0,
        isAttracting: state.isAttracting ? 1 : 0
      });
    }
  }, [state.parameters, mousePos, state.isAttracting]);
  
  // Update GPU simulation boid count when it changes
  useEffect(() => {
    if (gpuSimulationRef.current && state.boids.length > 0) {
      // Sync the React state boids to GPU instead of just updating count
      gpuSimulationRef.current.syncFromReactState(state.boids);
    }
  }, [state.boids.length]);
  
  // Animation loop
  useEffect(() => {
    if (!state.isRunning || !useGPU || !gpuSimulationRef.current || !projectionMatrixRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }
    
    const gl = gl2Ref.current;
    if (!gl) return;
    
    let lastTime = performance.now();
    
    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      frameTimeRef.current = deltaTime;
      lastTime = currentTime;
      
      // Update FPS counter
      fpsCounterRef.current++;
      if (currentTime - lastFpsUpdateRef.current >= 1000) {
        setPerformanceStats({
          fps: fpsCounterRef.current,
          frameTime: frameTimeRef.current,
          boidCount: gpuSimulationRef.current?.getBoidCount() || state.boids.length
        });
        fpsCounterRef.current = 0;
        lastFpsUpdateRef.current = currentTime;
      }
      
      // Update delta time for simulation
      if (gpuSimulationRef.current) {
        gpuSimulationRef.current.updateParameters({
          deltaTime: Math.min(deltaTime / 1000, 1/30) // Cap at 30fps minimum
        });
      }
      
      // Clear canvas
      gl.viewport(0, 0, state.canvasWidth, state.canvasHeight);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // Run GPU simulation
      if (gpuSimulationRef.current) {
        gpuSimulationRef.current.simulate();
        gpuSimulationRef.current.render(projectionMatrixRef.current!);
      }
      
      // Draw attraction indicator
      if (mousePos && state.isAttracting) {
        drawAttractionIndicator(gl, mousePos, projectionMatrixRef.current!);
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [state.isRunning, useGPU, state.canvasWidth, state.canvasHeight, mousePos, state.isAttracting, gpuConfig.maxBoids]);
  
  // Fallback to Canvas2D if GPU not available
  const renderCanvas2D = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
    
    // Simple fallback rendering
    ctx.fillStyle = '#4169e1';
    for (const boid of state.boids) {
      ctx.beginPath();
      ctx.arc(boid.position.x, boid.position.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    
    if (mousePos && state.isAttracting) {
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [state, mousePos]);
  
  // Render fallback if GPU not available
  useEffect(() => {
    if (!useGPU && state.isRunning) {
      const interval = setInterval(renderCanvas2D, 16); // ~60fps
      return () => clearInterval(interval);
    }
  }, [useGPU, state.isRunning, renderCanvas2D]);
  
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
          backgroundColor: '#0f1215',
          touchAction: 'none'
        }}
      />
      
      {/* Performance overlay */}
      {useGPU && (
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          color: 'white',
          fontSize: '12px',
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: '8px',
          borderRadius: '4px',
          fontFamily: 'monospace'
        }}>
          <div>GPU Mode: {useGPU ? 'ON' : 'OFF'}</div>
          <div>FPS: {performanceStats.fps}</div>
          <div>Frame: {performanceStats.frameTime.toFixed(1)}ms</div>
          <div>Boids: {performanceStats.boidCount.toLocaleString()}</div>
        </div>
      )}
      
      {/* Attraction indicator */}
      {mousePos && state.isAttracting && (
        <div style={{
          position: 'absolute',
          left: mousePos.x - 10,
          top: mousePos.y - 10,
          width: 20,
          height: 20,
          border: '2px solid rgba(255, 255, 0, 0.8)',
          borderRadius: '50%',
          pointerEvents: 'none',
          animation: 'pulse 1s infinite'
        }} />
      )}
      
             <style>{`
         @keyframes pulse {
           0% { transform: scale(1); opacity: 0.8; }
           50% { transform: scale(1.2); opacity: 0.4; }
           100% { transform: scale(1); opacity: 0.8; }
         }
       `}</style>
    </div>
  );
};

// Helper function to draw attraction indicator using WebGL
const drawAttractionIndicator = (
  _gl: WebGL2RenderingContext, 
  _position: { x: number, y: number }, 
  _projectionMatrix: Float32Array
) => {
  // This would implement a simple circle shader for the attraction indicator
  // For now, we'll use the CSS overlay approach above
}; 