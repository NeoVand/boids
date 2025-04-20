/**
 * Boids flocking algorithm implementation
 * Based on the original algorithm by Craig Reynolds: https://www.red3d.com/cwr/boids/
 * Optimized with spatial partitioning for better performance
 */

export interface Vector2D {
  x: number;
  y: number;
}

export interface Boid {
  id: number;
  position: Vector2D;
  velocity: Vector2D;
  acceleration: Vector2D;
  history: Vector2D[];
  maxHistoryLength: number;
  gridCell?: string; // For spatial partitioning
}

export interface BoidsParameters {
  alignmentForce: number;
  cohesionForce: number;
  separationForce: number;
  perceptionRadius: number;
  maxSpeed: number;
  maxForce: number;
  edgeBehavior: 'wrap' | 'bounce' | 'avoid';
  edgeMargin: number;
  trailLength: number; // Added for configurable trail length
  attractionForce: number; // Force towards cursor when clicked/touched
}

export type ParticleType = 'disk' | 'trail' | 'arrow' | 'dot';

export interface BoidsState {
  boids: Boid[];
  parameters: BoidsParameters;
  canvasWidth: number;
  canvasHeight: number;
  particleType: ParticleType;
  isRunning: boolean;
  showPerceptionRadius: boolean;
  spatialGrid: Map<string, number[]>; // Spatial partitioning grid: cell key -> array of boid indices
  gridCellSize: number;
  cursorPosition: Vector2D | null; // Position of cursor when clicked/touched
  isAttracting: boolean; // Whether the attraction force is active
}

export const DEFAULT_PARAMETERS: BoidsParameters = {
  alignmentForce: 1.0,
  cohesionForce: 1.0,
  separationForce: 1.5,
  perceptionRadius: 50,
  maxSpeed: 4,
  maxForce: 0.1,
  edgeBehavior: 'wrap',
  edgeMargin: 50,
  trailLength: 10,
  attractionForce: 1.0, // Default attraction force
};

// Create a spatial grid key from position
const getGridCellKey = (x: number, y: number, cellSize: number): string => {
  const gridX = Math.floor(x / cellSize);
  const gridY = Math.floor(y / cellSize);
  return `${gridX},${gridY}`;
};

// Update the spatial grid with boid positions
const updateSpatialGrid = (
  boids: Boid[],
  cellSize: number
): Map<string, number[]> => {
  const grid = new Map<string, number[]>();
  
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    const cellKey = getGridCellKey(boid.position.x, boid.position.y, cellSize);
    
    boid.gridCell = cellKey;
    
    if (!grid.has(cellKey)) {
      grid.set(cellKey, [i]);
    } else {
      grid.get(cellKey)!.push(i);
    }
  }
  
  return grid;
};

// Get neighboring cells for a given position
const getNeighboringCells = (
  x: number,
  y: number,
  cellSize: number,
  radius: number
): string[] => {
  const radiusCells = Math.ceil(radius / cellSize);
  const cellX = Math.floor(x / cellSize);
  const cellY = Math.floor(y / cellSize);
  const cells: string[] = [];
  
  for (let i = -radiusCells; i <= radiusCells; i++) {
    for (let j = -radiusCells; j <= radiusCells; j++) {
      cells.push(`${cellX + i},${cellY + j}`);
    }
  }
  
  return cells;
};

// Get nearby boid indices using spatial grid
const getNearbyBoidIndices = (
  boid: Boid,
  grid: Map<string, number[]>,
  cellSize: number,
  radius: number
): number[] => {
  const neighboringCells = getNeighboringCells(
    boid.position.x,
    boid.position.y,
    cellSize,
    radius
  );
  
  const nearbyIndices: number[] = [];
  
  for (const cell of neighboringCells) {
    const cellBoids = grid.get(cell);
    if (cellBoids) {
      nearbyIndices.push(...cellBoids);
    }
  }
  
  return nearbyIndices;
};

/**
 * Create a new boid with random position and velocity
 */
export const createBoid = (
  id: number,
  canvasWidth: number,
  canvasHeight: number,
  maxHistoryLength = 10
): Boid => {
  return {
    id,
    position: {
      x: Math.random() * canvasWidth,
      y: Math.random() * canvasHeight,
    },
    velocity: {
      x: (Math.random() * 2 - 1) * 2,
      y: (Math.random() * 2 - 1) * 2,
    },
    acceleration: { x: 0, y: 0 },
    history: [],
    maxHistoryLength,
  };
};

/**
 * Create an initial state with a given number of boids
 */
export const createInitialState = (
  numBoids: number,
  canvasWidth: number,
  canvasHeight: number
): BoidsState => {
  const boids: Boid[] = [];
  const cellSize = DEFAULT_PARAMETERS.perceptionRadius; // Use perception radius as cell size for optimal performance

  for (let i = 0; i < numBoids; i++) {
    boids.push(createBoid(i, canvasWidth, canvasHeight, DEFAULT_PARAMETERS.trailLength));
  }

  // Create initial spatial grid
  const spatialGrid = updateSpatialGrid(boids, cellSize);

  return {
    boids,
    parameters: DEFAULT_PARAMETERS,
    canvasWidth,
    canvasHeight,
    particleType: 'disk',
    isRunning: true,
    showPerceptionRadius: false,
    spatialGrid,
    gridCellSize: cellSize,
    cursorPosition: null,
    isAttracting: false,
  };
};

// Vector operations
export const add = (v1: Vector2D, v2: Vector2D): Vector2D => {
  return { x: v1.x + v2.x, y: v1.y + v2.y };
};

export const subtract = (v1: Vector2D, v2: Vector2D): Vector2D => {
  return { x: v1.x - v2.x, y: v1.y - v2.y };
};

export const multiply = (v: Vector2D, scalar: number): Vector2D => {
  return { x: v.x * scalar, y: v.y * scalar };
};

export const divide = (v: Vector2D, scalar: number): Vector2D => {
  if (scalar === 0) return { x: 0, y: 0 };
  return { x: v.x / scalar, y: v.y / scalar };
};

export const magnitude = (v: Vector2D): number => {
  return Math.sqrt(v.x * v.x + v.y * v.y);
};

export const magnitudeSq = (v: Vector2D): number => {
  return v.x * v.x + v.y * v.y;
};

export const distanceSq = (v1: Vector2D, v2: Vector2D): number => {
  const dx = v1.x - v2.x;
  const dy = v1.y - v2.y;
  return dx * dx + dy * dy;
};

export const normalize = (v: Vector2D): Vector2D => {
  const mag = magnitude(v);
  if (mag === 0) return { x: 0, y: 0 };
  return divide(v, mag);
};

export const limit = (v: Vector2D, max: number): Vector2D => {
  const magSq = magnitudeSq(v);
  if (magSq > max * max) {
    const mag = Math.sqrt(magSq);
    return { x: (v.x / mag) * max, y: (v.y / mag) * max };
  }
  return v;
};

export const distance = (v1: Vector2D, v2: Vector2D): number => {
  return Math.sqrt(distanceSq(v1, v2));
};

/**
 * Calculate steering force for alignment behavior with spatial optimization
 */
export const align = (
  boid: Boid,
  boids: Boid[],
  nearbyIndices: number[],
  parameters: BoidsParameters
): Vector2D => {
  const steering = { x: 0, y: 0 };
  let total = 0;
  const perceptionRadiusSq = parameters.perceptionRadius * parameters.perceptionRadius;

  for (const idx of nearbyIndices) {
    const other = boids[idx];
    if (other.id !== boid.id) {
      const d = distanceSq(boid.position, other.position);
      if (d < perceptionRadiusSq) {
        steering.x += other.velocity.x;
        steering.y += other.velocity.y;
        total++;
      }
    }
  }

  if (total > 0) {
    steering.x /= total;
    steering.y /= total;

    const steeringMag = magnitude(steering);
    if (steeringMag > 0) {
      const steeringNorm = { 
        x: steering.x / steeringMag, 
        y: steering.y / steeringMag 
      };
      const steeringScaled = multiply(steeringNorm, parameters.maxSpeed);
      const steeringForce = subtract(steeringScaled, boid.velocity);
      return limit(steeringForce, parameters.maxForce);
    }
  }

  return steering;
};

/**
 * Calculate steering force for cohesion behavior with spatial optimization
 */
export const cohesion = (
  boid: Boid,
  boids: Boid[],
  nearbyIndices: number[],
  parameters: BoidsParameters
): Vector2D => {
  const steering = { x: 0, y: 0 };
  let total = 0;
  const perceptionRadiusSq = parameters.perceptionRadius * parameters.perceptionRadius;

  for (const idx of nearbyIndices) {
    const other = boids[idx];
    if (other.id !== boid.id) {
      const d = distanceSq(boid.position, other.position);
      if (d < perceptionRadiusSq) {
        steering.x += other.position.x;
        steering.y += other.position.y;
        total++;
      }
    }
  }

  if (total > 0) {
    steering.x /= total;
    steering.y /= total;

    const desired = subtract(steering, boid.position);
    const desiredMag = magnitude(desired);
    
    if (desiredMag > 0) {
      const desiredNorm = { 
        x: desired.x / desiredMag, 
        y: desired.y / desiredMag 
      };
      const desiredScaled = multiply(desiredNorm, parameters.maxSpeed);
      const steeringForce = subtract(desiredScaled, boid.velocity);
      return limit(steeringForce, parameters.maxForce);
    }
  }

  return steering;
};

/**
 * Calculate steering force for separation behavior with spatial optimization
 */
export const separation = (
  boid: Boid,
  boids: Boid[],
  nearbyIndices: number[],
  parameters: BoidsParameters
): Vector2D => {
  const steering = { x: 0, y: 0 };
  let total = 0;
  const perceptionRadiusSq = parameters.perceptionRadius * parameters.perceptionRadius;

  for (const idx of nearbyIndices) {
    const other = boids[idx];
    if (other.id !== boid.id) {
      const d = distanceSq(boid.position, other.position);
      if (d < perceptionRadiusSq && d > 0) {
        const diff = subtract(boid.position, other.position);
        const dist = Math.sqrt(d);
        diff.x /= dist;
        diff.y /= dist;
        steering.x += diff.x;
        steering.y += diff.y;
        total++;
      }
    }
  }

  if (total > 0) {
    steering.x /= total;
    steering.y /= total;

    const steeringMag = magnitude(steering);
    if (steeringMag > 0) {
      const steeringNorm = { 
        x: steering.x / steeringMag, 
        y: steering.y / steeringMag 
      };
      const steeringScaled = multiply(steeringNorm, parameters.maxSpeed);
      const steeringForce = subtract(steeringScaled, boid.velocity);
      return limit(steeringForce, parameters.maxForce);
    }
  }

  return steering;
};

/**
 * Calculate steering force towards cursor when clicked/touched
 */
export const attraction = (
  boid: Boid,
  targetPosition: Vector2D,
  parameters: BoidsParameters
): Vector2D => {
  // Debug
  if (boid.id === 0) {
    console.log("Attraction force calculation for boid 0:", { 
      targetPosition, 
      boidPosition: boid.position,
      attractionForce: parameters.attractionForce 
    });
  }

  // Calculate desired velocity (towards target)
  const desired = subtract(targetPosition, boid.position);
  const desiredMag = magnitude(desired);
  
  if (desiredMag > 0) {
    // Scale desired velocity by maximum speed
    const desiredNorm = { 
      x: desired.x / desiredMag, 
      y: desired.y / desiredMag 
    };
    
    // Attraction force is stronger and has longer range
    const strength = Math.min(3.0, 1000 / (desiredMag + 1));
    const desiredScaled = multiply(desiredNorm, parameters.maxSpeed * strength);
    
    // Calculate steering force
    const steeringForce = subtract(desiredScaled, boid.velocity);
    
    // Return limited force scaled by attraction force parameter
    const result = multiply(
      limit(steeringForce, parameters.maxForce * 2),  // Allow stronger forces for attraction
      parameters.attractionForce * 3  // Amplify the attraction force
    );

    // Debug
    if (boid.id === 0) {
      console.log("Resulting attraction force:", result);
    }
    
    return result;
  }
  
  return { x: 0, y: 0 };
};

/**
 * Handle edges based on the configured edge behavior
 * Fixed handling for trail rendering across edges
 */
export const handleEdges = (
  boid: Boid,
  canvasWidth: number,
  canvasHeight: number,
  parameters: BoidsParameters
): void => {
  const { position, velocity, history } = boid;
  const { edgeBehavior, edgeMargin, maxSpeed } = parameters;

  // Save the previous position for fixing trail wrapping
  const prevX = position.x;
  const prevY = position.y;
  
  // Flag to detect if wrapping occurred
  let didWrap = false;

  if (edgeBehavior === 'wrap') {
    // Wrap around the edges
    if (position.x < 0) {
      position.x = canvasWidth;
      didWrap = true;
    }
    if (position.y < 0) {
      position.y = canvasHeight;
      didWrap = true;
    }
    if (position.x > canvasWidth) {
      position.x = 0;
      didWrap = true;
    }
    if (position.y > canvasHeight) {
      position.y = 0;
      didWrap = true;
    }
    
    // Clear history on wrap to prevent trails spanning across the screen
    if (didWrap) {
      boid.history = [];
    }
  } else if (edgeBehavior === 'bounce') {
    // Bounce off the edges
    let bounced = false;
    
    if (position.x < 0 || position.x > canvasWidth) {
      velocity.x *= -1;
      bounced = true;
    }
    if (position.y < 0 || position.y > canvasHeight) {
      velocity.y *= -1;
      bounced = true;
    }
    
    // Ensure we're inside the canvas
    position.x = Math.max(0, Math.min(position.x, canvasWidth));
    position.y = Math.max(0, Math.min(position.y, canvasHeight));
    
    // Clear history on bounce for smoother visual
    if (bounced) {
      boid.history = [];
    }
  } else if (edgeBehavior === 'avoid') {
    // Steer away from edges
    const steer = { x: 0, y: 0 };
    
    if (position.x < edgeMargin) {
      steer.x = maxSpeed;
    } else if (position.x > canvasWidth - edgeMargin) {
      steer.x = -maxSpeed;
    }
    
    if (position.y < edgeMargin) {
      steer.y = maxSpeed;
    } else if (position.y > canvasHeight - edgeMargin) {
      steer.y = -maxSpeed;
    }
    
    if (steer.x !== 0 || steer.y !== 0) {
      const steerNorm = normalize(steer);
      const steerForce = multiply(steerNorm, parameters.maxForce * 2);
      boid.acceleration = add(boid.acceleration, steerForce);
    }
  }
};

/**
 * Update a single boid's position based on the flocking algorithm
 * Using spatial optimization for significant performance improvement
 */
export const updateBoid = (
  boid: Boid,
  boids: Boid[],
  nearbyIndices: number[],
  parameters: BoidsParameters,
  canvasWidth: number,
  canvasHeight: number,
  cursorPosition: Vector2D | null,
  isAttracting: boolean
): void => {
  // DIRECT FIX FOR ATTRACTION: If attracting, move directly toward cursor
  if (isAttracting && cursorPosition) {
    // Calculate direction to cursor
    const directionToCursor = subtract(cursorPosition, boid.position);
    const distanceToCursor = magnitude(directionToCursor);
    
    if (distanceToCursor > 5) { // Only attract if not too close
      // Normalize and scale by attraction force * max speed
      const normalizedDirection = {
        x: directionToCursor.x / distanceToCursor,
        y: directionToCursor.y / distanceToCursor
      };
      
      // Strong direct attraction that overrides other behaviors
      const attractionStrength = Math.min(1.0, 100 / distanceToCursor) * parameters.attractionForce;
      
      // Mix current velocity with attraction direction
      boid.velocity = {
        x: boid.velocity.x * 0.8 + normalizedDirection.x * parameters.maxSpeed * attractionStrength * 0.2,
        y: boid.velocity.y * 0.8 + normalizedDirection.y * parameters.maxSpeed * attractionStrength * 0.2
      };
      
      if (boid.id === 0) {
        console.log("DIRECT ATTRACTION:", { 
          attractionStrength, 
          distanceToCursor,
          velocity: { ...boid.velocity }
        });
      }
    }
  }

  // Calculate flocking forces - normal behavior
  const alignForce = multiply(
    align(boid, boids, nearbyIndices, parameters),
    parameters.alignmentForce
  );
  const cohesionForce = multiply(
    cohesion(boid, boids, nearbyIndices, parameters),
    parameters.cohesionForce
  );
  const separationForce = multiply(
    separation(boid, boids, nearbyIndices, parameters),
    parameters.separationForce
  );

  // Apply flocking forces
  boid.acceleration = add(boid.acceleration, alignForce);
  boid.acceleration = add(boid.acceleration, cohesionForce);
  boid.acceleration = add(boid.acceleration, separationForce);
  
  // Update velocity and position (only if we're not directly controlling velocity via attraction)
  if (!(isAttracting && cursorPosition)) {
    boid.velocity = add(boid.velocity, boid.acceleration);
  }
  
  // Always limit velocity to max speed
  boid.velocity = limit(boid.velocity, parameters.maxSpeed);
  
  // Save position history for trails
  if (boid.history.length >= parameters.trailLength) {
    boid.history.shift();
  }
  boid.history.push({ ...boid.position });
  
  boid.position = add(boid.position, boid.velocity);
  
  // Handle edges
  handleEdges(boid, canvasWidth, canvasHeight, parameters);
  
  // Reset acceleration
  boid.acceleration = { x: 0, y: 0 };
};

/**
 * Update all boids in the simulation
 * With spatial partitioning for O(n) performance instead of O(n²)
 */
export const updateBoids = (state: BoidsState): BoidsState => {
  if (!state.isRunning) return state;
  
  const { boids, canvasWidth, canvasHeight, parameters, gridCellSize, cursorPosition, isAttracting } = state;
  
  // Debug attraction state
  if (isAttracting && cursorPosition) {
    console.log("Attraction active:", { isAttracting, cursorPosition });
  }
  
  // Update spatial grid for this frame
  const spatialGrid = updateSpatialGrid(boids, gridCellSize);
  
  // Update each boid using spatial optimization
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    const nearbyIndices = getNearbyBoidIndices(
      boid,
      spatialGrid,
      gridCellSize,
      parameters.perceptionRadius
    );
    
    updateBoid(
      boid,
      boids,
      nearbyIndices,
      parameters,
      canvasWidth,
      canvasHeight,
      cursorPosition,
      isAttracting
    );
  }
  
  return {
    ...state,
    boids: [...boids], // Create new array reference to ensure proper updates
    spatialGrid,
  };
}; 