import { useEffect, useState, useRef, useCallback } from 'react';
import { BoidsCanvas } from './BoidsCanvas';
import { EnhancedBoidsControls } from '../controls/EnhancedBoidsControls';
import { createBoid, createInitialState, updateBoidsInPlace, BoidsState, BoidsParameters } from '../../utils/boids';

export const EnhancedBoidsSimulation = () => {
  // Use full screen dimensions for canvas
  const canvasWidth = window.innerWidth;
  const canvasHeight = window.innerHeight;
  
  // Performance tracking
  const [performanceStats, setPerformanceStats] = useState({
    fps: 0,
    frameTime: 0,
    boidCount: 0
  });
  
  // Use a single state object for both parameters and state
  const [state, setState] = useState<BoidsState>(() => {
    // Create initial state with reasonable number of boids
    const initialState = createInitialState(2000, canvasWidth, canvasHeight);
    
    // Keep defaults from DEFAULT_PARAMETERS for consistent initial UX
    initialState.gridCellSize = initialState.parameters.perceptionRadius;
    initialState.particleType = 'disk';
    
    // console.log('Initial state created with', initialState.boids.length, 'boids');
    // console.log('Initial state isRunning:', initialState.isRunning);
    
    return initialState;
  });

  // State for controls panel collapsed state
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(true);

  // Use refs for values that need to be accessed in animation loop (CPU mode only)
  const stateRef = useRef(state);
  const attractingRef = useRef(false);
  const cursorPositionRef = useRef<{ x: number, y: number } | null>(null);
  
  // Animation frame tracking (CPU mode only)
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const targetFPS = 60;
  const frameInterval = 1000 / targetFPS;
  
  // Performance tracking (CPU mode only)
  const fpsCounterRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);
  const currentFpsRef = useRef<number>(0);
  const frameTimeSumRef = useRef<number>(0);
  const frameTimeCountRef = useRef<number>(0);
  
  // Update the ref whenever state changes (CPU mode only)
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
  }, []);

  // Handle attraction boost (mouse down)
  const handleAttractionStateChange = useCallback((isAttracting: boolean) => {
    attractingRef.current = isAttracting;
  }, []);

  // Toggle running state
  const handleToggleRunning = useCallback(() => {
    setState(prev => {
      const newIsRunning = !prev.isRunning;
      return {
        ...prev,
        isRunning: newIsRunning
      };
    });
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

  // Reset simulation
  const handleReset = useCallback((count?: number) => {
    setState(() => {
      const newState = createInitialState(
        count || state.boids.length,
        state.canvasWidth,
        state.canvasHeight
      );
      // Preserve current parameters
      newState.parameters = { ...state.parameters };
      newState.particleType = state.particleType;
      newState.colorizationMode = state.colorizationMode;
      return newState;
    });
  }, [state]);

  // Handle population change
  const handlePopulationChange = useCallback((count: number) => {
    // console.log('Population change requested:', count);
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

  // Update canvas dimensions on window resize
  useEffect(() => {
    const handleResize = () => {
      setState(prev => ({
        ...prev,
        canvasWidth: window.innerWidth,
        canvasHeight: window.innerHeight
      }));
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // CPU animation loop (only when GPU is disabled)
  useEffect(() => {
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

        // Update performance stats (throttled to ~1Hz to avoid heavy React/MUI work every frame)
        setPerformanceStats({
          fps,
          frameTime: avgFrameTime,
          boidCount: stateRef.current.boids.length,
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

        // In-place tick: avoid per-frame React state updates (major perf win)
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
  }, [state.isRunning, frameInterval]);

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
      width: '100vw', 
      height: '100vh' 
    }}>
      {/* Always use the regular BoidsCanvas which has WebGL rendering with CPU simulation */}
      <BoidsCanvas 
        state={state}
        className="w-full h-full" 
        onCursorPositionChange={handleCursorPositionChange}
        onAttractionStateChange={handleAttractionStateChange}
      />
      
      {/* Note: GPU mode temporarily disabled due to complexity - WebGL rendering is still used for performance */}
      
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
          onReset={handleReset}
          isCollapsed={isControlsCollapsed}
          onToggleCollapsed={handleToggleControlsCollapsed}
          onPopulationChange={handlePopulationChange}
          onColorizationChange={handleColorizationChange}
          performanceStats={performanceStats}
          gpuEnabled={false}
          onToggleGPU={undefined}
        />
      </div>
      
      {/* Attraction Indicator removed per UI request */}
    </div>
  );
}; 