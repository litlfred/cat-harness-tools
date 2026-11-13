# Specifies where a note is anchored (schemas/ui/note-anchor.ts): on a block,
# global to a page, or unattached; how a note moves or is duplicated; and its
# declared secondary references.
Feature: A note has one anchor of three kinds, moves without being re-created, and may name secondaries

  @test:schemas/note-anchor.test.ts::the_three_states_are_actually_three::page-global_and_unattached_are_NOT_the_same_value
  Scenario: A page-global anchor differs from no anchor
    Given a note anchored to page "index" and a note with no anchor
    When their anchors are read
    Then the first is of kind page and not the no-anchor value
    And the second is of kind none

  @test:schemas/note-anchor.test.ts::the_three_states_are_actually_three::page-global_carries_its_page_—_global_is_global_TO_A_PAGE
  Scenario: A page anchor must name its page
    Given a page anchor without a page and one with page "index"
    When each is parsed
    Then the first is refused and the second parses

  @test:schemas/note-anchor.test.ts::the_three_states_are_actually_three::an_unknown_kind_is_refused_rather_than_silently_ignored
  Scenario: An unknown anchor kind is refused
    Given an anchor of kind "chapter"
    When it is parsed
    Then it is refused

  @test:schemas/note-anchor.test.ts::the_three_states_are_actually_three::a_block_anchor_needs_a_label
  Scenario: A block anchor needs a non-empty label
    Given a block anchor with no label and one with an empty label
    When each is parsed
    Then each is refused

  @test:schemas/note-anchor.test.ts::existing_notes_keep_working_—_the_old_field_is_read,_not_replaced::a_note_with_only_targetLabel_reads_as_block-attached
  Scenario: A note with only targetLabel is attached to that block
    Given a note whose only location is targetLabel "sec:page-one"
    When its anchor is read
    Then it is a block anchor on "sec:page-one"

  @test:schemas/note-anchor.test.ts::existing_notes_keep_working_—_the_old_field_is_read,_not_replaced::an_explicit_anchor_wins_over_the_derived_one
  Scenario: An explicit anchor wins over targetLabel
    Given a note with targetLabel "sec:old" and a page anchor on "index"
    When its anchor is read
    Then it is the page anchor

  @test:schemas/note-anchor.test.ts::existing_notes_keep_working_—_the_old_field_is_read,_not_replaced::isOnBlock_answers_from_either_field
  Scenario: A note is on a block by either field
    Given a note with targetLabel "sec:a", one with a block anchor on "sec:a", and one with a page anchor whose page is "sec:a"
    When each is asked whether it is on block "sec:a"
    Then the first two are and the third is not

  @test:schemas/note-anchor.test.ts::existing_notes_keep_working_—_the_old_field_is_read,_not_replaced::an_unattached_note_is_never_page-global_for_any_page
  Scenario: An unattached note is not page-global
    Given a note with no anchor
    When it is asked whether it is page-global on "index"
    Then it is not

  @test:schemas/note-anchor.test.ts::a_move_re-anchors_—_it_does_not_re-create::the_id_survives
  Scenario: A moved note keeps its id
    Given note t1
    When it is moved to block "sec:b"
    Then its id is still t1

  @test:schemas/note-anchor.test.ts::a_move_re-anchors_—_it_does_not_re-create::targetLabel_is_kept_in_step,_so_an_older_reader_still_sees_the_truth
  Scenario: A move to a block updates targetLabel
    Given note t1
    When it is moved to block "sec:b"
    Then its targetLabel is "sec:b"

  @test:schemas/note-anchor.test.ts::a_move_re-anchors_—_it_does_not_re-create::moving_to_a_page_or_to_nothing_CLEARS_the_stale_label
  Scenario: A move off a block clears targetLabel
    Given a note on block "sec:a"
    When it is moved to page "index", or to no anchor
    Then its targetLabel is cleared either way

  @test:schemas/note-anchor.test.ts::a_move_re-anchors_—_it_does_not_re-create::a_move_between_pages_leaves_one_owner,_not_two
  Scenario: A move between pages leaves one page owning the note
    Given a note made page-global on "one" and then moved to "two"
    When it is asked whether it is page-global on each
    Then it is on "two" and not on "one"

  @test:schemas/note-anchor.test.ts::a_drop_never_implicitly_duplicates::duplicating_REQUIRES_a_new_id,_so_it_cannot_happen_by_accident
  Scenario: A duplicate carries the new id it was given
    Given note t1
    When it is duplicated with id t2 onto block "sec:b"
    Then the copy's id is t2 and the original's is still t1
    # Gap: that duplicating cannot happen without a new id is a matter of the function's signature; the test does not exercise any path that omits one.

  @test:schemas/note-anchor.test.ts::a_drop_never_implicitly_duplicates::the_original_is_untouched_by_either_operation
  Scenario: Moving and duplicating leave the original unchanged
    Given a note on "sec:a"
    When it is moved to a page and duplicated with no anchor
    Then the original is exactly as before

  @test:schemas/note-anchor.test.ts::a_drop_never_implicitly_duplicates::a_duplicate_is_a_separate_note_at_a_separate_anchor
  Scenario: A duplicate sits at its own anchor
    Given a note on "sec:a" duplicated as t2 onto "sec:b"
    When each is asked where it is
    Then the original is on "sec:a", the copy on "sec:b", and the copy not on "sec:a"

  @test:schemas/note-anchor.test.ts::beans_carry_no_anchor_—_the_owner's_rule,_guarded::%s_does_not_reach_for_an_anchor
  Scenario: The bean modules never mention an anchor
    Given the bean modules schemas/sdlc/bean-graph.ts and src/workflow/bean-link.ts
    When each is read
    Then it exists and mentions neither NoteAnchor nor the word anchor

  @test:schemas/note-anchor.test.ts::one_primary,_declared_secondaries_—_the_owner's_CRDM_Q1_ruling::a_secondary_reference_does_not_change_where_the_note_is_attached
  Scenario: A secondary reference does not move the note's anchor
    Given a note on "sec:page-one" also about "sec:page-two"
    When its anchor is read
    Then it is the block anchor on "sec:page-one"

  @test:schemas/note-anchor.test.ts::one_primary,_declared_secondaries_—_the_owner's_CRDM_Q1_ruling::a_note_with_no_list_reads_as_[]_rather_than_undefined
  Scenario: A note with no secondaries has an empty list
    Given a note with no alsoAbout and one also about "sec:y"
    When their secondary labels are read
    Then the first is empty and the second is "sec:y"

  @test:schemas/note-anchor.test.ts::one_primary,_declared_secondaries_—_the_owner's_CRDM_Q1_ruling::the_two_relations_come_back_split,_from_one_pass
  Scenario: Notes at a block are split into attached and also-about
    Given note a on "sec:here", note b elsewhere but also about "sec:here", and note c elsewhere
    When the notes at "sec:here" are found
    Then a is attached and b is also-about

  @test:schemas/note-anchor.test.ts::one_primary,_declared_secondaries_—_the_owner's_CRDM_Q1_ruling::a_note_attached_AND_also-about_the_same_node_counts_once,_as_attached
  Scenario: A note attached and also-about the same block counts once
    Given a note on "sec:here" that is also about "sec:here"
    When the notes at "sec:here" are found
    Then it is attached and not also-about

  @test:schemas/note-anchor.test.ts::one_primary,_declared_secondaries_—_the_owner's_CRDM_Q1_ruling::the_badge_counts_PRIMARIES_—_R6_stays_true_with_secondaries_in_play
  Scenario: The badge counts only attached notes
    Given one note on "sec:here" and one also about it
    When the badge at "sec:here" is computed
    Then its count is 1 with no count shown

  @test:schemas/note-anchor.test.ts::one_primary,_declared_secondaries_—_the_owner's_CRDM_Q1_ruling::the_badge_shows_a_count_only_above_one,_and_keeps_the_exact_number
  Scenario: The badge shows a count only above one
    Given two notes on "sec:here"
    When the badge is computed
    Then its count is 2 and shown
    And with no notes the count is 0 and not shown

  @test:schemas/note-anchor.test.ts::one_primary,_declared_secondaries_—_the_owner's_CRDM_Q1_ruling::a_page-global_or_unattached_note_is_at_no_block
  Scenario: Page-global and unattached notes are at no block
    Given a page-global note and an unattached note
    When the notes at "sec:here" are found for each
    Then neither is attached or also-about
