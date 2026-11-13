# Specifies how the harness reads bootstrap: the published class glosses and
# the graph-typology registry take bootstrap's own sentences.
Feature: The harness reads bootstrap's terms and kinds as bootstrap states them

  @test:schemas/bootstrap-reading.test.ts::the_harness_reads_bootstrap's_terms_and_kinds_as_bootstrap_states_them::the_published_vocabulary_uses_bootstrap's_definitions,_and_bootstrap's_terms_link_nowhere_above
  Scenario: The published vocabulary uses bootstrap's definitions and links nowhere above
    Given bootstrap's terms and the harness's class glosses
    When each bootstrap term is looked up as a class
    Then its gloss is bootstrap's definition and its layer is "bootstrap"
    And the bootstrap-layer classes are exactly bootstrap's terms
    And "Tool" is not a bootstrap term but a harness class
    And no bootstrap-layer class carries a seeAlso link

  @test:schemas/bootstrap-reading.test.ts::the_harness_reads_bootstrap's_terms_and_kinds_as_bootstrap_states_them::the_harness's_registry_reads_bootstrap's_sentence;_the_class_it_types_a_directory_with_is_its_own
  Scenario: The harness's typology registry reads bootstrap's summary for each bootstrap typology
    Given bootstrap's graph typologies
    When each is looked up in the harness's base typology registry
    Then it is defined, its summary is bootstrap's sentence and its layer is "bootstrap"
    # Gap: the title's claim that the class typing a directory is the harness's own is not checked.
