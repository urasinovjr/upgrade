import { Program, Renderer, Triangle } from "ogl";
import { inkDensity, parseColor } from "./inkPalette";
import { fragment, vertex } from "./inkWaterShader";

const dropCount = 8;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createInkWater(canvas: HTMLCanvasElement, ink: string) {
  const renderer = new Renderer({
    canvas,
    alpha: true,
    premultipliedAlpha: true,
    depth: false,
    antialias: false,
    powerPreference: "low-power",
  });
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);
  const drops: number[] = new Array(dropCount * 4).fill(0);
  let nextDrop = 0;
  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: [1, 1] },
      uText: { value: [0, 0, 0, 0] },
      uDrops: { value: drops },
      uInk: { value: parseColor(ink) },
      uPeak: { value: inkDensity.peak },
      uUnderText: { value: inkDensity.underText },
    },
  });
  const triangle = new Triangle(gl);

  function resize(width: number, height: number, scale: number) {
    renderer.dpr = scale;
    renderer.setSize(width, height);
    program.uniforms.uResolution.value = [width, height];
  }

  function setTextBox(box: Box) {
    program.uniforms.uText.value = [box.x, box.y, box.width, box.height];
  }

  function addDrop(x: number, y: number, time: number, strength: number) {
    drops.splice(nextDrop * 4, 4, x, y, time, strength);
    nextDrop = (nextDrop + 1) % dropCount;
  }

  function render(time: number) {
    program.uniforms.uTime.value = time;
    renderer.setViewport(renderer.width * renderer.dpr, renderer.height * renderer.dpr);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    triangle.draw({ program });
  }

  function destroy() {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { resize, setTextBox, addDrop, render, destroy };
}

export type InkWater = ReturnType<typeof createInkWater>;
