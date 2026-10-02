import { midiToFrequency, renderPluck } from './karplus'
import type { GuitarAudio } from './types'

const CROSSFADE_SECONDS = 0.005
const DAMP_SECONDS = 0.07
// An exponential release is 61 dB down after this many time constants.
const RELEASE_TIME_CONSTANTS = 7
// The audio thread can pick a release up late; stopping the source only well after it keeps a late one from being cut short.
const STOP_MARGIN_SECONDS = 0.1
const VOLUME_RAMP_SECONDS = 0.03
const SUSPEND_DELAY_MS = 200
// A pluck made while the clock wakes still sounds in time within this; older ones would burst out late.
const WAKE_GRACE_MS = 300
// Leaves room for six strings at full velocity ahead of the compressor's make-up gain.
const MASTER_HEADROOM = 0.5
const DEFAULT_VOLUME = 0.8

interface Graph {
  context: AudioContext
  master: GainNode
}

interface Voice {
  source: AudioBufferSourceNode
  gain: GainNode
}

interface PendingPluck {
  midi: number
  velocity: number
  requestedAt: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const masterGainFor = (volume: number) => MASTER_HEADROOM * volume ** 2

// Soft plucks are mellow, hard ones open the filter completely.
const toneCutoffFor = (midi: number, velocity: number, sampleRate: number) =>
  Math.min(sampleRate * 0.45, 2 * midiToFrequency(midi) + 600 * 2 ** (5 * velocity))

const whenIdle = (task: () => void) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(task, { timeout: 500 })
  else setTimeout(task, 30)
}

function holdGain(gain: AudioParam, time: number) {
  if (typeof gain.cancelAndHoldAtTime === 'function') {
    gain.cancelAndHoldAtTime(time)
  } else {
    gain.cancelScheduledValues(time)
    gain.setValueAtTime(gain.value, time)
  }
}

function createGraph(): Graph | null {
  if (typeof AudioContext !== 'function') return null
  const context = new AudioContext({ latencyHint: 'interactive' })
  const master = context.createGain()
  const compressor = context.createDynamicsCompressor()
  // Set so a single string passes untouched and only a hard multi-string strum is pulled down.
  compressor.threshold.value = -10
  compressor.knee.value = 8
  compressor.ratio.value = 8
  compressor.attack.value = 0.002
  compressor.release.value = 0.2
  master.connect(compressor).connect(context.destination)
  return { context, master }
}

export function createGuitarAudio(): GuitarAudio {
  const buffers = new Map<number, AudioBuffer>()
  const voices = new Map<number, Voice>()
  const pendingPlucks = new Map<number, PendingPluck>()
  const prewarmQueue = new Set<number>()
  let graph: Graph | null = null
  let volume = DEFAULT_VOLUME
  let unlocked = false
  let prewarming = false
  let suspendTimer: ReturnType<typeof setTimeout> | undefined

  function ensureGraph() {
    if (graph) return graph
    graph = createGraph()
    if (!graph) return null
    graph.master.gain.value = masterGainFor(volume)
    graph.context.addEventListener('statechange', onStateChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return graph
  }

  function onStateChange() {
    if (graph?.context.state !== 'running') {
      void resumeIfWanted()
      return
    }
    const waiting = [...pendingPlucks]
    pendingPlucks.clear()
    for (const [stringIndex, { midi, velocity, requestedAt }] of waiting) {
      if (performance.now() - requestedAt <= WAKE_GRACE_MS) pluck(stringIndex, midi, velocity)
    }
  }

  function resumeIfWanted() {
    const context = graph?.context
    if (!context || !unlocked || document.visibilityState !== 'visible') return Promise.resolve()
    if (context.state === 'running' || context.state === 'closed') return Promise.resolve()
    return context.resume().catch(() => {})
  }

  function onVisibilityChange() {
    clearTimeout(suspendTimer)
    if (document.visibilityState === 'visible') {
      void resumeIfWanted()
      return
    }
    dampAll()
    // Lets the releases finish before the clock stops, so nothing is left to sound on return.
    suspendTimer = setTimeout(() => void graph?.context.suspend().catch(() => {}), SUSPEND_DELAY_MS)
  }

  function bufferFor(context: AudioContext, midi: number) {
    let buffer = buffers.get(midi)
    if (!buffer) {
      const samples = renderPluck(midi, context.sampleRate)
      buffer = context.createBuffer(1, samples.length, context.sampleRate)
      buffer.copyToChannel(samples, 0)
      buffers.set(midi, buffer)
    }
    return buffer
  }

  function prewarmNext() {
    const context = graph?.context
    const [midi] = prewarmQueue
    if (!context || midi === undefined) {
      prewarming = false
      return
    }
    prewarmQueue.delete(midi)
    bufferFor(context, midi)
    whenIdle(prewarmNext)
  }

  function release(voice: Voice, time: number, seconds: number) {
    voice.gain.gain.setTargetAtTime(0, time, seconds / RELEASE_TIME_CONSTANTS)
    voice.source.stop(time + seconds + STOP_MARGIN_SECONDS)
  }

  function startVoice({ context, master }: Graph, stringIndex: number, midi: number, velocity: number) {
    const source = context.createBufferSource()
    const tone = context.createBiquadFilter()
    const gain = context.createGain()
    const voice = { source, gain }

    source.buffer = bufferFor(context, midi)
    tone.type = 'lowpass'
    tone.Q.value = -3
    tone.frequency.value = toneCutoffFor(midi, velocity, context.sampleRate)
    gain.gain.value = velocity ** 1.3
    source.connect(tone).connect(gain).connect(master)
    source.onended = () => {
      source.disconnect()
      tone.disconnect()
      gain.disconnect()
      if (voices.get(stringIndex) === voice) voices.delete(stringIndex)
    }
    source.start()
    return voice
  }

  function pluck(stringIndex: number, midi: number, velocity: number) {
    if (!graph || !Number.isFinite(midi + velocity)) return
    const { context } = graph
    if (context.state !== 'running') {
      pendingPlucks.set(stringIndex, { midi, velocity, requestedAt: performance.now() })
      void resumeIfWanted()
      return
    }
    const previous = voices.get(stringIndex)
    if (previous) release(previous, context.currentTime, CROSSFADE_SECONDS)
    voices.set(stringIndex, startVoice(graph, stringIndex, midi, clamp01(velocity)))
  }

  function damp(stringIndex: number) {
    pendingPlucks.delete(stringIndex)
    const voice = voices.get(stringIndex)
    if (!graph || !voice) return
    voices.delete(stringIndex)
    release(voice, graph.context.currentTime, DAMP_SECONDS)
  }

  function dampAll() {
    pendingPlucks.clear()
    for (const stringIndex of [...voices.keys()]) damp(stringIndex)
  }

  return {
    async unlock() {
      if (!ensureGraph()) return
      unlocked = true
      await resumeIfWanted()
    },
    pluck,
    damp,
    dampAll,
    setVolume(next) {
      volume = clamp01(next)
      if (!graph) return
      const now = graph.context.currentTime
      holdGain(graph.master.gain, now)
      // Chrome freezes setTargetAtTime on a node with silent input, so a change made between notes needs a ramp.
      graph.master.gain.linearRampToValueAtTime(masterGainFor(volume), now + VOLUME_RAMP_SECONDS)
    },
    prewarm(midis) {
      if (!ensureGraph()) return
      for (const midi of midis) if (Number.isFinite(midi) && !buffers.has(midi)) prewarmQueue.add(midi)
      if (prewarming || prewarmQueue.size === 0) return
      prewarming = true
      whenIdle(prewarmNext)
    },
  }
}
