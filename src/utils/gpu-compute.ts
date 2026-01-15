/**
 * GPU Compute Module for Boids Simulation
 * 
 * This module ONLY accelerates the simulation computation (flocking algorithm).
 * It does NOT handle rendering - that's still done by BoidsCanvas.
 * 
 * The GPU computes: positions, velocities, accelerations
 * Results are read back to update the BoidsState for the existing renderer.
 */

import { Boid, BoidsState } from './boids';

// WebGL2 Transform Feedback Shader for boids simulation
const COMPUTE_VERTEX_SHADER = `#version 300 es
precision highp float;

// Input attributes (current state)
in vec2 aPosition;
in vec2 aVelocity;

// Output (transform feedback) - new state
out vec2 vNewPosition;
out vec2 vNewVelocity;
out vec2 vNewAcceleration;

// Simulation parameters
uniform float uAlignmentForce;
uniform float uCohesionForce;
uniform float uSeparationForce;
uniform float uPerceptionRadius;
uniform float uMaxSpeed;
uniform float uMaxForce;
uniform float uNoiseStrength;
uniform float uCanvasWidth;
uniform float uCanvasHeight;
uniform float uAttractionForce;
uniform float uAttractionX;
uniform float uAttractionY;
uniform float uIsAttracting;
uniform float uAttractionMode; // 0 = off, 1 = attract, -1 = repel
uniform int uNumBoids;
uniform float uTime;

// Texture containing all boid data for neighbor lookup
uniform sampler2D uPositionTexture;
uniform sampler2D uVelocityTexture;
uniform int uTextureSize;

vec2 getBoidPosition(int index) {
  int x = index % uTextureSize;
  int y = index / uTextureSize;
  return texelFetch(uPositionTexture, ivec2(x, y), 0).xy;
}

vec2 getBoidVelocity(int index) {
  int x = index % uTextureSize;
  int y = index / uTextureSize;
  return texelFetch(uVelocityTexture, ivec2(x, y), 0).xy;
}

vec2 limit(vec2 v, float max) {
  float mag = length(v);
  if (mag > max && mag > 0.0) {
    return (v / mag) * max;
  }
  return v;
}

void main() {
  int boidIndex = gl_VertexID;
  vec2 pos = aPosition;
  vec2 vel = aVelocity;
  
  float perceptionSq = uPerceptionRadius * uPerceptionRadius;
  
  // Accumulate flocking forces in single pass
  vec2 avgVel = vec2(0.0);
  vec2 avgPos = vec2(0.0);
  vec2 separation = vec2(0.0);
  int neighborCount = 0;
  
  for (int i = 0; i < uNumBoids; i++) {
    if (i == boidIndex) continue;
    
    vec2 otherPos = getBoidPosition(i);
    vec2 diff = pos - otherPos;
    float distSq = dot(diff, diff);
    
    if (distSq < perceptionSq && distSq > 0.0) {
      vec2 otherVel = getBoidVelocity(i);
      avgVel += otherVel;
      avgPos += otherPos;
      
      float dist = sqrt(distSq);
      separation += diff / dist;
      neighborCount++;
    }
  }
  
  vec2 acceleration = vec2(0.0);
  
  if (neighborCount > 0) {
    float n = float(neighborCount);
    float currentSpeed = length(vel);
    float targetSpeed = min(uMaxSpeed, max(0.25 * uMaxSpeed, currentSpeed));
    
    // Alignment
    vec2 alignForce = avgVel / n;
    if (length(alignForce) > 0.0001) {
      alignForce = normalize(alignForce) * targetSpeed - vel;
      alignForce = limit(alignForce, uMaxForce) * uAlignmentForce;
    }
    
    // Cohesion
    vec2 cohesionForce = (avgPos / n) - pos;
    if (length(cohesionForce) > 0.0001) {
      cohesionForce = normalize(cohesionForce) * targetSpeed - vel;
      cohesionForce = limit(cohesionForce, uMaxForce) * uCohesionForce;
    }
    
    // Separation
    vec2 sepForce = separation / n;
    if (length(sepForce) > 0.0001) {
      sepForce = normalize(sepForce) * targetSpeed - vel;
      sepForce = limit(sepForce, uMaxForce) * uSeparationForce;
    }
    
    acceleration = alignForce + cohesionForce + sepForce;
  }
  
  // Cursor attraction/repulsion
  if (uAttractionMode != 0.0) {
    vec2 target = vec2(uAttractionX, uAttractionY);
    vec2 toTarget = target - pos;
    float dist = length(toTarget);
    
    if (dist > 0.0) {
      float falloff = 1.0 / (1.0 + dist / 250.0);
      float crowdDamp = 1.0 / (1.0 + float(neighborCount) / 6.0);
      float boost = uIsAttracting > 0.5 ? 10.0 : 1.0;
      
      vec2 desired = normalize(toTarget) * uMaxSpeed;
      vec2 steer = desired - vel;
      steer = limit(steer, uMaxForce * 0.6);
      steer *= uAttractionForce * falloff * crowdDamp * uAttractionMode * boost;
      
      acceleration += steer;
    }
  }
  
  // Add noise
  if (uNoiseStrength > 0.0) {
    float angle = fract(sin(float(boidIndex) * 12.9898 + uTime) * 43758.5453) * 6.28318;
    float noiseMag = uMaxForce * uNoiseStrength;
    acceleration += vec2(cos(angle), sin(angle)) * noiseMag;
  }
  
  // Update velocity
  vel += acceleration;
  vel = limit(vel, uMaxSpeed);
  
  // Update position
  pos += vel;
  
  // Wrap edges (will be corrected on CPU for proper tail handling)
  if (pos.x < 0.0) pos.x += uCanvasWidth;
  if (pos.x > uCanvasWidth) pos.x -= uCanvasWidth;
  if (pos.y < 0.0) pos.y += uCanvasHeight;
  if (pos.y > uCanvasHeight) pos.y -= uCanvasHeight;
  
  // Output
  vNewPosition = pos;
  vNewVelocity = vel;
  vNewAcceleration = acceleration;
  
  gl_Position = vec4(0.0);
}
`;

const COMPUTE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.0);
}
`;

export interface GPUComputeContext {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uniforms: { [key: string]: WebGLUniformLocation | null };
  
  // Double-buffered position/velocity buffers
  posBuffers: [WebGLBuffer, WebGLBuffer];
  velBuffers: [WebGLBuffer, WebGLBuffer];
  accelBuffers: [WebGLBuffer, WebGLBuffer];
  
  // Transform feedbacks
  transformFeedbacks: [WebGLTransformFeedback, WebGLTransformFeedback];
  
  // VAOs for input binding
  vaos: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  
  // Textures for neighbor lookup
  posTexture: WebGLTexture;
  velTexture: WebGLTexture;
  textureSize: number;
  
  // State
  currentIdx: number;
  numBoids: number;
  
  // CPU readback buffers
  positionsReadback: Float32Array;
  velocitiesReadback: Float32Array;
  accelerationsReadback: Float32Array;
  
  // Pre-allocated arrays to avoid GC pressure
  texDataBuffer: Float32Array;
  uploadPositions: Float32Array;
  uploadVelocities: Float32Array;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, COMPUTE_VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, COMPUTE_FRAGMENT_SHADER);
  
  if (!vertexShader || !fragmentShader) return null;
  
  const program = gl.createProgram();
  if (!program) return null;
  
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  
  // Specify transform feedback outputs BEFORE linking
  gl.transformFeedbackVaryings(
    program,
    ['vNewPosition', 'vNewVelocity', 'vNewAcceleration'],
    gl.SEPARATE_ATTRIBS
  );
  
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  
  return program;
}

/**
 * Initialize GPU compute context
 */
export function initGPUCompute(canvas: HTMLCanvasElement, maxBoids: number): GPUComputeContext | null {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  
  if (!gl) {
    console.warn('WebGL2 not available for GPU compute');
    return null;
  }
  
  const program = createProgram(gl);
  if (!program) return null;
  
  // Get uniform locations
  const uniforms: { [key: string]: WebGLUniformLocation | null } = {};
  const uniformNames = [
    'uAlignmentForce', 'uCohesionForce', 'uSeparationForce',
    'uPerceptionRadius', 'uMaxSpeed', 'uMaxForce', 'uNoiseStrength',
    'uCanvasWidth', 'uCanvasHeight',
    'uAttractionForce', 'uAttractionX', 'uAttractionY', 'uIsAttracting', 'uAttractionMode',
    'uNumBoids', 'uTime',
    'uPositionTexture', 'uVelocityTexture', 'uTextureSize'
  ];
  
  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  
  // Create double-buffered buffers
  const posBuffers: [WebGLBuffer, WebGLBuffer] = [
    gl.createBuffer()!,
    gl.createBuffer()!
  ];
  const velBuffers: [WebGLBuffer, WebGLBuffer] = [
    gl.createBuffer()!,
    gl.createBuffer()!
  ];
  const accelBuffers: [WebGLBuffer, WebGLBuffer] = [
    gl.createBuffer()!,
    gl.createBuffer()!
  ];
  
  // Allocate buffer storage
  const bufferSize = maxBoids * 2 * 4; // vec2 * float32
  for (let i = 0; i < 2; i++) {
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffers[i]);
    gl.bufferData(gl.ARRAY_BUFFER, bufferSize, gl.DYNAMIC_COPY);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, velBuffers[i]);
    gl.bufferData(gl.ARRAY_BUFFER, bufferSize, gl.DYNAMIC_COPY);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, accelBuffers[i]);
    gl.bufferData(gl.ARRAY_BUFFER, bufferSize, gl.DYNAMIC_COPY);
  }
  
  // Create transform feedbacks
  const transformFeedbacks: [WebGLTransformFeedback, WebGLTransformFeedback] = [
    gl.createTransformFeedback()!,
    gl.createTransformFeedback()!
  ];
  
  // Bind output buffers to transform feedbacks
  for (let i = 0; i < 2; i++) {
    const writeIdx = (i + 1) % 2;
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, transformFeedbacks[i]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, posBuffers[writeIdx]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, velBuffers[writeIdx]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 2, accelBuffers[writeIdx]);
  }
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  
  // Create VAOs for input binding
  const vaos: [WebGLVertexArrayObject, WebGLVertexArrayObject] = [
    gl.createVertexArray()!,
    gl.createVertexArray()!
  ];
  
  const posLoc = gl.getAttribLocation(program, 'aPosition');
  const velLoc = gl.getAttribLocation(program, 'aVelocity');
  
  for (let i = 0; i < 2; i++) {
    gl.bindVertexArray(vaos[i]);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffers[i]);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, velBuffers[i]);
    gl.enableVertexAttribArray(velLoc);
    gl.vertexAttribPointer(velLoc, 2, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  
  // Create textures for neighbor lookup
  const textureSize = Math.ceil(Math.sqrt(maxBoids));
  
  const posTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, posTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, textureSize, textureSize, 0, gl.RG, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  const velTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, velTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, textureSize, textureSize, 0, gl.RG, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  gl.bindTexture(gl.TEXTURE_2D, null);
  
  console.log('GPU Compute initialized for boids simulation');
  
  return {
    gl,
    program,
    uniforms,
    posBuffers,
    velBuffers,
    accelBuffers,
    transformFeedbacks,
    vaos,
    posTexture,
    velTexture,
    textureSize,
    currentIdx: 0,
    numBoids: 0,
    positionsReadback: new Float32Array(maxBoids * 2),
    velocitiesReadback: new Float32Array(maxBoids * 2),
    accelerationsReadback: new Float32Array(maxBoids * 2),
    // Pre-allocated arrays to avoid GC pressure
    texDataBuffer: new Float32Array(textureSize * textureSize * 2),
    uploadPositions: new Float32Array(maxBoids * 2),
    uploadVelocities: new Float32Array(maxBoids * 2),
  };
}

/**
 * Upload boid data to GPU buffers
 */
export function uploadBoidsToGPU(ctx: GPUComputeContext, boids: Boid[]): void {
  const gl = ctx.gl;
  const numBoids = boids.length;
  ctx.numBoids = numBoids;
  
  // Use pre-allocated arrays to avoid GC pressure
  const positions = ctx.uploadPositions;
  const velocities = ctx.uploadVelocities;
  
  for (let i = 0; i < numBoids; i++) {
    const boid = boids[i];
    positions[i * 2] = boid.position.x;
    positions[i * 2 + 1] = boid.position.y;
    velocities[i * 2] = boid.velocity.x;
    velocities[i * 2 + 1] = boid.velocity.y;
  }
  
  // Upload to current buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.posBuffers[ctx.currentIdx]);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions.subarray(0, numBoids * 2));
  
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.velBuffers[ctx.currentIdx]);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, velocities.subarray(0, numBoids * 2));
  
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  
  // Use pre-allocated texData buffer
  const texData = ctx.texDataBuffer;
  texData.fill(0);
  texData.set(positions.subarray(0, numBoids * 2));
  
  gl.bindTexture(gl.TEXTURE_2D, ctx.posTexture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ctx.textureSize, ctx.textureSize, gl.RG, gl.FLOAT, texData);
  
  texData.fill(0);
  texData.set(velocities.subarray(0, numBoids * 2));
  
  gl.bindTexture(gl.TEXTURE_2D, ctx.velTexture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ctx.textureSize, ctx.textureSize, gl.RG, gl.FLOAT, texData);
  
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Run one simulation step on GPU and read back results
 */
export function runGPUSimulation(
  ctx: GPUComputeContext,
  state: BoidsState,
  time: number
): void {
  const gl = ctx.gl;
  const params = state.parameters;
  const numBoids = ctx.numBoids;
  
  if (numBoids === 0) return;
  
  const readIdx = ctx.currentIdx;
  const writeIdx = (ctx.currentIdx + 1) % 2;
  
  // First, update textures with current positions/velocities for neighbor lookup
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.posBuffers[readIdx]);
  gl.getBufferSubData(gl.ARRAY_BUFFER, 0, ctx.positionsReadback, 0, numBoids * 2);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.velBuffers[readIdx]);
  gl.getBufferSubData(gl.ARRAY_BUFFER, 0, ctx.velocitiesReadback, 0, numBoids * 2);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  
  // Update textures using pre-allocated buffer
  const texData = ctx.texDataBuffer;
  texData.fill(0);
  texData.set(ctx.positionsReadback.subarray(0, numBoids * 2));
  
  gl.bindTexture(gl.TEXTURE_2D, ctx.posTexture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ctx.textureSize, ctx.textureSize, gl.RG, gl.FLOAT, texData);
  
  texData.fill(0);
  texData.set(ctx.velocitiesReadback.subarray(0, numBoids * 2));
  
  gl.bindTexture(gl.TEXTURE_2D, ctx.velTexture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ctx.textureSize, ctx.textureSize, gl.RG, gl.FLOAT, texData);
  
  // Use compute program
  gl.useProgram(ctx.program);
  
  // Set uniforms
  const u = ctx.uniforms;
  gl.uniform1f(u.uAlignmentForce, params.alignmentForce);
  gl.uniform1f(u.uCohesionForce, params.cohesionForce);
  gl.uniform1f(u.uSeparationForce, params.separationForce);
  gl.uniform1f(u.uPerceptionRadius, params.perceptionRadius);
  gl.uniform1f(u.uMaxSpeed, params.maxSpeed);
  gl.uniform1f(u.uMaxForce, params.maxForce);
  gl.uniform1f(u.uNoiseStrength, params.noiseStrength);
  gl.uniform1f(u.uCanvasWidth, state.canvasWidth);
  gl.uniform1f(u.uCanvasHeight, state.canvasHeight);
  gl.uniform1f(u.uAttractionForce, params.attractionForce);
  gl.uniform1f(u.uAttractionX, state.cursorPosition?.x ?? 0);
  gl.uniform1f(u.uAttractionY, state.cursorPosition?.y ?? 0);
  gl.uniform1f(u.uIsAttracting, state.isAttracting ? 1.0 : 0.0);
  
  let attractionMode = 0;
  if (params.attractionMode === 'attract') attractionMode = 1;
  else if (params.attractionMode === 'repel') attractionMode = -1;
  gl.uniform1f(u.uAttractionMode, attractionMode);
  
  gl.uniform1i(u.uNumBoids, numBoids);
  gl.uniform1f(u.uTime, time);
  gl.uniform1i(u.uTextureSize, ctx.textureSize);
  
  // Bind textures
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, ctx.posTexture);
  gl.uniform1i(u.uPositionTexture, 0);
  
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, ctx.velTexture);
  gl.uniform1i(u.uVelocityTexture, 1);
  
  // Bind input VAO
  gl.bindVertexArray(ctx.vaos[readIdx]);
  
  // CRITICAL: Unbind all buffers before transform feedback
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
  
  // Bind transform feedback for output
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, ctx.transformFeedbacks[readIdx]);
  
  // Explicitly bind output buffers
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, ctx.posBuffers[writeIdx]);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 1, ctx.velBuffers[writeIdx]);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 2, ctx.accelBuffers[writeIdx]);
  
  // Disable rasterization
  gl.enable(gl.RASTERIZER_DISCARD);
  
  // Run transform feedback
  gl.beginTransformFeedback(gl.POINTS);
  gl.drawArrays(gl.POINTS, 0, numBoids);
  gl.endTransformFeedback();
  
  // Re-enable rasterization
  gl.disable(gl.RASTERIZER_DISCARD);
  
  // Cleanup
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  gl.bindVertexArray(null);
  
  // Swap buffers
  ctx.currentIdx = writeIdx;
}

/**
 * Read back GPU results into the BoidsState
 */
export function readBackToState(ctx: GPUComputeContext, state: BoidsState): void {
  const gl = ctx.gl;
  const numBoids = Math.min(ctx.numBoids, state.boids.length);
  
  if (numBoids === 0) return;
  
  // Read back from current (just-written) buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.posBuffers[ctx.currentIdx]);
  gl.getBufferSubData(gl.ARRAY_BUFFER, 0, ctx.positionsReadback, 0, numBoids * 2);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.velBuffers[ctx.currentIdx]);
  gl.getBufferSubData(gl.ARRAY_BUFFER, 0, ctx.velocitiesReadback, 0, numBoids * 2);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, ctx.accelBuffers[ctx.currentIdx]);
  gl.getBufferSubData(gl.ARRAY_BUFFER, 0, ctx.accelerationsReadback, 0, numBoids * 2);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  
  // Update boids with GPU results
  for (let i = 0; i < numBoids; i++) {
    const boid = state.boids[i];
    
    // Store old position for tail
    const oldX = boid.position.x;
    const oldY = boid.position.y;
    
    // Update from GPU
    const newX = ctx.positionsReadback[i * 2];
    const newY = ctx.positionsReadback[i * 2 + 1];
    
    boid.position.x = newX;
    boid.position.y = newY;
    boid.velocity.x = ctx.velocitiesReadback[i * 2];
    boid.velocity.y = ctx.velocitiesReadback[i * 2 + 1];
    boid.acceleration.x = ctx.accelerationsReadback[i * 2];
    boid.acceleration.y = ctx.accelerationsReadback[i * 2 + 1];
    
    // Update tail (CPU-side for proper trail rendering)
    // Check if wrapped (large position change)
    const dx = Math.abs(newX - oldX);
    const dy = Math.abs(newY - oldY);
    const wrapped = dx > state.canvasWidth / 2 || dy > state.canvasHeight / 2;
    
    if (wrapped && boid.tailCapacity > 0) {
      // Insert NaN marker to break the trail
      boid.tailX[boid.tailHead] = Number.NaN;
      boid.tailY[boid.tailHead] = Number.NaN;
      boid.tailHead = (boid.tailHead + 1) % boid.tailCapacity;
      boid.tailCount = Math.min(boid.tailCount + 1, boid.tailCapacity);
    } else if (boid.tailCapacity > 0) {
      // Normal tail update
      boid.tailX[boid.tailHead] = oldX;
      boid.tailY[boid.tailHead] = oldY;
      boid.tailHead = (boid.tailHead + 1) % boid.tailCapacity;
      boid.tailCount = Math.min(boid.tailCount + 1, boid.tailCapacity);
    }
  }
}

/**
 * GPU-accelerated version of updateBoidsInPlace
 * This is a drop-in replacement that uses the GPU for simulation
 * but keeps all visual features intact by updating the same BoidsState
 */
export function updateBoidsGPU(
  ctx: GPUComputeContext,
  state: BoidsState,
  time: number
): void {
  if (!state.isRunning) return;
  
  // Upload current state if boid count changed
  if (ctx.numBoids !== state.boids.length) {
    uploadBoidsToGPU(ctx, state.boids);
  }
  
  // Run GPU simulation
  runGPUSimulation(ctx, state, time);
  
  // Read back results
  readBackToState(ctx, state);
}

/**
 * Cleanup GPU resources
 */
export function destroyGPUCompute(ctx: GPUComputeContext): void {
  const gl = ctx.gl;
  
  gl.deleteProgram(ctx.program);
  
  for (let i = 0; i < 2; i++) {
    gl.deleteBuffer(ctx.posBuffers[i]);
    gl.deleteBuffer(ctx.velBuffers[i]);
    gl.deleteBuffer(ctx.accelBuffers[i]);
    gl.deleteTransformFeedback(ctx.transformFeedbacks[i]);
    gl.deleteVertexArray(ctx.vaos[i]);
  }
  
  gl.deleteTexture(ctx.posTexture);
  gl.deleteTexture(ctx.velTexture);
}
