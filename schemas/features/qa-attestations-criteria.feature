# Specifies the QA attestation store (schemas/sdlc/qa-attestations.ts): agent
# and human judgements are held apart from a derived report's script results,
# composed back on read, moved into the store on first save, and migrated by
# scripts/migrate-qa-attestations.ts.
Feature: Judgements live in an attestation store apart from the derived QA report

  @test:schemas/qa-attestations-criteria.test.ts::the_envelope_—_2gst's,_with_the_8wj1_families_as_union_members::a_block-qa_file_carries_{kind,_id,_path}_as_its_subject_and_validates
  Scenario: A block-qa store file names its subject and validates
    Given a layer whose store holds one judgement for block "seed"
    When the store file is read
    Then its subject is kind block, id seed, path seed
    And it validates against the attestations schema

  @test:schemas/qa-attestations-criteria.test.ts::the_envelope_—_2gst's,_with_the_8wj1_families_as_union_members::a_script_entry,_a_missing_locale_on_translation-qa,_or_a_stray_field_is_refused
  Scenario: The store refuses script entries, a translation without locale, and stray fields
    Given a block-qa attestations envelope
    When it holds an agent judgement it parses
    And when it holds a script entry it is refused
    And a translation-qa envelope without locale is refused, and with locale "fr" parses
    And an envelope with a totals field is refused

  @test:schemas/qa-attestations-criteria.test.ts::the_envelope_—_2gst's,_with_the_8wj1_families_as_union_members::the_subject-composed_path_is_the_same_one_attestationPathFor_gives_for_the_derived_report
  Scenario: The store path from a subject equals the one derived from its report
    Given a French translation subject content/p and its derived report path
    When the store path is composed from the subject and from the report
    Then both are the same path
    And the key derived from the report is the subject's key

  @test:schemas/qa-attestations-criteria.test.ts::split_and_compose::compose(split(x))_is_x_when_judgements_lead,_key_order_included
  Scenario: Splitting and composing criteria is the identity when judgements lead
    Given criteria a with a judgement then a script entry, b with a script entry, and c with a judgement
    When they are split and composed again
    Then the script half keeps keys a, b, c in order
    And the composed criteria serialise identically to the original

  @test:schemas/qa-attestations-criteria.test.ts::split_and_compose::a_malformed_entry_is_kept_as_a_judgement,_never_dropped_as_a_script_one
  Scenario: A malformed entry is kept as a judgement
    Given criterion a with an empty entry and a script entry
    When it is split
    Then the judgement half holds one entry for a

  @test:schemas/qa-attestations-criteria.test.ts::read_states::no_store_directory_at_all_is_`absent`_—_not_a_refusal
  Scenario: A layer with no store reads as absent
    Given a layer with no store directory
    When a subject's judgements are read
    Then the state is absent

  @test:schemas/qa-attestations-criteria.test.ts::read_states::present_store,_no_file_for_the_subject:_`miss`;_a_garbled_file:_`corrupt`
  Scenario: A missing subject file is a miss and a garbled one is corrupt
    Given a layer with a store but no file for subject content/b
    When its judgements are read
    Then the state is miss
    And once a garbled file is written there the state is corrupt

  @test:schemas/qa-attestations-criteria.test.ts::read_states::a_store_file_holding_a_script_entry,_or_naming_another_subject,_is_`corrupt`
  Scenario: A store file with a script entry or another subject is corrupt
    Given a store file for b holding a script entry
    When it is read
    Then the state is corrupt
    And a store file for b naming path "other" is also corrupt

  @test:schemas/qa-attestations-criteria.test.ts::owner_ruling_2_—_auto-move_on_first_save::(a)_prior_holds_a_judgement,_NO_store:_after_the_write_it_is_in_the_store,_verbatim
  Scenario: With no store, a prior report's judgement moves into the store on first save
    Given a layer with no store and a prior report holding a script entry and a judgement
    When the prior is resolved and new script results are finalised
    Then the prior is adopted
    And the store now holds exactly the judgement
    And the output holds the judgement then the new script entry

  @test:schemas/qa-attestations-criteria.test.ts::owner_ruling_2_—_auto-move_on_first_save::(a')_store_present_but_no_entry_for_this_subject:_moved_the_same_way
  Scenario: With a store lacking the subject, the judgement moves the same way
    Given a store with no file for b and a prior holding a judgement
    When the prior is resolved and finalised
    Then it is adopted and the store reads as a hit

  @test:schemas/qa-attestations-criteria.test.ts::owner_ruling_2_—_auto-move_on_first_save::(b)_a_CORRUPT_store_file_is_refused:_nothing_to_write_with
  Scenario: A corrupt store file refuses the save and is left untouched
    Given b's store file holds a merge-conflict marker
    When a prior is resolved
    Then it is refused as corrupt
    And the file is unchanged

  @test:schemas/qa-attestations-criteria.test.ts::owner_ruling_2_—_auto-move_on_first_save::(b')_a_store_path_that_is_not_a_directory_is_`unknown`,_and_refused
  Scenario: A store path that is a file is unknown and refused
    Given test/attestations is a file rather than a directory
    When a prior is resolved
    Then it is refused as unknown

  @test:schemas/qa-attestations-criteria.test.ts::owner_ruling_2_—_auto-move_on_first_save::(c)_store_HIT:_the_store_is_the_source,_and_a_prior's_stale_projection_does_not_change_it
  Scenario: On a store hit the store is the source of judgements
    Given b's store holds judgements kept and added-later, and the prior holds kept and an old script entry
    When the prior is resolved and a new script result finalised
    Then nothing is adopted
    And the output is kept, added-later, then the new script entry

  @test:schemas/qa-attestations-criteria.test.ts::owner_ruling_2_—_auto-move_on_first_save::(c')_store_HIT_and_the_prior_holds_a_judgement_the_store_lacks:_a_conflict,_refused,_never_dropped
  Scenario: A prior judgement the store lacks is a conflict
    Given b's store holds judgement kept and the prior holds judgement stray
    When the prior is resolved
    Then it is refused as a conflict

  @test:schemas/qa-attestations-criteria.test.ts::owner_ruling_2_—_auto-move_on_first_save::an_attesting_writer's_new_entry_is_in_the_store_before_the_derived_report_is_composed
  Scenario: An attesting writer's new judgement is stored
    Given a French translation subject p with no prior
    When a judgement and a script entry are finalised by an attesting writer
    Then the store reads as a hit
    And the store file is translation-qa/p.fr.attestations.json
    # Gap: the title says the entry is stored before the derived report is composed; ordering is not observed, only that it ends up stored.

  @test:schemas/qa-attestations-criteria.test.ts::this_repository's_store_is_the_DECLARED_one::no_marker_file_decides_presence
  Scenario: The harness's store is its own declared one, with no marker file
    Given the harness root
    When its attestation store home is found
    Then it is found by "own"
    And no attestations.store.json marker exists

  @test:schemas/qa-attestations-criteria.test.ts::the_D2_split,_measured_over_a_fixture_corpus::before:_every_judgement_is_missing_from_the_store;_after:_counted_by_family,_none_missing
  Scenario: Migration moves every judgement and counts them by family
    Given a fixture corpus of derived reports holding four judgements in three files
    When the migration is checked, run, and checked again
    Then before it judgements are missing
    And after it nothing is unreadable or missing, with 4 entries in 3 files, 3 block-qa and 1 translation-qa

  @test:schemas/qa-attestations-criteria.test.ts::the_D2_split,_measured_over_a_fixture_corpus::every_judgement_is_byte-identical_in_the_store
  Scenario: Every migrated judgement is identical in the store
    Given the migrated fixture corpus
    When each report's judgements are compared with the store
    Then each store read is a hit and each judgement matches, four in all

  @test:schemas/qa-attestations-criteria.test.ts::the_D2_split,_measured_over_a_fixture_corpus::every_judgement's_TEXT_is_the_same_bytes_in_the_derived_report_and_in_the_store
  Scenario: Every judgement's text is the same in report and store
    Given the migrated fixture corpus
    When each judgement is serialised as its report serialises it
    Then the same text is in the report and in the store file, four in all

  @test:schemas/qa-attestations-criteria.test.ts::the_D2_split,_measured_over_a_fixture_corpus::ROUND_TRIP:_each_derived_file,_recomposed_from_its_script_half_and_the_store,_is_the_same_bytes
  Scenario: Each report recomposed from its script half and the store is byte-identical
    Given the three migrated reports holding judgements
    When each is recomposed from its script half and the store
    Then the text is exactly the report's

  @test:schemas/qa-attestations-criteria.test.ts::the_D2_split,_measured_over_a_fixture_corpus::ROUND_TRIP_through_ruling_2:_with_NO_store,_the_first_save_writes_exactly_the_migrated_store
  Scenario: A first save with no store writes exactly what migration writes
    Given an unmigrated fixture corpus and a migrated copy
    When each report's prior is resolved and its script half finalised
    Then each prior is adopted and the report text is unchanged
    And each store file equals the migrated copy's
    And four judgements moved, and a migration check then finds all four already held and none missing

  @test:schemas/qa-attestations-criteria.test.ts::the_D2_split,_measured_over_a_fixture_corpus::the_migration_is_idempotent
  Scenario: Migration is idempotent
    Given the unmigrated fixture corpus
    When migration runs twice
    Then the first adds four judgements in three store files
    And the second adds none, writes none and finds four already held

  @test:schemas/qa-attestations-criteria.test.ts::the_D2_split,_measured_over_a_fixture_corpus::a_store_file_moved_with_its_content_directory_has_its_stale_subject.path_repaired_by_migrateCriteria
  Scenario: Migration repairs a stale subject path
    Given a migrated store file whose subject path is rewritten to old/a
    When migration is checked
    Then the file's subject.path is reported missing and nothing is unreadable
    And running migration rewrites one store file
    And a further check finds nothing missing
