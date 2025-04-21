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
  trailLength: number;
  attractionForce: number;
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
  cursorPosition: Vector2D | null;
  isAttracting: boolean;
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
  attractionForce: 1.0,
};

// Performance optimization - reuse vectors
const tmpVec1 = { x: 0, y: 0 };

// Create a spatial grid key from position

// Update the spatial grid with boid positions - optimized to reduce memory allocation
const updateSpatialGrid = (
  boids: Boid[],
  cellSize: number,
  existingGrid?: Map<string, number[]>
): Map<string, number[]> => {
  // Reuse existing grid if provided
  const grid = existingGrid || new Map<string, number[]>();
  
  // Clear existing grid entries instead of creating a new map
  if (existingGrid) {
    grid.forEach((arr) => {
      arr.length = 0; // Clear array without allocating new one
    });
  }
  
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    const gridX = Math.floor(boid.position.x / cellSize);
    const gridY = Math.floor(boid.position.y / cellSize);
    const cellKey = `${gridX},${gridY}`;
    
    boid.gridCell = cellKey;
    
    let cell = grid.get(cellKey);
    if (!cell) {
      cell = [];
      grid.set(cellKey, cell);
    }
    cell.push(i);
  }
  
  return grid;
};

// Cache neighboring cell calculations
const cellCache = new Map<string, string[]>();

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
  
  // Create cache key
  const cacheKey = `${cellX},${cellY},${radiusCells}`;
  
  // Check cache
  const cached = cellCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Create new array only if not in cache
  const cells: string[] = [];
  
  for (let i = -radiusCells; i <= radiusCells; i++) {
    for (let j = -radiusCells; j <= radiusCells; j++) {
      cells.push(`${cellX + i},${cellY + j}`);
    }
  }
  
  // Store in cache for future use
  if (cellCache.size > 1000) {
    // Prevent unbounded growth
    const firstKey = cellCache.keys().next().value;
    if (firstKey !== undefined) {
      cellCache.delete(firstKey);
    }
  }
  cellCache.set(cacheKey, cells);
  
  return cells;
};

// Get nearby boid indices using spatial grid - optimized to reuse arrays
const getNearbyBoidIndices = (
  boid: Boid,
  grid: Map<string, number[]>,
  cellSize: number,
  radius: number,
  resultArray: number[] = []
): number[] => {
  // Clear the result array instead of creating a new one
  resultArray.length = 0;
  
  const neighboringCells = getNeighboringCells(
    boid.position.x,
    boid.position.y,
    cellSize,
    radius
  );
  
  for (const cell of neighboringCells) {
    const cellBoids = grid.get(cell);
    if (cellBoids) {
      for (let i = 0; i < cellBoids.length; i++) {
        resultArray.push(cellBoids[i]);
      }
    }
  }
  
  return resultArray;
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

// Cached arrays for neighboring boids
const nearbyIndicesCache: number[] = [];

/**
 * Create an initial state with a given number of boids
 */
export const createInitialState = (
  numBoids: number,
  canvasWidth: number,
  canvasHeight: number
): BoidsState => {
  const boids: Boid[] = [];
  const cellSize = DEFAULT_PARAMETERS.perceptionRadius;

  for (let i = 0; i < numBoids; i++) {
    boids.push(createBoid(i, canvasWidth, canvasHeight, DEFAULT_PARAMETERS.trailLength));
  }

  // Create initial spatial grid
  const spatialGrid = updateSpatialGrid(boids, cellSize);

  return {
    boids,
    parameters: { ...DEFAULT_PARAMETERS }, // Clone to avoid reference issues
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

// Optimized vector operations that modify inputs rather than creating new objects
// This significantly reduces garbage collection pressure

// Add v2 to v1 in-place
export const addInPlace = (v1: Vector2D, v2: Vector2D): Vector2D => {
  v1.x += v2.x;
  v1.y += v2.y;
  return v1;
};

// Subtract v2 from v1 in-place
export const subtractInPlace = (v1: Vector2D, v2: Vector2D, result: Vector2D): Vector2D => {
  result.x = v1.x - v2.x;
  result.y = v1.y - v2.y;
  return result;
};

// Multiply v by scalar in-place
export const multiplyInPlace = (v: Vector2D, scalar: number): Vector2D => {
  v.x *= scalar;
  v.y *= scalar;
  return v;
};

// Set vector values
export const setVector = (v: Vector2D, x: number, y: number): Vector2D => {
  v.x = x;
  v.y = y;
  return v;
};

// Square of magnitude (avoids sqrt for performance)
export const magnitudeSq = (v: Vector2D): number => {
  return v.x * v.x + v.y * v.y;
};

// Square of distance (avoids sqrt for performance)
export const distanceSq = (v1: Vector2D, v2: Vector2D): number => {
  const dx = v1.x - v2.x;
  const dy = v1.y - v2.y;
  return dx * dx + dy * dy;
};

// Normalize a vector in-place
export const normalizeInPlace = (v: Vector2D): Vector2D => {
  const mag = Math.sqrt(v.x * v.x + v.y * v.y);
  if (mag > 0.0001) {
    v.x /= mag;
    v.y /= mag;
  } else {
    v.x = 0;
    v.y = 0;
  }
  return v;
};

// Limit magnitude of a vector in-place
export const limitInPlace = (v: Vector2D, max: number): Vector2D => {
  const magSq = v.x * v.x + v.y * v.y;
  if (magSq > max * max) {
    const mag = Math.sqrt(magSq);
    v.x = (v.x / mag) * max;
    v.y = (v.y / mag) * max;
  }
  return v;
};

/**
 * Calculate steering force for alignment behavior with spatial optimization
 */
export const align = (
  boid: Boid,
  boids: Boid[],
  nearbyIndices: number[],
  parameters: BoidsParameters,
  result: Vector2D
): Vector2D => {
  // Initialize result vector
  result.x = 0;
  result.y = 0;
  
  let total = 0;
  const perceptionRadiusSq = parameters.perceptionRadius * parameters.perceptionRadius;

  for (const idx of nearbyIndices) {
    const other = boids[idx];
    if (other.id !== boid.id) {
      const d = distanceSq(boid.position, other.position);
      if (d < perceptionRadiusSq) {
        result.x += other.velocity.x;
        result.y += other.velocity.y;
        total++;
      }
    }
  }

  if (total > 0) {
    result.x /= total;
    result.y /= total;

    // Normalize to get direction
    normalizeInPlace(result);
    
    // Scale to max speed
    multiplyInPlace(result, parameters.maxSpeed);
    
    // Calculate steering force: desired - current
    subtractInPlace(result, boid.velocity, result);
    
    // Limit the force
    limitInPlace(result, parameters.maxForce);
  }

  return result;
};

/**
 * Calculate steering force for cohesion behavior with spatial optimization
 */
export const cohesion = (
  boid: Boid,
  boids: Boid[],
  nearbyIndices: number[],
  parameters: BoidsParameters,
  result: Vector2D
): Vector2D => {
  // Initialize result vector
  result.x = 0;
  result.y = 0;
  
  let total = 0;
  const perceptionRadiusSq = parameters.perceptionRadius * parameters.perceptionRadius;

  for (const idx of nearbyIndices) {
    const other = boids[idx];
    if (other.id !== boid.id) {
      const d = distanceSq(boid.position, other.position);
      if (d < perceptionRadiusSq) {
        result.x += other.position.x;
        result.y += other.position.y;
        total++;
      }
    }
  }

  if (total > 0) {
    result.x /= total;
    result.y /= total;

    // Get desired direction - difference between center and current position
    subtractInPlace(result, boid.position, result);
    
    // Normalize and scale
    const mag = Math.sqrt(result.x * result.x + result.y * result.y);
    if (mag > 0.0001) {
      result.x = (result.x / mag) * parameters.maxSpeed;
      result.y = (result.y / mag) * parameters.maxSpeed;
      
      // Subtract current velocity to get steering force
      result.x -= boid.velocity.x;
      result.y -= boid.velocity.y;
      
      // Limit force
      limitInPlace(result, parameters.maxForce);
    }
  }

  return result;
};

/**
 * Calculate steering force for separation behavior with spatial optimization
 */
export const separation = (
  boid: Boid,
  boids: Boid[],
  nearbyIndices: number[],
  parameters: BoidsParameters,
  result: Vector2D
): Vector2D => {
  // Initialize result vector
  result.x = 0;
  result.y = 0;
  
  let total = 0;
  const perceptionRadiusSq = parameters.perceptionRadius * parameters.perceptionRadius;

  for (const idx of nearbyIndices) {
    const other = boids[idx];
    if (other.id !== boid.id) {
      const d = distanceSq(boid.position, other.position);
      if (d < perceptionRadiusSq && d > 0) {
        // Calculate difference vector
        tmpVec1.x = boid.position.x - other.position.x;
        tmpVec1.y = boid.position.y - other.position.y;
        
        // Weight by distance (closer boids are more important)
        const dist = Math.sqrt(d);
        tmpVec1.x /= dist;
        tmpVec1.y /= dist;
        
        result.x += tmpVec1.x;
        result.y += tmpVec1.y;
        total++;
      }
    }
  }

  if (total > 0) {
    result.x /= total;
    result.y /= total;
    
    // Normalize to get direction
    normalizeInPlace(result);
    
    // Scale to max speed
    multiplyInPlace(result, parameters.maxSpeed);
    
    // Calculate steering force
    result.x -= boid.velocity.x;
    result.y -= boid.velocity.y;
    
    // Limit force
    limitInPlace(result, parameters.maxForce);
  }

  return result;
};

/**
 * Calculate steering force towards cursor when clicked/touched
 */
export const attraction = (
  boid: Boid,
  targetPosition: Vector2D,
  parameters: BoidsParameters,
  result: Vector2D
): Vector2D => {
  // Calculate direction towards target
  subtractInPlace(targetPosition, boid.position, result);
  
  const distanceSq = result.x * result.x + result.y * result.y;
  
  if (distanceSq > 0) {
    const distance = Math.sqrt(distanceSq);
    
    // Normalize direction
    result.x /= distance;
    result.y /= distance;
    
    // Stronger attraction for distant boids
    const strength = Math.min(3.0, 1000 / (distance + 1));
    
    // Scale by max speed and strength
    result.x *= parameters.maxSpeed * strength;
    result.y *= parameters.maxSpeed * strength;
    
    // Calculate steering force
    result.x -= boid.velocity.x;
    result.y -= boid.velocity.y;
    
    // Limit force and apply attraction multiplier
    limitInPlace(result, parameters.maxForce * 2);
    multiplyInPlace(result, parameters.attractionForce * 2);
  } else {
    result.x = 0;
    result.y = 0;
  }
  
  return result;
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
  const { position, velocity } = boid;
  const { edgeBehavior, edgeMargin, maxSpeed } = parameters;
  
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
      boid.history.length = 0;
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
      boid.history.length = 0;
    }
  } else if (edgeBehavior === 'avoid') {
    // Steer away from edges
    if (position.x < edgeMargin) {
      boid.acceleration.x += maxSpeed * (1 - position.x / edgeMargin);
    } else if (position.x > canvasWidth - edgeMargin) {
      boid.acceleration.x -= maxSpeed * (1 - (canvasWidth - position.x) / edgeMargin);
    }
    
    if (position.y < edgeMargin) {
      boid.acceleration.y += maxSpeed * (1 - position.y / edgeMargin);
    } else if (position.y > canvasHeight - edgeMargin) {
      boid.acceleration.y -= maxSpeed * (1 - (canvasHeight - position.y) / edgeMargin);
    }
  }
};

// Reusable vectors for force calculations
const alignForceVec = { x: 0, y: 0 };
const cohesionForceVec = { x: 0, y: 0 };
const separationForceVec = { x: 0, y: 0 };
const attractionForceVec = { x: 0, y: 0 };
const directionVec = { x: 0, y: 0 };

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
  // Reset acceleration
  boid.acceleration.x = 0;
  boid.acceleration.y = 0;
  
  // Direct attraction to cursor if enabled
  if (isAttracting && cursorPosition) {
    // Calculate direction to cursor
    subtractInPlace(cursorPosition, boid.position, directionVec);
    const distanceToCursor = Math.sqrt(directionVec.x * directionVec.x + directionVec.y * directionVec.y);
    
    if (distanceToCursor > 5) { // Only attract if not too close
      // Normalize and apply attraction
      directionVec.x /= distanceToCursor;
      directionVec.y /= distanceToCursor;
      
      // Attraction factor decreases with distance
      const attractionStrength = Math.min(1.0, 100 / distanceToCursor) * parameters.attractionForce;
      
      // Apply weighted attraction to velocity
      boid.velocity.x = boid.velocity.x * 0.8 + directionVec.x * parameters.maxSpeed * attractionStrength * 0.2;
      boid.velocity.y = boid.velocity.y * 0.8 + directionVec.y * parameters.maxSpeed * attractionStrength * 0.2;
    }
  } else {
    // Normal flocking behavior
    
    // Calculate alignment force
    align(boid, boids, nearbyIndices, parameters, alignForceVec);
    multiplyInPlace(alignForceVec, parameters.alignmentForce);
    
    // Calculate cohesion force
    cohesion(boid, boids, nearbyIndices, parameters, cohesionForceVec);
    multiplyInPlace(cohesionForceVec, parameters.cohesionForce);
    
    // Calculate separation force
    separation(boid, boids, nearbyIndices, parameters, separationForceVec);
    multiplyInPlace(separationForceVec, parameters.separationForce);
    
    // Add all forces to acceleration
    boid.acceleration.x += alignForceVec.x + cohesionForceVec.x + separationForceVec.x;
    boid.acceleration.y += alignForceVec.y + cohesionForceVec.y + separationForceVec.y;
    
    // Apply cursor attraction as a separate force if active
    if (isAttracting && cursorPosition) {
      attraction(boid, cursorPosition, parameters, attractionForceVec);
      boid.acceleration.x += attractionForceVec.x;
      boid.acceleration.y += attractionForceVec.y;
    }
    
    // Update velocity with acceleration
    boid.velocity.x += boid.acceleration.x;
    boid.velocity.y += boid.acceleration.y;
  }
  
  // Always limit velocity to max speed
  limitInPlace(boid.velocity, parameters.maxSpeed);
  
  // Save position history for trails (limit to parameter length)
  if (boid.history.length >= parameters.trailLength) {
    if (boid.history.length > 0) {
      // Reuse first history point instead of shifting
      const firstPoint = boid.history.shift()!;
      firstPoint.x = boid.position.x;
      firstPoint.y = boid.position.y;
      boid.history.push(firstPoint);
    }
  } else {
    boid.history.push({ x: boid.position.x, y: boid.position.y });
  }
  
  // Update position
  boid.position.x += boid.velocity.x;
  boid.position.y += boid.velocity.y;
  
  // Handle edges
  handleEdges(boid, canvasWidth, canvasHeight, parameters);
};

/**
 * Update all boids in the simulation
 * With spatial partitioning for O(n) performance instead of O(n²)
 */
export const updateBoids = (state: BoidsState): BoidsState => {
  if (!state.isRunning) return state;
  
  const { boids, canvasWidth, canvasHeight, parameters, gridCellSize, cursorPosition, isAttracting } = state;
  
  // Update spatial grid for this frame - reuse existing grid
  const spatialGrid = updateSpatialGrid(boids, gridCellSize, state.spatialGrid);
  
  // Update each boid using spatial optimization
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    
    // Get nearby boids using cached array
    const nearbyIndices = getNearbyBoidIndices(
      boid,
      spatialGrid,
      gridCellSize,
      parameters.perceptionRadius,
      nearbyIndicesCache
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
  
  // Return updated state with minimal cloning
  return {
    ...state,
    spatialGrid,
  };
}; 