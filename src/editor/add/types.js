/**
 * SPDX-FileCopyrightText: 2026 kubed-io
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The diagram types Add diagram lists (editor spec A6): the server's 30 `@start`
 * types less def (no drawing), chronology and jcckit (1.2026.8 draws neither),
 * named and iconed as the style guide's "Diagram icons" board.
 */

/** @type {{ type: string, name: string, icon: string, description: string }[]} */
export const TYPES = [
  { type: 'uml', name: 'UML', icon: 'shape-outline', description: 'Classes, sequences, states and more' },
  { type: 'bpm', name: 'BPM', icon: 'cog-transfer-outline', description: 'Business process steps and branches' },
  { type: 'board', name: 'Board', icon: 'view-column-outline', description: 'Cards under column headings' },
  { type: 'chart', name: 'Chart', icon: 'chart-bar', description: 'Bar, line and area charts' },
  { type: 'chen', name: 'Chen ER', icon: 'relation-one-to-many', description: 'Entities, attributes and relationships, Chen style' },
  { type: 'creole', name: 'Creole', icon: 'format-text', description: 'Formatted text, lists and tables' },
  { type: 'dot', name: 'DOT', icon: 'graph-outline', description: 'Graphviz graph of nodes and edges' },
  { type: 'ditaa', name: 'Ditaa', icon: 'draw', description: 'ASCII art drawn as boxes' },
  { type: 'ebnf', name: 'EBNF', icon: 'alphabetical-variant', description: 'Grammar rules as railroad diagrams' },
  { type: 'files', name: 'Files', icon: 'file-tree-outline', description: 'Folders and files as a tree' },
  { type: 'flow', name: 'Flow', icon: 'transit-connection-variant', description: 'Boxes and the links between them' },
  { type: 'gantt', name: 'Gantt', icon: 'chart-gantt', description: 'Tasks and milestones on a timeline' },
  { type: 'git', name: 'Git', icon: 'source-branch', description: 'Commits and branches of a history' },
  { type: 'hcl', name: 'HCL', icon: 'code-equal', description: 'HCL configuration drawn as a tree' },
  { type: 'json', name: 'JSON', icon: 'code-json', description: 'JSON data drawn as a tree' },
  { type: 'latex', name: 'LaTeX', icon: 'sigma', description: 'A formula typeset with LaTeX' },
  { type: 'math', name: 'Math', icon: 'math-integral', description: 'A formula written in AsciiMath' },
  { type: 'mindmap', name: 'MindMap', icon: 'head-lightbulb-outline', description: 'Ideas branching from one topic' },
  { type: 'project', name: 'Project', icon: 'calendar-range-outline', description: "A project's tasks on a timeline" },
  { type: 'regex', name: 'Regex', icon: 'regex', description: 'A regular expression as a railroad diagram' },
  { type: 'salt', name: 'Salt', icon: 'application-outline', description: 'Wireframe of windows, buttons and fields' },
  { type: 'sprites', name: 'Sprites', icon: 'checkerboard', description: 'Small pictures drawn pixel by pixel' },
  { type: 'wbs', name: 'WBS', icon: 'sitemap-outline', description: 'Work broken down into a tree' },
  { type: 'wire', name: 'Wire', icon: 'connection', description: 'Components wired together on a grid' },
  { type: 'yaml', name: 'YAML', icon: 'format-indent-increase', description: 'YAML data drawn as a tree' },
  { type: 'nwdiag', name: 'nwdiag', icon: 'lan', description: 'Networks and the servers on them' },
  { type: 'packetdiag', name: 'packetdiag', icon: 'table-row', description: "A packet's fields, bit by bit" },
]
