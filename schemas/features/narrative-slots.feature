# Specifies per-language narrative slots: a block summary's status across
# languages (schemas/content/block-summary.ts) and the optional narrative of
# a tabular CSVW record (schemas/library/tabular-csvw.ts).
Feature: A narrative slot holds one entry per language, and its status reads all of them

  @test:schemas/narrative-slots.test.ts::a_summary's_status_reads_every_language::a_one-entry_list_reads_as_its_one_narrative
  Scenario: A one-entry list has its entry's status
    Given a block summary whose narrative is one confirmed English entry
    When its status is computed against the current body
    Then it is "confirmed"

  @test:schemas/narrative-slots.test.ts::a_summary's_status_reads_every_language::confirmed_only_when_every_language_is
  Scenario: A summary is confirmed only when every language is
    Given a summary with English and French both confirmed
    When its status is computed
    Then it is "confirmed"
    And with French only a draft the status is "draft"

  @test:schemas/narrative-slots.test.ts::a_summary's_status_reads_every_language::rejected_when_any_language_is
  Scenario: A summary is rejected when any language is
    Given a summary with English confirmed and French rejected
    When its status is computed
    Then it is "rejected"

  @test:schemas/narrative-slots.test.ts::a_summary's_status_reads_every_language::FALSIFIED:_a_list_entry_that_is_not-authored_is_refused,_as_the_single_form_is
  Scenario: A not-authored entry in a narrative list is refused
    Given a summary whose narrative lists an English draft and a French entry with no text in state "not-authored"
    When it is parsed
    Then it is refused

  @test:schemas/narrative-slots.test.ts::an_optional_slot_takes_a_per-language_list::tabular-csvw:_a_list_parses;_a_list_missing_a_lang_does_not
  Scenario: A tabular CSVW narrative takes a per-language list, each entry with a lang
    Given a tabular CSVW record with one table
    When its narrative is an English and a French draft
    Then it parses
    And when the French entry has no lang it is refused
