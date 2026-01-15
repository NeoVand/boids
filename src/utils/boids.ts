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
  /**
   * Tail ring buffer storing previous positions.
   * Efficient: no per-frame object allocations.
   */
  tailX: Float32Array;
  tailY: Float32Array;
  tailCapacity: number;
  tailHead: number; // next write index
  tailCount: number; // valid points [0..tailCapacity]
  /**
   * Cached neighbor count from the most recent simulation step.
   * Used by render/colorization to avoid doing expensive neighbor scans on the render thread.
   */
  neighborCount?: number;
}

export interface BoidsParameters {
  alignmentForce: number;
  cohesionForce: number;
  separationForce: number;
  perceptionRadius: number;
  maxSpeed: number;
  maxForce: number;
  noiseStrength: number;
  edgeBehavior: 'wrap' | 'bounce';
  edgeMargin: number;
  boundaryMode: BoundaryMode;
  trailLength: number;
  attractionForce: number;
  attractionMode: 'off' | 'attract' | 'repel';
  colorSpectrum: 'chrome' | 'cool' | 'warm' | 'rainbow' | 'mono';
  colorSensitivity: number;
  /**
   * Visual size multiplier for boids (render-only).
   * 1 = default size.
   */
  boidSize: number;
}

export type ParticleType = 'disk' | 'trail' | 'arrow' | 'dot';
export type BoundaryMode =
  | 'plane'
  | 'cylinderX'
  | 'cylinderY'
  | 'torus'
  | 'mobiusX'
  | 'mobiusY'
  | 'kleinX'
  | 'kleinY'
  | 'projectivePlane';

export interface BoidsState {
  boids: Boid[];
  parameters: BoidsParameters;
  canvasWidth: number;
  canvasHeight: number;
  particleType: ParticleType;
  isRunning: boolean;
  showPerceptionRadius: boolean;
  /**
   * Spatial partitioning grid:
   * numeric cellKey -> array of boid indices in that cell
   */
  spatialGrid: Map<number, number[]>;
  gridCellSize: number;
  cursorPosition: Vector2D | null;
  isAttracting: boolean;
  colorizationMode: string;
}

export const DEFAULT_PARAMETERS: BoidsParameters = {
  alignmentForce: 1.0,
  cohesionForce: 1.0,
  separationForce: 1.0,
  perceptionRadius: 50,
  maxSpeed: 3.0,
  maxForce: 0.1,
  noiseStrength: 0.35,
  edgeBehavior: 'bounce',
  edgeMargin: 50,
  boundaryMode: 'plane',
  trailLength: 30,
  attractionForce: 0.5,
  attractionMode: 'attract',
  colorSpectrum: 'chrome',
  colorSensitivity: 1.0,
  boidSize: 0.5,
};

// Performance optimization - reuse vectors
const tmpVec1 = { x: 0, y: 0 };

// Frame-stamping for spatial grid cells:
// Instead of clearing the whole grid map each frame, we stamp each cell key with the current frame id.
// Neighbor lookups ignore any cell whose stamp is not the current frame.
let spatialGridFrameId = 0;
const spatialGridCellStamp = new Map<number, number>();

const getCellKey = (cellX: number, cellY: number, gridWidth: number): number => {
  return cellY * gridWidth + cellX;
};

// Update the spatial grid with boid positions - optimized to reduce memory allocation
const updateSpatialGrid = (
  boids: Boid[],
  cellSize: number,
  canvasWidth: number,
  canvasHeight: number,
  existingGrid?: Map<number, number[]>
): Map<number, number[]> => {
  const grid = existingGrid || new Map<number, number[]>();
  spatialGridFrameId++;

  const safeCellSize = Math.max(1, cellSize);
  const gridWidth = Math.max(1, Math.ceil(canvasWidth / safeCellSize) + 1);
  const gridHeight = Math.max(1, Math.ceil(canvasHeight / safeCellSize) + 1);
  
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    // Clamp cell coordinates to stay inside the grid (prevents negative / OOB keys on edge cases)
    const gridX = Math.max(0, Math.min(gridWidth - 1, Math.floor(boid.position.x / safeCellSize)));
    const gridY = Math.max(0, Math.min(gridHeight - 1, Math.floor(boid.position.y / safeCellSize)));
    const cellKey = getCellKey(gridX, gridY, gridWidth);

    let cell = grid.get(cellKey);
    if (!cell) {
      cell = [];
      grid.set(cellKey, cell);
    }
    // Clear-on-first-use for this frame (prevents stale indices ever being read)
    if (spatialGridCellStamp.get(cellKey) !== spatialGridFrameId) {
      cell.length = 0;
      spatialGridCellStamp.set(cellKey, spatialGridFrameId);
    }
    cell.push(i);
  }
  
  return grid;
};

// Cache neighbor offsets per radiusCells (dx/dy pairs).
const neighborOffsetCache = new Map<number, Int16Array>();

const getNeighborOffsets = (radiusCells: number): Int16Array => {
  const cached = neighborOffsetCache.get(radiusCells);
  if (cached) return cached;

  const side = radiusCells * 2 + 1;
  const offsets = new Int16Array(side * side * 2);
  let k = 0;
  for (let dy = -radiusCells; dy <= radiusCells; dy++) {
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      offsets[k++] = dx;
      offsets[k++] = dy;
    }
  }
  neighborOffsetCache.set(radiusCells, offsets);
  return offsets;
};

// Get nearby boid indices using spatial grid - optimized to reuse arrays
const getNearbyBoidIndices = (
  boid: Boid,
  grid: Map<number, number[]>,
  cellSize: number,
  radius: number,
  canvasWidth: number,
  canvasHeight: number,
  resultArray: number[] = []
): number[] => {
  // Clear the result array instead of creating a new one
  resultArray.length = 0;

  const safeCellSize = Math.max(1, cellSize);
  const gridWidth = Math.max(1, Math.ceil(canvasWidth / safeCellSize) + 1);
  const gridHeight = Math.max(1, Math.ceil(canvasHeight / safeCellSize) + 1);

  const cellX = Math.max(0, Math.min(gridWidth - 1, Math.floor(boid.position.x / safeCellSize)));
  const cellY = Math.max(0, Math.min(gridHeight - 1, Math.floor(boid.position.y / safeCellSize)));

  const radiusCells = Math.max(0, Math.ceil(radius / safeCellSize));
  const offsets = getNeighborOffsets(radiusCells);

  for (let i = 0; i < offsets.length; i += 2) {
    const nx = cellX + offsets[i];
    const ny = cellY + offsets[i + 1];
    if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;

    const key = getCellKey(nx, ny, gridWidth);
    const cellBoids = grid.get(key);
    if (!cellBoids) continue;
    // Ignore any cell that wasn't written this frame (may contain stale indices).
    if (spatialGridCellStamp.get(key) !== spatialGridFrameId) continue;

    for (let j = 0; j < cellBoids.length; j++) {
      resultArray.push(cellBoids[j]);
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
  trailLength = 10
): Boid => {
  const capacity = Math.max(0, Math.floor(trailLength));
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
    tailX: new Float32Array(capacity),
    tailY: new Float32Array(capacity),
    tailCapacity: capacity,
    tailHead: 0,
    tailCount: 0,
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
  const spatialGrid = updateSpatialGrid(boids, cellSize, canvasWidth, canvasHeight);

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
    colorizationMode: 'orientation'
  };
};

const ensureTailCapacity = (boid: Boid, desiredLength: number): void => {
  // Tails are always on; never allow 0. Keep at least 2 points so segments exist.
  const desired = Math.max(2, Math.floor(desiredLength));
  if (desired === boid.tailCapacity) return;

  const newX = new Float32Array(desired);
  const newY = new Float32Array(desired);

  const toCopy = Math.min(boid.tailCount, desired);
  if (toCopy > 0 && boid.tailCapacity > 0) {
    // Copy newest `toCopy` points in chronological order (oldest -> newest).
    const oldestIdx = (boid.tailHead - boid.tailCount + boid.tailCapacity) % boid.tailCapacity;
    const start = (oldestIdx + (boid.tailCount - toCopy)) % boid.tailCapacity;
    for (let i = 0; i < toCopy; i++) {
      const srcIdx = (start + i) % boid.tailCapacity;
      newX[i] = boid.tailX[srcIdx];
      newY[i] = boid.tailY[srcIdx];
    }
  }

  boid.tailX = newX;
  boid.tailY = newY;
  boid.tailCapacity = desired;
  boid.tailHead = toCopy % desired;
  boid.tailCount = toCopy;
};

const appendTailPoint = (boid: Boid, x: number, y: number): void => {
  if (boid.tailCapacity <= 0) return;
  boid.tailX[boid.tailHead] = x;
  boid.tailY[boid.tailHead] = y;
  boid.tailHead = (boid.tailHead + 1) % boid.tailCapacity;
  boid.tailCount = Math.min(boid.tailCount + 1, boid.tailCapacity);
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
  boostMultiplier: number,
  result: Vector2D
): Vector2D => {
  if (parameters.attractionMode === 'off') {
    result.x = 0;
    result.y = 0;
    return result;
  }
  // Calculate direction towards target
  subtractInPlace(targetPosition, boid.position, result);

  const distanceSq = result.x * result.x + result.y * result.y;
  if (distanceSq > 0) {
    const distance = Math.sqrt(distanceSq);

    // Normalize direction
    result.x /= distance;
    result.y /= distance;

    // Mild falloff with distance to keep the effect subtle by default
    const falloff = 1 / (1 + distance / 250);
    // Damp attraction in dense areas so separation keeps its authority
    const neighborCount = boid.neighborCount ?? 0;
    const crowdDamp = 1 / (1 + neighborCount / 6);
    const sign = parameters.attractionMode === 'repel' ? -1 : 1;

    // Desired velocity in the attraction direction
    result.x *= parameters.maxSpeed;
    result.y *= parameters.maxSpeed;

    // Steering force
    result.x -= boid.velocity.x;
    result.y -= boid.velocity.y;
    // Attraction should never dominate separation; cap it to a fraction of maxForce
    const maxAttractionForce = parameters.maxForce * 0.6;
    limitInPlace(result, maxAttractionForce);
    multiplyInPlace(result, parameters.attractionForce * falloff * crowdDamp * sign * boostMultiplier);
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
  const mode = parameters.boundaryMode || (parameters.edgeBehavior === 'wrap' ? 'torus' : 'plane');

  const glueX =
    mode === 'cylinderX' ||
    mode === 'torus' ||
    mode === 'mobiusX' ||
    mode === 'kleinX' ||
    mode === 'kleinY' ||
    mode === 'projectivePlane';
  const glueY =
    mode === 'cylinderY' ||
    mode === 'torus' ||
    mode === 'mobiusY' ||
    mode === 'kleinX' ||
    mode === 'kleinY' ||
    mode === 'projectivePlane';
  const flipX = mode === 'mobiusY' || mode === 'kleinY' || mode === 'projectivePlane';
  const flipY = mode === 'mobiusX' || mode === 'kleinX' || mode === 'projectivePlane';

  let wrapped = false;
  let bounced = false;

  const wrapX = (flip: boolean) => {
    if (position.x < 0) {
      position.x = canvasWidth;
      if (flip) {
        position.y = canvasHeight - position.y;
        velocity.y *= -1;
      }
      wrapped = true;
    } else if (position.x > canvasWidth) {
      position.x = 0;
      if (flip) {
        position.y = canvasHeight - position.y;
        velocity.y *= -1;
      }
      wrapped = true;
    }
  };

  const wrapY = (flip: boolean) => {
    if (position.y < 0) {
      position.y = canvasHeight;
      if (flip) {
        position.x = canvasWidth - position.x;
        velocity.x *= -1;
      }
      wrapped = true;
    } else if (position.y > canvasHeight) {
      position.y = 0;
      if (flip) {
        position.x = canvasWidth - position.x;
        velocity.x *= -1;
      }
      wrapped = true;
    }
  };

  if (glueX) {
    wrapX(flipY);
  } else if (position.x < 0 || position.x > canvasWidth) {
    velocity.x *= -1;
    bounced = true;
    position.x = Math.max(0, Math.min(position.x, canvasWidth));
  }

  if (glueY) {
    wrapY(flipX);
  } else if (position.y < 0 || position.y > canvasHeight) {
    velocity.y *= -1;
    bounced = true;
    position.y = Math.max(0, Math.min(position.y, canvasHeight));
  }

  // Break tail at seam
  if ((wrapped || bounced) && boid.tailCapacity > 0) {
    boid.tailX[boid.tailHead] = Number.NaN;
    boid.tailY[boid.tailHead] = Number.NaN;
    boid.tailHead = (boid.tailHead + 1) % boid.tailCapacity;
    boid.tailCount = Math.min(boid.tailCount + 1, boid.tailCapacity);
  }
};

// Reusable vectors for force calculations
const alignForceVec = { x: 0, y: 0 };
const cohesionForceVec = { x: 0, y: 0 };
const separationForceVec = { x: 0, y: 0 };
const attractionForceVec = { x: 0, y: 0 };

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
  cursorBoostMultiplier: number
): void => {
  ensureTailCapacity(boid, parameters.trailLength);

  // Reset acceleration
  boid.acceleration.x = 0;
  boid.acceleration.y = 0;

  // Normal flocking behavior
  // Single-pass neighbor loop:
  // computes alignment/cohesion/separation with one distance check per candidate
  const perceptionRadiusSq = parameters.perceptionRadius * parameters.perceptionRadius;
  let total = 0;

  let sumVelX = 0;
  let sumVelY = 0;
  let sumPosX = 0;
  let sumPosY = 0;
  let sumSepX = 0;
  let sumSepY = 0;

  for (let i = 0; i < nearbyIndices.length; i++) {
    const other = boids[nearbyIndices[i]];
    if (!other) continue;
    if (other.id === boid.id) continue;

    const dx = other.position.x - boid.position.x;
    const dy = other.position.y - boid.position.y;
    const dSq = dx * dx + dy * dy;

    if (dSq >= perceptionRadiusSq || dSq <= 0) continue;

    total++;
    sumVelX += other.velocity.x;
    sumVelY += other.velocity.y;
    sumPosX += other.position.x;
    sumPosY += other.position.y;

    const invDist = 1 / Math.sqrt(dSq);
    // separation points away from neighbor; weight by inverse distance
    sumSepX -= dx * invDist;
    sumSepY -= dy * invDist;
  }

  // Cache neighbor count for render/colorization
  boid.neighborCount = total;

  if (total > 0) {
    const currentSpeed = Math.sqrt(boid.velocity.x * boid.velocity.x + boid.velocity.y * boid.velocity.y);
    // Prevent “stalling” by keeping a small speed floor, while still allowing variation.
    const targetSpeed = Math.min(parameters.maxSpeed, Math.max(0.25 * parameters.maxSpeed, currentSpeed));

    // Alignment
    alignForceVec.x = sumVelX / total;
    alignForceVec.y = sumVelY / total;
    // Normalize direction but keep per-boid speed variation via targetSpeed (not always maxSpeed).
    normalizeInPlace(alignForceVec);
    multiplyInPlace(alignForceVec, targetSpeed);
    subtractInPlace(alignForceVec, boid.velocity, alignForceVec);
    limitInPlace(alignForceVec, parameters.maxForce);
    multiplyInPlace(alignForceVec, parameters.alignmentForce);

    // Cohesion
    cohesionForceVec.x = sumPosX / total;
    cohesionForceVec.y = sumPosY / total;
    cohesionForceVec.x -= boid.position.x;
    cohesionForceVec.y -= boid.position.y;
    normalizeInPlace(cohesionForceVec);
    multiplyInPlace(cohesionForceVec, targetSpeed);
    subtractInPlace(cohesionForceVec, boid.velocity, cohesionForceVec);
    limitInPlace(cohesionForceVec, parameters.maxForce);
    multiplyInPlace(cohesionForceVec, parameters.cohesionForce);

    // Separation
    separationForceVec.x = sumSepX / total;
    separationForceVec.y = sumSepY / total;
    normalizeInPlace(separationForceVec);
    multiplyInPlace(separationForceVec, targetSpeed);
    subtractInPlace(separationForceVec, boid.velocity, separationForceVec);
    limitInPlace(separationForceVec, parameters.maxForce);
    multiplyInPlace(separationForceVec, parameters.separationForce);

    boid.acceleration.x += alignForceVec.x + cohesionForceVec.x + separationForceVec.x;
    boid.acceleration.y += alignForceVec.y + cohesionForceVec.y + separationForceVec.y;
  } else {
    boid.neighborCount = 0;
  }

  // Cursor attraction/repulsion is always a component if cursor exists
  if (cursorPosition) {
    attraction(boid, cursorPosition, parameters, cursorBoostMultiplier, attractionForceVec);
    boid.acceleration.x += attractionForceVec.x;
    boid.acceleration.y += attractionForceVec.y;
  }

  // Add controlled noise to avoid overly rigid alignment
  if (parameters.noiseStrength > 0) {
    const angle = Math.random() * Math.PI * 2;
    const noiseMagnitude = parameters.maxForce * parameters.noiseStrength;
    boid.acceleration.x += Math.cos(angle) * noiseMagnitude;
    boid.acceleration.y += Math.sin(angle) * noiseMagnitude;
  }

  // Update velocity with acceleration
  boid.velocity.x += boid.acceleration.x;
  boid.velocity.y += boid.acceleration.y;
  
  // Always limit velocity to max speed
  limitInPlace(boid.velocity, parameters.maxSpeed);
  
  // Tail should trace previous locations: record current position before moving.
  appendTailPoint(boid, boid.position.x, boid.position.y);
  
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
  
  const { boids, canvasWidth, canvasHeight, parameters, gridCellSize, cursorPosition } = state;
  const cursorBoostMultiplier = state.isAttracting ? 10 : 1;
  
  // Update spatial grid for this frame - reuse existing grid
  const spatialGrid = updateSpatialGrid(boids, gridCellSize, canvasWidth, canvasHeight, state.spatialGrid);
  
  // Update each boid using spatial optimization
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    
    // Get nearby boids using cached array
    const nearbyIndices = getNearbyBoidIndices(
      boid,
      spatialGrid,
      gridCellSize,
      parameters.perceptionRadius,
      canvasWidth,
      canvasHeight,
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
      cursorBoostMultiplier
    );
  }
  
  // Return updated state with minimal cloning
  return {
    ...state,
    spatialGrid,
  };
}; 

/**
 * In-place simulation update (avoids allocating a new `BoidsState` object per frame).
 * Use this for high-FPS loops where React state updates would be too expensive.
 */
export const updateBoidsInPlace = (state: BoidsState): void => {
  if (!state.isRunning) return;

  const { boids, canvasWidth, canvasHeight, parameters, gridCellSize, cursorPosition } = state;
  const cursorBoostMultiplier = state.isAttracting ? 10 : 1;

  state.spatialGrid = updateSpatialGrid(boids, gridCellSize, canvasWidth, canvasHeight, state.spatialGrid);

  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];

    const nearbyIndices = getNearbyBoidIndices(
      boid,
      state.spatialGrid,
      gridCellSize,
      parameters.perceptionRadius,
      canvasWidth,
      canvasHeight,
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
      cursorBoostMultiplier
    );
  }
};