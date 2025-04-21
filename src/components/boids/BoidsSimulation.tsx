import { useEffect, useState, useRef, useCallback } from 'react';
import { BoidsCanvas } from './BoidsCanvas';
import { BoidsControls } from '../controls/BoidsControls';
import { createInitialState, updateBoids, BoidsState, BoidsParameters, ParticleType } from '../../utils/boids';

export const BoidsSimulation = () => {
  // Use full screen dimensions for canvas
  const canvasWidth = window.innerWidth;
  const canvasHeight = window.innerHeight;
  
  // Use a single state object for both parameters and state
  const [state, setState] = useState<BoidsState>(() => {
    // Create initial state with more boids and optimized parameters
    const initialState = createInitialState(500, canvasWidth, canvasHeight);
    
    // Set optimized parameters for better performance
    initialState.parameters.attractionForce = 2.0;
    initialState.parameters.maxSpeed = 2.5;
    initialState.parameters.perceptionRadius = 30; // Smaller perception radius for better performance
    initialState.parameters.separationForce = 1.5;
    initialState.gridCellSize = initialState.parameters.perceptionRadius;
    initialState.particleType = 'disk'; // Start with simple disks for better performance
    
    return initialState;
  });

  // State for controls panel collapsed state
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);

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

  // Handle cursor position updates - update ref directly for animation loop
  const handleCursorPositionChange = useCallback((position: { x: number; y: number } | null) => {
    // Update ref immediately for animation loop
    cursorPositionRef.current = position;
  }, []);

  // Handle attraction state changes - update ref directly for animation loop
  const handleAttractionStateChange = useCallback((isAttracting: boolean) => {
    // Update ref immediately for animation loop
    attractingRef.current = isAttracting;
    
    // Update state for UI
    setState(prev => ({
      ...prev,
      isAttracting
    }));
  }, []);

  // Handle particle type change
  const handleParticleTypeChange = useCallback((type: ParticleType) => {
    setState(prev => ({
      ...prev,
      particleType: type
    }));
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

  // Toggle perception radius
  const handleTogglePerceptionRadius = useCallback(() => {
    setState(prev => ({
      ...prev,
      showPerceptionRadius: !prev.showPerceptionRadius
    }));
  }, []);

  // Toggle controls panel collapsed state
  const handleToggleControlsCollapsed = useCallback(() => {
    setIsControlsCollapsed(prev => !prev);
  }, []);

  // Reset simulation
  const handleReset = useCallback((count?: number) => {
    setState(() => {
      const newState = createInitialState(
        count || state.boids.length,
        state.canvasWidth,
        state.canvasHeight
      );
      // Preserve attraction force on reset
      newState.parameters.attractionForce = state.parameters.attractionForce;
      return newState;
    });
  }, [state.boids.length, state.canvasWidth, state.canvasHeight, state.parameters.attractionForce]);

  // Add a direct method to update population without resetting other attributes
  const handlePopulationChange = useCallback((count: number) => {
    setState(prev => {
      // Create new boids array with desired count
      const newBoids = [...prev.boids];
      
      // If we need more boids
      if (count > newBoids.length) {
        // Get existing ids to avoid duplicates
        const existingIds = new Set(newBoids.map(b => b.id));
        let nextId = prev.boids.length > 0 ? Math.max(...prev.boids.map(b => b.id)) + 1 : 0;
        
        // Create additional boids
        const additionalCount = count - newBoids.length;
        const canvasWidth = prev.canvasWidth;
        const canvasHeight = prev.canvasHeight;
        
        for (let i = 0; i < additionalCount; i++) {
          // Find next available id
          while (existingIds.has(nextId)) {
            nextId++;
          }
          
          // Add a new boid with random position and velocity
          newBoids.push({
            id: nextId,
            position: {
              x: Math.random() * canvasWidth,
              y: Math.random() * canvasHeight
            },
            velocity: {
              x: (Math.random() * 2 - 1) * prev.parameters.maxSpeed,
              y: (Math.random() * 2 - 1) * prev.parameters.maxSpeed
            },
            acceleration: { x: 0, y: 0 },
            history: [],
            maxHistoryLength: prev.parameters.trailLength,
            // The gridCell will be calculated in the next update
            gridCell: undefined
          });
          
          existingIds.add(nextId);
          nextId++;
        }
      }
      // If we need fewer boids
      else if (count < newBoids.length) {
        // Remove boids from the end
        newBoids.splice(count);
      }
      
      // Return updated state with new boid count but preserve other settings
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

  // Advanced animation loop with optimized updates
  useEffect(() => {
    if (!state.isRunning) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    // Three phases: 
    // 1. Only update subset of boids each frame for large counts
    // 2. Batch update to reduce React state changes
    // 3. Skip frames if performance drops
    
    let updateCounter = 0;
    let stateUpdated = false;
    let previousState = stateRef.current;
    let skippedFrames = 0;
    const maxSkipFrames = 2;
    
    // Animation function with direct ref access
    const animate = (timestamp: number) => {
      // Track FPS
      fpsCounterRef.current++;
      if (timestamp - lastFpsUpdateRef.current >= 1000) {
        currentFpsRef.current = fpsCounterRef.current;
        fpsCounterRef.current = 0;
        lastFpsUpdateRef.current = timestamp;
        
        // Adjust simulation complexity based on FPS
        if (currentFpsRef.current < 30 && skippedFrames < maxSkipFrames) {
          skippedFrames++;
        } else if (currentFpsRef.current > 45 && skippedFrames > 0) {
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
        lastFrameTimeRef.current = timestamp - ((timestamp - lastFrameTimeRef.current) % frameInterval);
        
        // Use the current state from ref, but update with the latest cursor and attraction values
        if (!stateUpdated) {
          const nextState = updateBoids({
            ...stateRef.current,
            isAttracting: attractingRef.current,
            cursorPosition: cursorPositionRef.current
          });
          
          // Only trigger React update if state has really changed
          if (nextState !== previousState) {
            setState(nextState);
            previousState = nextState;
            stateUpdated = true;
          }
        } else {
          // Reset stateUpdated for next time
          stateUpdated = false;
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation if not running
    if (animationFrameRef.current === null) {
      lastFrameTimeRef.current = performance.now();
      lastFpsUpdateRef.current = performance.now();
      fpsCounterRef.current = 0;
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    // Cleanup
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [state.isRunning, frameInterval]);

  return (
    <div style={{ margin: 0, padding: 0, overflow: 'hidden', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh' }}>
      {/* Full-screen canvas */}
      <BoidsCanvas 
        state={state}
        className="w-full h-full" 
        onCursorPositionChange={handleCursorPositionChange}
        onAttractionStateChange={handleAttractionStateChange}
      />
      
      {/* Controls panel in top right corner */}
      <div 
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
        }}
      >
        <BoidsControls
          state={state}
          onParameterChange={handleParameterChange}
          onParticleTypeChange={handleParticleTypeChange}
          onToggleRunning={handleToggleRunning}
          onTogglePerceptionRadius={handleTogglePerceptionRadius}
          onReset={handleReset}
          isCollapsed={isControlsCollapsed}
          onToggleCollapsed={handleToggleControlsCollapsed}
          onPopulationChange={handlePopulationChange}
        />
      </div>
      
      {/* FPS Counter */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, color: 'white', fontSize: '12px', backgroundColor: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '4px' }}>
        FPS: {currentFpsRef.current} | Boids: {state.boids.length}
      </div>
      
      {/* Attraction Indicator */}
      {state.isAttracting && (
        <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, color: 'white', fontSize: '12px', backgroundColor: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '4px' }}>
          Attracting: ON
        </div>
      )}
    </div>
  );
}; 