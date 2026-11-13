# Specifies harnessRoot (schemas/harness-root.ts): which cat-harness checkout
# a cat-harness-tools checkout reads when CAT_HARNESS_ROOT is unset.
Feature: harnessRoot prefers a sibling cat-harness over a linked package

  @test:schemas/harness-root.test.ts::harnessRoot::the_sibling_cat-harness_wins_over_a_linked_package_from_another_checkout
  Scenario: A sibling cat-harness wins over a linked package
    Given a rehearsal workspace with a sibling cat-harness and node_modules linking another checkout's cat-harness
    When harnessRoot runs there with CAT_HARNESS_ROOT unset
    Then it exits 0 and answers the sibling rehearsal/cat-harness

  @test:schemas/harness-root.test.ts::harnessRoot::with_no_sibling,_the_linked_package_is_still_found
  Scenario: With no sibling the linked package is found
    Given the same workspace without a sibling cat-harness
    When harnessRoot runs there with CAT_HARNESS_ROOT unset
    Then it exits 0 and answers the linked index/cat-harness
