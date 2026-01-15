import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { BoidsState } from '../../utils/boids';

interface BoidsCanvasProps {
  state: BoidsState;
  className?: string;
  onCursorPositionChange?: (position: { x: number; y: number } | null) => void;
  onAttractionStateChange?: (isAttracting: boolean) => void;
}

// Simple WebGL shaders for robust point rendering
const vertexShaderSource = `
  attribute vec2 aPosition;
  attribute vec2 aVelocity;
  attribute vec4 aColor;
  
  uniform mat4 uProjectionMatrix;
  uniform float uPointSize;
  
  varying vec2 vVelocity;
  varying vec4 vColor;
  
  void main() {
    gl_Position = uProjectionMatrix * vec4(aPosition, 0.0, 1.0);
    gl_PointSize = uPointSize;
    vVelocity = aVelocity;
    vColor = aColor;
  }
`;

const fragmentShaderSource = `
  precision highp float;
  
  varying vec2 vVelocity;
  varying vec4 vColor;

  uniform int uShape; // 0 = circle, 1 = arrow (triangle)
  
  void main() {
    vec2 coord = (gl_PointCoord - vec2(0.5)) * 2.0; // [-1, 1]

    if (uShape == 1) {
      // Arrow/triangle oriented by velocity.
      // Rotate coord so that +X is "forward".
      vec2 vel = normalize(vVelocity + vec2(0.001)); // avoid NaN
      float angle = atan(vel.y, vel.x);
      float c = cos(-angle);
      float s = sin(-angle);
      mat2 rot = mat2(c, -s, s, c);
      vec2 p = rot * coord;

      // Triangle vertices in local space
      vec2 a = vec2(1.0, 0.0);
      vec2 b = vec2(-0.7, 0.55);
      vec2 d = vec2(-0.7, -0.55);

      // Edge function (signed area)
      float e1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      float e2 = (d.x - b.x) * (p.y - b.y) - (d.y - b.y) * (p.x - b.x);
      float e3 = (a.x - d.x) * (p.y - d.y) - (a.y - d.y) * (p.x - d.x);

      // Accept either winding
      bool inside = (e1 >= 0.0 && e2 >= 0.0 && e3 >= 0.0) || (e1 <= 0.0 && e2 <= 0.0 && e3 <= 0.0);
      if (!inside) discard;

      gl_FragColor = vColor;
      return;
    }

    // Circle (disk/dot)
    float dist = length(coord);
    if (dist > 1.0) discard;
    gl_FragColor = vColor;
  }
`;

// Trail renderer shader sources
const trailVertexShaderSource = `
  attribute vec2 aPosition;
  attribute vec4 aColor;
  
  uniform mat4 uProjectionMatrix;
  
  varying vec4 vColor;
  
  void main() {
    gl_Position = uProjectionMatrix * vec4(aPosition, 0.0, 1.0);
    vColor = aColor;
  }
`;

const trailFragmentShaderSource = `
  precision highp float;
  
  varying vec4 vColor;
  
  void main() {
    gl_FragColor = vColor;
  }
`;

// Cached projection matrix
const createProjectionMatrix = (width: number, height: number): Float32Array => {
  // Ensure positive dimensions to avoid division by zero
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  // Create an identity matrix first
  const matrix = new Float32Array(16);
  matrix.fill(0);
  
  // Set the identity components
  matrix[0] = 1;
  matrix[5] = 1;
  matrix[10] = 1;
  matrix[15] = 1;
  
  // Set orthographic projection values (for 2D rendering)
  matrix[0] = 2 / safeWidth;
  matrix[5] = -2 / safeHeight;
  matrix[12] = -1;
  matrix[13] = 1;
  
  // Validate the matrix
  if (!isValidMatrix(matrix)) {
    console.error("Failed to create valid projection matrix, using identity matrix instead");
    const identity = new Float32Array(16);
    identity.fill(0);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    return identity;
  }
  
  return matrix;
};

// Helper to validate a matrix
const isValidMatrix = (matrix: any): boolean => {
  return matrix && 
         matrix instanceof Float32Array && 
         matrix.length === 16 && 
         !matrix.some(val => isNaN(val) || !isFinite(val));
};

// Geometry for different particle types

// Indices for quad/disk geometry

export const BoidsCanvas = ({ 
  state, 
  className = '',
  onCursorPositionChange,
  onAttractionStateChange
}: BoidsCanvasProps) => {
  const stateRef = useRef(state);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const trailProgramRef = useRef<WebGLProgram | null>(null);
  const renderRafRef = useRef<number | null>(null);
  
  // WebGL buffer references to avoid recreation
  const positionBufferRef = useRef<WebGLBuffer | null>(null);
  const velocityBufferRef = useRef<WebGLBuffer | null>(null);
  const colorBufferRef = useRef<WebGLBuffer | null>(null);
  const projectionMatrixRef = useRef<Float32Array | null>(null);
  
  // Performance optimization - typed arrays for GPU data
  const positionsArrayRef = useRef<Float32Array | null>(null);
  const velocitiesArrayRef = useRef<Float32Array | null>(null);
  const colorsArrayRef = useRef<Float32Array | null>(null);
  const trailVerticesArrayRef = useRef<Float32Array | null>(null);
  const trailColorsArrayRef = useRef<Float32Array | null>(null);
  const smoothedRgbArrayRef = useRef<Float32Array | null>(null);
  
  // Set initial projection matrix with default dimensions
  useEffect(() => {
    if (!projectionMatrixRef.current) {
      // Create an initial projection matrix with safe values
      const validWidth = state.canvasWidth > 0 ? state.canvasWidth : 100;
      const validHeight = state.canvasHeight > 0 ? state.canvasHeight : 100;
      projectionMatrixRef.current = createProjectionMatrix(validWidth, validHeight);
    }
    
    // Initialize typed arrays for boids data if not already
    if (!positionsArrayRef.current) {
      const boidCount = Math.max(1000, state.boids.length); // Preallocate for efficiency
      positionsArrayRef.current = new Float32Array(boidCount * 2);
      velocitiesArrayRef.current = new Float32Array(boidCount * 2);
      colorsArrayRef.current = new Float32Array(boidCount * 4);
    }
  }, [state.canvasWidth, state.canvasHeight, state.boids.length]);

  // Keep latest state in a ref so the render loop doesn't depend on React re-renders
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  
  const [useWebGL, setUseWebGL] = useState(true); // Use WebGL for better performance
  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);
  
  // Generate a color palette for boids based on the primary color
  const colorPalette = useMemo(() => generateColorPalette('#4169e1', 5), []);
  
  // Handle mouse/touch interaction
  const getCanvasCoordinates = useCallback((e: MouseEvent | TouchEvent): { x: number, y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    
    if ('touches' in e) {
      // Touch event
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      // Mouse event
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    // Convert screen coordinates to canvas coordinates
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    
    return { x, y };
  }, []);
  
  // Handle mouse/touch move (always active, no click required)
  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent) => {
    const position = getCanvasCoordinates(e);
    if (position) {
      setMousePos(position);
      onCursorPositionChange?.(position);
    }
  }, [getCanvasCoordinates, onCursorPositionChange, onAttractionStateChange]);

  const handlePointerLeave = useCallback(() => {
    setMousePos(null);
    onCursorPositionChange?.(null);
    onAttractionStateChange?.(false);
  }, [onCursorPositionChange, onAttractionStateChange]);

  const handlePointerDown = useCallback(() => {
    // Boost attraction/repulsion on click
    onAttractionStateChange?.(true);
  }, [onAttractionStateChange]);

  const handlePointerUp = useCallback(() => {
    // Remove boost on release (still tracking position if cursor is inside)
    onAttractionStateChange?.(false);
  }, [onAttractionStateChange]);
  
  // Setup event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Always prevent default for touch events to avoid scrolling
    const preventDefaultTouchmove = (e: TouchEvent) => {
      e.preventDefault();
      handlePointerMove(e);
    };
    
    // Mouse events
    canvas.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', handlePointerLeave);
    
    // Touch events with passive: false to allow preventDefault
    canvas.addEventListener('touchstart', handlePointerDown, { passive: true });
    window.addEventListener('touchmove', preventDefaultTouchmove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerLeave);
    
    return () => {
      // Clean up event listeners
      canvas.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      canvas.removeEventListener('mouseleave', handlePointerLeave);
      
      canvas.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('touchmove', preventDefaultTouchmove);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('touchcancel', handlePointerLeave);
    };
  }, [handlePointerMove, handlePointerLeave, handlePointerDown, handlePointerUp]);
  
  // Initialize WebGL - only once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Only initialize WebGL if we want to use it
    if (!useWebGL) {
      // Clean up any existing WebGL context
      if (glRef.current) {
        glRef.current = null;
        programRef.current = null;
        trailProgramRef.current = null;
      }
      return;
    }
    
    try {
      // Get WebGL context with optimized parameters
      const gl = canvas.getContext('webgl', { 
        antialias: false, // Disable antialiasing for performance
        alpha: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
      });
      
      if (!gl) {
        setUseWebGL(false);
        return;
      }
      
      glRef.current = gl;
      
      // Create shader programs
      const program = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      if (!program) {
        setUseWebGL(false);
        return;
      }
      programRef.current = program;
      
      // Create trail shader program
      const trailProgram = createShaderProgram(gl, trailVertexShaderSource, trailFragmentShaderSource);
      if (!trailProgram) {
        setUseWebGL(false);
        return;
      }
      trailProgramRef.current = trailProgram;
      
      // Create buffers once
      positionBufferRef.current = gl.createBuffer();
      velocityBufferRef.current = gl.createBuffer();
      colorBufferRef.current = gl.createBuffer();
      
      // Set clear color
      gl.clearColor(0.06, 0.07, 0.08, 1.0);
      
      // Set blending for alpha transparency
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } catch (e) {
      console.error("WebGL initialization error:", e);
      setUseWebGL(false);
    }
    
    return () => {
      try {
        const gl = glRef.current;
        if (gl) {
          if (positionBufferRef.current) gl.deleteBuffer(positionBufferRef.current);
          if (velocityBufferRef.current) gl.deleteBuffer(velocityBufferRef.current);
          if (colorBufferRef.current) gl.deleteBuffer(colorBufferRef.current);
          if (programRef.current) gl.deleteProgram(programRef.current);
          if (trailProgramRef.current) gl.deleteProgram(trailProgramRef.current);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    };
  }, [useWebGL]);
  
  // Make sure canvas dimensions match state and prepare projection matrix
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Only update if dimensions changed
    if (canvas.width !== state.canvasWidth || canvas.height !== state.canvasHeight) {
      canvas.width = state.canvasWidth;
      canvas.height = state.canvasHeight;
      
      // Update projection matrix with validation
      const validWidth = state.canvasWidth > 0 ? state.canvasWidth : 1;
      const validHeight = state.canvasHeight > 0 ? state.canvasHeight : 1;
      projectionMatrixRef.current = createProjectionMatrix(validWidth, validHeight);
    }
  }, [state.canvasWidth, state.canvasHeight]);
  
  // Prepare typed arrays for boids data when count changes
  useEffect(() => {
    const boidCount = state.boids.length;
    
    // Initialize or resize typed arrays if needed
    if (!positionsArrayRef.current || positionsArrayRef.current.length < boidCount * 2) {
      positionsArrayRef.current = new Float32Array(boidCount * 2);
      velocitiesArrayRef.current = new Float32Array(boidCount * 2);
      colorsArrayRef.current = new Float32Array(boidCount * 4);
    }

    if (!smoothedRgbArrayRef.current || smoothedRgbArrayRef.current.length < boidCount * 3) {
      smoothedRgbArrayRef.current = new Float32Array(boidCount * 3);
    }

    // Tail buffers: cap by a segment budget to avoid huge allocations at high counts.
    const requestedTailLen = Math.max(2, Math.floor(state.parameters.trailLength || 25));
    const maxSegmentsBudget = 300_000;
    const maxSegments = Math.min(
      maxSegmentsBudget,
      boidCount * Math.max(1, requestedTailLen - 1)
    );
    // We render tapered tails as quads (two triangles) per segment:
    // 6 vertices per segment
    const requiredTrailVertexFloats = maxSegments * 12; // 6 vertices * 2 coords
    const requiredTrailColorFloats = maxSegments * 24;  // 6 vertices * 4 comps

    if (!trailVerticesArrayRef.current || trailVerticesArrayRef.current.length < requiredTrailVertexFloats) {
      trailVerticesArrayRef.current = new Float32Array(requiredTrailVertexFloats);
    }
    if (!trailColorsArrayRef.current || trailColorsArrayRef.current.length < requiredTrailColorFloats) {
      trailColorsArrayRef.current = new Float32Array(requiredTrailColorFloats);
    }
  }, [state.boids.length, state.parameters.trailLength]);
  
  // Render loop (avoids tying rendering to React state updates)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderOnce = () => {
      const s = stateRef.current;

      // Make sure projection matrix is initialized
      if (!projectionMatrixRef.current) {
        const validWidth = s.canvasWidth > 0 ? s.canvasWidth : 100;
        const validHeight = s.canvasHeight > 0 ? s.canvasHeight : 100;
        projectionMatrixRef.current = createProjectionMatrix(validWidth, validHeight);
      }

      if (
        useWebGL &&
        glRef.current &&
        programRef.current &&
        trailProgramRef.current &&
        positionBufferRef.current &&
        velocityBufferRef.current &&
        colorBufferRef.current &&
        positionsArrayRef.current &&
        velocitiesArrayRef.current &&
        colorsArrayRef.current &&
        trailVerticesArrayRef.current &&
        trailColorsArrayRef.current &&
        smoothedRgbArrayRef.current &&
        projectionMatrixRef.current
      ) {
        try {
          renderBoidsInstanced(
            glRef.current,
            programRef.current,
            trailProgramRef.current,
            s,
            colorPalette,
            {
              positionBuffer: positionBufferRef.current,
              velocityBuffer: velocityBufferRef.current,
              colorBuffer: colorBufferRef.current,
              positions: positionsArrayRef.current,
              velocities: velocitiesArrayRef.current,
              colors: colorsArrayRef.current,
              trailVertices: trailVerticesArrayRef.current,
              trailColors: trailColorsArrayRef.current,
              smoothedRgb: smoothedRgbArrayRef.current,
              projectionMatrix: projectionMatrixRef.current,
            }
          );
        } catch (e) {
          console.error('WebGL rendering error:', e);
          setUseWebGL(false);
          renderBoidsCanvas2D(canvas, s, colorPalette);
        }
      } else {
        renderBoidsCanvas2D(canvas, s, colorPalette);
      }

      // Draw attraction target if needed (2D overlay)
      if (mousePos && s.isAttracting) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(mousePos.x, mousePos.y, 8, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }
    };

    const loop = () => {
      renderOnce();
      if (stateRef.current.isRunning) {
        renderRafRef.current = requestAnimationFrame(loop);
      } else {
        renderRafRef.current = null;
      }
    };

    // Start loop only when running (otherwise render once for a stable paused frame)
    if (stateRef.current.isRunning) {
      renderRafRef.current = requestAnimationFrame(loop);
    } else {
      renderOnce();
    }

    return () => {
      if (renderRafRef.current !== null) {
        cancelAnimationFrame(renderRafRef.current);
        renderRafRef.current = null;
      }
    };
  }, [colorPalette, useWebGL, mousePos]);
  
  return (
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
  );
};

// Create a WebGL shader program
const createShaderProgram = (
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram | null => {
  // Create and compile vertex shader
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  if (!vertexShader) return null;
  
  gl.shaderSource(vertexShader, vertexSource);
  gl.compileShader(vertexShader);
  
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    gl.deleteShader(vertexShader);
    return null;
  }
  
  // Create and compile fragment shader
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fragmentShader) return null;
  
  gl.shaderSource(fragmentShader, fragmentSource);
  gl.compileShader(fragmentShader);
  
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  
  // Create shader program
  const program = gl.createProgram();
  if (!program) return null;
  
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteProgram(program);
    return null;
  }
  
  // Cleanup shaders
  gl.detachShader(program, vertexShader);
  gl.detachShader(program, fragmentShader);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  
  return program;
};

// WebGL buffer pointers
interface WebGLBuffers {
  positionBuffer: WebGLBuffer;
  velocityBuffer: WebGLBuffer;
  colorBuffer: WebGLBuffer;
  positions: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  trailVertices: Float32Array;
  trailColors: Float32Array;
  smoothedRgb: Float32Array;
  projectionMatrix: Float32Array;
}

// Simple, reliable WebGL rendering
const renderBoidsInstanced = (
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  trailProgram: WebGLProgram,
  state: BoidsState,
  colorPalette: string[],
  buffers: WebGLBuffers
) => {
  const { boids, canvasWidth, canvasHeight, particleType, colorizationMode } = state;
  
  // Early return if there are no boids or the projection matrix is invalid
  if (boids.length === 0) return;
  
  // Validate and fix projection matrix if necessary
  if (!isValidMatrix(buffers.projectionMatrix)) {
    console.error('Invalid projection matrix, recreating');
    buffers.projectionMatrix = createProjectionMatrix(canvasWidth, canvasHeight);
    
    // If still invalid, use identity matrix as fallback
    if (!isValidMatrix(buffers.projectionMatrix)) {
      console.error('Failed to create valid projection matrix, using identity matrix');
      const identity = new Float32Array(16);
      identity.fill(0);
      identity[0] = identity[5] = identity[10] = identity[15] = 1;
      buffers.projectionMatrix = identity;
    }
  }
  
  // Clear the canvas
  gl.viewport(0, 0, canvasWidth, canvasHeight);
  gl.clear(gl.COLOR_BUFFER_BIT);
  
  // Prepare data for all boids
  const positions = buffers.positions;
  const velocities = buffers.velocities;
  const colors = buffers.colors;
  const smoothedRgb = buffers.smoothedRgb;

  const colorMode = colorizationMode || 'speed';
  const shouldSmooth = true;
  const smoothing = 0.18; // higher = faster response, lower = smoother
  
  // Fill arrays with boid data
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    const idx = i * 2;
    const colorIdx = i * 4;
    const smoothIdx = i * 3;
    
    // Position data
    positions[idx] = boid.position.x;
    positions[idx + 1] = boid.position.y;
    
    // Velocity data
    velocities[idx] = boid.velocity.x;
    velocities[idx + 1] = boid.velocity.y;
    
    // Color data based on selected color mode
    const color = getBoidColor(boid, i, colorPalette, colorMode, state);
    const colorValues = parseColor(color);

    const tr = colorValues[0] / 255;
    const tg = colorValues[1] / 255;
    const tb = colorValues[2] / 255;

    // Smooth dynamic color modes to avoid visible flicker from fast-changing inputs
    if (shouldSmooth) {
      const pr = smoothedRgb[smoothIdx];
      const pg = smoothedRgb[smoothIdx + 1];
      const pb = smoothedRgb[smoothIdx + 2];

      const nr = pr + (tr - pr) * smoothing;
      const ng = pg + (tg - pg) * smoothing;
      const nb = pb + (tb - pb) * smoothing;

      smoothedRgb[smoothIdx] = nr;
      smoothedRgb[smoothIdx + 1] = ng;
      smoothedRgb[smoothIdx + 2] = nb;

      colors[colorIdx] = nr;
      colors[colorIdx + 1] = ng;
      colors[colorIdx + 2] = nb;
    } else {
      smoothedRgb[smoothIdx] = tr;
      smoothedRgb[smoothIdx + 1] = tg;
      smoothedRgb[smoothIdx + 2] = tb;

      colors[colorIdx] = tr;
      colors[colorIdx + 1] = tg;
      colors[colorIdx + 2] = tb;
    }
    colors[colorIdx + 3] = 0.9; // Alpha
  }
  
  // Draw tails (previous positions) in one batch for performance (always enabled)
  if ((state.parameters.trailLength ?? 25) >= 2) {
    gl.useProgram(trailProgram);

    const projectionMatrixLocation = gl.getUniformLocation(trailProgram, 'uProjectionMatrix');
    if (!projectionMatrixLocation) {
      console.warn('Could not find trail projection matrix uniform location');
    } else {
      try {
        gl.uniformMatrix4fv(projectionMatrixLocation, false, buffers.projectionMatrix);
      } catch (e) {
        console.error('Error setting trail projection matrix:', e);
        return;
      }
    }

    const maxSegmentsBudget = 300_000;
    const requestedLen = Math.max(2, Math.floor(state.parameters.trailLength));
    const maxLenForBudget = Math.max(2, Math.floor(maxSegmentsBudget / Math.max(1, boids.length)) + 1);
    const effectiveLen = Math.min(requestedLen, maxLenForBudget);

    const vertices = buffers.trailVertices;
    const trailColors = buffers.trailColors;
    let segCount = 0;

    const alphaMax = 0.6;
    const minWidth = 0.6;
    // Match disk diameter (point sprite size) at the head of the tail.
    const boidSize = state.parameters.boidSize ?? 1;
    const diskDiameter = 10 * Math.max(0.1, boidSize);
    const maxWidth = diskDiameter;

    for (let i = 0; i < boids.length; i++) {
      const boid = boids[i];
      const count = Math.min(boid.tailCount || 0, effectiveLen);
      if (count < 2 || boid.tailCapacity <= 0) continue;

      const newestExclusive = boid.tailHead; // next write
      const start = (newestExclusive - count + boid.tailCapacity) % boid.tailCapacity;

      const baseColorIdx = i * 4;
      const r = colors[baseColorIdx];
      const g = colors[baseColorIdx + 1];
      const b = colors[baseColorIdx + 2];

      // Build segments between consecutive points: (p0->p1), (p1->p2), ...
      for (let j = 0; j < count - 1; j++) {
        if (segCount >= maxSegmentsBudget) break;

        const i0 = (start + j) % boid.tailCapacity;
        const i1 = (start + j + 1) % boid.tailCapacity;

        const x0 = boid.tailX[i0];
        const y0 = boid.tailY[i0];
        const x1 = boid.tailX[i1];
        const y1 = boid.tailY[i1];

        // Break marker (inserted on wrap/bounce)
        if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
          continue;
        }

        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.0001) continue;

        const px = -dy / len;
        const py = dx / len;

        const t0 = j / (count - 1);
        const t1 = (j + 1) / (count - 1);
        const w0 = minWidth + (maxWidth - minWidth) * t0;
        const w1 = minWidth + (maxWidth - minWidth) * t1;

        const ox0 = px * (w0 * 0.5);
        const oy0 = py * (w0 * 0.5);
        const ox1 = px * (w1 * 0.5);
        const oy1 = py * (w1 * 0.5);

        // Quad points
        const x0l = x0 - ox0;
        const y0l = y0 - oy0;
        const x0r = x0 + ox0;
        const y0r = y0 + oy0;
        const x1l = x1 - ox1;
        const y1l = y1 - oy1;
        const x1r = x1 + ox1;
        const y1r = y1 + oy1;

        const vOff = segCount * 12;
        // Tri 1: p0L, p0R, p1L
        vertices[vOff] = x0l;
        vertices[vOff + 1] = y0l;
        vertices[vOff + 2] = x0r;
        vertices[vOff + 3] = y0r;
        vertices[vOff + 4] = x1l;
        vertices[vOff + 5] = y1l;
        // Tri 2: p1L, p0R, p1R
        vertices[vOff + 6] = x1l;
        vertices[vOff + 7] = y1l;
        vertices[vOff + 8] = x0r;
        vertices[vOff + 9] = y0r;
        vertices[vOff + 10] = x1r;
        vertices[vOff + 11] = y1r;

        const a0 = t0 * alphaMax;
        const a1 = t1 * alphaMax;

        const cOff = segCount * 24;
        // 6 vertices colors: first two use a0, last four interpolate toward a1
        // (simple: assign a0 for p0*, a1 for p1*)
        // Tri 1
        trailColors[cOff] = r;
        trailColors[cOff + 1] = g;
        trailColors[cOff + 2] = b;
        trailColors[cOff + 3] = a0;
        trailColors[cOff + 4] = r;
        trailColors[cOff + 5] = g;
        trailColors[cOff + 6] = b;
        trailColors[cOff + 7] = a0;
        trailColors[cOff + 8] = r;
        trailColors[cOff + 9] = g;
        trailColors[cOff + 10] = b;
        trailColors[cOff + 11] = a1;
        // Tri 2
        trailColors[cOff + 12] = r;
        trailColors[cOff + 13] = g;
        trailColors[cOff + 14] = b;
        trailColors[cOff + 15] = a1;
        trailColors[cOff + 16] = r;
        trailColors[cOff + 17] = g;
        trailColors[cOff + 18] = b;
        trailColors[cOff + 19] = a0;
        trailColors[cOff + 20] = r;
        trailColors[cOff + 21] = g;
        trailColors[cOff + 22] = b;
        trailColors[cOff + 23] = a1;

        segCount++;
      }

      if (segCount >= maxSegmentsBudget) break;
    }

    if (segCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, segCount * 12), gl.STREAM_DRAW);

      const positionLocation = gl.getAttribLocation(trailProgram, 'aPosition');
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, trailColors.subarray(0, segCount * 24), gl.STREAM_DRAW);

      const colorLocation = gl.getAttribLocation(trailProgram, 'aColor');
      gl.enableVertexAttribArray(colorLocation);
      gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, segCount * 6);
    }
  }

  // Draw boids as points
  gl.useProgram(program);
  
  const projectionMatrixLocation = gl.getUniformLocation(program, 'uProjectionMatrix');
  if (!projectionMatrixLocation) {
    console.warn('Could not find projection matrix uniform location');
    return;
  }
  
  try {
    gl.uniformMatrix4fv(projectionMatrixLocation, false, buffers.projectionMatrix);
  } catch (e) {
    console.error('Error setting projection matrix:', e);
    // Fall back to 2D canvas rendering as a last resort
    renderBoidsCanvas2D(gl.canvas as HTMLCanvasElement, state, colorPalette);
    return;
  }
  
  // Position attribute
  const positionAttributeLocation = gl.getAttribLocation(program, 'aPosition');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(positionAttributeLocation);
  gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
  
  // Velocity attribute
  const velocityAttributeLocation = gl.getAttribLocation(program, 'aVelocity');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.velocityBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, velocities, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(velocityAttributeLocation);
  gl.vertexAttribPointer(velocityAttributeLocation, 2, gl.FLOAT, false, 0, 0);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STREAM_DRAW);
  
  const colorLocation = gl.getAttribLocation(program, 'aColor');
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
  
  let pointSize = 10;
  switch (particleType) {
    case 'disk': pointSize = 10; break;
    case 'dot': pointSize = 4; break;
    case 'trail': pointSize = 6; break;
  }
  
  const pointSizeLocation = gl.getUniformLocation(program, 'uPointSize');
  if (pointSizeLocation) {
    const size = state.parameters.boidSize ?? 1;
    gl.uniform1f(pointSizeLocation, pointSize * Math.max(0.1, size));
  }

  // Shape uniform (0 circle, 1 arrow)
  const shapeLocation = gl.getUniformLocation(program, 'uShape');
  if (shapeLocation) {
    gl.uniform1i(shapeLocation, particleType === 'arrow' ? 1 : 0);
  }
  
  gl.drawArrays(gl.POINTS, 0, boids.length);
  
  gl.disableVertexAttribArray(positionAttributeLocation);
  gl.disableVertexAttribArray(velocityAttributeLocation);
  gl.disableVertexAttribArray(colorLocation);
};

// Fallback Canvas2D rendering when WebGL is not available
const renderBoidsCanvas2D = (
  canvas: HTMLCanvasElement,
  state: BoidsState,
  colorPalette: string[]
) => {
  const { boids, canvasWidth, canvasHeight, colorizationMode } = state;
  // console.log('Canvas2D rendering:', boids.length, 'boids');
  
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    console.error('Could not get 2D context - canvas may have been used for WebGL');
    return;
  }
  
  // Clear the canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  
  // Set a simple fill style for debugging
  ctx.fillStyle = '#4169e1';
  
  // Draw a test circle to verify Canvas2D is working
  // ctx.beginPath();
  // ctx.arc(100, 100, 20, 0, Math.PI * 2);
  // ctx.fill();
  
  // Draw each boid
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    
    // Debug: log first few boid positions
    // if (i < 3) {
    //   console.log(`Boid ${i} position:`, boid.position.x, boid.position.y);
    // }
    const color = getBoidColor(boid, i, colorPalette, colorizationMode || 'default', state);
    
    ctx.save();
    
    // Draw tails (ring buffer) with taper (Canvas2D fallback)
    if ((state.parameters.trailLength ?? 25) >= 2 && boid.tailCount > 1) {
      const requestedLen = Math.max(2, Math.floor(state.parameters.trailLength));
      const effectiveLen = Math.min(requestedLen, boid.tailCount);
      const alphaMax = 0.6;

      const minWidth = 0.6;
      const boidSize = state.parameters.boidSize ?? 1;
      const diskDiameter = 10 * Math.max(0.1, boidSize);
      const maxWidth = diskDiameter;

      const start = (boid.tailHead - effectiveLen + boid.tailCapacity) % boid.tailCapacity;
      const rgbValues = parseColor(color);

      for (let j = 0; j < effectiveLen - 1; j++) {
        const i0 = (start + j) % boid.tailCapacity;
        const i1 = (start + j + 1) % boid.tailCapacity;

        const x0 = boid.tailX[i0];
        const y0 = boid.tailY[i0];
        const x1 = boid.tailX[i1];
        const y1 = boid.tailY[i1];

        if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
          continue;
        }

        const t = (j + 1) / (effectiveLen - 1); // 0 tail -> 1 head
        const width = minWidth + (maxWidth - minWidth) * t;

        ctx.strokeStyle = `rgba(${rgbValues[0]}, ${rgbValues[1]}, ${rgbValues[2]}, ${t * alphaMax})`;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    } else {
      // Draw the boid - simplified for debugging
      ctx.fillStyle = '#4169e1';
      
      // Draw a simple circle at the boid's position
      ctx.beginPath();
      ctx.arc(boid.position.x, boid.position.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
};

// Generate a palette of colors based on a primary color
const generateColorPalette = (baseColor: string, count: number): string[] => {
  const palette: string[] = [];
  
  // Parse the base color
  const r = parseInt(baseColor.slice(1, 3), 16);
  const g = parseInt(baseColor.slice(3, 5), 16);
  const b = parseInt(baseColor.slice(5, 7), 16);
  
  for (let i = 0; i < count; i++) {
    // Vary the hue slightly for each color
    const hueShift = (i * 20) % 360;
    const [h, s, l] = rgbToHsl(r, g, b);
    const [newR, newG, newB] = hslToRgb((h + hueShift) % 360, s, l);
    
    palette.push(`rgb(${newR}, ${newG}, ${newB})`);
  }
  
  return palette;
};

// Get a color based on colorization mode
const getBoidColor = (
  boid: any, 
  index: number, 
  colorPalette: string[], 
  colorizationMode: string,
  state: BoidsState
): string => {
  switch (colorizationMode) {
    case 'speed': {
      // Color based on speed (magnitude of velocity)
      const speed = Math.sqrt(boid.velocity.x * boid.velocity.x + boid.velocity.y * boid.velocity.y);
      
      // Use the state's maxSpeed parameter but scale it to create a better distribution
      const maxSpeed = state.parameters.maxSpeed;
      
      // Most boids operate in the 25-85% of max speed range
      // We'll scale our colors to emphasize this range
      const minEffectiveSpeed = 0.1 * maxSpeed;  // Slow threshold (10% of max)
      const maxEffectiveSpeed = 0.9 * maxSpeed;  // Fast threshold (90% of max)
      
      // Normalize to our effective range
      let adjustedSpeed = (speed - minEffectiveSpeed) / (maxEffectiveSpeed - minEffectiveSpeed);
      // Clamp to 0-1 range
      adjustedSpeed = Math.max(0, Math.min(1, adjustedSpeed));
      
      // Use a tri-color scale: blue (cold) -> teal -> green -> yellow -> red (hot)
      // Map 0-1 to 240-0 (blue to red) with extra emphasis on the middle range
      let hue;
      if (adjustedSpeed < 0.33) {
        // Blue (240) to teal/green (180)
        hue = 240 - (adjustedSpeed * 3) * 60;
      } else if (adjustedSpeed < 0.66) {
        // Teal/green (180) to yellow (60)
        hue = 180 - ((adjustedSpeed - 0.33) * 3) * 120;
      } else {
        // Yellow (60) to red (0)
        hue = 60 - ((adjustedSpeed - 0.66) * 3) * 60;
      }
      
      // Boost saturation and lightness for better visibility of the coloring
      return `hsl(${Math.round(hue)}, 90%, 60%)`;
    }
    case 'acceleration': {
      const ax = boid.acceleration?.x ?? 0;
      const ay = boid.acceleration?.y ?? 0;
      const accel = Math.sqrt(ax * ax + ay * ay);
      const maxAccel = Math.max(0.001, state.parameters.maxForce * 4);
      const t = Math.max(0, Math.min(1, accel / maxAccel));
      const hue = 220 - t * 220; // blue -> red
      return `hsl(${Math.round(hue)}, 85%, 60%)`;
    }
    case 'turning': {
      const vx = boid.velocity.x;
      const vy = boid.velocity.y;
      const ax = boid.acceleration?.x ?? 0;
      const ay = boid.acceleration?.y ?? 0;
      const vMag = Math.sqrt(vx * vx + vy * vy);
      const aMag = Math.sqrt(ax * ax + ay * ay);
      const denom = Math.max(0.0001, vMag * aMag);
      const turn = Math.abs(vx * ay - vy * ax) / denom; // 0..1-ish
      const t = Math.max(0, Math.min(1, turn));
      const hue = 160 - t * 160; // green -> red
      return `hsl(${Math.round(hue)}, 80%, 58%)`;
    }
    case 'orientation': {
      // Color based on direction angle of velocity vector
      const angle = Math.atan2(boid.velocity.y, boid.velocity.x);
      
      // Convert to degrees and normalize to 0-360 range
      // Add 180° to shift from [-180,180] to [0,360]
      let degrees = (angle * 180 / Math.PI) + 180;
      
      // Use the HSL color wheel directly:
      // 0° = Red, 60° = Yellow, 120° = Green, 180° = Cyan, 240° = Blue, 300° = Magenta
      
      // Create more vibrant colors with high saturation and balanced brightness
      return `hsl(${Math.round(degrees)}, 100%, 65%)`;
    }
    case 'neighbors': {
      // Use cached neighbor count computed during the simulation step.
      // This avoids doing an O(k) neighbor scan again during rendering.
      const neighborCount = typeof boid.neighborCount === 'number' ? boid.neighborCount : 0;
      
      // Adjust thresholds based on observed neighbor counts
      // Use a higher max to get a broader distribution
      const maxNeighbors = 24;  // Increase threshold for better distribution
      
      // Linear mapping - no square root to avoid skewing toward higher values
      const normalizedCount = Math.min(1, neighborCount / maxNeighbors);
      
      // Use a rainbow gradient with more blues and greens
      let hue;
      if (normalizedCount <= 0.4) {
        // More room for blues (0-40% of range)
        // Map 0-0.4 to 240-180 (blue to cyan)
        hue = 240 - (normalizedCount / 0.4) * 60;
      } else if (normalizedCount <= 0.7) {
        // More room for greens (40-70% of range)
        // Map 0.4-0.7 to 180-90 (cyan to yellow-green)
        hue = 180 - ((normalizedCount - 0.4) / 0.3) * 90;
      } else {
        // Less room for reds (70-100% of range)
        // Map 0.7-1.0 to 90-0 (yellow-green to red)
        hue = 90 - ((normalizedCount - 0.7) / 0.3) * 90;
      }
      
      // Use high saturation and brightness for vibrant colors
      return `hsl(${Math.round(hue)}, 90%, 60%)`;
    }
    default:
      return colorPalette[index % colorPalette.length];
  }
};

// Parse a color string to RGB array
const parseColor = (color: string): number[] => {
  // Handle hsl colors
  if (color.startsWith('hsl')) {
    const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (match) {
      const [h, s, l] = [parseInt(match[1]), parseInt(match[2]) / 100, parseInt(match[3]) / 100];
      const [r, g, b] = hslToRgb(h, s, l);
      return [r, g, b];
    }
  }
  
  // Handle rgb colors
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  }
  
  return [65, 105, 225]; // Default blue
};

// Convert RGB to HSL
const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    
    h *= 60;
  }
  
  return [h, s, l];
};

// Convert HSL to RGB
const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  let r, g, b;
  
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    
    r = hue2rgb(p, q, (h / 360) + 1/3);
    g = hue2rgb(p, q, h / 360);
    b = hue2rgb(p, q, (h / 360) - 1/3);
  }
  
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}; 