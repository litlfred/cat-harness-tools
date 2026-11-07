# Specifies SourceDescriptorSchema (schemas/library/source-descriptor.ts) over
# every source descriptor in the checkout's declared schemas directories. The
# per-descriptor parse tests have computed titles and are not tagged here.
Feature: Every source descriptor in the checkout parses and explains a non-self-contained subset

  @test:test/coordinator/source-descriptor.test.ts::source_descriptors::there_are_descriptors_to_check,_so_the_checks_below_are_not_vacuous
  Scenario: There are at least two source descriptors
    Given the JSON files in the checkout's declared schemas directories whose $schema is the descriptor tag
    When they are counted
    Then there are at least 2

  @test:test/coordinator/source-descriptor.test.ts::source_descriptors::a_source_whose_subset_is_NOT_self-contained_says_why
  Scenario: A descriptor whose subset is not self-contained gives its basis
    Given every source descriptor
    When each is parsed
    Then each whose subsetIsSelfContained is false has a subsetBasis
