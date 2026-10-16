/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PlantUML 1.2026.8's JSON reader, ported: its fork of minimal-json (ralfstx, MIT) with
 * PlantUML's own `//` comment extension inside objects. Stricter than JavaScript (no trailing
 * comma, no single quotes) and laxer in that one place, so `JSON.parse` would mark valid files.
 * Imports nothing from the editor's core (the profiles' chunk guard).
 */

/**
 * Null when PlantUML would draw the data, else what its ParseException says and where.
 *
 * @param {string} text
 * @return {null|{message: string, offset: number}}
 */
export function checkJson(text) {
  const EOT = '\u0003'
  let i = 0
  const cur = () => (i < text.length ? text[i] : EOT)
  const err = (what) => ({ message: cur() === EOT ? 'Unexpected end of input' : what, offset: i })
  const ws = () => { while (cur() === ' ' || cur() === '\t' || cur() === '\n' || cur() === '\r') i++ }
  const eat = (c) => (cur() === c ? (i++, true) : false)
  const digit = () => cur() >= '0' && cur() <= '9' && (i++, true)
  function value() {
    const c = cur()
    if (c === 'n') return lit('null')
    if (c === 't') return lit('true')
    if (c === 'f') return lit('false')
    if (c === '"') return str()
    if (c === '[') return arr()
    if (c === '{') return obj()
    if (c === '-' || (c >= '0' && c <= '9')) return num()
    return err('Expected value')
  }
  function lit(w) { i++; for (const ch of w.slice(1)) if (!eat(ch)) return err(`Expected '${ch}'`); return null }
  function str() {
    i++
    for (;;) {
      const c = cur()
      if (c === '"') { i++; return null }
      if (c === '\\') {
        i++
        const e = cur()
        if ('"/\\bfnrt'.includes(e) && e !== EOT) i++
        else if (e === 'u') { i++; for (let k = 0; k < 4; k++) { if (!/[0-9a-fA-F]/.test(cur())) return err('Expected hexadecimal digit'); i++ } }
        else return err('Expected valid escape sequence')
      } else if (c < ' ') return err('Expected valid string character') // EOT (\u0003) lands here too
      else i++
    }
  }
  function num() {
    eat('-')
    const first = cur()
    if (!digit()) return err('Expected digit')
    if (first !== '0') while (digit());
    if (eat('.')) { if (!digit()) return err('Expected digit'); while (digit()); }
    if (eat('e') || eat('E')) { if (!eat('+')) eat('-'); if (!digit()) return err('Expected digit'); while (digit()); }
    return null
  }
  function arr() {
    i++; ws()
    if (eat(']')) return null
    do { ws(); const e = value(); if (e) return e; ws() } while (eat(','))
    return eat(']') ? null : err("Expected ',' or ']'")
  }
  function comment() { // after the first '/'
    if (!eat('/')) return err('Expected Error in comment')
    while (cur() !== '\n' && cur() !== '\r' && cur() !== EOT) i++
    ws()
    return null
  }
  function obj() {
    i++; ws()
    if (eat('}')) return null
    do {
      ws()
      if (eat('/')) { const e = comment(); if (e) return e }
      if (cur() !== '"') return err('Expected name')
      let e = str(); if (e) return e
      ws()
      if (!eat(':')) return err("Expected ':'")
      ws()
      e = value(); if (e) return e
      ws()
      if (eat('/')) { e = comment(); if (e) return e }
    } while (eat(','))
    return eat('}') ? null : err("Expected ',' or '}'")
  }
  ws()
  let e = value(); if (e) return e
  ws()
  return cur() === EOT ? null : err('Unexpected character')
}

/**
 * The text PlantUML's JSON parser is handed, from the lines between `@startjson` and
 * `@endjson`. Dropped lines are blanked, never removed, so offsets map back to lines.
 * Mirrors StyleExtractor and JsonDiagramFactory; `'` comments and `!` lines are the
 * preprocessor's.
 *
 * @param {string[]} lines
 * @return {string[]}
 */
export function jsonLines(lines) {
  let closer = null // ends the preprocessor comment or <style> block in progress
  let kept = 0
  return lines.map((line) => {
    const t = line.trim()
    if (closer) { if (t.includes(closer)) closer = null; return '' }
    if (t.startsWith("/'")) { closer = t.includes("'/", 2) ? null : "'/"; return '' }
    if (t === '<style>') { closer = '</style>'; return '' }   // StyleExtractor: trimmed line equals <style>
    if (t === '' || t.startsWith("'") || t.startsWith('!')) return ''  // preprocessor: comments, !pragma, !assume, other ! lines
    if (kept <= 1 && /^(?:title |scale |skin |skinparam |hide )/.test(t)) return ''
    if (line.startsWith('#')) return ''                       // #highlight and any other column-0 # line
    kept++
    return line
  })
}
