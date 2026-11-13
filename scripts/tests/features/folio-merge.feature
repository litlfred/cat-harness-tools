# TODO-HEADER: what scripts/tests/folio-merge.test.ts covers, one or two comment lines. Each Scenario names the test that executes it.
Feature: TODO-FEATURE

  @test:scripts/tests/folio-merge.test.ts::mergeFolio_—_a_union_keyed_by_id::every_published_node_and_every_local_entry_is_a_row:_neither_side_is_dropped
  Scenario: TODO-SCENARIO every published node and every local entry is a row: neither side is dropped
    # TODO-STEPS scripts/tests/folio-merge.test.ts:48

  @test:scripts/tests/folio-merge.test.ts::mergeFolio_—_a_union_keyed_by_id::the_published_copy_wins_for_content
  Scenario: TODO-SCENARIO the published copy wins for content
    # TODO-STEPS scripts/tests/folio-merge.test.ts:53

  @test:scripts/tests/folio-merge.test.ts::mergeFolio_—_a_union_keyed_by_id::the_local_copy_wins_for_the_reader's_own_state,_including_fields_the_merge_does_not_know
  Scenario: TODO-SCENARIO the local copy wins for the reader's own state, including fields the merge does not know
    # TODO-STEPS scripts/tests/folio-merge.test.ts:64

  @test:scripts/tests/folio-merge.test.ts::mergeFolio_—_a_union_keyed_by_id::a_newly_published_node_shows_even_though_the_browser's_folio_never_held_it
  Scenario: TODO-SCENARIO a newly published node shows even though the browser's folio never held it
    # TODO-STEPS scripts/tests/folio-merge.test.ts:72

  @test:scripts/tests/folio-merge.test.ts::mergeFolio_—_a_union_keyed_by_id::a_local-only_item_is_kept_and_marked_unsynced,_with_its_own_title_and_address
  Scenario: TODO-SCENARIO a local-only item is kept and marked unsynced, with its own title and address
    # TODO-STEPS scripts/tests/folio-merge.test.ts:79

  @test:scripts/tests/folio-merge.test.ts::mergeFolio_—_a_union_keyed_by_id::the_bare_id_and_pin:/bookmark:_forms_match_too;_nothing_else_is_guessed
  Scenario: TODO-SCENARIO the bare id and pin:/bookmark: forms match too; nothing else is guessed
    # TODO-STEPS scripts/tests/folio-merge.test.ts:89

  @test:scripts/tests/folio-merge.test.ts::mergeFolio_—_a_union_keyed_by_id::two_local_keys_for_one_published_id:_the_first_syncs,_the_second_stays_its_own_row
  Scenario: TODO-SCENARIO two local keys for one published id: the first syncs, the second stays its own row
    # TODO-STEPS scripts/tests/folio-merge.test.ts:100

  @test:scripts/tests/folio-merge.test.ts::mergeFolio_—_a_union_keyed_by_id::a_missing_or_malformed_side_is_empty,_not_an_error
  Scenario: TODO-SCENARIO a missing or malformed side is empty, not an error
    # TODO-STEPS scripts/tests/folio-merge.test.ts:107

  @test:scripts/tests/folio-merge.test.ts::mergeFolio_—_a_union_keyed_by_id::it_is_self-contained,_so_the_page_can_carry_it_by_toString
  Scenario: TODO-SCENARIO it is self-contained, so the page can carry it by toString
    # TODO-STEPS scripts/tests/folio-merge.test.ts:114

  @test:scripts/tests/folio-merge.test.ts::the_page_loads_both_sources::it_carries_the_merge_and_reads_the_reader's_folio_store
  Scenario: TODO-SCENARIO it carries the merge and reads the reader's folio store
    # TODO-STEPS scripts/tests/folio-merge.test.ts:126

  @test:scripts/tests/folio-merge.test.ts::the_page_loads_both_sources::the_projection_is_fetched_past_any_cache,_and_fetched_again_when_the_tab_returns
  Scenario: TODO-SCENARIO the projection is fetched past any cache, and fetched again when the tab returns
    # TODO-STEPS scripts/tests/folio-merge.test.ts:133
