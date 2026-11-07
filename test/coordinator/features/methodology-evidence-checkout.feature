# Specifies checkMethodologyEvidence (scripts/check-methodology-evidence.ts)
# over the cat-harness instance's real methodology corpus, smart-base's
# repository-scoped graph included.
Feature: Methodology evidence over the real corpus resolves, validates and counts correctly

  @T1
  Scenario: The methodology graph is found
    Given the methodology evidence report
    When it is read
    Then it is not undetermined
    And it counts at least one node

  @T2
  Scenario: Every node validates
    Given the methodology evidence report
    When its invalid nodes are read
    Then there are none

  @T3
  Scenario: No node cites evidence that resolves nowhere
    Given the methodology evidence report
    When its unresolved evidence is read
    Then there is none

  @T4
  Scenario: The sweep reaches diig in smart-base's repository-scoped graph
    Given the methodology evidence report
    When the names of resolved and no-evidence nodes are collected
    Then they include "diig"

  @T5
  Scenario: swot is backed by both its sources, each on disk
    Given the methodology evidence report
    When swot's resolved evidence is read
    Then it is exactly the two SWOT library entries
    And each resolved path exists

  @T6
  Scenario: A node is backed only when every source it cites resolves
    Given the methodology evidence report
    When the backed names are compared with the names with unresolved evidence
    Then no backed name has unresolved evidence
    And there are no more backed names than nodes

  @T7
  Scenario: The sweep does not descend into a methodology's own subgraph directory
    Given every node in the report, resolved, without evidence, invalid or untagged
    When their node paths are read
    Then none lies inside a subdirectory of a methodologies directory
