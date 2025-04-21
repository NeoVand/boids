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
  
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    
    if (dist > 0.5) discard;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const trailProgramRef = useRef<WebGLProgram | null>(null);
  
  // WebGL buffer references to avoid recreation
  const positionBufferRef = useRef<WebGLBuffer | null>(null);
  const velocityBufferRef = useRef<WebGLBuffer | null>(null);
  const colorBufferRef = useRef<WebGLBuffer | null>(null);
  const projectionMatrixRef = useRef<Float32Array | null>(null);
  
  // Performance optimization - typed arrays for GPU data
  const positionsArrayRef = useRef<Float32Array | null>(null);
  const velocitiesArrayRef = useRef<Float32Array | null>(null);
  const colorsArrayRef = useRef<Float32Array | null>(null);
  
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
  
  const [useWebGL, setUseWebGL] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
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
  
  // Handle mouse/touch start (down)
  const handlePointerDown = useCallback((e: MouseEvent | TouchEvent) => {
    const position = getCanvasCoordinates(e);
    if (position) {
      setIsDragging(true);
      setMousePos(position);
      onCursorPositionChange?.(position);
      onAttractionStateChange?.(true);
    }
  }, [getCanvasCoordinates, onCursorPositionChange, onAttractionStateChange]);
  
  // Handle mouse/touch move
  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent) => {
    // Only update position if currently attracting (button/touch is down)
    if (state.isAttracting || isDragging) {
      const position = getCanvasCoordinates(e);
      if (position) {
        setMousePos(position);
        onCursorPositionChange?.(position);
      }
    }
  }, [getCanvasCoordinates, onCursorPositionChange, state.isAttracting, isDragging]);
  
  // Handle mouse/touch end (up)
  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    onAttractionStateChange?.(false);
  }, [onAttractionStateChange]);
  
  // Setup event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Always prevent default for touch events to avoid scrolling
    const preventDefaultTouchstart = (e: TouchEvent) => {
      e.preventDefault();
      handlePointerDown(e);
    };
    
    // Mouse events
    canvas.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    
    // Touch events with passive: false to allow preventDefault
    canvas.addEventListener('touchstart', preventDefaultTouchstart, { passive: false });
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
    
    return () => {
      // Clean up event listeners
      canvas.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      
      canvas.removeEventListener('touchstart', preventDefaultTouchstart);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp]);
  
  // Initialize WebGL - only once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
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
  }, []);
  
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
  }, [state.boids.length]);
  
  // Render the boids using either WebGL or Canvas2D
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Make sure projection matrix is initialized
    if (!projectionMatrixRef.current) {
      const validWidth = state.canvasWidth > 0 ? state.canvasWidth : 100;
      const validHeight = state.canvasHeight > 0 ? state.canvasHeight : 100;
      projectionMatrixRef.current = createProjectionMatrix(validWidth, validHeight);
    }
    
    if (useWebGL && glRef.current && programRef.current && trailProgramRef.current && 
        positionBufferRef.current && velocityBufferRef.current && colorBufferRef.current && 
        positionsArrayRef.current && velocitiesArrayRef.current && colorsArrayRef.current && 
        projectionMatrixRef.current) {
      try {
        renderBoidsInstanced(
          glRef.current,
          programRef.current,
          trailProgramRef.current,
          state,
          colorPalette,
          {
            positionBuffer: positionBufferRef.current,
            velocityBuffer: velocityBufferRef.current,
            colorBuffer: colorBufferRef.current,
            positions: positionsArrayRef.current,
            velocities: velocitiesArrayRef.current,
            colors: colorsArrayRef.current,
            projectionMatrix: projectionMatrixRef.current
          }
        );
      } catch (e) {
        console.error("WebGL rendering error:", e);
        setUseWebGL(false); // Switch to Canvas2D renderer
        renderBoidsCanvas2D(canvas, state, colorPalette);
      }
    } else {
      renderBoidsCanvas2D(canvas, state, colorPalette);
    }
    
    // Show minimal debug info
    if (state.showPerceptionRadius) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        
        // Draw attraction target if needed
        if (mousePos && state.isAttracting) {
          ctx.beginPath();
          ctx.arc(mousePos.x, mousePos.y, 8, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        
        ctx.restore();
      }
    }
  }, [state, colorPalette, useWebGL, mousePos]);
  
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
  const { boids, canvasWidth, canvasHeight, particleType } = state;
  
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
  
  // Fill arrays with boid data
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    const idx = i * 2;
    const colorIdx = i * 4;
    
    // Position data
    positions[idx] = boid.position.x;
    positions[idx + 1] = boid.position.y;
    
    // Velocity data
    velocities[idx] = boid.velocity.x;
    velocities[idx + 1] = boid.velocity.y;
    
    // Color data
    const colorValues = parseColor(colorPalette[boid.id % colorPalette.length]);
    colors[colorIdx] = colorValues[0] / 255;
    colors[colorIdx + 1] = colorValues[1] / 255;
    colors[colorIdx + 2] = colorValues[2] / 255;
    colors[colorIdx + 3] = 0.9; // Alpha
  }
  
  // Draw trails if needed
  if (particleType === 'trail') {
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
    
    for (let i = 0; i < boids.length; i++) {
      const boid = boids[i];
      const { history } = boid;
      
      if (history.length < 2) continue;
      
      const colorValues = parseColor(colorPalette[boid.id % colorPalette.length]);
      
      const vertices = new Float32Array(history.length * 2);
      const trailColors = new Float32Array(history.length * 4);
      
      for (let j = 0; j < history.length; j++) {
        const idx = j * 2;
        const colorIdx = j * 4;
        
        vertices[idx] = history[j].x;
        vertices[idx + 1] = history[j].y;
        
        const alpha = j / history.length;
        trailColors[colorIdx] = colorValues[0] / 255;
        trailColors[colorIdx + 1] = colorValues[1] / 255;
        trailColors[colorIdx + 2] = colorValues[2] / 255;
        trailColors[colorIdx + 3] = 0.7 * (1 - alpha);
      }
      
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
      
      const positionLocation = gl.getAttribLocation(trailProgram, 'aPosition');
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, trailColors, gl.STREAM_DRAW);
      
      const colorLocation = gl.getAttribLocation(trailProgram, 'aColor');
      gl.enableVertexAttribArray(colorLocation);
      gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
      
      gl.drawArrays(gl.LINE_STRIP, 0, history.length);
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
    case 'arrow': pointSize = 12; break;
    case 'trail': pointSize = 4; break;
  }
  
  const pointSizeLocation = gl.getUniformLocation(program, 'uPointSize');
  if (pointSizeLocation) {
    gl.uniform1f(pointSizeLocation, pointSize);
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
  const { boids, canvasWidth, canvasHeight, particleType } = state;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return;
  
  // Clear the canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  
  // Draw each boid
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    const color = colorPalette[boid.id % colorPalette.length];
    
    ctx.save();
    
    // Draw trails if enabled
    if (particleType === 'trail' && boid.history.length > 1) {
      ctx.beginPath();
      ctx.moveTo(boid.history[0].x, boid.history[0].y);
      
      for (let j = 1; j < boid.history.length; j++) {
        ctx.lineTo(boid.history[j].x, boid.history[j].y);
      }
      
      ctx.strokeStyle = color + '70'; // 70 is hex for ~44% opacity
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    // Draw the boid
    ctx.fillStyle = color;
    
    // Position at the boid's current position
    ctx.translate(boid.position.x, boid.position.y);
    
    if (particleType === 'arrow') {
      // Draw an arrow pointing in the direction of velocity
      const angle = Math.atan2(boid.velocity.y, boid.velocity.x);
      ctx.rotate(angle);
      
      const size = 8;
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size / 2, size / 2);
      ctx.lineTo(-size / 2, -size / 2);
      ctx.closePath();
      ctx.fill();
    } else {
      // Draw a circle for disk and dot types
      const radius = particleType === 'dot' ? 2 : 5;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
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

// Parse a color string to RGB array
const parseColor = (color: string): number[] => {
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