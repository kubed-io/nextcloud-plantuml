# Notes, decisions and history for this feature: ../AGENTS.md#connectionadmin

Feature: The admin connects the app to a PlantUML server
  As a Nextcloud admin
  I want to point the app at my PlantUML server and check that it answers
  So that every diagram in Nextcloud has a server to render it

  Background:
    Given the app is enabled
    And no server is configured yet

  @admin @occ
  Scenario: An admin enters a working server address
    When the admin fills in the connection details:
      | url | the test server |
    And the admin tests the connection
    Then the health check reports success
    And the health check names the PlantUML version the server is running

  @admin @occ
  Scenario Outline: An admin enters a server address that cannot render
    When the admin fills in the connection details:
      | url | <url> |
    And the admin tests the connection
    Then the health check reports an error
    And the message says the server is <problem>

    Examples: three problems, three different fixes
      | url                           | problem               |
      |                               | not set               |
      | an unreachable host           | unreachable           |
      | a server that is not PlantUML | not a PlantUML server |

    # notes: ../AGENTS.md#an-admin-enters-a-server-address-that-cannot-render
