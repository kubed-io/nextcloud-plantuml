# Notes, decisions and history for this feature: ../AGENTS.md#diagramscreate

# @unbuilt until a browser leg runs this; the behaviour is built (src/files.js).
@unbuilt
Feature: Creating a diagram file
  As a Nextcloud user
  I want to start a new diagram from the Files app
  So that a diagram begins in the folder it belongs to

  Background:
    Given the app is connected to a PlantUML server

  @ui @gesture
  Scenario: A new diagram from the + New menu
    Given I am looking at "Diagrams" in the Files app
    When I choose "Diagram" from the + New menu and name it "Checkout"
    Then "Diagrams/Checkout.puml" holds an empty diagram
    And the editor opens on it

    # An empty diagram is the @startuml and @enduml lines with room between them,
    # so the file opens ready to write in rather than blank.
