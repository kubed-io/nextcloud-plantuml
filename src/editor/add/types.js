/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The diagram types Add diagram lists (editor spec A6): the server's 30 `@start`
 * types less def (no drawing), chronology and jcckit (1.2026.8 draws neither),
 * named and iconed as the style guide's "Diagram icons" board.
 */

/** @type {{ type: string, name: string, icon: string }[]} */
export const TYPES = [
  { type: 'uml', name: 'UML', icon: 'shape-outline' },
  { type: 'bpm', name: 'BPM', icon: 'cog-transfer-outline' },
  { type: 'board', name: 'Board', icon: 'view-column-outline' },
  { type: 'chart', name: 'Chart', icon: 'chart-bar' },
  { type: 'chen', name: 'Chen ER', icon: 'relation-one-to-many' },
  { type: 'creole', name: 'Creole', icon: 'format-text' },
  { type: 'dot', name: 'DOT', icon: 'graph-outline' },
  { type: 'ditaa', name: 'Ditaa', icon: 'draw' },
  { type: 'ebnf', name: 'EBNF', icon: 'alphabetical-variant' },
  { type: 'files', name: 'Files', icon: 'file-tree-outline' },
  { type: 'flow', name: 'Flow', icon: 'transit-connection-variant' },
  { type: 'gantt', name: 'Gantt', icon: 'chart-gantt' },
  { type: 'git', name: 'Git', icon: 'source-branch' },
  { type: 'hcl', name: 'HCL', icon: 'code-equal' },
  { type: 'json', name: 'JSON', icon: 'code-json' },
  { type: 'latex', name: 'LaTeX', icon: 'sigma' },
  { type: 'math', name: 'Math', icon: 'math-integral' },
  { type: 'mindmap', name: 'MindMap', icon: 'head-lightbulb-outline' },
  { type: 'project', name: 'Project', icon: 'calendar-range-outline' },
  { type: 'regex', name: 'Regex', icon: 'regex' },
  { type: 'salt', name: 'Salt', icon: 'application-outline' },
  { type: 'sprites', name: 'Sprites', icon: 'checkerboard' },
  { type: 'wbs', name: 'WBS', icon: 'sitemap-outline' },
  { type: 'wire', name: 'Wire', icon: 'connection' },
  { type: 'yaml', name: 'YAML', icon: 'format-indent-increase' },
  { type: 'nwdiag', name: 'nwdiag', icon: 'lan' },
  { type: 'packetdiag', name: 'packetdiag', icon: 'table-row' },
]
