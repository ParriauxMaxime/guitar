import { describe, expect, it } from 'vitest'
import { midiToFrequency, mulberry32, renderPluck } from './karplus'

const SAMPLE_RATES = [44100, 48000]
const LOWEST_MIDI = 36
const HIGHEST_MIDI = 90

function autocorrelation(samples: Float32Array, start: number, length: number, lag: number) {
  let sum = 0
  for (let n = start; n < start + length; n++) sum += samples[n]! * samples[n + lag]!
  return sum
}

function peakLag(samples: Float32Array, start: number, length: number, centre: number, radius: number) {
  const from = Math.max(1, Math.round(centre - radius))
  const to = Math.round(centre + radius)
  let best = from
  let bestValue = -Infinity
  for (let lag = from; lag <= to; lag++) {
    const value = autocorrelation(samples, start, length, lag)
    if (value > bestValue) {
      best = lag
      bestValue = value
    }
  }
  const before = autocorrelation(samples, start, length, best - 1)
  const after = autocorrelation(samples, start, length, best + 1)
  return best + (0.5 * (before - after)) / (before - 2 * bestValue + after)
}

// Locates one period near the expected pitch, then refines on a lag many periods long to shrink the interpolation error.
function measureFrequency(samples: Float32Array, sampleRate: number, expected: number) {
  const start = Math.round(0.1 * sampleRate)
  const length = Math.round(0.4 * sampleRate)
  const roughPeriod = sampleRate / expected
  const period = peakLag(samples, start, length, roughPeriod, roughPeriod * 0.06)
  const periods = Math.max(1, Math.round((0.05 * sampleRate) / period))
  return (sampleRate * periods) / peakLag(samples, start, length, period * periods, period * 0.4)
}

const cents = (measured: number, expected: number) => 1200 * Math.log2(measured / expected)

function rms(samples: Float32Array, fromSeconds: number, toSeconds: number, sampleRate: number) {
  const from = Math.round(fromSeconds * sampleRate)
  const to = Math.round(toSeconds * sampleRate)
  let squares = 0
  for (let n = from; n < to; n++) squares += samples[n]! ** 2
  return Math.sqrt(squares / (to - from))
}

function largestStep(samples: Float32Array, from: number, to: number) {
  let largest = 0
  for (let n = from + 1; n <= to; n++) largest = Math.max(largest, Math.abs(samples[n]! - samples[n - 1]!))
  return largest
}

// Share of the signal's energy carried by sample-to-sample change: a cheap brightness measure.
function brightness(samples: Float32Array, fromSeconds: number, toSeconds: number, sampleRate: number) {
  const from = Math.round(fromSeconds * sampleRate)
  const to = Math.round(toSeconds * sampleRate)
  let differences = 0
  let squares = 0
  for (let n = from + 1; n < to; n++) {
    differences += (samples[n]! - samples[n - 1]!) ** 2
    squares += samples[n]! ** 2
  }
  return differences / squares
}

describe('mulberry32', () => {
  it('repeats the same sequence for the same seed', () => {
    const first = mulberry32(42)
    const second = mulberry32(42)
    for (let n = 0; n < 100; n++) expect(first()).toBe(second())
  })

  it('stays within [0, 1)', () => {
    const random = mulberry32(7)
    for (let n = 0; n < 1000; n++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('renderPluck', () => {
  for (const sampleRate of SAMPLE_RATES) {
    describe(`at ${sampleRate} Hz`, () => {
      it('is within 3 cents of every pitch from C2 to F#6', () => {
        let worst = 0
        for (let midi = LOWEST_MIDI; midi <= HIGHEST_MIDI; midi++) {
          const expected = midiToFrequency(midi)
          const error = cents(measureFrequency(renderPluck(midi, sampleRate), sampleRate, expected), expected)
          worst = Math.max(worst, Math.abs(error))
        }
        expect(worst).toBeLessThan(3)
      })

      it('produces finite samples that peak at or below 1, starting and ending at exact zero', () => {
        for (let midi = LOWEST_MIDI; midi <= HIGHEST_MIDI; midi++) {
          const samples = renderPluck(midi, sampleRate)
          let peak = 0
          let finite = true
          for (const sample of samples) {
            finite &&= Number.isFinite(sample)
            peak = Math.max(peak, Math.abs(sample))
          }
          expect(finite).toBe(true)
          expect(peak).toBeGreaterThan(0.2)
          expect(peak).toBeLessThanOrEqual(1)
          expect(Math.abs(samples[0]!)).toBe(0)
          expect(samples[samples.length - 1]).toBe(0)
          expect(Math.abs(samples[samples.length - 2]!)).toBeLessThan(1e-4)
        }
      })

      it('decays steadily', () => {
        for (const midi of [LOWEST_MIDI, 40, 52, 64, 76, HIGHEST_MIDI]) {
          const samples = renderPluck(midi, sampleRate)
          const seconds = samples.length / sampleRate
          const attack = rms(samples, 0, 0.1, sampleRate)
          const middle = rms(samples, seconds / 2, seconds / 2 + 0.1, sampleRate)
          const tail = rms(samples, seconds - 0.2, seconds - 0.1, sampleRate)
          expect(middle).toBeLessThan(attack * 0.2)
          expect(tail).toBeLessThan(middle * 0.2)
        }
      })

      it('loses its high harmonics faster than its fundamental', () => {
        for (const midi of [40, 52, 64]) {
          const samples = renderPluck(midi, sampleRate)
          expect(brightness(samples, 1, 1.2, sampleRate)).toBeLessThan(brightness(samples, 0, 0.2, sampleRate) * 0.5)
        }
      })

      it('stays smooth when the delay line first wraps around', () => {
        for (let midi = LOWEST_MIDI; midi <= 64; midi++) {
          const samples = renderPluck(midi, sampleRate)
          const period = Math.round(sampleRate / midiToFrequency(midi))
          const atWrap = largestStep(samples, period - 4, period + 4)
          const withinSecondPeriod = largestStep(samples, period + 4, 2 * period - 8)
          expect(atWrap).toBeLessThan(1.5 * withinSecondPeriod)
        }
      })

      it('lets low notes ring 2 to 6 seconds, longer than high ones', () => {
        let previous = Infinity
        for (let midi = LOWEST_MIDI; midi <= HIGHEST_MIDI; midi++) {
          const seconds = renderPluck(midi, sampleRate).length / sampleRate
          expect(seconds).toBeLessThanOrEqual(6)
          expect(seconds).toBeGreaterThan(1.5)
          expect(seconds).toBeLessThanOrEqual(previous)
          previous = seconds
        }
        expect(renderPluck(40, sampleRate).length / sampleRate).toBeGreaterThan(4)
      })
    })
  }

  it('is deterministic for a given seed', () => {
    expect(renderPluck(52, 48000, { seed: 3 })).toEqual(renderPluck(52, 48000, { seed: 3 }))
    expect(renderPluck(52, 48000)).toEqual(renderPluck(52, 48000))
  })

  it('changes with the seed', () => {
    expect(renderPluck(52, 48000, { seed: 3 })).not.toEqual(renderPluck(52, 48000, { seed: 4 }))
  })

  it('keeps a similar loudness from one pitch to the next', () => {
    for (let midi = LOWEST_MIDI; midi < HIGHEST_MIDI; midi++) {
      const here = rms(renderPluck(midi, 48000), 0, 0.1, 48000)
      const next = rms(renderPluck(midi + 1, 48000), 0, 0.1, 48000)
      expect(Math.abs(20 * Math.log10(next / here))).toBeLessThan(1.5)
    }
  })
})
