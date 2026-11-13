# Specifies mountApprovers on an index config (schemas/kg/index-config.ts).
Feature: An index's mount approvers are a non-empty list of distinct names

  @test:schemas/index-config-mount-approvers.test.ts::an_index's_mount_approvers::parse_as_a_non-empty_list_of_distinct_names
  Scenario: Mount approvers must be a non-empty list of distinct names
    Given an index config whose mountApprovers is "litlfred" in a list
    When it is parsed
    Then it parses
    And an empty list, a list with an empty name, a duplicated name, or a bare string are each refused

  @test:schemas/index-config-mount-approvers.test.ts::an_index's_mount_approvers::survive_formatIndexConfig,_with_contentTypes,_and_are_absent_when_not_declared
  Scenario: Mount approvers and content types survive formatting and are absent when undeclared
    Given an index config with mountApprovers and a "dak" content type
    When it is formatted and read back
    Then both are unchanged
    And a config declaring neither formats with neither key
