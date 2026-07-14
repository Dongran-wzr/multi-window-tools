/**
 * Minimal WebGL 1.0 helpers for a single textured quad with custom shaders.
 * All shape warping happens in the fragment shader via UV remapping;
 * the vertex shader is a strict pass-through.
 */

export interface GLContext {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  uniforms: {
    u_texture: WebGLUniformLocation;
    u_time: WebGLUniformLocation;
    u_left: WebGLUniformLocation;
    u_right: WebGLUniformLocation;
    u_movementDir: WebGLUniformLocation;
    u_velocityPx: WebGLUniformLocation;
    u_texSize: WebGLUniformLocation;
    u_curveExp: WebGLUniformLocation;
  };
  attribs: {
    a_position: number;
    a_texCoord: number;
  };
}

// ── Full-screen quad (2 triangles) in Normalized Device Coordinates ──
// The quad covers the entire canvas. CSS handles positioning/scaling of the
// canvas element itself, so the shader always renders at full canvas size.
const QUAD_VERTICES = new Float32Array([
  // x, y,    u, v
  -1.0, -1.0,  0.0, 0.0, // bottom-left
   1.0, -1.0,  1.0, 0.0, // bottom-right
  -1.0,  1.0,  0.0, 1.0, // top-left

  -1.0,  1.0,  0.0, 1.0, // top-left
   1.0, -1.0,  1.0, 0.0, // bottom-right
   1.0,  1.0,  1.0, 1.0, // top-right
]);

const STRIDE = 4 * Float32Array.BYTES_PER_ELEMENT; // 4 floats per vertex

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function linkProgram(
  gl: WebGLRenderingContext,
  vert: WebGLShader,
  frag: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

/**
 * Initialize WebGL on the given canvas.
 * Returns the GL context object with resolved uniform and attribute locations,
 * or null if WebGL is unavailable.
 */
export function initGL(
  canvas: HTMLCanvasElement,
  vertSrc: string,
  fragSrc: string,
): GLContext | null {
  const gl = canvas.getContext("webgl", {
    premultipliedAlpha: false,
    alpha: true,
    antialias: false,
  });
  if (!gl) {
    console.warn("WebGL not available — falling back to CSS animation");
    return null;
  }

  try {
    // Compile shaders
    const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);

    // Link program
    const program = linkProgram(gl, vertShader, fragShader);

    // Clean up shader objects (already linked into program)
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    // Resolve uniforms
    const uniforms: GLContext["uniforms"] = {
      u_texture: gl.getUniformLocation(program, "u_texture")!,
      u_time: gl.getUniformLocation(program, "u_time")!,
      u_left: gl.getUniformLocation(program, "u_left")!,
      u_right: gl.getUniformLocation(program, "u_right")!,
      u_movementDir: gl.getUniformLocation(program, "u_movementDir")!,
      u_velocityPx: gl.getUniformLocation(program, "u_velocityPx")!,
      u_texSize: gl.getUniformLocation(program, "u_texSize")!,
      u_curveExp: gl.getUniformLocation(program, "u_curveExp")!,
    };

    // Resolve attributes
    const a_position = gl.getAttribLocation(program, "a_position");
    const a_texCoord = gl.getAttribLocation(program, "a_texCoord");

    // Create and populate vertex buffer
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

    // Set up attribute pointers
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, STRIDE, 0);

    gl.enableVertexAttribArray(a_texCoord);
    gl.vertexAttribPointer(a_texCoord, 2, gl.FLOAT, false, STRIDE, 2 * Float32Array.BYTES_PER_ELEMENT);

    // Use the program
    gl.useProgram(program);
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Enable blending for alpha
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return { gl, program, uniforms, attribs: { a_position, a_texCoord } };
  } catch (err) {
    console.warn("WebGL init failed — falling back to CSS animation:", err);
    return null;
  }
}

/**
 * Upload an image/canvas as texture unit 0.
 * Must be called after initGL.
 */
export function updateTexture(
  gl: WebGLRenderingContext,
  source: TexImageSource,
): void {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // NPOT texture support: clamp to edge, no mipmaps
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    source,
  );

  gl.uniform1i(gl.getUniformLocation(
    gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram,
    "u_texture",
  ), 0);
}

/** Render one frame. Must call after uniforms are set. */
export function drawFrame(gl: WebGLRenderingContext): void {
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
