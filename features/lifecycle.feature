# Notes, decisions and history for this feature: AGENTS.md#lifecycle

# @unbuilt throughout — the app is specified ahead of its code; nothing in lib/ yet.
@unbuilt
Feature: App install lifecycle
  As a Nextcloud admin
  I want the plantuml app to enable, disable and uninstall cleanly
  So that installing or removing it never leaves the instance broken

  @admin @occ
  Scenario: Enabling the app
    When the admin enables the app
    Then the app is enabled
    And ".puml" files are registered as their own file type
    # The file type is an end state of enabling, not a feature of its own.

  @admin @occ
  Scenario: Disabling the app
    Given the app is enabled
    When the admin disables the app
    Then the app is not enabled

  # Becomes @blocked once built — no app removal: occ enables and disables, and
  # removing an app is a store operation this suite cannot perform.
  @admin @occ
  Scenario: Removing the app
    Given the app is enabled
    When the admin removes the app
    Then ".puml" files are not registered as their own file type
    And the diagram files are left where they are
