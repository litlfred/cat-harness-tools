# Specifies the skill registry scripts/generate-registry.ts writes to the
# checkout's .claude/skills/registry.json, run once before the tests (skipped
# where the checkout root has no package.json), against SkillRegistrySchema.
Feature: The generated skill registry satisfies its schema and lists what is on disk

  @test:test/coordinator/registry.test.ts::generated_skill_registry::satisfies_SkillRegistrySchema
  Scenario: The generated registry satisfies SkillRegistrySchema
    Given the registry the generator wrote
    When it is parsed with SkillRegistrySchema
    Then it parses with no issues

  @test:test/coordinator/registry.test.ts::generated_skill_registry::carries_the_role_rules_that_are_on_disk
  Scenario: The registry carries role assignments in descending priority
    Given the generated registry
    When its role assignments are read
    Then there is at least one
    And their priorities are in descending order

  @test:test/coordinator/registry.test.ts::generated_skill_registry::hooks_are_HookCommands,_not_raw_settings_entries
  Scenario: Every hook command is a command HookCommand
    Given the generated registry
    When every command of every hook is read
    Then its type is "command"
    And its command is a string

  @test:test/coordinator/registry.test.ts::generated_skill_registry::every_package_manifest_on_disk_is_in_the_registry
  Scenario: Every package manifest on disk is in the registry
    Given the skill packages under cat-harness/skills that have a package-manifest.json
    When their names are compared with the registry's packages
    Then there is at least one on disk
    And the registry's package names are exactly those
