import { useEffect, useState, useRef, useCallback } from 'react';
import { BoidsCanvas } from './BoidsCanvas';
import { BoidsControls } from '../controls/BoidsControls';
import { DEFAULT_PARAMETERS, createInitialState, updateBoids, BoidsState, BoidsParameters, ParticleType } from '../../utils/boids';

export const BoidsSimulation = () => {
  console.log("BoidsSimulation rerendering");
  
  // Get window dimensions for canvas
  const canvasWidth = window.innerWidth * 0.9; // Make canvas responsive
  const canvasHeight = window.innerHeight * 0.7;
  
  // Use a single state object for both parameters and state
  const [state, setState] = useState<BoidsState>(() => {
    // Make sure attraction force is set in initial state
    const initialState = createInitialState(100, canvasWidth, canvasHeight);
    initialState.parameters.attractionForce = 2.0; // Set a default higher attraction force
    return initialState;
  });

  // Use refs for values that need to be accessed in animation loop
  const stateRef = useRef(state);
  const attractingRef = useRef(false);
  const cursorPositionRef = useRef<{ x: number, y: number } | null>(null);
  
  // Update the ref whenever state changes
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const targetFPS = 60;
  const frameInterval = 1000 / targetFPS;

  // Handle parameter change
  const handleParameterChange = useCallback((params: Partial<BoidsParameters>) => {
    console.log("Parameter change:", params);
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
    console.log("Cursor position change:", position);
    if (position) {
      // Update ref immediately for animation loop
      cursorPositionRef.current = position;
      
      // Also update state for rendering
      setState(prev => ({
        ...prev,
        cursorPosition: position
      }));
    }
  }, []);

  // Handle attraction state changes - update ref directly for animation loop
  const handleAttractionStateChange = useCallback((isAttracting: boolean) => {
    console.log("Attraction state change:", isAttracting);
    
    // Update ref immediately for animation loop
    attractingRef.current = isAttracting;
    
    // Also update state for rendering
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
      console.log(`Simulation is now ${newIsRunning ? 'running' : 'paused'}`);
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

  // Debug effect to monitor state changes
  useEffect(() => {
    console.log("Current state:", {
      isAttracting: state.isAttracting,
      cursorPosition: state.cursorPosition,
      boidsCount: state.boids.length,
      attractingRef: attractingRef.current,
      cursorPositionRef: cursorPositionRef.current,
      attractionForce: state.parameters.attractionForce
    });
  }, [state.isAttracting, state.cursorPosition, state.parameters.attractionForce]);

  // Animation loop
  useEffect(() => {
    if (!state.isRunning) return;

    // Animation function with direct ref access
    const animate = (timestamp: number) => {
      if (timestamp - lastFrameTimeRef.current >= frameInterval) {
        lastFrameTimeRef.current = timestamp - ((timestamp - lastFrameTimeRef.current) % frameInterval);
        
        // Use the current state from ref, but update with the latest cursor and attraction values
        setState(prevState => {
          const newState = updateBoids({
            ...prevState,
            isAttracting: attractingRef.current,
            cursorPosition: cursorPositionRef.current
          });
          return newState;
        });
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.isRunning, frameInterval]);

  return (
    <div className="flex flex-col w-full max-w-4xl mx-auto gap-4">
      <div className="relative">
        <BoidsCanvas 
          state={state} 
          className="w-full aspect-video bg-black rounded-lg shadow-lg" 
          onCursorPositionChange={handleCursorPositionChange}
          onAttractionStateChange={handleAttractionStateChange}
        />
        <div className="absolute bottom-2 left-2 text-white text-sm bg-black bg-opacity-50 p-1 rounded">
          Click and drag to attract boids. {state.isAttracting ? 'Attracting ON' : 'Attracting OFF'}
        </div>
      </div>
      <BoidsControls
        state={state}
        onParameterChange={handleParameterChange}
        onParticleTypeChange={handleParticleTypeChange}
        onToggleRunning={handleToggleRunning}
        onTogglePerceptionRadius={handleTogglePerceptionRadius}
        onReset={handleReset}
      />
    </div>
  );
}; 