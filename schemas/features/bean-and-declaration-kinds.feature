# Specifies the bean kind (schemas/sdlc/bean-graph.ts) and the instance
# declaration kind (schemas/kg/cat-harness.ts), and how the node-kind index
# finds them.
Feature: Beans and layer declarations are node kinds, by tagging their files

  @test:schemas/bean-and-declaration-kinds.test.ts::the_bean_kind::is_`bean/1.0.0`,_and_the_tag_constant_says_the_same
  Scenario: The bean kind's tag is bean/1.0.0
    Given the bean kind
    When its tag is read
    Then it is "bean/1.0.0"
    And the bean schema tag constant is the same

  @test:schemas/bean-and-declaration-kinds.test.ts::the_bean_kind::accepts_a_tagged_bean's_front_matter_and_refuses_an_untagged_one
  Scenario: The bean kind accepts only tagged front matter of its own major
    Given bean front matter with an id, title and status
    When it is parsed with the bean kind's schema tagged "bean/1.0.0"
    Then it parses
    And the same front matter without $schema is refused
    And front matter tagged "bean/2.0.0" is refused

  @test:schemas/bean-and-declaration-kinds.test.ts::the_instance-declaration_kind::is_`cat-harness-declaration/1.0.0`
  Scenario: The declaration kind's tag is the declaration schema tag
    Given the cat-harness declaration kind
    When its tag is read
    Then it equals the cat-harness declaration schema tag constant

  @test:schemas/bean-and-declaration-kinds.test.ts::the_instance-declaration_kind::a_parse_KEEPS_the_tag,_so_a_parse-and-write_does_not_lose_it
  Scenario: Parsing a declaration keeps its $schema tag
    Given a declaration named "alpha" tagged with the declaration schema tag
    When it is parsed with the declaration schema
    Then the output still carries the tag

  @test:schemas/bean-and-declaration-kinds.test.ts::the_instance-declaration_kind::an_untagged_declaration_still_parses_(the_retag_gate_is_what_fails_it);_another_major_does_not
  Scenario: The declaration schema accepts an untagged declaration but not another major
    Given a declaration named "alpha"
    When it is parsed without a tag
    Then it parses
    And when it is tagged "cat-harness-declaration/2.0.0" it is refused

  @test:schemas/bean-and-declaration-kinds.test.ts::the_instance-declaration_kind::the_kind_requires_the_tag_and_runs_the_same_cross-field_checks_as_the_schema
  Scenario: The declaration kind requires the tag
    Given a declaration named "alpha"
    When it is parsed with the declaration kind's schema without a tag
    Then it is refused
    And with the declaration schema tag it parses
    # Gap: no cross-field check is exercised; only the tag requirement is.

  @test:schemas/bean-and-declaration-kinds.test.ts::the_node-kind_index::finds_the_bean_kind_through_the_bean-defs_typology
  Scenario: The node-kind index finds the bean kind through bean-defs
    Given the node-kind index of the default graph typologies over the harness root
    When the "bean" kind is looked up
    Then its holdings are exactly the "bean-defs" typology

  @test:schemas/bean-and-declaration-kinds.test.ts::the_node-kind_index::finds_the_declaration_kind_by_its_name_rule,_declared_by_cat-harness
  Scenario: The node-kind index finds the declaration kind by its name rule
    Given the node-kind index
    When the "cat-harness-declaration" kind is looked up
    Then it is found by "instance-declaration", declared by "cat-harness", with no holdings

  @test:schemas/bean-and-declaration-kinds.test.ts::the_node-kind_index::bean-defs_is_no_longer_an_unkinded_typology
  Scenario: bean-defs is not an unkinded typology
    Given the node-kind index
    When its unkinded typologies are listed
    Then "bean-defs" is not among them
