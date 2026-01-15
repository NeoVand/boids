import { useEffect, useState, useRef, useCallback } from 'react';
import { BoidsCanvas } from './BoidsCanvas';
import { OptimizedGPUCanvas, type PerformanceStats } from './OptimizedGPUCanvas';
import { EnhancedBoidsControls } from '../controls/EnhancedBoidsControls';
import { createBoid, createInitialState, updateBoidsInPlace, BoidsState, BoidsParameters, DEFAULT_PARAMETERS } from '../../utils/boids';

export const EnhancedBoidsSimulation = () => {
  const getViewportSize = () => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  });
  
  // GPU mode - uses OptimizedGPUCanvas for both simulation AND rendering on GPU
  const [useGPU, setUseGPU] = useState(true);
  
  // Performance tracking
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats>({
    fps: 0,
    frameTime: 0,
    boidCount: 0,
    gpuMode: 'webgl2',
    simulationTime: 0,
    renderTime: 0
  });
  
  // Use a single state object for both parameters and state
  const [state, setState] = useState<BoidsState>(() => {
    const viewport = getViewportSize();
    // Create initial state with reasonable number of boids
    const initialBoidCount = 10000;
    const initialState = createInitialState(initialBoidCount, viewport.width, viewport.height);
    
    // Keep defaults from DEFAULT_PARAMETERS for consistent initial UX
    initialState.gridCellSize = initialState.parameters.perceptionRadius;
    initialState.particleType = 'disk';
    
    return initialState;
  });

  // State for controls panel collapsed state
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(true);

  // Use refs for values that need to be accessed in animation loop
  const stateRef = useRef(state);
  const attractingRef = useRef(false);
  const cursorPositionRef = useRef<{ x: number, y: number } | null>(null);
  
  // Animation frame tracking
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const targetFPS = 60;
  const frameInterval = 1000 / targetFPS;
  
  // Performance tracking
  const fpsCounterRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);
  const currentFpsRef = useRef<number>(0);
  const frameTimeSumRef = useRef<number>(0);
  const frameTimeCountRef = useRef<number>(0);
  
  // Update the ref whenever state changes
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Handle parameter change
  const handleParameterChange = useCallback((params: Partial<BoidsParameters>) => {
    setState(prev => ({
      ...prev,
      parameters: {
        ...prev.parameters,
        ...params
      }
    }));
  }, []);

  // Handle cursor position updates
  const handleCursorPositionChange = useCallback((position: { x: number; y: number } | null) => {
    cursorPositionRef.current = position;
    setState(prev => ({
      ...prev,
      cursorPosition: position
    }));
  }, []);

  // Handle attraction boost (mouse down)
  const handleAttractionStateChange = useCallback((isAttracting: boolean) => {
    attractingRef.current = isAttracting;
    setState(prev => ({
      ...prev,
      isAttracting
    }));
  }, []);

  // Toggle running state
  const handleToggleRunning = useCallback(() => {
    setState(prev => ({
      ...prev,
      isRunning: !prev.isRunning
    }));
  }, []);

  // Toggle controls panel collapsed state
  const handleToggleControlsCollapsed = useCallback(() => {
    setIsControlsCollapsed(prev => !prev);
  }, []);

  // Handle colorization mode change
  const handleColorizationChange = useCallback((mode: string) => {
    setState(prev => ({
      ...prev,
      colorizationMode: mode
    }));
  }, []);

  // Reset particles (positions/velocities) - keeps current parameters
  const handleResetParticles = useCallback((count?: number) => {
    setState(prev => {
      const newState = createInitialState(
        count || prev.boids.length,
        prev.canvasWidth,
        prev.canvasHeight
      );
      // Preserve current parameters
      newState.parameters = { ...prev.parameters };
      newState.particleType = prev.particleType;
      newState.colorizationMode = prev.colorizationMode;
      return newState;
    });
  }, []);

  // Reset parameters to defaults - keeps current particles
  const handleResetParameters = useCallback(() => {
    setState(prev => ({
      ...prev,
      parameters: { ...DEFAULT_PARAMETERS },
      colorizationMode: 'orientation'
    }));
  }, []);

  // Handle population change
  const handlePopulationChange = useCallback((count: number) => {
    setState(prev => {
      const newBoids = [...prev.boids];
      
      if (count > newBoids.length) {
        // Add new boids
        const existingIds = new Set(newBoids.map(b => b.id));
        let nextId = prev.boids.length > 0 ? Math.max(...prev.boids.map(b => b.id)) + 1 : 0;
        
        const additionalCount = count - newBoids.length;
        const canvasWidth = prev.canvasWidth;
        const canvasHeight = prev.canvasHeight;
        
        for (let i = 0; i < additionalCount; i++) {
          while (existingIds.has(nextId)) {
            nextId++;
          }

          const boid = createBoid(nextId, canvasWidth, canvasHeight, prev.parameters.trailLength);
          boid.velocity.x = (Math.random() * 2 - 1) * prev.parameters.maxSpeed;
          boid.velocity.y = (Math.random() * 2 - 1) * prev.parameters.maxSpeed;
          newBoids.push(boid);
          
          existingIds.add(nextId);
          nextId++;
        }
      } else if (count < newBoids.length) {
        // Remove boids
        newBoids.splice(count);
      }
      
      return {
        ...prev,
        boids: newBoids
      };
    });
  }, []);

  // Toggle GPU mode
  const handleToggleGPU = useCallback(() => {
    setUseGPU(prev => !prev);
  }, []);

  // Handle performance updates from GPU canvas
  const handlePerformanceUpdate = useCallback((stats: PerformanceStats) => {
    setPerformanceStats(stats);
  }, []);

  // Update canvas dimensions on window resize
  useEffect(() => {
    const handleResize = () => {
      const viewport = getViewportSize();
      setState(prev => ({
        ...prev,
        canvasWidth: viewport.width,
        canvasHeight: viewport.height
      }));
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  // CPU animation loop (only when GPU is disabled)
  useEffect(() => {
    // Skip CPU animation if using GPU mode - OptimizedGPUCanvas handles everything
    if (useGPU) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    if (!state.isRunning) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    let updateCounter = 0;
    let skippedFrames = 0;
    const maxSkipFrames = 2;
    
    const animate = (timestamp: number) => {
      // Track FPS
      fpsCounterRef.current++;
      if (timestamp - lastFpsUpdateRef.current >= 1000) {
        const fps = fpsCounterRef.current;
        currentFpsRef.current = fps;
        fpsCounterRef.current = 0;
        lastFpsUpdateRef.current = timestamp;

        const avgFrameTime =
          frameTimeCountRef.current > 0 ? frameTimeSumRef.current / frameTimeCountRef.current : 0;
        frameTimeSumRef.current = 0;
        frameTimeCountRef.current = 0;

        // Update performance stats (throttled to ~1Hz)
        setPerformanceStats({
          fps,
          frameTime: avgFrameTime,
          boidCount: stateRef.current.boids.length,
          gpuMode: 'cpu',
          simulationTime: 0,
          renderTime: 0
        });
        
        // Adjust simulation complexity based on FPS
        if (fps < 30 && skippedFrames < maxSkipFrames) {
          skippedFrames++;
        } else if (fps > 45 && skippedFrames > 0) {
          skippedFrames--;
        }
      }
      
      // Performance optimization: skip frames if needed
      updateCounter++;
      if (updateCounter % (skippedFrames + 1) !== 0) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      
      // Limit updates to target FPS
      if (timestamp - lastFrameTimeRef.current >= frameInterval) {
        const frameTime = timestamp - lastFrameTimeRef.current;
        lastFrameTimeRef.current = timestamp - (frameTime % frameInterval);

        frameTimeSumRef.current += frameTime;
        frameTimeCountRef.current += 1;

        // Update cursor state and run CPU simulation
        stateRef.current.isAttracting = attractingRef.current;
        stateRef.current.cursorPosition = cursorPositionRef.current;
        updateBoidsInPlace(stateRef.current);
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    if (animationFrameRef.current === null) {
      lastFrameTimeRef.current = performance.now();
      lastFpsUpdateRef.current = performance.now();
      fpsCounterRef.current = 0;
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [state.isRunning, frameInterval, useGPU]);

  return (
    <div style={{ 
      margin: 0, 
      padding: 0, 
      overflow: 'hidden', 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      width: '100dvw', 
      height: '100dvh' 
    }}>
      {/* GPU mode: OptimizedGPUCanvas does both simulation AND rendering on GPU
          CPU mode: BoidsCanvas with full visual features (trails, etc.) */}
      {useGPU ? (
        <OptimizedGPUCanvas 
          state={state}
          className="w-full h-full" 
          onCursorPositionChange={handleCursorPositionChange}
          onAttractionStateChange={handleAttractionStateChange}
          onPerformanceUpdate={handlePerformanceUpdate}
        />
      ) : (
        <BoidsCanvas 
          state={state}
          className="w-full h-full" 
          onCursorPositionChange={handleCursorPositionChange}
          onAttractionStateChange={handleAttractionStateChange}
        />
      )}
      
      {/* Enhanced controls panel in top right corner */}
      <div 
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
        }}
      >
        <EnhancedBoidsControls
          state={state}
          onParameterChange={handleParameterChange}
          onToggleRunning={handleToggleRunning}
          onResetParticles={handleResetParticles}
          onResetParameters={handleResetParameters}
          isCollapsed={isControlsCollapsed}
          onToggleCollapsed={handleToggleControlsCollapsed}
          onPopulationChange={handlePopulationChange}
          onColorizationChange={handleColorizationChange}
          performanceStats={performanceStats}
          gpuEnabled={useGPU}
          onToggleGPU={handleToggleGPU}
        />
      </div>
    </div>
  );
};
