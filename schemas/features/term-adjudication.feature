# Specifies term adjudications (schemas/content/term-adjudication.ts): an
# owner's decision on a term that disagrees with its authority vocabulary, and
# how check:term-mapping (scripts/check-term-mapping.ts) reads them.
Feature: A term disagreement is adjudicated by one of three outcomes, each recording what it writes

  @test:schemas/term-adjudication.test.ts::three_outcomes,_each_saying_what_is_written_and_where::every_outcome_has_its_row,_and_the_table_has_no_extra_rows
  Scenario: Every outcome says what it writes and where
    Given the outcomes and the outcome-writes table
    When the table's keys are compared with the outcomes
    Then they are the same set
    And every row has something written and somewhere to write it

  @test:schemas/term-adjudication.test.ts::three_outcomes,_each_saying_what_is_written_and_where::a_well-formed_record_of_each_outcome_parses
  Scenario: A well-formed record of each outcome parses
    Given a change-prose, a local-term and a vocabulary-wrong record
    When each is parsed
    Then each parses

  @test:schemas/term-adjudication.test.ts::what_is_refused::an_undetermined_subject:_a_terminology_nobody_reached_has_not_disagreed_(dh4f)
  Scenario: A subject whose mapping was undetermined is refused
    Given a vocabulary-wrong record whose observed exact and concept answers are undetermined
    When it is parsed
    Then it is refused

  @test:schemas/term-adjudication.test.ts::what_is_refused::an_exact_match:_that_is_agreement,_with_nothing_to_decide
  Scenario: A subject that already maps exactly is refused
    Given a vocabulary-wrong record whose observed answers are both mapped
    When it is parsed
    Then it is refused

  @test:schemas/term-adjudication.test.ts::what_is_refused::a_local_term_that_is_exactly_the_authority's_concept:_that_outcome_is_change-prose
  Scenario: A local term related by exactMatch is refused
    Given a local-term record whose relation is exactMatch
    When it is parsed
    Then it is refused

  @test:schemas/term-adjudication.test.ts::what_is_refused::relatedMatch:_an_authored_term_cannot_carry_it,_so_the_outcome_could_not_be_written
  Scenario: A local term related by relatedMatch is refused
    Given a local-term record whose relation is relatedMatch
    When it is parsed
    Then it is refused

  @test:schemas/term-adjudication.test.ts::what_is_refused::a_relation_with_no_concept,_and_a_concept_with_no_relation
  Scenario: A relation and a concept come together or not at all
    Given a local-term record with a relation but no concept, and one with a concept and relation "none"
    When each is parsed
    Then each is refused
    And a record with neither concept nor a relation other than "none" parses

  @test:schemas/term-adjudication.test.ts::what_is_refused::a_decision_with_no_reason,_or_a_blank_one
  Scenario: A decision without a reason is refused
    Given a vocabulary-wrong record without a reason, and one with a blank reason
    When each is parsed
    Then each is refused

  @test:schemas/term-adjudication.test.ts::what_is_refused::an_in-repo_`<scheme>:<id>`_where_an_IRI_is_required
  Scenario: A scheme-prefixed id is refused where an IRI is required
    Given a change-prose record whose concept is "platform:actor"
    When it is parsed
    Then it is refused

  @test:schemas/term-adjudication.test.ts::what_is_refused::change-prose_that_names_no_changed_asset
  Scenario: Change-prose that names no changed asset is refused
    Given a change-prose record with an empty changed list
    When it is parsed
    Then it is refused

  @test:schemas/term-adjudication.test.ts::what_is_refused::two_outcomes_for_one_disagreement_in_a_file
  Scenario: A file may not give two outcomes for one disagreement
    Given an adjudications file with a change-prose and a vocabulary-wrong record on the same subject
    When it is parsed
    Then it is refused
    And when the second record's target is fhir it parses

  @test:schemas/term-adjudication.test.ts::a_record_set_against_the_check's_current_answer::change-prose_is_applied_once_the_term_maps_exactly_or_is_gone,_pending_while_unchanged
  Scenario: A change-prose record's status follows the check's answer
    Given a change-prose record decided on exact unmapped, concept mapped
    When its status is set against the current answer
    Then it is applied when the term maps exactly or is gone
    And pending while the answer is unchanged
    And stale when the concept no longer maps

  @test:schemas/term-adjudication.test.ts::a_record_set_against_the_check's_current_answer::vocabulary-wrong_holds_while_the_observed_pair_holds,_and_is_stale_otherwise
  Scenario: A vocabulary-wrong record holds only while its observation does
    Given a vocabulary-wrong record decided on exact unmapped, concept mapped
    When its status is set against the current answer
    Then it holds while the answer is unchanged
    And it is stale when the term maps exactly or is gone

  @test:schemas/term-adjudication.test.ts::check:term-mapping_reads_the_files_beside_the_schemes::no_file_is_zero_files,_not_a_failure
  Scenario: A glossary with no adjudication file reads as zero files
    Given a checkout with a glossary directory and no adjudication file
    When adjudications are read
    Then there are no files, no invalid records and no statuses

  @test:schemas/term-adjudication.test.ts::check:term-mapping_reads_the_files_beside_the_schemes::an_invalid_record_is_reported_with_its_path
  Scenario: An invalid record is reported with its file
    Given an adjudication file whose record has an empty reason
    When adjudications are read
    Then there is one invalid entry naming x.term-adjudications.json

  @test:schemas/term-adjudication.test.ts::check:term-mapping_reads_the_files_beside_the_schemes::a_valid_record_is_set_against_the_mappings_this_run_produced
  Scenario: A valid record is set against this run's mappings
    Given an adjudication file with a vocabulary-wrong record and a mapping run that still observes the same pair
    When adjudications are read
    Then there is one file, nothing invalid, and the record "kg-tools/participant on skos" holds
