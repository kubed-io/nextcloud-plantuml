# Notes, decisions and history for this feature: ../AGENTS.md#readmerender

# @unbuilt until a browser leg runs these; the behaviour is built (src/readme/).
@unbuilt
Feature: Diagrams in a folder README
  As someone reading a folder in the Files app
  I want the README to show its diagrams drawn, not as source
  So that a folder explains itself with pictures

  Background:
    Given the app is connected to a PlantUML server
    And a diagram file "Order flow.puml" in "Diagrams"

    # ── RULE: a plantuml fence is a picture ───────────────────────────────────

  @ui
  Scenario: A plantuml code fence in the README shows the diagram
    Given the README in "Diagrams" holds a plantuml code fence
    When I open "Diagrams" in the Files app
    Then the README shows the fence as its diagram

    # ── RULE: an image that names a diagram file is that file's picture ───────

  @ui
  Scenario: An image that points at a diagram file shows its diagram
    Given the README in "Diagrams" embeds the image "Order flow.puml"
    When I open "Diagrams" in the Files app
    Then the README shows the diagram of "Order flow.puml" where the image is

    # Only the fence tag "plantuml" is recognised; it is the one every other tool
    # agrees on. The image is handled as Text handles any image: inline, no link.
