# Notes, decisions and history for this feature: ../AGENTS.md#diagramscreate

Feature: Creating a diagram file
  As a Nextcloud user
  I want to start a new diagram from the Files app
  So that a diagram begins in the folder it belongs to

  Background:
    Given the app is connected to a PlantUML server

  @gesture
  Scenario: A new diagram starts empty and ready to write in
    When I create a new diagram in "Diagrams"
    Then "Diagrams/New diagram.puml" holds an empty diagram

    # An empty diagram is the @startuml and @enduml lines with room between them,
    # so the file opens ready to write in rather than blank.
