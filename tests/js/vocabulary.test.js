// SPDX-FileCopyrightText: 2026 kubed-io
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The style vocabulary is generated from PlantUML's source (X1); these tests
// read the committed JSON, never the network.
import { describe, expect, it } from 'vitest'
import vocabulary from '../../src/editor/data/vocabulary.json'
import builtins from '../../src/editor/data/builtins.json'
import directives from '../../src/editor/data/directives.json'
import c4 from '../../src/editor/data/stdlib/C4.json'
import awslib from '../../src/editor/data/stdlib/awslib.json'
import { directiveWords, enumConstants, readmeRows, signatures, stdlibEntries, stdlibIndex, stdlibReadmes } from '../../scripts/vocabulary.mjs'

describe('style vocabulary', () => {
  it('records the PlantUML version it came from', () => {
    expect(vocabulary.plantuml).toBe('1.2026.8')
  })

  it('has the 30 style properties', () => {
    const { properties } = vocabulary.style
    expect(properties).toHaveLength(30)
    expect(properties).toEqual(expect.arrayContaining(['BackGroundColor', 'FontStyle', 'RoundCorner']))
  })

  it('has the 157 selectors with the Java underscore suffix dropped', () => {
    const { selectors } = vocabulary.style
    expect(selectors).toHaveLength(157)
    expect(selectors).toEqual(expect.arrayContaining(['mindmapDiagram', 'class', 'package']))
    expect(selectors.filter((s) => s.endsWith('_'))).toEqual([])
  })

  it('has the font styles without backcolor', () => {
    expect(vocabulary.style.fontStyles).toEqual(['plain', 'italic', 'bold', 'underline', 'strike', 'wave'])
  })
})

describe('built-in functions', () => {
  const byName = Object.fromEntries(builtins.map((f) => [f.name, f]))

  it('has a described entry for the documented functions', () => {
    for (const name of ['%date', '%lighten', '%get_all_stdlib', '%strlen']) {
      expect(byName[name].description).not.toBe('')
    }
    expect(byName['%strlen'].example).toBe('%strlen("foo")')
  })

  it('has an empty description for a function without a readme row', () => {
    expect(byName['%get_current_theme']).toMatchObject({ description: '', example: '' })
  })

  it('is sorted by name', () => {
    expect(builtins.map((f) => f.name)).toEqual(builtins.map((f) => f.name).sort())
  })
})

describe('the generator', () => {
  it('reads the constants of a Java enum, ignoring arguments and comments', () => {
    const java = 'public enum E {\n  A("x,y"), // c\n  B_, C;\n  int z;\n}'
    expect(enumConstants(java)).toEqual(['A', 'B_', 'C'])
  })

  it('reads every signature of a builtin class, and none from one without', () => {
    expect(signatures('x = new TFunctionSignature("%a", 2); y = new TFunctionSignature("%b", 0);')).toEqual([
      { name: '%a', args: 2 },
      { name: '%b', args: 0 },
    ])
    expect(signatures('class Helper {}')).toEqual([])
  })

  it('reads a readme row and skips its continuation rows', () => {
    const md = '| ``%chr`` | A [link](http://x) | ``%chr(65)`` | ``A`` |\n|  | more | ``%chr(66)`` | ``B`` |'
    expect([...readmeRows(md)]).toEqual([['%chr', { description: 'A link', example: '%chr(65)' }]])
  })
})

describe('directives', () => {
  it('reads the lines of a classifier, widened by the Or that follows, and none that is commented out', () => {
    const java = `
      A = simpleKeyword("!ifdef");
      B = new RegexConcat(new RegexLeaf("!define"), RegexLeaf.spaceOneOrMore(), X);
      C = new RegexConcat(new RegexLeaf("!include"), RegexLeaf.spaceZeroOrMore(),
        new RegexOptional(new RegexOr(new RegexLeaf("url"), new RegexLeaf("_many"), new RegexLeaf("_once"))), new RegexLeaf("\\b"));
      D = new RegexConcat(new RegexLeaf("!end"), RegexLeaf.spaceZeroOrMore(),
        new RegexOr(new RegexLeaf("function"), new RegexLeaf("definelong"), new RegexLeaf("procedure")));
      E = new RegexConcat(new RegexLeaf("!"), new RegexLeaf(1, "(unquoted\\s|final\\s)*"), new RegexLeaf("function"));
      F = new RegexConcat(new RegexLeaf("!"), new RegexLeaf(1, "(unquoted\\s|final\\s)*"), new RegexLeaf("procedure"));
      // G = simpleKeyword("!include_sprites");
    `
    const words = directiveWords(java)

    expect(words).toEqual(['!define', '!enddefinelong', '!endfunction', '!endprocedure', '!function', '!ifdef', '!include', '!include_many', '!include_once', '!includeurl', '!procedure'])
    for (const absent of ['!end', '!', '!include_sprites']) expect(words).not.toContain(absent)
  })

  it('is the committed list, sorted, once each', () => {
    expect(directives.plantuml).toBe('1.2026.8')
    expect(directives.directives).toEqual([...new Set(directives.directives)].sort())
    expect(new Set(directives.directives)).toEqual(new Set((
      '!assert !define !definelong !dump_memory !else !elseif !endfor !endfunction !enddefinelong !endif !endprocedure !endsub !endwhile ' +
      '!foreach !function !if !ifdef !ifndef !import !include !include_many !include_once !includedef !includesub !includeurl !log !option ' +
      '!procedure !return !startsub !theme !undef !while !pragma !local !global !unquoted !final'
    ).split(' ')))
  })
})

describe('the stdlib index', () => {
  it('keeps the .puml files under each stdlib folder, as paths below it without the extension, sorted', () => {
    const tree = {
      sha: '7167ca01416dac036fb11a72898ad7cbd008031a',
      truncated: false,
      tree: [
        { path: 'stdlib', type: 'tree' },
        { path: 'stdlib/cloudogu/dogus/scm.puml', type: 'blob' },
        { path: 'stdlib/C4', type: 'tree' },
        { path: 'stdlib/C4/README.md', type: 'blob' },
        { path: 'stdlib/C4/C4_Container.puml', type: 'blob' },
        { path: 'stdlib/C4/C4_Context.png', type: 'blob' },
        { path: 'stdlib/cloudogu/dogus', type: 'tree' },
        { path: 'src/x.java', type: 'blob' },
      ],
    }

    expect(stdlibIndex(tree)).toEqual({ C4: ['C4_Container'], cloudogu: ['dogus/scm'] })
  })

  it('reads a folder whose README links to another as that one', () => {
    const tree = {
      truncated: false,
      tree: [
        { path: 'stdlib/awslib/README.md', type: 'blob' },
        { path: 'stdlib/awslib/_examples_/example.puml', type: 'blob' },
        { path: 'stdlib/awslib14/README.md', type: 'blob' },
        { path: 'stdlib/awslib14/AWSCommon.puml', type: 'blob' },
        { path: 'stdlib/bootstrap/README.md', type: 'blob' },
        { path: 'stdlib/awslib14/Compute/README.md', type: 'blob' },
      ],
    }
    const readmes = {
      awslib: '---\nname: awslib\nsource: https://github.com/awslabs/aws-icons-for-plantuml\nlink: awslib14\norigin: \n---\n\nlink: nope\n',
      awslib14: '---\nname: awslib14\nversion: 14.0.0\nlink: \n---\n',
      // A link to a folder with no files is no link.
      bootstrap: '---\nname: bootstrap\nlink: bootstrap1.13.1\n---\n',
    }

    expect(stdlibReadmes(tree)).toEqual(['awslib', 'awslib14', 'bootstrap'])
    expect(stdlibEntries(tree, readmes)).toEqual({
      awslib: { 'plantuml-stdlib': '7167ca0', link: 'awslib14' },
      awslib14: { 'plantuml-stdlib': '7167ca0', files: ['AWSCommon'] },
    })
  })

  it('is committed per folder, from the pinned commit', () => {
    expect(c4['plantuml-stdlib']).toBe('7167ca0')
    expect(c4.files).toContain('C4_Container')
    expect(c4.files).toContain('themes/puml-theme-C4_united')
    expect(c4.files).toEqual([...c4.files].sort())
    expect(awslib).toEqual({ 'plantuml-stdlib': '7167ca0', link: 'awslib14' })
  })
})
