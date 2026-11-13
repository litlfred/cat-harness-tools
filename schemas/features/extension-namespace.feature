# Specifies that BPMN extension elements are recognised by namespace, never by
# the prefix a diagram binds (schemas/kg/namespaces.ts and the process-model
# loader src/workflow/process-model.ts).
Feature: Our BPMN extension elements are recognised by namespace, not by prefix

  @test:schemas/extension-namespace.test.ts::the_parser_follows_the_namespace,_not_the_prefix::bootstrap's_diagram,_written_bootstrap.processes:,_binds_bootstrap's_own_address_(stage_2)
  Scenario: Bootstrap's main diagram binds bootstrap's own processes address
    Given bootstrap's processes/initialize-harness.bpmn
    When its own extension prefixes are read
    Then they are exactly "bootstrap.processes"
    And the file binds that prefix to the bootstrap processes namespace
    And it contains no folio: element

  @test:schemas/extension-namespace.test.ts::the_parser_follows_the_namespace,_not_the_prefix::the_same_address_under_any_other_prefix_loads_into_the_same_model
  Scenario: The same namespace under another prefix loads into the same model
    Given a copy of bootstrap's diagram unchanged and a copy with the prefix renamed to "x"
    When both are loaded as process models
    Then the unchanged model names the skill "confirm-harness"
    And the renamed model equals the unchanged one

  @test:schemas/extension-namespace.test.ts::the_parser_follows_the_namespace,_not_the_prefix::the_retired_single_address_is_no_longer_ours_(stage_4)
  Scenario: Elements under the retired folio namespace are not read
    Given a copy of bootstrap's diagram rewritten to folio: bound to the retired single namespace
    When it is loaded as a process model
    Then no node names a skill

  @test:schemas/extension-namespace.test.ts::the_parser_follows_the_namespace,_not_the_prefix::folio:_bound_to_someone_else's_namespace_is_not_ours,_whatever_it_spells
  Scenario: folio: bound to a foreign namespace is not ours
    Given a copy of bootstrap's diagram rewritten to folio: bound to "urn:somebody-else"
    And an unchanged control copy
    When both are loaded
    Then the control names at least one skill
    And the foreign copy names none

  @test:schemas/extension-namespace.test.ts::raw-XML_readers_follow_the_namespace_too::the_prefixes_bound_to_our_namespace_are_found,_dotted_ones_included
  Scenario: Raw-XML prefix discovery finds dotted prefixes bound to our namespace
    Given a document binding bootstrap.processes to our namespace and folio to "urn:other"
    When its own extension prefixes are read
    Then they are exactly "bootstrap.processes"

  @test:schemas/extension-namespace.test.ts::raw-XML_readers_follow_the_namespace_too::a_pattern_matches_our_element_under_any_prefix,_and_never_a_foreign_folio:
  Scenario: The own-element pattern matches only our namespace's elements
    Given a document with bootstrap.processes:skill ref "a" and a foreign folio:skill ref "b"
    When the own-element pattern for "skill" is matched
    Then only ref "a" is found

  @test:schemas/extension-namespace.test.ts::raw-XML_readers_follow_the_namespace_too::a_document_that_binds_none_of_our_namespaces_has_none_of_our_elements
  Scenario: A document binding none of our namespaces has none of our elements
    Given a document with an unbound folio:skill element
    When the own-element pattern for "skill" is matched
    Then nothing is found

  @test:schemas/extension-namespace.test.ts::nothing_matches_our_elements_by_the_text_folio:_again::no_regex_literal_matches_folio:<element>_in_raw_text
  Scenario: No code matches our elements by the text folio:
    Given every non-comment line of the .ts files under cat-harness and folio-assistant-core
    When regex literals naming folio:<element> outside an error-message matcher are collected
    Then there are none

  @test:schemas/extension-namespace.test.ts::every_diagram_writes_each_element_under_the_Subgraph_that_defines_it_(stage_3)::no_diagram_binds_the_older_single_address_any_more
  Scenario: No diagram binds the retired single namespace
    Given the .bpmn files of the checkout's git corpus
    When those that contain the retired folio namespace are listed
    Then there are more than 70 diagrams
    And none binds the retired namespace

  @test:schemas/extension-namespace.test.ts::every_diagram_writes_each_element_under_the_Subgraph_that_defines_it_(stage_3)::each_element_used_is_defined_by_the_vocabulary_of_the_address_it_is_written_under
  Scenario: Each extension element is defined by the vocabulary of its namespace
    Given the bootstrap and cat-harness processes ns.jsonld vocabularies, each id being its namespace plus its label
    When every element written under one of those namespaces in every diagram is checked
    Then more than 500 elements are used
    And every one is defined by its namespace's vocabulary
