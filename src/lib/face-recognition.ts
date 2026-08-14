// face-api.js bundles @tensorflow/tfjs which calls bare `require("util")`
// at module init — that throws ReferenceError in the Cloudflare Worker SSR
// runtime and crashes every page. We MUST load it lazily, only in the browser.

const MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

type FaceApi = typeof import("face-api.js");

let faceapiPromise: Promise<FaceApi> | null = null;
let loadingPromise: Promise<void> | null = null;

async function getFaceApi(): Promise<FaceApi> {
  if (typeof window === "undefined") {
    throw new Error("face-api.js is browser-only");
  }
  if (!faceapiPromise) {
    faceapiPromise = import("face-api.js");
  }
  return faceapiPromise;
}

export async function ensureFaceModels(): Promise<void> {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const faceapi = await getFaceApi();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
  })();
  return loadingPromise;
}

export async function detectDescriptor(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<Float32Array | null> {
  await ensureFaceModels();
  const faceapi = await getFaceApi();
  const result = await faceapi
    .detectSingleFace(
      input,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }),
    )
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  return result?.descriptor ?? null;
}

export function euclidean(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = (a[i] as number) - (b[i] as number);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export const FACE_MATCH_THRESHOLD = 0.55;
