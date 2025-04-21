/**
 * This hook has been deprecated.
 * All boids simulation logic is now directly implemented in BoidsSimulation.tsx
 * for optimal performance with WebGL rendering.
 */

import { BoidsState } from '../utils/boids';

// This is a placeholder implementation to prevent import errors
export const useBoids = () => {
  console.warn('useBoids hook is deprecated. Use BoidsSimulation component directly.');
  
  // Return minimal placeholders to avoid errors
  return {
    state: {} as BoidsState,
    setParameters: () => {},
    setParticleType: () => {},
    toggleRunning: () => {},
    togglePerceptionRadius: () => {},
    resetBoids: () => {},
    setFps: () => {},
    getCurrentFps: () => 0,
    setBoidsCount: () => {}
  };
};

// This empty file is kept to avoid breaking imports
// The functionality has been merged into BoidsSimulation.tsx and BoidsCanvas.tsx 