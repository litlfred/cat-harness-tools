# Specifies schemas/content/block-kinds.ts: block kinds and content-adapter
# vocabularies are discovered from folio-block-kind/v1 and
# folio-content-adapter/v1 nodes rather than listed centrally.
Feature: Block kinds and content-adapter vocabularies are discovered from nodes

  @test:schemas/block-kind-nodes.test.ts::block_kinds_are_discovered,_not_listed::every_typed_kind_is_discovered,_and_every_discovered_kind_is_typed
  Scenario: The discovered block kinds are exactly the typed ones
    Given the discovered block kinds and the typed block kinds of the vocabulary modules
    When both are sorted
    Then they are equal

  @test:schemas/block-kind-nodes.test.ts::block_kinds_are_discovered,_not_listed::the_math_kinds_are_the_paper_adapter's,_declared_by_folio-assistant-sci;_the_rest_by_folio-assistant-core
  Scenario: The math kinds are the seven theorem-like kinds and the rest are document kinds
    Given the discovered math and document block kinds
    When the math kinds are sorted
    Then they are conjecture, corollary, definition, lemma, proof, proposition and theorem
    And the math and document kinds together number all the block kinds
    # Gap: neither the adapter of the math kinds nor the layer that declares either set is checked.

  @test:schemas/block-kind-nodes.test.ts::block_kinds_are_discovered,_not_listed::each_per-kind_table_is_read_off_the_nodes
  Scenario: Every per-kind table is read off the block-kind nodes
    Given each block-kind node
    When the folio type table, label prefixes, English heading, builder lookup and enforced prefixes are read
    Then each agrees with the node
    And the known label prefixes are in sync with the JSON-LD kind prefixes and equal in number

  @test:schemas/block-kind-nodes.test.ts::block_kinds_are_discovered,_not_listed::non-English_headings_come_from_the_owners'_translation_catalogues
  Scenario: Kind headings come from translation catalogues, with English fallbacks
    Given the kind heading lookup
    When headings are asked for in several locales
    Then "theorem" in French is "Théorème", "table" in zh-Hans is "表" and "figure" in Spanish is "Figura"
    And "prose" has an empty heading
    And "lemma" in an unknown locale falls back to "Lemma"
    And a kind with no node is sentence-cased, keeping the hyphen of a "non-" prefix

  @test:schemas/block-kind-nodes.test.ts::block_kinds_are_discovered,_not_listed::a_kind_declared_by_two_files_is_refused,_naming_both
  Scenario: A block kind declared by two files is refused, naming both
    Given a temporary checkout of two instances that each declare a "note" block-kind node
    When block kinds are discovered
    Then discovery throws "declared twice" naming both files

  @test:schemas/block-kind-nodes.test.ts::block_kinds_are_discovered,_not_listed::a_checkout_that_declares_no_block-kinds_graph_has_no_kinds_—_the_harness_alone_loads
  Scenario: A checkout with no block-kinds graph has no block kinds
    Given an empty temporary checkout and no standalone fixture
    When block kinds are discovered
    Then none are found
    And the harness's own discovered kinds are not empty

  @test:schemas/block-kind-nodes.test.ts::content-adapter_vocabularies_are_nodes_(bean_riit,_step_5)::the_typed_vocabularies_are_the_nodes_that_say_typed,_each_owning_a_kind,_and_every_built-in_kind_names_one
  Scenario: The typed content adapters are the nodes marked typed, each owning kinds
    Given the content-adapter nodes
    When those marked typed are listed
    Then they are exactly the content adapters
    And each content adapter owns at least one block kind
    And every block kind's adapter is a content adapter

  @test:schemas/block-kind-nodes.test.ts::content-adapter_vocabularies_are_nodes_(bean_riit,_step_5)::each_typed_vocabulary's_companion_roles_come_from_its_node
  Scenario: A typed vocabulary's companion roles come from its node
    Given each typed content-adapter node
    When its adapter's companion roles are looked up
    Then they equal the node's companion roles
    And every paper-profile block kind's adapter has the "lean" companion role

  @test:schemas/block-kind-nodes.test.ts::content-adapter_vocabularies_are_nodes_(bean_riit,_step_5)::every_block-kind_node_names_a_vocabulary_that_has_a_node
  Scenario: Every block kind names a vocabulary that has a node
    Given the discovered block kinds
    When each kind's adapter is looked up among the content-adapter nodes
    Then it is found

  @test:schemas/block-kind-nodes.test.ts::content-adapter_vocabularies_are_nodes_(bean_riit,_step_5)::a_node_is_never_mistaken_for_an_instance_declaration
  Scenario: A content-adapter node carries no instance name
    Given each content-adapter node
    When its fields are read
    Then it has no "name" field

  @test:schemas/block-kind-nodes.test.ts::content-adapter_vocabularies_are_nodes_(bean_riit,_step_5)::a_vocabulary_declared_twice_throws;_finding_no_typed_one_does_not
  Scenario: A vocabulary declared twice throws, and no typed vocabulary is not an error
    Given a temporary checkout with one instance declaring an untyped adapter "x"
    When content adapters are discovered
    Then "x" is found without error
    And when a second instance also declares "x" discovery throws "declared twice"
