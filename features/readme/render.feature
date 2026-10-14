# Notes, decisions and history for this feature: ../AGENTS.md#readmerender

Feature: Diagrams in a folder README
  As someone reading a folder
  I want the README to show its diagrams drawn, not as source
  So that a folder explains itself with pictures

  Background:
    Given the app is connected to a PlantUML server
    And a diagram file "Order flow.puml" in "Diagrams"

    # ── RULE: a plantuml fence is a picture ───────────────────────────────────

  @gesture
  Scenario: A plantuml code fence in the README is drawn as its diagram
    Given the README in "Diagrams" holds a plantuml code fence
    When I read the README in "Diagrams"
    Then the fence is drawn as its diagram

    # ── RULE: an image that names a diagram file is that file's picture ───────

  @gesture
  Scenario: An image that points at a diagram file is drawn as that diagram
    Given the README in "Diagrams" embeds the image "Order flow.puml"
    When I read the README in "Diagrams"
    Then the image is drawn as the diagram of "Diagrams/Order flow.puml"

    # Only the fence tag "plantuml" is recognised; it is the one every other tool
    # agrees on. The image is handled as Text handles any image: inline, no link.
