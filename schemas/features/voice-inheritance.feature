# Specifies voice profiles and their inheritance (schemas/content/voices.ts):
# rules union along extends, what is not inherited, applicability, and the
# scope an inherited rule keeps.
Feature: A voice extends another by unioning rules, keeping each rule's origin and scope

  @test:schemas/voice-inheritance.test.ts::rules_UNION,_because_two_vendors_agreeing_is_evidence::a_child_keeps_the_base's_rules_and_adds_its_own
  Scenario: A child voice keeps the base's rules and adds its own
    Given a base voice with rules degrees-of-freedom and concise, and a child extending it with gerund-names
    When the child is resolved
    Then it resolves with rules degrees-of-freedom, concise and gerund-names in that order

  @test:schemas/voice-inheritance.test.ts::rules_UNION,_because_two_vendors_agreeing_is_evidence::and_says_WHERE_each_rule_came_from_—_otherwise_the_union_is_untraceable
  Scenario: Each resolved rule records the voice it came from
    Given a base voice and a child in instance agent-skills
    When the child is resolved
    Then the base's rule comes from agent-skills/skill-authoring
    And the child's rule comes from agent-skills/skill-authoring-gemini

  @test:schemas/voice-inheritance.test.ts::rules_UNION,_because_two_vendors_agreeing_is_evidence::a_child_overrides_ONLY_by_reusing_a_rule_id,_and_the_base_rule_keeps_its_place
  Scenario: A child overrides a rule by reusing its id, in the base's position
    Given a base with rules a, b and c, and a child redefining b
    When the child is resolved
    Then the rules are a, b and c in that order
    And b carries the child's description and comes from the child

  @test:schemas/voice-inheritance.test.ts::what_is_NOT_inherited::provenance_is_the_child's_own_—_a_vendor_page_does_not_become_evidence
  Scenario: Provenance is not inherited
    Given a base of provenance evidence and a child of provenance assertion
    When the child is resolved
    Then its provenance is assertion

  @test:schemas/voice-inheritance.test.ts::what_is_NOT_inherited::supersession_is_the_child's_own_—_a_live_source_does_not_die_with_its_parent
  Scenario: Supersession is not inherited
    Given a superseded base and a live child extending it
    When the child is resolved
    Then it is not superseded

  @test:schemas/voice-inheritance.test.ts::the_chain_has_to_terminate,_and_say_so_when_it_does_not::a_cycle_is_reported_rather_than_hanging
  Scenario: An extends cycle is reported
    Given voice a extending b and b extending a
    When a is resolved
    Then it fails as a cycle, and the explanation says "cycle"

  @test:schemas/voice-inheritance.test.ts::the_chain_has_to_terminate,_and_say_so_when_it_does_not::a_voice_extending_one_nothing_serves_names_the_id_and_the_instance
  Scenario: Extending a voice nobody serves names the missing voice
    Given a child extending voice "missing" of instance "someone/elsewhere", which is not available
    When the child is resolved
    Then it fails, and the explanation names someone/elsewhere/missing and mentions voices

  @test:schemas/voice-inheritance.test.ts::applicability_—_the_CRDM_axis::absent_means_EVERYWHERE,_including_a_context_naming_nothing
  Scenario: A voice with no applicability is active everywhere
    Given a voice with no activeIn
    When it is asked whether it is active in an empty context and in a named process and role
    Then it is active in both

  @test:schemas/voice-inheritance.test.ts::applicability_—_the_CRDM_axis::a_declared_list_is_an_OR_within_itself
  Scenario: A list of processes is active in any of them
    Given a voice active in Process_Crdm and Process_Review
    When it is asked about Process_Review and Process_Publication
    Then it is active in the first and not the second

  @test:schemas/voice-inheritance.test.ts::applicability_—_the_CRDM_axis::and_an_AND_across_the_three_—_a_lane-scoped_voice_is_NOT_in_force_anywhere_its_process_runs
  Scenario: Process and role conditions must both hold
    Given a voice active in Process_Crdm for role requirements-analyst
    When it is asked about that process with that role, with reviewer, and with no role
    Then it is active only in the first

  @test:schemas/voice-inheritance.test.ts::applicability_—_the_CRDM_axis::an_EMPTY_list_is_refused_—_it_would_switch_the_voice_off_silently
  Scenario: An empty applicability list is refused
    Given applicability with an empty process list and with one process
    When each is parsed
    Then the empty list is refused and the other parses

  @test:schemas/voice-inheritance.test.ts::applicability_—_the_CRDM_axis::an_unknown_key_is_refused,_so_a_typo_is_not_a_voice_that_never_activates
  Scenario: An unknown applicability key is refused
    Given applicability keyed "process" instead of "processes"
    When it is parsed
    Then it is refused

  @test:schemas/voice-inheritance.test.ts::provenance_and_supersession_are_structural,_the_rules_are_not::provenance_is_REQUIRED_—_a_voice_that_did_not_classify_itself_does_not_parse
  Scenario: A voice without provenance does not parse
    Given a voice with its provenance removed
    When it is parsed
    Then it is refused

  @test:schemas/voice-inheritance.test.ts::provenance_and_supersession_are_structural,_the_rules_are_not::the_three_classes_are_the_ones_the_corpus_actually_contains
  Scenario: The provenance classes are assertion, evidence and house
    Given the voice provenance classes
    When they are sorted
    Then they are assertion, evidence and house
    # Gap: the title says these are the classes the corpus contains; no corpus voice is read.

  @test:schemas/voice-inheritance.test.ts::provenance_and_supersession_are_structural,_the_rules_are_not::a_supersession_with_no_successor_is_VALID_—_the_honest_state
  Scenario: A supersession naming a replacement but no successor voice parses
    Given a supersession with a date, a replacement and a quote
    When it is parsed
    Then it parses

  @test:schemas/voice-inheritance.test.ts::provenance_and_supersession_are_structural,_the_rules_are_not::but_a_date_that_is_not_a_date_is_refused
  Scenario: A supersession date must be a date
    Given a supersession dated "June 2026"
    When it is parsed
    Then it is refused

  @test:schemas/voice-inheritance.test.ts::provenance_and_supersession_are_structural,_the_rules_are_not::a_rule's_CONTENT_is_unconstrained,_deliberately
  Scenario: A rule's description is free text
    Given a voice whose rule description is arbitrary prose
    When it is parsed
    Then it parses

  @test:schemas/voice-inheritance.test.ts::an_inherited_rule_keeps_the_scope_it_was_DECLARED_under::both_rules_are_present_—_inheritance_still_unions
  Scenario: A child of a scoped base has both rules
    Given a base scoped to prose in Process_Crdm, and an unscoped child extending it
    When the child is resolved
    Then its rules are base-rule and child-rule

  @test:schemas/voice-inheritance.test.ts::an_inherited_rule_keeps_the_scope_it_was_DECLARED_under::the_BASE's_rule_is_still_confined_to_prose,_and_to_its_process
  Scenario: The base's rule keeps its scope in the child
    Given the resolved child
    When base-rule is asked about prose in Process_Crdm, a theorem there, and prose in Process_Review
    Then it applies only to the first

  @test:schemas/voice-inheritance.test.ts::an_inherited_rule_keeps_the_scope_it_was_DECLARED_under::the_CHILD's_rule_is_unconfined,_because_its_author_declared_no_scope
  Scenario: The child's own rule is unscoped
    Given the resolved child
    When child-rule is asked about a theorem in Process_Review
    Then it applies

  @test:schemas/voice-inheritance.test.ts::an_inherited_rule_keeps_the_scope_it_was_DECLARED_under::a_child_overriding_a_rule_id_takes_over_its_scope_—_it_is_the_child's_rule_now
  Scenario: A child that overrides a rule takes over its scope
    Given an unscoped child redefining base-rule
    When base-rule is asked about a theorem
    Then it applies

  @test:schemas/voice-inheritance.test.ts::an_inherited_rule_keeps_the_scope_it_was_DECLARED_under::an_unknown_rule_id_is_FALSE,_not_'everywhere'
  Scenario: An unknown rule applies nowhere
    Given the resolved child
    When a rule it does not have is asked about prose
    Then it does not apply

  @test:schemas/voice-inheritance.test.ts::an_inherited_rule_keeps_the_scope_it_was_DECLARED_under::the_voice-level_fields_are_the_START_voice's_own,_and_say_so
  Scenario: The resolved voice's own scope is the child's, with each rule's scope recorded
    Given the resolved child
    When its voice-level and per-rule scopes are read
    Then it has no appliesTo and no activeIn of its own
    And base-rule's recorded scope applies to prose
