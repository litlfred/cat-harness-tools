# Specifies the four content axes: content adapters and profiles
# (schemas/content/block-kinds.ts), the visualiser kinds and the per-directory
# visualisedAs field (schemas/kg/cat-harness.ts), and interactivity
# (schemas/kg/harness-config.ts).
Feature: The four content axes stay distinct, and each keeps its own property

  @test:schemas/content-axes.test.ts::the_four_axes_are_four,_and_none_is_a_synonym_for_another::no_value_appears_on_two_axes,_except_the_ONE_that_is_meant_to
  Scenario: Exactly one value is shared between axes
    Given the values of the adapter, profile, visualiser and interactivity axes
    When the values that appear more than once are counted
    Then there is exactly one
    And it is "document"
    # Gap: the test's comment names `paper` as the deliberate overlap, but the assertion pins "document"; the reason is not checked.

  @test:schemas/content-axes.test.ts::the_four_axes_are_four,_and_none_is_a_synonym_for_another::the_two_NEW_axes_overlap_nothing_at_all
  Scenario: The visualiser and interactivity axes share no value with the older axes
    Given the adapter and profile values
    When each visualiser and interactivity value is looked up among them
    Then none is found

  @test:schemas/content-axes.test.ts::the_four_axes_are_four,_and_none_is_a_synonym_for_another::each_axis_is_non-empty,_so_none_of_this_is_vacuous
  Scenario: Every axis has at least one value
    Given the four axes
    When their lengths are read
    Then each is greater than zero

  @test:schemas/content-axes.test.ts::interactivity_—_`undetermined`_is_a_VALUE,_not_an_absence::the_axis_carries_all_three_answers
  Scenario: Interactivity has three values
    Given the interactivity axis
    When its values are sorted
    Then they are "interactive", "static" and "undetermined"

  @test:schemas/content-axes.test.ts::interactivity_—_`undetermined`_is_a_VALUE,_not_an_absence::absent_and_`undetermined`_are_DIFFERENT_states_on_a_real_config
  Scenario: An absent interactivity differs from "undetermined"
    Given a harness config of content type "document" with no interactivity
    And another with interactivity "undetermined"
    When both are parsed
    Then the first has no interactivity
    And the second's interactivity is "undetermined"

  @test:schemas/content-axes.test.ts::interactivity_—_`undetermined`_is_a_VALUE,_not_an_absence::it_is_a_widening,_which_is_why_it_could_not_be_a_profile
  Scenario: Profile and interactivity combine into four distinct pairs
    Given the pairs document/static, document/interactive, paper/static and paper/interactive written in the test
    When they are joined into strings
    Then there are four distinct strings
    # Gap: the pairs are literals in the test; no schema or config is consulted, so nothing about the axes is checked.

  @test:schemas/content-axes.test.ts::the_visualiser_axis_attaches_PER_GRAPH::a_directory_may_declare_it
  Scenario: A directory may declare how it is visualised
    Given a library directory declaration with visualisedAs "folio"
    When it is parsed with the content directory schema
    Then its visualisedAs is "folio"

  @test:schemas/content-axes.test.ts::the_visualiser_axis_attaches_PER_GRAPH::ABSENT_is_not_a_default_—_a_consumer_reading_one_would_be_inventing_it
  Scenario: An absent visualiser gets no default
    Given a library directory declaration without visualisedAs
    When it is parsed
    Then it has no visualisedAs

  @test:schemas/content-axes.test.ts::the_visualiser_axis_attaches_PER_GRAPH::a_value_outside_the_vocabulary_is_refused
  Scenario: A visualiser outside the vocabulary is refused
    Given a directory declaration with visualisedAs "whiteboard"
    When it is parsed
    Then parsing throws

  @test:schemas/content-axes.test.ts::the_visualiser_axis_attaches_PER_GRAPH::it_is_NOT_`coverage.visualiser`_—_the_two_coexist_on_one_directory
  Scenario: visualisedAs and coverage.visualiser coexist on one directory
    Given a directory with visualisedAs "folio" and a coverage visualiser path
    When it is parsed
    Then visualisedAs is "folio"
    And the coverage visualiser is kept

  @test:schemas/content-axes.test.ts::one_visualiser,_and_the_count_is_a_claim::cat-harness_provides_exactly_one
  Scenario: The harness provides exactly one visualiser kind
    Given the visualiser kinds
    When they are listed
    Then they are exactly "folio"
