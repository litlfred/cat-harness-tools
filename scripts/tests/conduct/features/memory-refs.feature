# A memory entry's `roles:` name roles that exist, so no entry silently
# reaches nobody. Archived entries are excluded on purpose. Each Scenario
# names the test that executes it.
Feature: Memory entries name roles that exist

  @test:scripts/tests/conduct/memory-refs.test.ts::memory_entries_name_roles_and_agents_that_exist::the_corpus_is_non-empty,_so_the_assertions_below_are_not_vacuous
  Scenario: There are roles and unarchived memory entries to check
    Given the declared roles and the unarchived folio-memory/v1 entries of every memory directory
    Then at least one role is declared
    And at least one entry exists
    And at least one entry names a role

  @test:scripts/tests/conduct/memory-refs.test.ts::memory_entries_name_roles_and_agents_that_exist::every_`roles:`_value_is_a_declared_role
  Scenario: Every role a memory entry names is declared
    Given the unarchived memory entries and the roles in cat-harness/scenarios/roles.json
    When each entry's `roles:` values are resolved
    Then no value names an undeclared role

  @test:scripts/tests/conduct/memory-refs.test.ts::memory_entries_name_roles_and_agents_that_exist::no_entry_carries_the_retired_`agents:`_shorthand
  Scenario: No memory entry uses the retired `agents:` shorthand
    Given the unarchived memory entries
    Then none has an `agents:` front-matter field
