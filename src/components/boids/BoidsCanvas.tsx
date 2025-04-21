import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { Boid, BoidsState } from '../../utils/boids';

interface BoidsCanvasProps {
  state: BoidsState;
  className?: string;
  onCursorPositionChange?: (position: { x: number; y: number } | null) => void;
  onAttractionStateChange?: (isAttracting: boolean) => void;
}

// WebGL shader sources
const vertexShaderSource = `
  attribute vec2 aPosition;
  attribute vec2 aVelocity;
  attribute float aAlpha;
  
  uniform mat4 uProjectionMatrix;
  uniform float uSize;
  
  varying vec2 vVelocity;
  varying float vAlpha;
  
  void main() {
    gl_Position = uProjectionMatrix * vec4(aPosition, 0.0, 1.0);
    gl_PointSize = uSize;
    vVelocity = aVelocity;
    vAlpha = aAlpha;
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  
  varying vec2 vVelocity;
  varying float vAlpha;
  
  uniform vec4 uColor;
  uniform int uParticleType;
  
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    
    // Disk shape
    if (uParticleType == 0) {
      if (dist > 0.5) discard;
      gl_FragColor = vec4(uColor.rgb, uColor.a * vAlpha);
    } 
    // Dot shape
    else if (uParticleType == 1) {
      if (dist > 0.3) discard;
      gl_FragColor = vec4(uColor.rgb, uColor.a * vAlpha);
    }
    // Arrow shape (simulated)
    else if (uParticleType == 2) {
      float angle = atan(vVelocity.y, vVelocity.x);
      float direction = atan(coord.y, coord.x);
      float relativeDiff = mod(direction - angle + 3.14159, 6.28318) - 3.14159;
      
      if (dist > 0.5 || abs(relativeDiff) > 0.8 && dist > 0.2) discard;
      gl_FragColor = vec4(uColor.rgb, uColor.a * vAlpha);
    }
    // Default (fallback)
    else {
      if (dist > 0.5) discard;
      gl_FragColor = vec4(uColor.rgb, uColor.a * vAlpha);
    }
  }
`;

// Trail renderer shader sources
const trailVertexShaderSource = `
  attribute vec2 aPosition;
  attribute float aAge;
  
  uniform mat4 uProjectionMatrix;
  
  varying float vAge;
  
  void main() {
    gl_Position = uProjectionMatrix * vec4(aPosition, 0.0, 1.0);
    vAge = aAge;
  }
`;

const trailFragmentShaderSource = `
  precision mediump float;
  
  varying float vAge;
  
  uniform vec4 uColor;
  
  void main() {
    gl_FragColor = vec4(uColor.rgb, uColor.a * (1.0 - vAge));
  }
`;

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
    
    console.log('Canvas coordinates:', x, y, 'from client:', clientX, clientY);    
    return { x, y };
  }, []);
  
  // Handle mouse/touch start (down)
  const handlePointerDown = useCallback((e: MouseEvent | TouchEvent) => {
    console.log('PointerDown event triggered');
    const position = getCanvasCoordinates(e);
    if (position) {
      console.log('Valid position on pointer down:', position);
      setIsDragging(true);
      setMousePos(position);
      onCursorPositionChange?.(position);
      onAttractionStateChange?.(true);
      
      // Apply attraction to ALL boids (not just 20)
      if (state?.boids) {
        // Scale attraction force based on the parameter value
        const attractionScale = state.parameters.attractionForce * 0.1;
        
        for (let i = 0; i < state.boids.length; i++) {
          const boid = state.boids[i];
          const direction = {
            x: position.x - boid.position.x,
            y: position.y - boid.position.y
          };
          const distance = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
          if (distance > 0) {
            // Apply instant position change - more subtle than before
            boid.position.x += direction.x * 0.1 * attractionScale;
            boid.position.y += direction.y * 0.1 * attractionScale;
            
            // Set velocity toward cursor - scaled by attraction force
            boid.velocity.x = (direction.x / distance * 3) * attractionScale;
            boid.velocity.y = (direction.y / distance * 3) * attractionScale;
          }
        }
      }
    }
  }, [getCanvasCoordinates, onCursorPositionChange, onAttractionStateChange, state]);
  
  // Handle mouse/touch move
  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent) => {
    // Only update position if currently attracting (button/touch is down)
    if (state.isAttracting || isDragging) {
      console.log('PointerMove event while attracting');
      const position = getCanvasCoordinates(e);
      if (position) {
        setMousePos(position);
        onCursorPositionChange?.(position);
        
        // Apply attraction to ALL boids during drag
        if (state?.boids) {
          // Scale attraction force based on the parameter value
          const attractionScale = state.parameters.attractionForce * 0.1; 
          
          for (let i = 0; i < state.boids.length; i++) {
            const boid = state.boids[i];
            const direction = {
              x: position.x - boid.position.x,
              y: position.y - boid.position.y
            };
            const distance = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
            if (distance > 0) {
              // Apply position change - smoother during drag
              boid.position.x += direction.x * 0.05 * attractionScale;
              boid.position.y += direction.y * 0.05 * attractionScale;
              
              // Adjust velocity toward cursor - scaled by attraction force and distance
              // The further away, the stronger the attraction
              const distanceScale = Math.min(1.0, 100 / distance);
              boid.velocity.x = (direction.x / distance * 2 * distanceScale) * attractionScale;
              boid.velocity.y = (direction.y / distance * 2 * distanceScale) * attractionScale;
            }
          }
        }
      }
    }
  }, [getCanvasCoordinates, onCursorPositionChange, state, isDragging]);
  
  // Handle mouse/touch end (up)
  const handlePointerUp = useCallback(() => {
    console.log('PointerUp event triggered');
    setIsDragging(false);
    onAttractionStateChange?.(false);
  }, [onAttractionStateChange]);
  
  // Setup event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    console.log('Setting up event listeners on canvas');
    
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
  
  // Initialize WebGL
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    try {
      const gl = canvas.getContext('webgl', { 
        antialias: true,
        alpha: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
      });
      
      if (!gl) {
        console.warn('WebGL not supported, falling back to Canvas2D');
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
      
      // Set clear color
      gl.clearColor(0.06, 0.07, 0.08, 1.0);
    } catch (e) {
      console.error('WebGL initialization failed:', e);
      setUseWebGL(false);
    }
    
    return () => {
      try {
        const gl = glRef.current;
        if (gl) {
          if (programRef.current) {
            gl.deleteProgram(programRef.current);
          }
          if (trailProgramRef.current) {
            gl.deleteProgram(trailProgramRef.current);
          }
        }
      } catch (e) {
        console.error('WebGL cleanup failed:', e);
      }
    };
  }, []);
  
  // Make sure canvas dimensions match state
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Only update if dimensions changed
    if (canvas.width !== state.canvasWidth || canvas.height !== state.canvasHeight) {
      canvas.width = state.canvasWidth;
      canvas.height = state.canvasHeight;
      console.log(`Canvas dimensions set to ${canvas.width}x${canvas.height}`);
    }
  }, [state.canvasWidth, state.canvasHeight]);
  
  // Render the boids using either WebGL or Canvas2D
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    if (useWebGL && glRef.current) {
      renderBoidsWebGL(
        glRef.current, 
        programRef.current!, 
        trailProgramRef.current!,
        state, 
        colorPalette
      );
    } else {
      renderBoidsCanvas2D(canvas, state, colorPalette);
    }
    
    // Always draw debugging elements with Canvas2D
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Draw debug info
      ctx.save();
      
      // Draw attraction state indicator
      ctx.font = '14px Arial';
      ctx.fillStyle = state.isAttracting ? 'lime' : 'red';
      ctx.fillText(`Attraction: ${state.isAttracting ? 'ON' : 'OFF'} Drag: ${isDragging ? 'ON' : 'OFF'}`, 10, 20);
      
      // Draw cursor position if available
      if (mousePos) {
        ctx.fillStyle = 'yellow';
        ctx.fillText(`Mouse: ${Math.round(mousePos.x)},${Math.round(mousePos.y)}`, 10, 40);
        
        // Draw a large target at cursor position
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, 20, 0, Math.PI * 2);
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw cross
        ctx.beginPath();
        ctx.moveTo(mousePos.x - 20, mousePos.y);
        ctx.lineTo(mousePos.x + 20, mousePos.y);
        ctx.moveTo(mousePos.x, mousePos.y - 20);
        ctx.lineTo(mousePos.x, mousePos.y + 20);
        ctx.stroke();
      }
      
      // Add attraction force indicator
      ctx.fillStyle = 'white';
      ctx.fillText(`Attraction Force: ${state.parameters.attractionForce.toFixed(1)}`, 10, 60);
      
      ctx.restore();
    }
  }, [state, colorPalette, useWebGL, mousePos, isDragging]);
  
  return (
    <canvas
      ref={canvasRef}
      width={state.canvasWidth}
      height={state.canvasHeight}
      className={className}
      style={{ cursor: 'pointer', touchAction: 'none' }} // Disable browser touch actions
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
    console.error('Vertex shader compilation failed:', gl.getShaderInfoLog(vertexShader));
    gl.deleteShader(vertexShader);
    return null;
  }
  
  // Create and compile fragment shader
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fragmentShader) return null;
  
  gl.shaderSource(fragmentShader, fragmentSource);
  gl.compileShader(fragmentShader);
  
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    console.error('Fragment shader compilation failed:', gl.getShaderInfoLog(fragmentShader));
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
    console.error('Shader program linking failed:', gl.getProgramInfoLog(program));
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

// Render boids using WebGL
const renderBoidsWebGL = (
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  trailProgram: WebGLProgram,
  state: BoidsState,
  colorPalette: string[]
) => {
  const { boids, canvasWidth, canvasHeight, particleType, showPerceptionRadius } = state;
  
  if (boids.length === 0) return;
  
  // Create projection matrix (converts to clip space)
  const projectionMatrix = [
    2 / canvasWidth, 0, 0, 0,
    0, -2 / canvasHeight, 0, 0,
    0, 0, 1, 0,
    -1, 1, 0, 1
  ];
  
  // Clear the canvas
  gl.viewport(0, 0, canvasWidth, canvasHeight);
  gl.clear(gl.COLOR_BUFFER_BIT);
  
  // Draw trails if needed
  if (particleType === 'trail') {
    gl.useProgram(trailProgram);
    
    // Set projection matrix uniform
    const projectionMatrixLocation = gl.getUniformLocation(trailProgram, 'uProjectionMatrix');
    gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);
    
    // Set color uniform
    const colorLocation = gl.getUniformLocation(trailProgram, 'uColor');
    
    // For each boid, draw its trail
    for (let i = 0; i < boids.length; i++) {
      const boid = boids[i];
      const { history } = boid;
      
      if (history.length < 2) continue;
      
      // Get a consistent color for this boid
      const color = parseColor(colorPalette[boid.id % colorPalette.length]);
      gl.uniform4f(colorLocation, color[0]/255, color[1]/255, color[2]/255, 0.6);
      
      // Create trail vertices and ages
      const vertices = new Float32Array(history.length * 2);
      const ages = new Float32Array(history.length);
      
      for (let j = 0; j < history.length; j++) {
        vertices[j * 2] = history[j].x;
        vertices[j * 2 + 1] = history[j].y;
        ages[j] = j / (history.length - 1); // 0 to 1
      }
      
      // Create and bind vertex buffer
      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      
      // Set position attribute
      const positionLocation = gl.getAttribLocation(trailProgram, 'aPosition');
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      
      // Create and bind age buffer
      const ageBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, ageBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, ages, gl.STATIC_DRAW);
      
      // Set age attribute
      const ageLocation = gl.getAttribLocation(trailProgram, 'aAge');
      gl.enableVertexAttribArray(ageLocation);
      gl.vertexAttribPointer(ageLocation, 1, gl.FLOAT, false, 0, 0);
      
      // Draw the trail as a line strip
      gl.drawArrays(gl.LINE_STRIP, 0, history.length);
      
      // Clean up
      gl.disableVertexAttribArray(positionLocation);
      gl.disableVertexAttribArray(ageLocation);
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(ageBuffer);
    }
  }
  
  // Draw boids
  gl.useProgram(program);
  
  // Set uniforms
  const projectionMatrixLocation = gl.getUniformLocation(program, 'uProjectionMatrix');
  gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);
  
  const colorLocation = gl.getUniformLocation(program, 'uColor');
  const sizeLocation = gl.getUniformLocation(program, 'uSize');
  const particleTypeLocation = gl.getUniformLocation(program, 'uParticleType');
  
  // Set particle type for the shader
  let particleTypeValue = 0; // Default: disk
  switch (particleType) {
    case 'disk': particleTypeValue = 0; break;
    case 'dot': particleTypeValue = 1; break;
    case 'arrow': particleTypeValue = 2; break;
    case 'trail': particleTypeValue = 1; break; // For trail, we draw dots for the head
  }
  gl.uniform1i(particleTypeLocation, particleTypeValue);
  
  // Create arrays for boid data
  const positions = new Float32Array(boids.length * 2);
  const velocities = new Float32Array(boids.length * 2);
  const alphas = new Float32Array(boids.length);
  
  // Fill arrays with boid data
  for (let i = 0; i < boids.length; i++) {
    const boid = boids[i];
    positions[i * 2] = boid.position.x;
    positions[i * 2 + 1] = boid.position.y;
    velocities[i * 2] = boid.velocity.x;
    velocities[i * 2 + 1] = boid.velocity.y;
    alphas[i] = 0.8;
  }
  
  // Create and bind position buffer
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  
  // Set position attribute
  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  
  // Create and bind velocity buffer
  const velocityBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, velocityBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, velocities, gl.STATIC_DRAW);
  
  // Set velocity attribute
  const velocityLocation = gl.getAttribLocation(program, 'aVelocity');
  gl.enableVertexAttribArray(velocityLocation);
  gl.vertexAttribPointer(velocityLocation, 2, gl.FLOAT, false, 0, 0);
  
  // Create and bind alpha buffer
  const alphaBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, alphas, gl.STATIC_DRAW);
  
  // Set alpha attribute
  const alphaLocation = gl.getAttribLocation(program, 'aAlpha');
  gl.enableVertexAttribArray(alphaLocation);
  gl.vertexAttribPointer(alphaLocation, 1, gl.FLOAT, false, 0, 0);
  
  // Set point size based on particle type
  let pointSize = 10;
  switch (particleType) {
    case 'disk': pointSize = 10; break;
    case 'dot': pointSize = 4; break;
    case 'arrow': pointSize = 12; break;
    case 'trail': pointSize = 4; break;
  }
  gl.uniform1f(sizeLocation, pointSize);
  
  // For each distinct color, draw the corresponding boids
  for (let colorIndex = 0; colorIndex < colorPalette.length; colorIndex++) {
    const color = parseColor(colorPalette[colorIndex]);
    gl.uniform4f(colorLocation, color[0]/255, color[1]/255, color[2]/255, 1.0);
    
    // Draw points for boids with the current color
    const indices = [];
    for (let i = 0; i < boids.length; i++) {
      if (i % colorPalette.length === colorIndex) {
        indices.push(i);
      }
    }
    
    if (indices.length === 0) continue;
    
    // Draw the boids
    for (const index of indices) {
      gl.drawArrays(gl.POINTS, index, 1);
    }
  }
  
  // Clean up
  gl.disableVertexAttribArray(positionLocation);
  gl.disableVertexAttribArray(velocityLocation);
  gl.disableVertexAttribArray(alphaLocation);
  gl.deleteBuffer(positionBuffer);
  gl.deleteBuffer(velocityBuffer);
  gl.deleteBuffer(alphaBuffer);
  
  // Draw perception radius if needed
  if (showPerceptionRadius) {
    drawPerceptionRadiusWebGL(
      gl, 
      state.boids,
      state.parameters.perceptionRadius,
      projectionMatrix
    );
  }
};

// Draw perception radius in WebGL
const drawPerceptionRadiusWebGL = (
  gl: WebGLRenderingContext,
  boids: Boid[],
  radius: number,
  projectionMatrix: number[]
) => {
  // Create a simple shader program for the circles
  const vertexShaderSource = `
    attribute vec2 aPosition;
    uniform mat4 uProjectionMatrix;
    void main() {
      gl_Position = uProjectionMatrix * vec4(aPosition, 0.0, 1.0);
    }
  `;
  
  const fragmentShaderSource = `
    precision mediump float;
    uniform vec4 uColor;
    void main() {
      gl_FragColor = uColor;
    }
  `;
  
  const program = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
  if (!program) return;
  
  gl.useProgram(program);
  
  // Set uniforms
  const projectionMatrixLocation = gl.getUniformLocation(program, 'uProjectionMatrix');
  gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);
  
  const colorLocation = gl.getUniformLocation(program, 'uColor');
  gl.uniform4f(colorLocation, 0.8, 0.8, 0.9, 0.15);
  
  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  
  // For each boid, draw its perception radius
  for (const boid of boids) {
    const { position } = boid;
    
    // Create circle vertices
    const segments = 32;
    const vertices = new Float32Array(segments * 2);
    
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      vertices[i * 2] = position.x + Math.cos(angle) * radius;
      vertices[i * 2 + 1] = position.y + Math.sin(angle) * radius;
    }
    
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    gl.drawArrays(gl.LINE_LOOP, 0, segments);
    gl.deleteBuffer(vertexBuffer);
  }
  
  gl.disableVertexAttribArray(positionLocation);
  gl.deleteProgram(program);
};

// Fallback method for rendering with Canvas2D
const renderBoidsCanvas2D = (
  canvas: HTMLCanvasElement,
  state: BoidsState,
  colorPalette: string[]
) => {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  
  const { boids, canvasWidth, canvasHeight, particleType, showPerceptionRadius, parameters } = state;
  
  // Set better rendering quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Clear the canvas with a dark background
  ctx.fillStyle = '#0f1215';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Render each boid
  for (const boid of boids) {
    // Get a consistent color for this boid based on its id
    const color = colorPalette[boid.id % colorPalette.length];
    renderBoid(ctx, boid, particleType, parameters.perceptionRadius, showPerceptionRadius, color);
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

// Helper function to render a single boid with enhanced visuals (Canvas2D fallback)
const renderBoid = (
  ctx: CanvasRenderingContext2D,
  boid: Boid,
  particleType: string,
  perceptionRadius: number,
  showPerceptionRadius: boolean,
  color: string
) => {
  const { position, velocity, history } = boid;
  
  // Save the current context state
  ctx.save();
  
  // Calculate velocity magnitude for scaling effects
  const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
  
  // Calculate direction angle for arrow style
  const angle = Math.atan2(velocity.y, velocity.x);
  
  // Create a semi-transparent version of the color for effects
  const colorAlpha = color.replace('rgb', 'rgba').replace(')', ', 0.8)');
  const colorFaint = color.replace('rgb', 'rgba').replace(')', ', 0.4)');
  
  // Draw perception radius if enabled
  if (showPerceptionRadius) {
    ctx.beginPath();
    ctx.arc(position.x, position.y, perceptionRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200, 200, 230, 0.15)';
    ctx.stroke();
  }
  
  // Render based on particle type
  switch (particleType) {
    case 'disk':
      // Draw a glowing disk
      const glowRadius = 5 + speed * 0.5;
      
      // Outer glow
      const gradient = ctx.createRadialGradient(
        position.x, position.y, 0,
        position.x, position.y, glowRadius * 2
      );
      gradient.addColorStop(0, colorAlpha);
      gradient.addColorStop(0.5, colorFaint);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      ctx.beginPath();
      ctx.arc(position.x, position.y, glowRadius * 2, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Inner solid circle
      ctx.beginPath();
      ctx.arc(position.x, position.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      break;
      
    case 'dot':
      ctx.beginPath();
      ctx.arc(position.x, position.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      break;
      
    case 'arrow':
      ctx.translate(position.x, position.y);
      ctx.rotate(angle);
      
      // Draw arrow with size based on speed
      const arrowSize = 4 + speed * 0.5;
      
      // Draw arrow
      ctx.beginPath();
      ctx.moveTo(arrowSize * 2, 0);
      ctx.lineTo(-arrowSize, arrowSize);
      ctx.lineTo(-arrowSize * 0.5, 0);
      ctx.lineTo(-arrowSize, -arrowSize);
      ctx.closePath();
      
      // Create gradient for arrow
      const arrowGradient = ctx.createLinearGradient(-arrowSize, 0, arrowSize * 2, 0);
      arrowGradient.addColorStop(0, colorFaint);
      arrowGradient.addColorStop(1, color);
      
      ctx.fillStyle = arrowGradient;
      ctx.fill();
      
      // Add an outline for better visibility
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
      
    case 'trail':
      // Draw trail with fading effect
      if (history.length > 1) {
        ctx.beginPath();
        ctx.moveTo(history[0].x, history[0].y);
        
        for (let i = 1; i < history.length; i++) {
          ctx.lineTo(history[i].x, history[i].y);
        }
        
        // Connect to current position
        ctx.lineTo(position.x, position.y);
        
        // Create gradient along path
        const pathLength = history.length;
        const gradient = ctx.createLinearGradient(
          history[0].x, history[0].y,
          position.x, position.y
        );
        
        gradient.addColorStop(0, 'rgba(30, 30, 50, 0)');
        gradient.addColorStop(0.5, colorFaint);
        gradient.addColorStop(1, color);
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      
      // Draw dot at current position
      ctx.beginPath();
      ctx.arc(position.x, position.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      break;
  }
  
  // Restore the context state
  ctx.restore();
}; 