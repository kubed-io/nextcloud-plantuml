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

    # ── RULE: an include reads only what may be downloaded ────────────────────

  @api
  Scenario: A view-only share cannot be read through a diagram
    Given a colleague shared a text file with me that may be viewed but not downloaded
    And I have a diagram that includes that file
    When the diagram is drawn
    Then the drawing names the include as one it cannot read
    And none of the shared file's text is in it

  @api @todo
  Scenario: A view-only folder cannot be read through a drawing of my own
    Given a colleague shared a folder with me that may be viewed but not downloaded
    And the folder holds a text file
    When I draw my own diagram that includes that file, beside a file in that folder
    Then the drawing names the include as one it cannot read
    And none of the shared file's text is in it

    # ── RULE: an open linked file is drawn before it is saved ─────────────────

  @api @unbuilt
  Scenario: A linked file's unsaved text is drawn in place of the saved one
    Given I have a diagram that takes its style from a file beside it
    When the diagram is drawn with new text for that style file
    Then the drawing uses the new text
    And the style file is unchanged

  @api @unbuilt
  Scenario: Unsaved text cannot stand in for a file that is not there
    Given I have a diagram that includes a file beside it that does not exist
    When the diagram is drawn with text for that missing file
    Then the drawing names the include as one it cannot find

  @api @unbuilt
  Scenario: Unsaved text cannot read the rest of a view-only share
    Given a colleague shared a folder with me that may be viewed but not downloaded
    And the folder holds a diagram, a part it includes and a notes file
    When the diagram is drawn with new text for that part that includes the notes file
    Then the drawing names the notes file as one it cannot read
    And none of the notes file's text is in it
