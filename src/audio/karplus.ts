export interface PluckOptions {
  seed?: number
  /** Distance from the bridge to the pick, as a fraction of the string length. */
  pickPosition?: number
  /** Time for the fundamental to fall by 60 dB. */
  sustainSeconds?: number
}

const TAU = 2 * Math.PI
const LN_60_DB = Math.log(1000)
const ATTACK_SECONDS = 0.002
const FADE_SECONDS = 0.05
const LEVEL_WINDOW_SECONDS = 0.1
const TARGET_RMS = 0.3
const PEAK_CEILING = 0.98
const EXCITATION_CEILING_HZ = 12000
const PICK_WIDTH_HZ = 4500
const DEFAULT_PICK_POSITION = 0.18
const LEAD_IN_SAMPLES = 32

export const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

const lerp = (from: number, to: number, t: number) => from + (to - from) * Math.min(1, Math.max(0, t))

const sustainSecondsFor = (midi: number) => lerp(6, 2.2, (midi - 36) / 54)

// b in the string damping law 1/T60(f) = a + b·f²: wound strings shed highs faster than plain ones.
const highLossFor = (midi: number) => lerp(9e-8, 4e-8, (midi - 50) / 12)

// Above this corner the excitation falls 6 dB/octave, like the bridge force of an ideal pluck.
const excitationCornerHz = (midi: number) => 350 * 2 ** ((midi - 40) / 24)

// Equal RMS makes high notes sound louder than bass ones; lean about 1.5 dB/octave the other way.
const levelFor = (midi: number) => TARGET_RMS * 2 ** (-(midi - 40) / 48)

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Loop {
  delaySamples: number
  lowpassPole: number
  lowpassGain: number
  allpass: number
}

function designLoop(frequency: number, sampleRate: number, sustainSeconds: number, highLoss: number): Loop {
  const omega = (TAU * frequency) / sampleRate
  const period = sampleRate / frequency

  // One-pole lowpass whose per-period loss near DC matches b·f²: pole / (1 - pole)² = k.
  const k = (LN_60_DB * highLoss * sampleRate ** 2) / (2 * Math.PI ** 2 * frequency)
  const pole = (2 * k + 1 - Math.sqrt(4 * k + 1)) / (2 * k)
  const real = 1 - pole * Math.cos(omega)
  const imaginary = pole * Math.sin(omega)
  const lowpassMagnitude = (1 - pole) / Math.hypot(real, imaginary)
  const lowpassDelay = Math.atan2(imaginary, real) / omega

  const fundamentalGain = 10 ** (-3 / (frequency * sustainSeconds))
  const loopGain = Math.min(1, fundamentalGain / lowpassMagnitude)

  // Keep the allpass delay in [0.5, 1.5) so its coefficient stays small and its phase nearly linear.
  const delaySamples = Math.max(2, Math.floor(period - lowpassDelay - 0.5))
  const fraction = period - lowpassDelay - delaySamples
  const allpass = Math.sin(((1 - fraction) * omega) / 2) / Math.sin(((1 + fraction) * omega) / 2)

  return { delaySamples, lowpassPole: pole, lowpassGain: loopGain * (1 - pole), allpass }
}

// A noise burst with random phases but a fixed magnitude per harmonic, so every pitch gets the same timbre.
function fillExcitation(
  burst: Float64Array,
  midi: number,
  frequency: number,
  sampleRate: number,
  pickPosition: number,
  random: () => number,
) {
  const corner = excitationCornerHz(midi)
  const harmonics = Math.floor(Math.min(EXCITATION_CEILING_HZ, sampleRate * 0.45) / frequency)
  for (let harmonic = 1; harmonic <= harmonics; harmonic++) {
    const hz = harmonic * frequency
    const pickComb = Math.abs(Math.sin(Math.PI * harmonic * pickPosition))
    const tilt = 1 / Math.sqrt(1 + (hz / corner) ** 2)
    const pickWidth = 1 / (1 + (hz / PICK_WIDTH_HZ) ** 2)
    const amplitude = pickComb * tilt * pickWidth
    const phase = TAU * random()
    const step = (TAU * hz) / sampleRate
    const cos = Math.cos(step)
    const sin = Math.sin(step)
    let re = amplitude * Math.cos(phase)
    let im = amplitude * Math.sin(phase)
    for (let n = 0; n < burst.length; n++) {
      burst[n] = burst[n]! + re
      const rotated = re * cos - im * sin
      im = re * sin + im * cos
      re = rotated
    }
  }
}

// Feeds the burst round the damped, fractionally delayed loop and returns the peak magnitude it reached.
function circulate(burst: Float64Array, loop: Loop, samples: Float32Array) {
  const { lowpassPole, lowpassGain, allpass } = loop
  let lowpassed = 0
  let allpassInput = 0
  let allpassOutput = 0
  // Settling the filters on a lead-in keeps the waveform continuous when the first period wraps around.
  for (let n = 0; n < LEAD_IN_SAMPLES; n++) {
    lowpassed = lowpassGain * burst[n]! + lowpassPole * lowpassed
    allpassOutput = allpass * (lowpassed - allpassOutput) + allpassInput
    allpassInput = lowpassed
  }

  const line = burst.subarray(LEAD_IN_SAMPLES)
  const length = line.length
  let position = 0
  let peak = 0
  for (let n = 0; n < samples.length; n++) {
    const delayed = line[position]!
    samples[n] = delayed
    const magnitude = Math.abs(delayed)
    if (magnitude > peak) peak = magnitude
    lowpassed = lowpassGain * delayed + lowpassPole * lowpassed
    allpassOutput = allpass * (lowpassed - allpassOutput) + allpassInput
    allpassInput = lowpassed
    line[position] = allpassOutput
    position = position + 1 === length ? 0 : position + 1
  }
  return peak
}

function normalise(samples: Float32Array, sampleRate: number, level: number, peak: number) {
  if (peak === 0) return
  const window = Math.min(samples.length, Math.round(LEVEL_WINDOW_SECONDS * sampleRate))
  let squares = 0
  for (let n = 0; n < window; n++) squares += samples[n]! ** 2
  const gain = Math.min(level / Math.sqrt(squares / window), PEAK_CEILING / peak)
  for (let n = 0; n < samples.length; n++) samples[n] = samples[n]! * gain
}

// The attack lives in the buffer, not in a gain ramp, so it stays click-free however late the audio thread starts it.
function fadeEnds(samples: Float32Array, sampleRate: number) {
  const attack = Math.min(samples.length, Math.round(ATTACK_SECONDS * sampleRate))
  for (let n = 0; n < attack; n++) {
    samples[n] = samples[n]! * (0.5 - 0.5 * Math.cos((Math.PI * n) / attack))
  }
  const fade = Math.min(samples.length, Math.round(FADE_SECONDS * sampleRate))
  const start = samples.length - fade
  for (let n = 0; n < fade; n++) {
    samples[start + n] = samples[start + n]! * (0.5 + 0.5 * Math.cos((Math.PI * (n + 1)) / fade))
  }
  samples[samples.length - 1] = 0
}

export function renderPluck(midi: number, sampleRate: number, options: PluckOptions = {}) {
  const frequency = midiToFrequency(midi)
  const sustainSeconds = options.sustainSeconds ?? sustainSecondsFor(midi)
  const loop = designLoop(frequency, sampleRate, sustainSeconds, highLossFor(midi))

  const burst = new Float64Array(LEAD_IN_SAMPLES + loop.delaySamples)
  fillExcitation(
    burst,
    midi,
    frequency,
    sampleRate,
    options.pickPosition ?? DEFAULT_PICK_POSITION,
    mulberry32(options.seed ?? midi),
  )

  // By 0.85·T60 the fundamental is 51 dB down, quiet enough for the fade to finish the job.
  const samples = new Float32Array(Math.round(sustainSeconds * 0.85 * sampleRate))
  const peak = circulate(burst, loop, samples)
  normalise(samples, sampleRate, levelFor(midi), peak)
  fadeEnds(samples, sampleRate)
  return samples
}
