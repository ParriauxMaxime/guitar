import type { GuitarAudio } from '../audio/types'

type AudioSpy = (method: string, args: unknown[]) => void

/**
 * Test hook: when a page script defines `window.__guitarAudioSpy` before the app
 * starts, every audio call is reported to it. Used by the browser automation checks.
 */
export function withAudioSpy(audio: GuitarAudio): GuitarAudio {
  const spy = (window as { __guitarAudioSpy?: AudioSpy }).__guitarAudioSpy
  if (!spy) return audio

  return new Proxy(audio, {
    get(target, key, receiver) {
      const member: unknown = Reflect.get(target, key, receiver)
      if (typeof member !== 'function') return member
      return (...args: unknown[]) => {
        spy(String(key), args)
        return Reflect.apply(member, target, args)
      }
    },
  })
}
