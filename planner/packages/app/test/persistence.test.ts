import { describe, expect, it } from 'vitest'
import {
  fromBase64Url,
  readShareFragment,
  shareFragmentFor,
  toBase64Url,
} from '../src/persistence'

describe('base64url', () => {
  it('round-trips ordinary text', () => {
    expect(fromBase64Url(toBase64Url('hello'))).toBe('hello')
  })

  it('round-trips the document JSON, punctuation and all', () => {
    const json = '{"v":1,"w":[32,32],"d":["a-b"],"p":[[0,1,2]],"a":[["Drill \\"x\\"",[]]]}'
    expect(fromBase64Url(toBase64Url(json))).toBe(json)
  })

  it('round-trips non-latin-1 text, which plain btoa cannot', () => {
    const name = 'Perceuse 🔧 ünïcode 工具'
    expect(fromBase64Url(toBase64Url(name))).toBe(name)
    // btoa alone throws on these, which is exactly why the UTF-8 step exists.
    expect(() => btoa(name)).toThrow()
  })

  it('emits nothing that needs escaping in a URL', () => {
    const encoded = toBase64Url('{"v":1,"p":[[0,1,2]]}~~~???')
    expect(encoded).not.toMatch(/[+/=]/)
    expect(encodeURIComponent(encoded)).toBe(encoded)
  })

  it('is much shorter than percent-encoding the same JSON', () => {
    const json = JSON.stringify({ v: 1, w: [32, 32], d: ['a'], p: [[0, 1, 2], [0, 3, 4]] })
    expect(toBase64Url(json).length).toBeLessThan(encodeURIComponent(json).length)
  })

  it('returns null for a link that was mangled rather than throwing', () => {
    expect(fromBase64Url('!!!not base64!!!')).toBeNull()
  })
})

describe('share fragment', () => {
  it('round-trips through a hash', () => {
    const json = '{"v":1,"w":[32,32],"d":[],"p":[],"a":[]}'
    expect(readShareFragment(shareFragmentFor(json))).toBe(json)
  })

  it('reads a hash with or without the leading #', () => {
    const json = '{"v":1}'
    const hash = shareFragmentFor(json)
    expect(readShareFragment(hash.slice(1))).toBe(json)
  })

  it('ignores a hash that carries something else', () => {
    expect(readShareFragment('#section=intro')).toBeNull()
    expect(readShareFragment('')).toBeNull()
    expect(readShareFragment('#')).toBeNull()
  })

  it('survives other parameters alongside it', () => {
    const json = '{"v":1}'
    const hash = `${shareFragmentFor(json)}&other=1`
    expect(readShareFragment(hash)).toBe(json)
  })
})
