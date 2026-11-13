# Specifies the tools field of a mount override (schemas/kg/remote-mount.ts).
Feature: A mount override may name Tools by id

  @test:schemas/remote-mount-tools.test.ts::MountOverrideSchema.tools::names_Tools_by_id,_beside_the_other_override_fields
  Scenario: A mount override names tools beside its other fields
    Given an override naming tools "bean-query" and "agent-memory" and a directory
    When it is parsed
    Then its tools are kept in order
    And a remote mount whose cat-harness override names "bpmn-checklist" keeps that tool

  @test:schemas/remote-mount-tools.test.ts::MountOverrideSchema.tools::refuses_an_id_that_is_not_a_Tool_id,_an_id_named_twice,_and_an_empty_list
  Scenario: Malformed tool lists are refused
    Given overrides whose tools are "Bean_Query", "tools/bean-query", a duplicated id, or empty
    When each is parsed
    Then each is refused
