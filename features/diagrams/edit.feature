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
    Given I am editing "Diagrams/Order flow.puml"
    When I change the source of "Diagrams/Order flow.puml" without saving
    Then the diagram shows the change
    And "Diagrams/Order flow.puml" still holds its old source

    # ── RULE: saving is the only thing that touches the file ──────────────────

  @gesture
  Scenario: Saving writes the source back to the file
    Given I am editing "Diagrams/Order flow.puml"
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
    Given the PlantUML server offers its own themes
    When I ask for the themes the server offers
    Then I receive the themes the PlantUML server lists

  @api
  Scenario: Asking for the server's icons
    Given the PlantUML server offers its own icons
    When I ask for the icons the server offers
    Then I receive the icons the PlantUML server lists

  @api
  Scenario: Asking for the server's emoji
    Given the PlantUML server offers its own emoji
    When I ask for the emoji the server offers
    Then I receive the emoji the PlantUML server lists

  @gesture
  Scenario: A mistake in the source names its line
    Given I am editing "Diagrams/Order flow.puml"
    When I change the source of "Diagrams/Order flow.puml" to one with a mistake, without saving
    Then the diagram names the line the mistake is on

    # ── RULE: a file of several diagrams draws the one asked for ──────────────

  @api
  Scenario: Drawing one diagram of a file that holds several
    Given "Diagrams/Screens.puml" holds the diagrams "nodes" and "login"
    When I draw the diagram "login" of "Diagrams/Screens.puml"
    Then I receive the diagram "login"
