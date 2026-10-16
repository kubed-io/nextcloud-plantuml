# Notes, decisions and history for this feature: ../AGENTS.md#diagramsview

Feature: Looking at a diagram file
  As a Nextcloud user
  I want a diagram file to show me its diagram
  So that a folder of diagrams reads as pictures, not as source

  Background:
    Given the app is connected to a PlantUML server
    And a diagram file "Order flow.puml" in "Diagrams"

    # ── RULE: a client can ask for the picture by the file's path ─────────────
    # notes: ../AGENTS.md#asking-for-a-diagram-file-by-its-path

  @api
  Scenario: Asking for a diagram file by its path returns its diagram
    Given "Diagrams/Order flow.puml" holds a diagram
    When I request the image of "Diagrams/Order flow.puml"
    Then I receive the diagram as an SVG image

  @api
  Scenario: Asking for a file that is not a diagram is refused
    Given a file "notes.txt" in "Diagrams"
    When I request the image of "Diagrams/notes.txt"
    Then the request is refused
