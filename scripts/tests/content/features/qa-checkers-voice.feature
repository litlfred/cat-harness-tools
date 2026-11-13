# The voice QA checkers' false-positive fixes (folio-assistant #41, beans
# nwus, fl5m, b7yo, 2t41): every exemption strips one construction and leaves
# the rest of the line checked, and the genuine case beside each exemption
# still fails. Each Scenario names the test that executes it.
Feature: Voice QA checkers exempt narrow constructions and still catch the genuine case

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_`merely`_in_a_contrast_is_a_degree_marker::'rather_than_merely_cited'_passes_—_the_contrast_IS_the_claim
  Scenario: "rather than merely cited" passes the editorializing check
    Given a file with the line "what makes a source authoritative rather than merely cited."
    When the editorializing check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_`merely`_in_a_contrast_is_a_degree_marker::'rather_than_merely_compile'_passes
  Scenario: "rather than merely compile" passes the editorializing check
    Given a file with the line "Rules that make this work rather than merely compile:"
    When the editorializing check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_`merely`_in_a_contrast_is_a_degree_marker::'not_merely_a_relabelling'_passes
  Scenario: "not merely a relabelling" passes the editorializing check
    Given a file with the line "This is not merely a relabelling."
    When the editorializing check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_`merely`_in_a_contrast_is_a_degree_marker::bare_'merely_a_formality'_still_FAILS_—_the_exemption_is_the_contrast,_not_the_word
  Scenario: A bare "merely a formality" fails the editorializing check
    Given a file with the line "The proof is merely a formality."
    When the editorializing check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_`merely`_in_a_contrast_is_a_degree_marker::bare_'merely_the_shadow'_still_FAILS
  Scenario: A bare "merely the shadow" fails the editorializing check
    Given a file with the line "This is merely the shadow of the real result."
    When the editorializing check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_`merely`_in_a_contrast_is_a_degree_marker::a_comparative_line_carrying_a_SECOND_hit_still_FAILS_(strip,_not_mask)
  Scenario: A contrast line with a second editorializing word fails
    Given a file with the line "authoritative rather than merely cited, and surprisingly so."
    When the editorializing check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_`merely`_in_a_contrast_is_a_degree_marker::hard-wrapped_'does_not'_/_'merely_go_unread'_passes
  Scenario: A negator wrapped onto the previous line still exempts "merely"
    Given a file whose line ending "does not" is followed by a line starting "merely go unread"
    When the editorializing check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_`merely`_in_a_contrast_is_a_degree_marker::a_line_OPENING_with_'merely'_after_a_non-negated_line_still_FAILS
  Scenario: A line opening with "merely" after a line with no negator fails
    Given a file with "The argument is short." followed by "merely a formality, in the end"
    When the editorializing check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_domain-phrase_exemption_is_a_strip,_not_a_mask::'naturally_occurring'_alone_passes_(domain_term,_not_opinion)
  Scenario: "naturally occurring" alone passes the editorializing check
    Given a file with the line "These are naturally occurring elements."
    When the editorializing check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_domain-phrase_exemption_is_a_strip,_not_a_mask::editorializing_elsewhere_on_a_'naturally_occurring'_line_still_FAILS
  Scenario: Editorializing elsewhere on a "naturally occurring" line fails
    Given a file with the line "naturally occurring elements are, surprisingly, abundant"
    When the editorializing check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_domain-phrase_exemption_is_a_strip,_not_a_mask::'simply_is'_still_fails_(genuine_intensifier)
  Scenario: "simply is" fails the editorializing check
    Given a file with the line "the universe simply is the structure"
    When the editorializing check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_domain-phrase_exemption_is_a_strip,_not_a_mask::'naturally_beautiful'_still_fails_(exemption_is_narrow)
  Scenario: "naturally beautiful" fails the editorializing check
    Given a file with the line "a naturally beautiful result"
    When the editorializing check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_'Right'_is_a_technical_adjective,_not_an_interjection::'Right_multiplication_by_a_generator'_passes
  Scenario: "Right multiplication" passes the scholarly-default check
    Given a markdown file with the line "Right multiplication by a generator preserves the parabolic."
    When the scholarly-default check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_'Right'_is_a_technical_adjective,_not_an_interjection::'Right_action_of_the_Hecke_generator'_passes
  Scenario: "Right action" passes the scholarly-default check
    Given a markdown file with the line "Right action of the Hecke generator on the module."
    When the scholarly-default check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_'Right'_is_a_technical_adjective,_not_an_interjection::'Right_gauge_action'_passes_inside_a_Lean_docstring
  Scenario: "Right gauge action" in a Lean docstring passes the scholarly-default check
    Given a Lean file whose docstring reads "Right gauge action `SU(2)_R`."
    When the scholarly-default check runs on the Lean file
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_'Right'_is_a_technical_adjective,_not_an_interjection::'Right,_so_...'_still_fails_(genuine_interjection)
  Scenario: The interjection "Right, so" fails the scholarly-default check
    Given a markdown file with the line "Right, so the bracket closes."
    When the scholarly-default check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_'Right'_is_a_technical_adjective,_not_an_interjection::'Right_now_we_encode_...'_still_fails_(lecturer_cadence)
  Scenario: "Right now we encode" fails the scholarly-default check
    Given a markdown file with the line "Right now we encode the real-part magnitude."
    When the scholarly-default check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_'Right'_is_a_technical_adjective,_not_an_interjection::neighbouring_bare-comma_openers_are_untouched
  Scenario: The openers "Alright" and "Okay so" still fail the scholarly-default check
    Given markdown files with "Alright the construction proceeds." and "Okay so the map is defined."
    When the scholarly-default check runs on each
    Then each fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_'So_the'_is_conclusion-drawing,_not_lecture_cadence::'So_the_sum_is_well-defined'_passes
  Scenario: The conclusion "So the sum is well-defined" passes
    Given a markdown file with the line "So the sum is well-defined and independent of the choice."
    When the scholarly-default check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_'So_the'_is_conclusion-drawing,_not_lecture_cadence::'So_the_two_sides_line_up'_passes
  Scenario: The conclusion "So the two sides line up" passes
    Given a markdown file with the line "So the two sides line up under the pairing."
    When the scholarly-default check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_'So_the'_is_conclusion-drawing,_not_lecture_cadence::'So_the_plan_is_...'_still_fails_(the_narration_it_was_for)
  Scenario: The narration "So the plan is" fails
    Given a markdown file with the line "So the plan is to reduce to the abelian case."
    When the scholarly-default check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_'So_the'_is_conclusion-drawing,_not_lecture_cadence::'So_the_idea_is_...'_still_fails
  Scenario: The narration "So the idea is" fails
    Given a markdown file with the line "So the idea is to push the estimate through."
    When the scholarly-default check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_'So_the'_is_conclusion-drawing,_not_lecture_cadence::'So_now_we_turn_to'_still_fails
  Scenario: The narration "So now we turn to" fails
    Given a markdown file with the line "So now we turn to the second factor."
    When the scholarly-default check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_bare-word_alternatives_do_not_glue_to_the_next_word::'So_there_is_no_inverse'_passes
  Scenario: "So there" is not matched as "So the"
    Given a markdown file with the line "So there is no inverse to apply here."
    When the scholarly-default check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_bare-word_alternatives_do_not_glue_to_the_next_word::'So_they_are_stated_over_the_same_ring'_passes
  Scenario: "So they" is not matched as "So the"
    Given a markdown file with the line "So they are stated over the same generic ring."
    When the scholarly-default check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_bare-word_alternatives_do_not_glue_to_the_next_word::'So_these_two_agree'_passes
  Scenario: "So these" is not matched as "So the"
    Given a markdown file with the line "So these two agree on the overlap."
    When the scholarly-default check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_bare-word_alternatives_do_not_glue_to_the_next_word::'So_what_is_proved_here_is_the_reduction'_passes
  Scenario: The "i" of "is" is not matched as "I"
    Given a markdown file with the line "So what is proved here is the reduction."
    When the scholarly-default check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_bare-word_alternatives_do_not_glue_to_the_next_word::'So_what_we_do_next'_still_fails
  Scenario: "So what we do next" fails
    Given a markdown file with the line "So what we do next is bound the tail."
    When the scholarly-default check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_a_wrap_continuation_is_not_a_sentence_start::'right,_since_...'_as_a_continuation_line_passes
  Scenario: "right, since" continuing a wrapped sentence passes
    Given a file with "The action is on the" followed by "right, since the ring need not be commutative."
    When the scholarly-default check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_a_wrap_continuation_is_not_a_sentence_start::the_same_opener_after_a_full_stop_still_fails
  Scenario: "Right, so" after a full stop fails
    Given a file with "The action is on one side." followed by "Right, so the ring need not be commutative."
    When the scholarly-default check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_a_wrap_continuation_is_not_a_sentence_start::an_opener_at_the_very_first_line_still_fails
  Scenario: An opener on the first line fails
    Given a file whose first line is "Okay so the map is defined."
    When the scholarly-default check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkScholarlyDefault_—_a_wrap_continuation_is_not_a_sentence_start::an_opener_after_a_blank_line_still_fails
  Scenario: An opener after a blank line fails
    Given a file with "A closing sentence", a blank line, then "Basically, the map is defined."
    When the scholarly-default check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkAuthorNotesPollution_—_a_measurement's_date_is_provenance,_not_pollution::the_AGENTS.md-mandated_form_passes
  Scenario: A measurement with its date passes the author-notes check
    Given the lines "**precision 71%** — measured 2026-09-18 on main." and "Re-measured 2026-09-18: the arc is 274 to 195."
    When the author-notes check runs on each
    Then each passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkAuthorNotesPollution_—_a_measurement's_date_is_provenance,_not_pollution::a_bare_status_date_still_FAILS
  Scenario: A bare status date fails the author-notes check
    Given the lines "As of 2026-05-28 this remains open." and "Blocked since 2026-05-28."
    When the author-notes check runs on each
    Then each fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkAuthorNotesPollution_—_a_measurement's_date_is_provenance,_not_pollution::the_exemption_cannot_reach_across_a_sentence_boundary
  Scenario: "measured" in one sentence does not exempt a date in the next
    Given the line "We measured throughput. As of 2026-05-28 it is unfixed."
    When the author-notes check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkAuthorNotesPollution_—_a_measurement's_date_is_provenance,_not_pollution::other_author-notes_patterns_on_a_measured_line_are_unaffected
  Scenario: Another author-notes pattern on a measured line fails
    Given the line "Measured 2026-09-18 by Claude on main."
    When the author-notes check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkStatusLeak_—_a_definition_table's_label_cell_names_a_term::a_checkpoint_name_in_a_label_cell_passes
  Scenario: A checkpoint name in a table's label cell passes the status-leak check
    Given the table row "| **Needs review** (Phase 1) | Confirm the BA's needs statement |"
    When the status-leak check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkStatusLeak_—_a_definition_table's_label_cell_names_a_term::a_status_marker_in_the_DEFINITION_half_still_FAILS
  Scenario: A status marker in the definition cell fails
    Given the table row "| **Phase 1** | (TODO) write the needs statement |"
    When the status-leak check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkStatusLeak_—_a_definition_table's_label_cell_names_a_term::a_label_cell_that_is_not_purely_a_label_still_FAILS
  Scenario: A label cell holding prose fails
    Given the table row "| **Pending.** the proof is stalled | see below |"
    When the status-leak check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkStatusLeak_—_a_definition_table's_label_cell_names_a_term::the_same_text_outside_a_table_still_FAILS
  Scenario: A checkpoint name outside a table fails
    Given the line "**Needs review** before we ship."
    When the status-leak check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_proof_economy_is_not_an_opinion_(bean_2t41)::sentence-initial:_the_exemplar's_own_opening_case_passes
  Scenario: A sentence-initial "Clearly" before a routine verification passes
    Given the line "Clearly the relation of homotopy is reflexive, symmetric and transitive."
    When the editorializing check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_proof_economy_is_not_an_opinion_(bean_2t41)::predicative_`is_clearly`_and_bare_`is_clear`_pass
  Scenario: Predicative "is clearly" and "is clear" pass
    Given the lines "The inclusion map is clearly a homotopy equivalence." and "This is clear for the case n = 0."
    When the editorializing check runs on each
    Then each passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_proof_economy_is_not_an_opinion_(bean_2t41)::the_`it_is_easy_to_see`_frame_passes
  Scenario: The frame "it is easy to see" passes
    Given the line "it is easy to see that ai is unique and well-defined"
    When the editorializing check runs
    Then it passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_proof_economy_is_not_an_opinion_(bean_2t41)::adverb_and_verb_pass_in_EITHER_order,_with_auxiliaries_between
  Scenario: Proof-economy adverb and verb pass in either order
    Given the lines "The parallel can clearly be represented by a loop.", "it follows easily that L is trivial.", "It clearly maps JG onto S." and "It is easily verified that the kernel is [A]."
    When the editorializing check runs on each
    Then each passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_proof_economy_is_not_an_opinion_(bean_2t41)::`naturally_isomorphic`_passes_—_the_adverb_IS_the_name
  Scenario: Terms of art "naturally isomorphic" and "properly discontinuous" pass
    Given the lines "The group is naturally isomorphic to G(Lt)." and "The action is properly discontinuous."
    When the editorializing check runs on each
    Then each passes

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_proof_economy_is_not_an_opinion_(bean_2t41)::THE_EXEMPTION_IS_THE_CONSTRUCTION,_NOT_THE_WORD
  Scenario: "Clearly" before a value judgement fails
    Given the line "Clearly this is the most important result in the field."
    When the editorializing check runs
    Then it fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_proof_economy_is_not_an_opinion_(bean_2t41)::the_genuine_set_still_fails
  Scenario: Genuine editorializing fails
    Given the lines "Unfortunately these invariants are not strong enough.", "Surprisingly, the two constructions agree.", "This is a beautiful result." and "It is worth noting that the map is injective."
    When the editorializing check runs on each
    Then each fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_proof_economy_is_not_an_opinion_(bean_2t41)::a_bare_superlative_now_fails_—_it_did_not_before
  Scenario: A bare superlative fails
    Given the lines "This is the most important result in the field." and "The single most striking consequence follows."
    When the editorializing check runs on each
    Then each fails

  @test:scripts/tests/content/qa-checkers-voice.test.ts::checkEditorializing_—_proof_economy_is_not_an_opinion_(bean_2t41)::a_hard_wrap_cuts_the_idiom_BOTH_ways
  Scenario: A proof-economy idiom split by a hard wrap passes
    Given a file whose line ends "is just the" and continues "commutator subgroup [A] of the kernel"
    And a file whose line ends "clearly" and continues "represents the ith parallel"
    When the editorializing check runs on each
    Then each passes
