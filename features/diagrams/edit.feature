# Notes, decisions and history for this feature: ../AGENTS.md#diagramsedit

# @unbuilt until a browser leg runs these; the behaviour is built (src/editor.js).
@unbuilt
Feature: Editing a diagram file
  As a Nextcloud user
  I want to write PlantUML and watch the diagram take shape beside it
  So that a diagram is edited where it lives, without another tool

  Background:
    Given the app is connected to a PlantUML server
    And a diagram file "Order flow.puml" in "Diagrams"

    # ── RULE: the source and the diagram are one view ─────────────────────────

  @ui @gesture
  Scenario: Opening a diagram file for editing
    When I choose "Edit diagram" on "Order flow.puml"
    Then the editor opens with the source on the left and the diagram on the right
    And the source is highlighted as PlantUML

  @ui
  Scenario: The diagram follows the source as it is typed
    Given "Order flow.puml" is open in the editor
    When I change the source
    Then the diagram on the right shows the changed source

    # ── RULE: the plain source is one click away too ──────────────────────────

  @ui @gesture
  Scenario: Opening a diagram file as plain text
    When I choose "Open with text editor" on "Order flow.puml"
    Then the text editor opens on the source

    # ── RULE: saving is the only thing that touches the file ──────────────────

  @ui
  Scenario: Saving writes the source back to the file
    Given "Order flow.puml" is open in the editor
    When I change the source
    And I save
    Then "Diagrams/Order flow.puml" holds the changed source
