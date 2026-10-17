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

  @api
  Scenario: A diagram too large to draw
    Given I have a diagram file of more than a megabyte
    When the diagram is drawn
    Then the answer says the diagram is too large to draw

    # ── RULE: a client can ask for one diagram of a file ──────────────────────
    # notes: ../AGENTS.md#asking-for-one-diagram-of-a-file

  @api
  Scenario: Asking for one diagram of a file that holds several
    Given "Diagrams/Screens.puml" holds the diagrams "nodes" and "login"
    When I request the image of the diagram "login" of "Diagrams/Screens.puml"
    Then I receive the diagram "login"

  @api
  Scenario: Asking for a diagram a file does not hold is refused
    Given "Diagrams/Screens.puml" holds the diagrams "nodes" and "login"
    When I request the image of the diagram "signup" of "Diagrams/Screens.puml"
    Then the request is refused
    And the answer says there is no diagram named "signup"

    # ── RULE: a diagram file can be saved in another format ───────────────────

  @api @unbuilt
  Scenario: Exporting one diagram of a file as a PNG
    Given "Diagrams/Screens.puml" holds the diagrams "nodes" and "login"
    When I export the diagram "login" of "Diagrams/Screens.puml" as PNG
    Then I download "Screens - login.png"

  @api @unbuilt
  Scenario: Exporting every diagram of a file
    Given "Diagrams/Screens.puml" holds the diagrams "nodes" and "login"
    When I export "Diagrams/Screens.puml" as SVG
    Then I download "Screens.zip"
    And it holds "Screens - nodes.svg" and "Screens - login.svg"

  @api @unbuilt
  Scenario: Exporting a file of one diagram
    Given "Diagrams/Order flow.puml" holds a diagram
    When I export "Diagrams/Order flow.puml" as PDF
    Then I download "Order flow.pdf"

  @api @unbuilt
  Scenario: Exporting in a format the server does not draw is refused
    Given "Diagrams/Order flow.puml" holds a diagram
    When I export "Diagrams/Order flow.puml" as LaTeX
    Then the request is refused
