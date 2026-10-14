# Notes, decisions and history for this feature: ../AGENTS.md#diagramsedit

Feature: Editing a diagram file
  As a Nextcloud user
  I want to write PlantUML and watch the diagram take shape beside it
  So that a diagram is edited where it lives, without another tool

  Background:
    Given the app is connected to a PlantUML server
    And a diagram file "Order flow.puml" in "Diagrams"

    # ── RULE: the diagram follows the source ──────────────────────────────────

  @gesture
  Scenario: A changed source draws the changed diagram
    When I change the source of "Diagrams/Order flow.puml" without saving
    Then the diagram shows the change
    And "Diagrams/Order flow.puml" still holds its old source

    # ── RULE: saving is the only thing that touches the file ──────────────────

  @gesture
  Scenario: Saving writes the source back to the file
    When I change the source of "Diagrams/Order flow.puml" and save
    Then "Diagrams/Order flow.puml" holds the changed source

  @gesture
  Scenario: Saving over someone else's change is refused
    Given someone else has changed "Diagrams/Order flow.puml" since I opened it
    When I change the source of "Diagrams/Order flow.puml" and save
    Then the save is refused
    And "Diagrams/Order flow.puml" holds their version

  @gesture
  Scenario: Saving a copy keeps both versions
    Given someone else has changed "Diagrams/Order flow.puml" since I opened it
    When I save my change as a copy
    Then "Diagrams/Order flow (copy).puml" holds my change
    And "Diagrams/Order flow.puml" holds their version

    # ── RULE: the editor knows what the server knows ──────────────────────────

  @api
  Scenario: Asking for the server's themes
    When I ask for the themes the server offers
    Then I receive the themes the PlantUML server lists

  @gesture
  Scenario: A mistake in the source names its line
    When I change the source of "Diagrams/Order flow.puml" to one with a mistake, without saving
    Then the diagram names the line the mistake is on
