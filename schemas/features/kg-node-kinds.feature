# Specifies KG_NODE_KINDS and KgRefSchema (schemas/kg/carried-note.ts): the
# closed set of node kinds a KG reference may name.
Feature: A KG reference's kind is closed and covers the graph

  @test:schemas/kg-node-kinds.test.ts::KgRef.kind_is_closed,_and_covers_the_graph::every_kind_kg-export_mints_an_IRI_for_is_a_KG_NODE_KIND
  Scenario: Every kind kg-export mints an IRI for is a KG node kind
    Given the kinds named in makeIri calls in scripts/kg-export.ts
    When they are compared with the KG node kinds
    Then there are more than five
    And every one is a KG node kind

  @test:schemas/kg-node-kinds.test.ts::KgRef.kind_is_closed,_and_covers_the_graph::a_typo_does_not_parse
  Scenario: A misspelt kind does not parse
    Given a KG reference of kind "skill" and one of kind "skil"
    When each is parsed
    Then the first parses and the second is refused
