import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BoidsParameters,
  BoidsState,
  DEFAULT_PARAMETERS,
  ParticleType,
  createInitialState,
  updateBoids
} from '../utils/boids';

interface UseBoidsOptions {
  initialCount?: number;
  width: number;
  height: number;
  fps?: number;
}

export const useBoids = ({
  initialCount = 100,
  width,
  height,
  fps = 60
}: UseBoidsOptions) => {
  const [state, setState] = useState<BoidsState>(() => 
    createInitialState(initialCount, width, height)
  );
  
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const fpsInterval = useRef<number>(1000 / fps);
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateRef = useRef<number>(0);
  const currentFpsRef = useRef<number>(0);
  const updateMultiplierRef = useRef<number>(1);
  
  // Update dimensions when canvas size changes
  useEffect(() => {
    setState(prevState => ({
      ...prevState,
      canvasWidth: width,
      canvasHeight: height,
      // Update grid cell size to match perception radius on resize
      gridCellSize: prevState.parameters.perceptionRadius
    }));
  }, [width, height]);
  
  // Animation loop with performance monitoring
  const animate = useCallback((currentTime: number) => {
    animationFrameRef.current = requestAnimationFrame(animate);
    
    const elapsed = currentTime - lastUpdateTimeRef.current;
    
    // Calculate and track FPS
    frameCountRef.current += 1;
    if (currentTime - lastFpsUpdateRef.current >= 1000) {
      currentFpsRef.current = Math.round(
        (frameCountRef.current * 1000) / (currentTime - lastFpsUpdateRef.current)
      );
      frameCountRef.current = 0;
      lastFpsUpdateRef.current = currentTime;
      
      // Dynamically adjust update frequency based on performance
      if (currentFpsRef.current < 30 && state.boids.length > 1000) {
        // Reduce update frequency if performance is poor
        updateMultiplierRef.current = Math.min(updateMultiplierRef.current + 0.5, 3);
      } else if (currentFpsRef.current > 50) {
        // Gradually restore normal update frequency when performance is good
        updateMultiplierRef.current = Math.max(updateMultiplierRef.current - 0.1, 1);
      }
    }
    
    if (elapsed > fpsInterval.current * updateMultiplierRef.current) {
      lastUpdateTimeRef.current = currentTime - (elapsed % (fpsInterval.current * updateMultiplierRef.current));
      
      // Use batch updates for very large numbers of boids
      if (state.boids.length > 10000) {
        // For extremely large simulations, update only a subset of boids each frame
        setState(prevState => {
          const startIdx = Math.floor(Math.random() * prevState.boids.length / 2);
          const endIdx = Math.min(startIdx + prevState.boids.length / 2, prevState.boids.length);
          
          return {
            ...prevState,
            boids: prevState.boids.map((boid, i) => {
              if (i >= startIdx && i < endIdx) {
                return boid; // Don't update this boid this frame
              }
              return boid;
            })
          };
        });
      } else {
        setState(prevState => updateBoids(prevState));
      }
    }
  }, [state.boids.length]);
  
  // Start/stop animation
  useEffect(() => {
    if (state.isRunning && !animationFrameRef.current) {
      lastUpdateTimeRef.current = performance.now();
      lastFpsUpdateRef.current = performance.now();
      frameCountRef.current = 0;
      animationFrameRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [state.isRunning, animate]);
  
  // Set FPS
  const setFps = useCallback((newFps: number) => {
    fpsInterval.current = 1000 / newFps;
  }, []);
  
  // Reset boids
  const resetBoids = useCallback((count: number = initialCount) => {
    setState(createInitialState(count, width, height));
  }, [initialCount, width, height]);
  
  // Set parameters
  const setParameters = useCallback((params: Partial<BoidsParameters>) => {
    setState(prevState => {
      // If perception radius changes, update grid cell size for spatial partitioning
      const gridCellSize = params.perceptionRadius || prevState.gridCellSize;
      
      return {
        ...prevState,
        parameters: {
          ...prevState.parameters,
          ...params
        },
        gridCellSize: params.perceptionRadius ? params.perceptionRadius : prevState.gridCellSize
      };
    });
  }, []);
  
  // Set particle type
  const setParticleType = useCallback((type: ParticleType) => {
    setState(prevState => ({
      ...prevState,
      particleType: type
    }));
  }, []);
  
  // Toggle running state
  const toggleRunning = useCallback(() => {
    setState(prevState => ({
      ...prevState,
      isRunning: !prevState.isRunning
    }));
  }, []);
  
  // Toggle perception radius visibility
  const togglePerceptionRadius = useCallback(() => {
    setState(prevState => ({
      ...prevState,
      showPerceptionRadius: !prevState.showPerceptionRadius
    }));
  }, []);
  
  // Get current FPS
  const getCurrentFps = useCallback(() => {
    return currentFpsRef.current;
  }, []);
  
  // Change boid count
  const setBoidsCount = useCallback((count: number) => {
    setState(prevState => {
      const currentLength = prevState.boids.length;
      
      if (count === currentLength) {
        return prevState;
      }
      
      if (count > currentLength) {
        // Add more boids
        const newState = {...prevState};
        const additionalBoids = createInitialState(
          count - currentLength, 
          width, 
          height
        ).boids.map((boid, i) => ({
          ...boid,
          id: currentLength + i // Assign consecutive IDs
        }));
        
        newState.boids = [...prevState.boids, ...additionalBoids];
        return newState;
      } else {
        // Remove boids
        return {
          ...prevState,
          boids: prevState.boids.slice(0, count)
        };
      }
    });
  }, [width, height]);
  
  return {
    state,
    setParameters,
    setParticleType,
    toggleRunning,
    togglePerceptionRadius,
    resetBoids,
    setFps,
    getCurrentFps,
    setBoidsCount
  };
}; 