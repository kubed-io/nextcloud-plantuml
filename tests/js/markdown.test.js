// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { findFences, findImages } from '../../src/readme/markdown.js'

const README = [
  '# Diagrams',
  '',
  '```plantuml',
  '@startuml',
  'Customer -> Shop: place order',
  '@enduml',
  '```',
  '',
  '```mermaid',
  'graph TD; A-->B',
  '```',
  '',
  '~~~plantuml',
  '@startuml',
  'Shop -> Payment: charge',
  '@enduml',
  '~~~',
  '',
].join('\n')

describe('findFences', () => {
  it('finds every fence in order, counting the ones that are not plantuml', () => {
    expect(findFences(README)).toEqual([
      { lang: 'plantuml', source: '@startuml\nCustomer -> Shop: place order\n@enduml', index: 0 },
      { lang: 'mermaid', source: 'graph TD; A-->B', index: 1 },
      { lang: 'plantuml', source: '@startuml\nShop -> Payment: charge\n@enduml', index: 2 },
    ])
  })

  it('reads the language from the info string and leaves a bare fence without one', () => {
    const md = '```plantuml title="x"\nA -> B\n```\n\n```\nplain\n```\n'
    expect(findFences(md).map((f) => f.lang)).toEqual(['plantuml', ''])
  })

  it('keeps a shorter fence inside a longer one as text', () => {
    const md = '````markdown\n```plantuml\nA -> B\n```\n````\n'
    expect(findFences(md)).toEqual([
      { lang: 'markdown', source: '```plantuml\nA -> B\n```', index: 0 },
    ])
  })

  it('strips the opening fence indent from an indented fence, as in a list', () => {
    const md = '- step\n\n  ```plantuml\n  A -> B\n    note\n  ```\n'
    expect(findFences(md)[0].source).toBe('A -> B\n  note')
  })

  it('runs an unclosed fence to the end of the document', () => {
    expect(findFences('```plantuml\nA -> B\n')).toEqual([{ lang: 'plantuml', source: 'A -> B', index: 0 }])
  })
})

describe('findImages', () => {
  it('finds a relative image and ignores a direct URL', () => {
    const md = [
      'The same flow, embedded from the file beside this README:',
      '',
      '![Order flow](Order flow.puml)',
      '',
      '![logo](http://example.com/logo.png) ![badge](https://example.com/b.svg "Badge")',
      '![photo](photo.png "A photo")',
    ].join('\n')
    expect(findImages(md)).toEqual([
      { alt: 'Order flow', src: 'Order flow.puml' },
      { alt: 'photo', src: 'photo.png' },
    ])
  })

  it('unwraps an angle-bracketed destination', () => {
    expect(findImages('![Order flow](<Order flow.puml>)')).toEqual([{ alt: 'Order flow', src: 'Order flow.puml' }])
  })

  it('does not read an image out of a code fence', () => {
    expect(findImages('```markdown\n![x](x.puml)\n```\n')).toEqual([])
  })
})
