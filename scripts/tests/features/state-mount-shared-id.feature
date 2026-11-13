# A mounted layer's own work plan is never the checkout's. These two tags are
# the names the checker currently computes: its parser loses this file's
# describe scopes and its other seven tests at the regex literal /^test\//,
# so the tags will need re-scoping when the checker is fixed.
# Each Scenario names the test that executes it.
Feature: A mounted layer's own state graph

  Background:
    Given an index checkout whose platform layer declares repository-scoped beans on a branch origin lacks
    And whose mounted upstream layer keeps its own beans on its own branch

  @test:scripts/tests/state-mount-shared-id.test.ts::the_upstream's_beans_mount_as_ITS_graph,_and_the_checkout-level_`beans`_stays_unmounted
  Scenario: The upstream's beans mount as its own graph
    When state is mounted
    Then up.beans is mounted and plat.beans is not
    And the upstream's work item file is present under up/beans
    And up's beans read as mounted into up/beans
    And the checkout-level beans read as unmounted

  @test:scripts/tests/state-mount-shared-id.test.ts::the_checkout's_bean_store_resolves_to_nothing,_not_to_the_upstream's_beans
  Scenario: The checkout's bean store does not resolve to the upstream's
    When state is mounted and the beans graph's read path is resolved
    Then it is refused
