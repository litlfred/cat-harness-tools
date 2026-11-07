# Specifies that the checkout has instance declarations to check. The
# per-declaration tests (one per instance root) have computed titles and are
# not tagged here.
Feature: Every declaration in the checkout is a Knowledge Graph declaration

  @test:test/coordinator/bootstrap-reading-checkout.test.ts::every_declaration_in_this_repository_is_a_Knowledge_Graph_declaration::there_are_declarations_to_check
  Scenario: The checkout has more than three instance declarations
    Given the checkout root
    When its instance roots are found
    Then there are more than 3
